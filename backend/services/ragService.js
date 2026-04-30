/**
 * RAG Service
 *
 * Single retrieval strategy: pure vector search.
 *
 * Flow:
 *   question → embed → Pinecone topK → fetch full email bodies from Mongo →
 *   build prompt with cited emails → Groq → grounded answer + sources.
 *
 * The earlier "vectorless" and "hybrid" modes were removed — they added a
 * second LLM call (query planner) and an injection surface ($regex from
 * untrusted plan output) without giving users a noticeably better answer.
 */

import { searchEmails } from './embeddingService.js';
import { callGroqWithRetry } from './groqService.js';
import Email from '../models/Email.js';

// Below this score, matches are noise. We keep the top 2 regardless so the
// UI never shows a blank "Sources" list when the LLM did give an answer.
const MIN_SOURCE_SCORE = 0.25;

const callGroq = async (messages, options = {}) => {
    const { temperature = 0.3, maxTokens = 1024, jsonMode = false } = options;
    const body = {
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature,
        max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: 'json_object' };
    const data = await callGroqWithRetry(body);
    return data.choices[0].message.content;
};

const buildAnswerPrompt = (question, emailContexts) => {
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

const filterSourcesByScore = (sources) => {
    const sorted = [...sources].sort((a, b) => (b.score || 0) - (a.score || 0));
    const strong = sorted.filter((s) => (s.score || 0) >= MIN_SOURCE_SCORE);
    return strong.length >= 2 ? strong : sorted.slice(0, 2);
};

/**
 * Answer a question via vector retrieval.
 */
const answerVector = async (question, userId, connectionId = null) => {
    const searchResults = await searchEmails(question, userId, connectionId, 10);

    if (searchResults.length === 0) {
        return {
            answer: "I couldn't find any relevant emails. Make sure your emails have been indexed.",
            sources: [],
        };
    }

    // Multiple chunks of the same email may have matched — keep the best.
    const uniqueEmails = new Map();
    for (const result of searchResults) {
        if (!uniqueEmails.has(result.emailId) ||
            uniqueEmails.get(result.emailId).score < result.score) {
            uniqueEmails.set(result.emailId, result);
        }
    }

    // Pinecone metadata stores the chunk text only. For the answer prompt
    // we want the FULL body so the LLM can quote any part of the email.
    const emailIds = Array.from(uniqueEmails.keys());
    const fullEmails = await Email.find({ _id: { $in: emailIds } });

    const emailContexts = fullEmails.map((email) => ({
        emailId: email._id.toString(),
        sender: email.sender || '(unknown)',
        subject: email.subject || '(no subject)',
        receivedAt: email.receivedAt || new Date(),
        text: (email.body || email.snippet || '').substring(0, 2000),
        score: uniqueEmails.get(email._id.toString())?.score || 0,
    }));

    emailContexts.sort((a, b) => b.score - a.score);
    const topContexts = emailContexts.slice(0, 5);

    const prompt = buildAnswerPrompt(question, topContexts);
    const answer = await callGroq([{ role: 'user', content: prompt }]);

    return {
        answer,
        sources: filterSourcesByScore(
            topContexts.map(({ emailId, sender, subject, receivedAt, score }) => ({
                emailId, sender, subject, receivedAt, score: Math.round(score * 100),
            })),
        ),
    };
};

export { answerVector };
