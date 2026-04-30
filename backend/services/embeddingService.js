/**
 * Embedding Service (Pinecone)
 *
 * Pipeline:
 *   email body → clean → chunk → embed (all-MiniLM-L6-v2) → upsert to Pinecone
 *
 * Retrieval:
 *   user question → embed → Pinecone query (filtered by userId) → top K chunks
 *
 * Why Pinecone instead of Chroma:
 *   Chroma needs a server alongside the app. Pinecone is hosted, has a free
 *   serverless tier, and works the same from local and production with one
 *   API key. One less moving piece for deployment.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import Email from '../models/Email.js';
import EmailConnection from '../models/EmailConnection.js';

// ============================================================================
// SECTION 1: Lazy clients
// ============================================================================

let embeddingPipeline = null;
let pineconeIndex = null;

const getEmbeddingPipeline = async () => {
    if (!embeddingPipeline) {
        const { pipeline } = await import('@xenova/transformers');
        console.log('Loading embedding model (first time may download ~22MB)...');
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('Embedding model loaded successfully');
    }
    return embeddingPipeline;
};

const getIndex = () => {
    if (!pineconeIndex) {
        const apiKey = process.env.PINECONE_API_KEY;
        const indexName = process.env.PINECONE_INDEX_NAME;
        if (!apiKey || !indexName) {
            throw new Error('PINECONE_API_KEY and PINECONE_INDEX_NAME must be set');
        }
        const client = new Pinecone({ apiKey });
        pineconeIndex = client.index(indexName);
    }
    return pineconeIndex;
};

// ============================================================================
// SECTION 2: Text processing
// ============================================================================

const cleanEmailText = (html) => {
    if (!html) return '';
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Split text into ~800-char chunks at paragraph boundaries.
 * Smaller chunks = sharper embeddings = better retrieval.
 */
const chunkText = (text, maxChars = 800) => {
    if (text.length <= maxChars) return [text];

    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        if (currentChunk && (currentChunk + '\n\n' + paragraph).length > maxChars) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        } else {
            currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
};

// ============================================================================
// SECTION 3: Embedding
// ============================================================================

const getEmbedding = async (text) => {
    const extractor = await getEmbeddingPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
};

// ============================================================================
// SECTION 4: Indexing
// ============================================================================

/**
 * Embed an email and upsert all its chunks to Pinecone.
 *
 * Pinecone metadata limits: 40KB per vector. Our chunks are 800 chars each,
 * well under the limit, so we store the chunk text as `text` in metadata
 * (saves a Mongo lookup at query time).
 */
const indexEmail = async (email, userId) => {
    const index = getIndex();

    const cleanBody = cleanEmailText(email.body);
    const fullText = [
        email.subject ? `Subject: ${email.subject}` : '',
        email.sender ? `From: ${email.sender}` : '',
        cleanBody,
    ].filter(Boolean).join('\n');

    if (fullText.length < 10) {
        await Email.findByIdAndUpdate(email._id, {
            embedded: true,
            embeddedAt: new Date(),
            chunkCount: 0,
        });
        return;
    }

    const chunks = chunkText(fullText);
    const vectors = [];

    for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);
        vectors.push({
            id: `${email._id.toString()}#${i}`,
            values: embedding,
            metadata: {
                userId,
                connectionId: email.connectionId.toString(),
                emailId: email._id.toString(),
                sender: email.sender || '',
                subject: email.subject || '',
                receivedAt: email.receivedAt ? email.receivedAt.getTime() : 0,
                category: email.category || 'uncategorized',
                chunkIndex: i,
                text: chunks[i],
            },
        });
    }

    await index.upsert(vectors);

    await Email.findByIdAndUpdate(email._id, {
        embedded: true,
        embeddedAt: new Date(),
        chunkCount: chunks.length,
    });
};

const indexEmails = async (emails, userId) => {
    let indexed = 0;
    for (const email of emails) {
        try {
            await indexEmail(email, userId);
            indexed++;
        } catch (error) {
            console.error(`Failed to embed email ${email._id}:`, error.message);
        }
    }
    return indexed;
};

// ============================================================================
// SECTION 5: Search
// ============================================================================

/**
 * Vector similarity search, scoped to one user's emails.
 *
 * The userId filter is the SECURITY boundary — without it, one user's
 * question could match another user's emails.
 */
const searchEmails = async (query, userId, connectionId = null, topK = 8) => {
    const index = getIndex();
    const queryEmbedding = await getEmbedding(query);

    const filter = connectionId
        ? { userId: { $eq: userId }, connectionId: { $eq: connectionId } }
        : { userId: { $eq: userId } };

    const result = await index.query({
        vector: queryEmbedding,
        topK,
        filter,
        includeMetadata: true,
    });

    return (result.matches || []).map((m) => ({
        chunkId: m.id,
        emailId: m.metadata.emailId,
        chunkText: m.metadata.text,
        sender: m.metadata.sender,
        subject: m.metadata.subject,
        receivedAt: new Date(m.metadata.receivedAt),
        category: m.metadata.category,
        // Pinecone returns cosine similarity directly in [0, 1]
        score: m.score || 0,
    }));
};

// ============================================================================
// SECTION 6: Cleanup + status
// ============================================================================

/**
 * Delete all vectors for an email. Pinecone serverless can't delete by
 * metadata filter, so we reconstruct the chunk IDs from the stored count.
 */
const deleteEmailEmbeddings = async (emailId) => {
    const email = await Email.findById(emailId).select('chunkCount');
    if (!email || !email.chunkCount) return;

    const ids = Array.from(
        { length: email.chunkCount },
        (_, i) => `${emailId.toString()}#${i}`,
    );
    const index = getIndex();
    await index.deleteMany(ids);
};

const getIndexStatus = async (userId, connectionId = null) => {
    const connectionFilter = { userId };
    if (connectionId) connectionFilter._id = connectionId;
    const connections = await EmailConnection.find(connectionFilter).select('_id');
    const connectionIds = connections.map((c) => c._id);

    const query = { connectionId: { $in: connectionIds } };

    const [total, embedded] = await Promise.all([
        Email.countDocuments(query),
        Email.countDocuments({ ...query, embedded: true }),
    ]);

    return { total, embedded, pending: total - embedded };
};

export {
    indexEmail,
    indexEmails,
    searchEmails,
    deleteEmailEmbeddings,
    getIndexStatus,
    getEmbedding,
    cleanEmailText,
    chunkText,
};
