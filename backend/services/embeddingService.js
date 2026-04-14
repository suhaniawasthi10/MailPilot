/**
 * Embedding Service
 *
 * This is the RAG indexing + retrieval layer. It handles:
 * 1. Converting email text into vector embeddings (using a local model)
 * 2. Storing those vectors in Chroma (our vector database)
 * 3. Searching for similar emails given a user's question
 *
 * Key concepts:
 * - Embeddings: A neural network converts text into a list of 384 numbers.
 *   Texts with similar MEANING get similar numbers, even if they share no words.
 *   "When is the meeting?" and "What time does it start?" → nearly identical vectors.
 *
 * - Chroma: A database optimized for storing and searching vectors.
 *   Instead of SQL "WHERE" queries, you say "find the 5 closest vectors to this one."
 *
 * - Chunking: Long emails get split into smaller pieces (~800 chars) because
 *   embedding models work best on short-to-medium text. Each chunk gets its own
 *   vector but shares the same emailId metadata, so we can trace back to the source.
 *
 * - User scoping: Every vector is tagged with a userId in Chroma's metadata.
 *   Queries ALWAYS filter by userId so users can never see each other's emails.
 */

import { ChromaClient } from 'chromadb';
import Email from '../models/Email.js';

// ============================================================================
// SECTION 1: Model + Client initialization (lazy loading)
// ============================================================================

// We use "lazy loading" — the model and Chroma client are NOT created when
// the server starts. They're created on FIRST USE. This means:
// - Server starts fast (no 5-second model download blocking startup)
// - If nobody uses RAG, the model is never loaded (saves memory)
// - Once loaded, it stays in memory for fast subsequent calls

let embeddingPipeline = null;  // Will hold the transformers.js pipeline
let chromaCollection = null;   // Will hold the Chroma collection reference

/**
 * Load the embedding model on first use.
 *
 * We use "all-MiniLM-L6-v2" — a small (22MB), fast model that produces
 * 384-dimensional vectors. It's the go-to choice for semantic search.
 *
 * @xenova/transformers runs this ENTIRELY in Node.js — no Python, no API key,
 * no network calls after the first download. The model is cached in ~/.cache/.
 */
const getEmbeddingPipeline = async () => {
    if (!embeddingPipeline) {
        // Dynamic import because @xenova/transformers is a heavy module.
        // We don't want it loaded until we actually need it.
        const { pipeline } = await import('@xenova/transformers');
        console.log('Loading embedding model (first time may download ~22MB)...');
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('Embedding model loaded successfully');
    }
    return embeddingPipeline;
};

/**
 * Get or create the Chroma collection.
 *
 * A "collection" in Chroma is like a "table" in SQL — it holds all our vectors.
 * We use one collection called "emails" for everything, and separate users
 * via metadata filters (not separate collections).
 *
 * The "cosine" distance metric means: vectors pointing in the same direction
 * are considered similar, regardless of their length. This is the standard
 * choice for text embeddings.
 */
const getCollection = async () => {
    if (!chromaCollection) {
        const client = new ChromaClient({
            path: process.env.CHROMA_URL || 'http://localhost:8000',
        });
        chromaCollection = await client.getOrCreateCollection({
            name: 'emails',
            metadata: { 'hnsw:space': 'cosine' },
            // We provide our own embeddings via Xenova, so pass null to bypass
            // Chroma's default embedding function (which would otherwise require
            // installing @chroma-core/default-embed).
            embeddingFunction: null,
        });
        console.log('Chroma collection "emails" ready');
    }
    return chromaCollection;
};

// ============================================================================
// SECTION 2: Text processing (cleaning + chunking)
// ============================================================================

/**
 * Strip HTML tags and clean up email text for embedding.
 *
 * Emails often contain HTML (bold, links, signatures, etc). The embedding
 * model doesn't need HTML — it only cares about the words and their meaning.
 * Leaving HTML in would waste tokens on "<div class='...'>" noise.
 *
 * @param {string} html - Raw email body (possibly HTML)
 * @returns {string} Clean plain text
 */
const cleanEmailText = (html) => {
    if (!html) return '';
    return html
        // Remove all HTML tags: <div>, <br>, <a href="...">, etc.
        .replace(/<[^>]+>/g, ' ')
        // Decode common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Collapse multiple spaces/newlines into single space
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Split long text into chunks at paragraph boundaries.
 *
 * WHY CHUNK? Embedding models have a sweet spot — they work best on text
 * that's roughly 1-3 paragraphs long. A 5000-char email would produce a
 * "blurry" embedding that tries to capture everything and captures nothing well.
 * Smaller chunks = sharper, more specific embeddings = better search results.
 *
 * WHY PARAGRAPH BOUNDARIES? We could split at exactly every 800 characters,
 * but that might cut a sentence in half: "The meeting is on Tues" | "day at 3pm."
 * By splitting at paragraph breaks (\n\n), each chunk is a coherent thought.
 *
 * @param {string} text - Clean plain text
 * @param {number} maxChars - Maximum characters per chunk (default 800)
 * @returns {string[]} Array of text chunks
 */
const chunkText = (text, maxChars = 800) => {
    // Short text? Don't bother chunking — just return as-is
    if (text.length <= maxChars) return [text];

    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        // If adding this paragraph would exceed the limit, save the current
        // chunk and start a new one
        if (currentChunk && (currentChunk + '\n\n' + paragraph).length > maxChars) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        } else {
            // Append paragraph to current chunk
            currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
        }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    // Edge case: if the text had no paragraph breaks at all (one giant wall of text),
    // fall back to splitting at sentence boundaries or hard character limits
    if (chunks.length === 0) {
        for (let i = 0; i < text.length; i += maxChars) {
            chunks.push(text.slice(i, i + maxChars));
        }
    }

    return chunks;
};

// ============================================================================
// SECTION 3: Embedding generation
// ============================================================================

/**
 * Convert text into a 384-dimensional vector embedding.
 *
 * This is the core operation. The model reads the text, "understands" its
 * meaning, and outputs 384 numbers that represent that meaning as coordinates
 * in a high-dimensional space.
 *
 * - pooling: 'mean' = average all token vectors into one sentence vector
 * - normalize: true = scale the vector to unit length (required for cosine similarity)
 *
 * @param {string} text - The text to embed
 * @returns {number[]} Array of 384 floats
 */
const getEmbedding = async (text) => {
    const extractor = await getEmbeddingPipeline();

    // The model returns a tensor (multi-dimensional array). We need a flat array.
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
};

// ============================================================================
// SECTION 4: Indexing (storing emails in Chroma)
// ============================================================================

/**
 * Index a single email into the vector store.
 *
 * This is the WRITE side of RAG. For each email:
 * 1. Build a text representation: "Subject: ... | From: ... | Body: ..."
 * 2. Chunk it if it's long
 * 3. Generate an embedding for each chunk
 * 4. Store in Chroma with metadata for filtering
 * 5. Mark the email as embedded in MongoDB
 *
 * The metadata stored alongside each vector is crucial:
 * - userId: for scoping queries to the correct user (SECURITY)
 * - connectionId: for filtering by email account
 * - emailId: to fetch the full email from MongoDB when showing results
 * - sender, subject, receivedAt, category: for display + vectorless RAG filtering
 *
 * @param {Object} email - Mongoose Email document
 * @param {string} userId - The owner's user ID
 */
const indexEmail = async (email, userId) => {
    const collection = await getCollection();

    // Build the text we'll embed. We include subject + sender because they
    // carry meaning: "meeting invite from John" is different from "receipt from Amazon"
    const cleanBody = cleanEmailText(email.body);
    const fullText = [
        email.subject ? `Subject: ${email.subject}` : '',
        email.sender ? `From: ${email.sender}` : '',
        cleanBody,
    ].filter(Boolean).join('\n');

    // Skip empty emails (no point embedding nothing)
    if (fullText.length < 10) {
        await Email.findByIdAndUpdate(email._id, { embedded: true, embeddedAt: new Date() });
        return;
    }

    // Chunk the text and generate embeddings
    const chunks = chunkText(fullText);
    const ids = [];
    const embeddings = [];
    const documents = [];
    const metadatas = [];

    for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i]);

        // Each chunk gets a unique ID: "emailId#chunkIndex"
        // If the email has only one chunk, it's just "emailId#0"
        ids.push(`${email._id.toString()}#${i}`);
        embeddings.push(embedding);
        documents.push(chunks[i]);
        metadatas.push({
            userId: userId,
            connectionId: email.connectionId.toString(),
            emailId: email._id.toString(),
            sender: email.sender || '',
            subject: email.subject || '',
            // Chroma metadata only supports string/number/boolean — not Date objects
            // So we store the timestamp as milliseconds since epoch
            receivedAt: email.receivedAt ? email.receivedAt.getTime() : 0,
            category: email.category || 'uncategorized',
            chunkIndex: i,
            totalChunks: chunks.length,
        });
    }

    // Upsert = insert if new, update if exists (idempotent — safe to re-run)
    await collection.upsert({ ids, embeddings, documents, metadatas });

    // Mark as embedded in MongoDB so we don't process it again
    await Email.findByIdAndUpdate(email._id, {
        embedded: true,
        embeddedAt: new Date(),
    });
};

/**
 * Index multiple emails in batch. Used after syncing new emails.
 *
 * Processes sequentially (not in parallel) to avoid overwhelming the
 * embedding model with concurrent inference. Each email takes ~50-200ms
 * to embed, so 25 emails ≈ 2-5 seconds. This runs in the background
 * so it doesn't block the user.
 *
 * @param {Object[]} emails - Array of Mongoose Email documents
 * @param {string} userId - The owner's user ID
 * @returns {number} Count of successfully indexed emails
 */
const indexEmails = async (emails, userId) => {
    let indexed = 0;
    for (const email of emails) {
        try {
            await indexEmail(email, userId);
            indexed++;
        } catch (error) {
            console.error(`Failed to embed email ${email._id}:`, error.message);
            // Continue with the rest — don't let one bad email stop the batch
        }
    }
    return indexed;
};

// ============================================================================
// SECTION 5: Searching (finding relevant emails)
// ============================================================================

/**
 * Search for emails similar to a query string.
 *
 * This is the READ side of RAG. Given a question like "What did Acme say
 * about the contract?", we:
 * 1. Convert the question into an embedding (same model, same 384 dims)
 * 2. Ask Chroma: "find the top K vectors closest to this one"
 * 3. Chroma returns the matching chunks with their metadata
 *
 * The WHERE filter ensures we ONLY search within this user's emails.
 * This is the security boundary — without it, User A could see User B's emails.
 *
 * @param {string} query - The user's natural language question
 * @param {string} userId - Authenticated user's ID
 * @param {string|null} connectionId - Optional: filter to specific email account
 * @param {number} topK - How many results to return (default 8)
 * @returns {Object[]} Array of { emailId, chunkText, sender, subject, receivedAt, score }
 */
const searchEmails = async (query, userId, connectionId = null, topK = 8) => {
    const collection = await getCollection();
    const queryEmbedding = await getEmbedding(query);

    // Build the metadata filter — always include userId for security.
    // Chroma requires multiple conditions to be wrapped in $and,
    // otherwise it errors with "Expected 'where' to have exactly one operator".
    const where = connectionId
        ? { $and: [{ userId: { $eq: userId } }, { connectionId: { $eq: connectionId } }] }
        : { userId: { $eq: userId } };

    const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        where,
        nResults: topK,
    });

    // Chroma returns results in a nested format:
    // { ids: [[...]], documents: [[...]], metadatas: [[...]], distances: [[...]] }
    // The outer array is per query (we only send 1 query, so we take index [0])

    if (!results || !results.ids || !results.ids[0]) return [];

    return results.ids[0].map((id, i) => ({
        chunkId: id,
        emailId: results.metadatas[0][i].emailId,
        chunkText: results.documents[0][i],
        sender: results.metadatas[0][i].sender,
        subject: results.metadatas[0][i].subject,
        receivedAt: new Date(results.metadatas[0][i].receivedAt),
        category: results.metadatas[0][i].category,
        // Chroma returns "distance" (lower = more similar for cosine).
        // We convert to a 0-1 similarity score for easier understanding.
        score: 1 - (results.distances[0][i] || 0),
    }));
};

/**
 * Fetch existing embeddings for a list of emails from Chroma.
 *
 * Used by hybrid mode to AVOID re-embedding candidates at query time —
 * the embeddings are already stored, just look them up.
 *
 * Returns: Map<emailId, { embedding: number[], chunkIndex: number }[]>
 * Each email may have multiple chunks; we return all of them so the caller
 * can pick the most relevant chunk per email.
 *
 * @param {string[]} emailIds - Array of email ID strings
 * @returns {Promise<Map>} Map keyed by emailId, value is array of chunk embeddings
 */
const getEmbeddingsForEmails = async (emailIds) => {
    if (!emailIds || emailIds.length === 0) return new Map();

    const collection = await getCollection();
    const stringIds = emailIds.map((id) => id.toString());

    // Fetch all chunks belonging to any of these emails, including their vectors
    const results = await collection.get({
        where: { emailId: { $in: stringIds } },
        include: ['embeddings', 'metadatas'],
    });

    const map = new Map();
    if (!results || !results.ids) return map;

    for (let i = 0; i < results.ids.length; i++) {
        const meta = results.metadatas[i];
        const embedding = results.embeddings[i];
        const emailId = meta.emailId;

        if (!map.has(emailId)) map.set(emailId, []);
        map.get(emailId).push({ embedding, chunkIndex: meta.chunkIndex || 0 });
    }

    return map;
};

// ============================================================================
// SECTION 6: Utilities (delete, status)
// ============================================================================

/**
 * Remove all embeddings for a specific email.
 * Used when an email is deleted from the system.
 *
 * We stored chunks as "emailId#0", "emailId#1", etc.
 * Chroma's where filter lets us delete by emailId metadata.
 */
const deleteEmailEmbeddings = async (emailId) => {
    const collection = await getCollection();
    await collection.delete({
        where: { emailId: { $eq: emailId.toString() } },
    });
};

/**
 * Get indexing status: how many emails are embedded vs total.
 * Useful for showing a progress bar or "index is up to date" status.
 */
const getIndexStatus = async (userId, connectionId = null) => {
    const query = {};

    // We need to find emails belonging to this user's connections
    // Since Email model links to connectionId (not userId directly),
    // we need to look up which connections belong to this user
    const EmailConnection = (await import('../models/EmailConnection.js')).default;
    const connectionFilter = { userId };
    if (connectionId) connectionFilter._id = connectionId;
    const connections = await EmailConnection.find(connectionFilter).select('_id');
    const connectionIds = connections.map((c) => c._id);

    query.connectionId = { $in: connectionIds };

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
    getEmbeddingsForEmails,
    deleteEmailEmbeddings,
    getIndexStatus,
    getEmbedding,
    cleanEmailText,
    chunkText,
};
