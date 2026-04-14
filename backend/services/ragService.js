/**
 * RAG Service
 *
 * This file is the "brain" of the RAG system. It orchestrates:
 * 1. Retrieving relevant emails (via vector search, structured query, or both)
 * 2. Building a prompt with those emails as context
 * 3. Sending it to Groq to generate a grounded answer
 * 4. Returning the answer + source references
 *
 * Three modes:
 * - VECTOR: Pure semantic search via embeddings. Best for "vibe" questions
 *   like "emails about project delays" or "anything about mental health."
 *
 * - VECTORLESS: LLM writes a MongoDB query plan. Best for structured questions
 *   like "emails from Shalini last week" or "show me work emails about deadlines."
 *   No embeddings used at all — this is the "reasoning-based RAG" approach.
 *
 * - HYBRID: Vectorless narrows candidates, vector re-ranks them. Best overall —
 *   combines precision of structured filters with semantic understanding.
 */

import { searchEmails, getEmbedding, getEmbeddingsForEmails } from './embeddingService.js';
import Email from '../models/Email.js';
import EmailConnection from '../models/EmailConnection.js';

// Minimum similarity score to surface a source to the user.
// Below this, matches are noise and confuse more than they help.
// We always keep the top 1-2 results regardless, so the user still sees
// SOMETHING even when nothing strongly matches.
const MIN_SOURCE_SCORE = 0.25;

// Reuse your existing Groq caller — no point duplicating retry logic
import { delay } from './groqService.js';

// ============================================================================
// SECTION 1: Groq helper (shared by all three modes)
// ============================================================================

/**
 * Call Groq with retry logic. Same pattern as your groqService.js
 * but kept here to avoid circular dependency issues.
 */
const callGroq = async (messages, options = {}) => {
    const {
        temperature = 0.3,    // Low temp = factual, not creative
        maxTokens = 1024,
        jsonMode = false,
    } = options;

    const body = {
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature,
        max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    for (let attempt = 0; attempt <= 3; attempt++) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();
            return data.choices[0].message.content;
        }

        const isRetryable = response.status === 429 || response.status >= 500;
        if (isRetryable && attempt < 3) {
            await delay(Math.pow(2, attempt + 1) * 1000);
            continue;
        }

        const errorData = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorData}`);
    }
};

// ============================================================================
// SECTION 2: The answer prompt (shared by all modes)
// ============================================================================

/**
 * Build the final "answer" prompt that Groq will use to generate the response.
 *
 * This is the "Augmented Generation" part of RAG. We take:
 * - The user's question
 * - The retrieved emails (our "context")
 * And we tell the LLM: "Answer ONLY using these emails. If the answer isn't
 * in them, say so. Don't make stuff up."
 *
 * The "grounding" instruction is critical — without it, the LLM might
 * hallucinate facts that sound right but aren't in any email.
 */
const buildAnswerPrompt = (question, emailContexts) => {
    // Format each email as a numbered reference so the LLM can cite them
    const contextBlock = emailContexts.map((ctx, i) =>
        `[Email ${i + 1}]
From: ${ctx.sender}
Subject: ${ctx.subject}
Date: ${ctx.receivedAt instanceof Date ? ctx.receivedAt.toLocaleDateString() : ctx.receivedAt}
Content: ${ctx.text}
---`
    ).join('\n');

    return `You are an AI email assistant. Answer the user's question using the emails provided below as your source of truth.

RULES:
- Use information from the provided emails. Do NOT invent facts that aren't in them.
- ANSWER WITH WHATEVER YOU CAN. Even partial information is useful — extract whatever the emails do say about the topic.
- If an email is clearly relevant (e.g. matches the sender or topic asked about), describe what it says.
- Only refuse to answer if NONE of the provided emails relate to the question at all.
- Reference specific emails by number when citing information, e.g. "According to Email 2..."
- Be concise and direct. No fluff. No restating the question.
- If asked to summarize, cover the key points from ALL relevant emails.

EMAILS:
${contextBlock}

QUESTION: ${question}

ANSWER:`;
};

/**
 * Filter sources by minimum score, but always keep at least the top 2.
 *
 * Why "at least 2"? If we filter strictly and end up with 0 sources, the
 * UI looks broken even when the LLM gave a useful answer. Keeping the
 * highest-ranked matches preserves the "I tried" signal.
 */
const filterSourcesByScore = (sources) => {
    const sorted = [...sources].sort((a, b) => (b.score || 0) - (a.score || 0));
    const strong = sorted.filter((s) => (s.score || 0) >= MIN_SOURCE_SCORE);
    return strong.length >= 2 ? strong : sorted.slice(0, 2);
};

// ============================================================================
// SECTION 3: VECTOR mode — pure semantic search
// ============================================================================

/**
 * Answer a question using vector similarity search.
 *
 * Flow:
 * 1. searchEmails() converts the question to a vector and finds the
 *    closest email chunks in Chroma (filtered by userId)
 * 2. We deduplicate by emailId (multiple chunks of the same email might match)
 * 3. We fetch the full email bodies from MongoDB (Chroma only stores chunks)
 * 4. We build a prompt with those emails and ask Groq to answer
 *
 * Best for: semantic/vibe questions where keywords won't help
 * "emails about project concerns", "anything about upcoming travel"
 */
const answerVector = async (question, userId, connectionId = null) => {
    // Step 1: Similarity search — find the most relevant email chunks
    const searchResults = await searchEmails(question, userId, connectionId, 10);

    if (searchResults.length === 0) {
        return {
            answer: "I couldn't find any relevant emails. Make sure your emails have been indexed.",
            sources: [],
            mode: 'vector',
        };
    }

    // Step 2: Deduplicate — if chunks 0 and 1 of the same email both matched,
    // we only want to show that email once. We keep the highest-scoring chunk.
    const uniqueEmails = new Map();
    for (const result of searchResults) {
        if (!uniqueEmails.has(result.emailId) ||
            uniqueEmails.get(result.emailId).score < result.score) {
            uniqueEmails.set(result.emailId, result);
        }
    }

    // Step 3: Fetch full email documents from MongoDB
    // Chroma only stores chunks (800 chars max). For the LLM prompt, we want
    // the full email so the answer can reference any part of it.
    const emailIds = Array.from(uniqueEmails.keys());
    const fullEmails = await Email.find({ _id: { $in: emailIds } });

    // Build context objects for the prompt
    const emailContexts = fullEmails.map((email) => ({
        emailId: email._id.toString(),
        sender: email.sender || '(unknown)',
        subject: email.subject || '(no subject)',
        receivedAt: email.receivedAt || new Date(),
        text: (email.body || email.snippet || '').substring(0, 2000), // Cap at 2000 chars
        score: uniqueEmails.get(email._id.toString())?.score || 0,
    }));

    // Sort by relevance score (highest first)
    emailContexts.sort((a, b) => b.score - a.score);

    // Take top 5 to keep the prompt manageable
    const topContexts = emailContexts.slice(0, 5);

    // Step 4: Ask Groq to synthesize an answer
    const prompt = buildAnswerPrompt(question, topContexts);
    const answer = await callGroq([{ role: 'user', content: prompt }]);

    return {
        answer,
        sources: filterSourcesByScore(
            topContexts.map(({ emailId, sender, subject, receivedAt, score }) => ({
                emailId, sender, subject, receivedAt, score: Math.round(score * 100),
            })),
        ),
        mode: 'vector',
    };
};

// ============================================================================
// SECTION 4: VECTORLESS mode — LLM plans a structured MongoDB query
// ============================================================================

/**
 * The "retrieval plan" prompt.
 *
 * Instead of embedding the question, we ask the LLM:
 * "What would you search for in a database?"
 *
 * The LLM outputs a JSON filter like:
 * { "sender": "shalini", "dateFrom": "2026-03-01", "keywords": ["contract"] }
 *
 * We then convert this into a real MongoDB query. No vectors involved at all!
 *
 * This is the core of "vectorless RAG" / "reasoning-based retrieval."
 * The LLM REASONS about what data would be relevant instead of relying
 * on mathematical similarity.
 */
const PLAN_PROMPT = `You are a search query planner for an email database. Convert the user's natural language question into a structured search plan.

Today's date is {today}.

Respond with ONLY valid JSON in this exact format:
{
  "sender": "name or email to filter by, or null if not specified",
  "keywords": ["important", "words", "to", "search", "for"],
  "dateFrom": "YYYY-MM-DD or null (start of date range)",
  "dateTo": "YYYY-MM-DD or null (end of date range)",
  "category": "personal|work|newsletter|marketing|receipt|calendar|notification|cold-email or null",
  "intent": "search|summarize|answer"
}

RULES:
- Extract the sender if the user mentions a specific person or company
- Convert relative dates to absolute: "last week" → actual date range, "yesterday" → actual date
- Pick relevant keywords that would appear in email subject or body
- Choose intent: "search" for finding emails, "summarize" for summaries, "answer" for specific questions
- Only set fields you're confident about. Leave as null if unsure.

QUESTION: {question}`;

/**
 * Convert the LLM's search plan into a MongoDB query.
 *
 * This is where vectorless RAG becomes "text-to-MongoDB" — the LLM's
 * structured output gets translated into an actual database query.
 *
 * @param {Object} plan - The parsed JSON from the LLM
 * @param {string[]} connectionIds - User's connection IDs (for scoping)
 * @returns {Object} MongoDB query filter
 */
const planToMongoQuery = (plan, connectionIds) => {
    const query = { connectionId: { $in: connectionIds } };

    // Sender filter: case-insensitive regex match
    // "shalini" matches "Shalini Gupta <shalini@example.com>"
    if (plan.sender) {
        query.sender = { $regex: plan.sender, $options: 'i' };
    }

    // Date range filter
    if (plan.dateFrom || plan.dateTo) {
        query.receivedAt = {};
        if (plan.dateFrom) query.receivedAt.$gte = new Date(plan.dateFrom);
        if (plan.dateTo) query.receivedAt.$lte = new Date(plan.dateTo + 'T23:59:59Z');
    }

    // Category filter
    if (plan.category) {
        query.category = plan.category;
    }

    // Keyword search: use $or with regex on subject and body
    // "contract deadline" → find emails where subject OR body contains "contract" OR "deadline"
    if (plan.keywords && plan.keywords.length > 0) {
        const keywordFilters = plan.keywords.map((kw) => ({
            $or: [
                { subject: { $regex: kw, $options: 'i' } },
                { body: { $regex: kw, $options: 'i' } },
            ],
        }));
        // All keywords must match (AND logic)
        query.$and = keywordFilters;
    }

    return query;
};

/**
 * Answer a question using vectorless (reasoning-based) retrieval.
 *
 * Flow:
 * 1. Ask LLM to "plan" a structured search query
 * 2. Convert the plan to a MongoDB query
 * 3. Run the query — get matching emails
 * 4. Feed those emails to LLM for final answer
 *
 * Best for: structured questions with clear metadata filters
 * "emails from John last Tuesday", "show me all receipts from March"
 */
const answerVectorless = async (question, userId, connectionId = null) => {
    // Step 1: Get the user's connections for scoping
    const connFilter = { userId };
    if (connectionId) connFilter._id = connectionId;
    const connections = await EmailConnection.find(connFilter).select('_id');
    const connectionIds = connections.map((c) => c._id);

    if (connectionIds.length === 0) {
        return {
            answer: 'No email accounts connected. Please connect an account first.',
            sources: [],
            mode: 'vectorless',
            plan: null,
        };
    }

    // Step 2: Ask the LLM to plan the retrieval
    const today = new Date().toISOString().split('T')[0]; // "2026-04-13"
    const planPrompt = PLAN_PROMPT
        .replace('{today}', today)
        .replace('{question}', question);

    const planResponse = await callGroq(
        [{ role: 'user', content: planPrompt }],
        { temperature: 0.1, maxTokens: 256, jsonMode: true },
    );

    let plan;
    try {
        plan = JSON.parse(planResponse);
    } catch {
        // If the LLM returns invalid JSON, fall back to keyword-only search
        plan = { keywords: question.split(' ').filter((w) => w.length > 3), intent: 'search' };
    }

    // Step 3: Convert plan to MongoDB query and execute
    const mongoQuery = planToMongoQuery(plan, connectionIds);
    const matchingEmails = await Email.find(mongoQuery)
        .sort({ receivedAt: -1 })
        .limit(20); // Cap at 20 candidates

    if (matchingEmails.length === 0) {
        return {
            answer: "I couldn't find any emails matching your query. Try rephrasing or broadening your question.",
            sources: [],
            mode: 'vectorless',
            plan,
        };
    }

    // Step 4: Build context and get LLM answer
    const emailContexts = matchingEmails.slice(0, 5).map((email) => ({
        emailId: email._id.toString(),
        sender: email.sender || '(unknown)',
        subject: email.subject || '(no subject)',
        receivedAt: email.receivedAt || new Date(),
        text: (email.body || email.snippet || '').substring(0, 2000),
    }));

    const prompt = buildAnswerPrompt(question, emailContexts);
    const answer = await callGroq([{ role: 'user', content: prompt }]);

    return {
        answer,
        sources: emailContexts.map(({ emailId, sender, subject, receivedAt }) => ({
            emailId, sender, subject, receivedAt,
        })),
        mode: 'vectorless',
        plan, // Include the plan so frontend can show "I searched for: sender=X, date=Y"
    };
};

// ============================================================================
// SECTION 5: HYBRID mode — vectorless filter + vector re-rank
// ============================================================================

/**
 * Cosine similarity between two vectors.
 *
 * This is the same math Chroma uses internally, but we do it manually here
 * because in hybrid mode we're re-ranking MongoDB results (which don't have
 * scores from Chroma).
 *
 * Cosine similarity = how much two vectors "point in the same direction"
 * - 1.0 = identical direction (very similar)
 * - 0.0 = perpendicular (unrelated)
 * - -1.0 = opposite (very different, rare with text embeddings)
 *
 * Formula: dot(A,B) / (|A| * |B|)
 * Since our embeddings are already normalized (|A| = |B| = 1), it's just dot(A,B).
 */
const cosineSimilarity = (a, b) => {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot; // Already normalized, so no need to divide by magnitudes
};

/**
 * Answer a question using hybrid retrieval (the best of both worlds).
 *
 * Flow:
 * 1. LLM plans a structured query (same as vectorless)
 * 2. MongoDB returns candidates (broader set — up to 50)
 * 3. Embed the question AND each candidate
 * 4. Re-rank candidates by cosine similarity to the question
 * 5. Take top 5, feed to LLM for final answer
 *
 * WHY THIS IS BETTER:
 * - Vectorless alone might return 50 emails from "Shalini" when you only care
 *   about the one where she mentions "the contract deadline"
 * - Vector alone might miss the email because "contract deadline" wasn't in
 *   the exact words used (she said "agreement due date")
 * - Hybrid: first narrow to "emails from Shalini" (vectorless), then rank by
 *   semantic similarity to "contract deadline" (vector). Gets the best match.
 *
 * Best for: most real-world questions. This is what production RAG systems use.
 */
const answerHybrid = async (question, userId, connectionId = null) => {
    // Steps 1-2: Same as vectorless — plan + MongoDB query
    const connFilter = { userId };
    if (connectionId) connFilter._id = connectionId;
    const connections = await EmailConnection.find(connFilter).select('_id');
    const connectionIds = connections.map((c) => c._id);

    if (connectionIds.length === 0) {
        return {
            answer: 'No email accounts connected. Please connect an account first.',
            sources: [],
            mode: 'hybrid',
            plan: null,
        };
    }

    const today = new Date().toISOString().split('T')[0];
    const planPrompt = PLAN_PROMPT
        .replace('{today}', today)
        .replace('{question}', question);

    const planResponse = await callGroq(
        [{ role: 'user', content: planPrompt }],
        { temperature: 0.1, maxTokens: 256, jsonMode: true },
    );

    let plan;
    try {
        plan = JSON.parse(planResponse);
    } catch {
        plan = { keywords: question.split(' ').filter((w) => w.length > 3), intent: 'search' };
    }

    // Broader candidate set — we'll re-rank with vectors
    const mongoQuery = planToMongoQuery(plan, connectionIds);
    let candidates = await Email.find(mongoQuery)
        .sort({ receivedAt: -1 })
        .limit(50);

    // If the structured query returned nothing, fall back to pure vector search
    if (candidates.length === 0) {
        return answerVector(question, userId, connectionId);
    }

    // Step 3: Embed the question (single embed call — fast)
    const questionEmbedding = await getEmbedding(question);

    // Step 4: PERF — fetch existing embeddings for candidates from Chroma
    // instead of re-embedding each one (was O(n) embedding calls per query,
    // ~50ms each). Now it's a single bulk Chroma fetch + cheap math.
    const candidateIds = candidates.map((c) => c._id.toString());
    const embeddingsMap = await getEmbeddingsForEmails(candidateIds);

    // Step 5: Score each candidate by cosine similarity to the question.
    // For emails with multiple chunks, take the BEST-matching chunk's score.
    // For emails not yet embedded (rare — sync race), embed on the fly.
    const scored = [];
    for (const email of candidates) {
        const id = email._id.toString();
        const chunks = embeddingsMap.get(id);

        let score = 0;
        if (chunks && chunks.length > 0) {
            // Best chunk score for this email
            score = Math.max(
                ...chunks.map((c) => cosineSimilarity(questionEmbedding, c.embedding)),
            );
        } else {
            // Fallback: not in Chroma yet, embed on the fly so it still ranks
            try {
                const text = [
                    email.subject ? `Subject: ${email.subject}` : '',
                    email.sender ? `From: ${email.sender}` : '',
                    (email.body || email.snippet || '').substring(0, 500),
                ].filter(Boolean).join(' ');
                const emailEmbedding = await getEmbedding(text);
                score = cosineSimilarity(questionEmbedding, emailEmbedding);
            } catch {
                score = 0;
            }
        }

        scored.push({ email, score });
    }

    // Step 6: Sort by similarity (highest first) and take top 5
    scored.sort((a, b) => b.score - a.score);
    const topEmails = scored.slice(0, 5);

    const emailContexts = topEmails.map(({ email, score }) => ({
        emailId: email._id.toString(),
        sender: email.sender || '(unknown)',
        subject: email.subject || '(no subject)',
        receivedAt: email.receivedAt || new Date(),
        text: (email.body || email.snippet || '').substring(0, 2000),
        score,
    }));

    // Step 6: Ask Groq for the final answer
    const prompt = buildAnswerPrompt(question, emailContexts);
    const answer = await callGroq([{ role: 'user', content: prompt }]);

    return {
        answer,
        sources: filterSourcesByScore(
            emailContexts.map(({ emailId, sender, subject, receivedAt, score }) => ({
                emailId, sender, subject, receivedAt, score: Math.round(score * 100),
            })),
        ),
        mode: 'hybrid',
        plan,
    };
};

export { answerVector, answerVectorless, answerHybrid };
