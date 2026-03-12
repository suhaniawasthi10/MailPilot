/**
 * Groq Service
 *
 * This file handles all communication with the Groq LLM API.
 * It sends email content to the AI and gets back structured JSON
 * containing commitments, deadlines, and whether a reply is needed.
 *
 * We use a strict prompt that forces JSON-only output, then we
 * validate the response before returning it.
 */

// The prompt template we send to the LLM along with each email.
// It tells the AI exactly what format to respond in.
const EXTRACTION_PROMPT = `You are an AI assistant that analyzes emails and extracts actionable information.

Analyze the following email and extract:
1. A brief summary of any commitment, action item, or task mentioned
2. Any deadline or due date mentioned (in ISO 8601 format: YYYY-MM-DD)
3. Whether the email requires a reply (true/false)
4. Priority level (high, medium, or low)

You MUST respond with ONLY valid JSON in this exact format, no other text:
{
  "summary": "Brief description of the commitment or action item",
  "deadline": "YYYY-MM-DD or null if no deadline",
  "replyRequired": true or false,
  "priority": "high" or "medium" or "low"
}

If there is no clear commitment or action item, respond with:
{
  "summary": "No actionable commitment found",
  "deadline": null,
  "replyRequired": false,
  "priority": "low"
}

EMAIL:
Subject: {subject}
From: {sender}
Body: {body}`;

// Smart truncation: keeps the beginning AND end of long emails
// Why? Important info (deadlines, action items) often appears at the bottom
const MAX_BODY_CHARS = 3000;
const truncateBody = (body) => {
    if (!body) return '(empty body)';
    if (body.length <= MAX_BODY_CHARS) return body;
    const half = Math.floor(MAX_BODY_CHARS / 2);
    return body.substring(0, half) + '\n\n... [middle truncated] ...\n\n' + body.substring(body.length - half);
};

// Delay helper for rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Valid categories for email classification
const VALID_CATEGORIES = [
    'personal', 'work', 'newsletter', 'marketing',
    'receipt', 'calendar', 'notification', 'cold-email',
];

// Prompt for email categorization — designed to be fast and accurate
const CATEGORIZATION_PROMPT = `You are an email classifier. Categorize the following email into EXACTLY ONE of these categories:

- personal: From a real person you know (friends, family, colleagues writing personally)
- work: Work-related (meeting requests, project updates, tasks, HR, team communication)
- newsletter: Subscribed newsletters, weekly digests, blog updates
- marketing: Promotions, sales, discounts, product announcements, ads
- receipt: Purchase confirmations, order updates, invoices, shipping notifications
- calendar: Event invitations, RSVPs, schedule changes, calendar reminders
- notification: Automated app notifications (GitHub, Slack, social media, security alerts)
- cold-email: Unsolicited outreach, sales pitches from strangers, recruitment spam

Respond with ONLY valid JSON: {"category": "one_of_the_above"}

EMAIL:
Subject: {subject}
From: {sender}
Snippet: {snippet}`;

/**
 * Calls the Groq API with retries and exponential backoff.
 * Retries on 429 (rate limit) and 5xx (server errors).
 * @param {Object} body - The request body to send to Groq
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Object} Parsed JSON response
 */
const callGroqWithRetry = async (body, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            return await response.json();
        }

        // Retry on 429 (rate limit) or 5xx (server error)
        const isRetryable = response.status === 429 || response.status >= 500;
        if (isRetryable && attempt < maxRetries) {
            // Exponential backoff: 2s, 4s, 8s
            const backoff = Math.pow(2, attempt + 1) * 1000;
            console.warn(`Groq API returned ${response.status}, retrying in ${backoff / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
            await delay(backoff);
            continue;
        }

        // Non-retryable error or exhausted retries
        const errorData = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorData}`);
    }
};

/**
 * Categorize an email using AI.
 *
 * Uses only the subject, sender, and snippet (not the full body) —
 * this is intentional: categorization doesn't need the full body,
 * and using less text means faster responses and lower token usage.
 *
 * @param {string} subject - Email subject line
 * @param {string} sender - Who sent the email
 * @param {string} snippet - Short preview of the email body
 * @returns {string} One of the VALID_CATEGORIES
 */
const categorizeEmail = async (subject, sender, snippet) => {
    try {
        const prompt = CATEGORIZATION_PROMPT
            .replace('{subject}', subject || '(no subject)')
            .replace('{sender}', sender || '(unknown sender)')
            .replace('{snippet}', snippet || '(empty)');

        const data = await callGroqWithRetry({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 32,     // Category response is tiny — save tokens
            response_format: { type: 'json_object' },
        });

        const content = data.choices[0].message.content;
        const parsed = JSON.parse(content);

        // Validate the category is one we recognize
        if (VALID_CATEGORIES.includes(parsed.category)) {
            return parsed.category;
        }
        return 'uncategorized';
    } catch (error) {
        console.error('Groq categorization error:', error.message);
        return 'uncategorized';
    }
};

/**
 * Categorize multiple emails in batch.
 * Adds a small delay between calls to respect Groq rate limits.
 *
 * @param {Array} emails - Array of { subject, sender, snippet } objects
 * @returns {Array} Array of category strings in the same order
 */
const categorizeEmails = async (emails) => {
    const categories = [];
    for (const email of emails) {
        const category = await categorizeEmail(email.subject, email.sender, email.snippet);
        categories.push(category);
        // Small delay between calls to avoid rate limits
        if (emails.indexOf(email) < emails.length - 1) {
            await delay(1000);
        }
    }
    return categories;
};

/**
 * Calls the Groq API with email content and returns structured JSON.
 *
 * @param {string} subject - Email subject line
 * @param {string} sender - Who sent the email
 * @param {string} body - Email body text
 * @returns {Object} Parsed JSON with summary, deadline, replyRequired, priority
 */
const extractCommitments = async (subject, sender, body) => {
    try {
        // Build the prompt by replacing placeholders with actual email data
        const prompt = EXTRACTION_PROMPT
            .replace('{subject}', subject || '(no subject)')
            .replace('{sender}', sender || '(unknown sender)')
            .replace('{body}', truncateBody(body));

        const data = await callGroqWithRetry({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 256,
            response_format: { type: 'json_object' },
        });

        const content = data.choices[0].message.content;

        // Safely parse the JSON response from the LLM
        const parsed = JSON.parse(content);

        // Validate required fields exist
        return validateExtraction(parsed);
    } catch (error) {
        console.error('Groq extraction error:', error.message);
        // Return a safe fallback if anything goes wrong
        return {
            summary: 'Failed to extract commitment',
            deadline: null,
            replyRequired: false,
            priority: 'low',
        };
    }
};

/**
 * Validates the LLM response has the correct structure and types.
 * If any field is missing or wrong type, it gets a safe default.
 *
 * Why? LLMs can sometimes return unexpected formats, even with strict prompts.
 * We never trust AI output without validation.
 */
const validateExtraction = (data) => {
    return {
        summary: typeof data.summary === 'string' ? data.summary : 'No summary available',
        deadline: isValidDate(data.deadline) ? data.deadline : null,
        replyRequired: typeof data.replyRequired === 'boolean' ? data.replyRequired : false,
        priority: ['high', 'medium', 'low'].includes(data.priority) ? data.priority : 'medium',
    };
};

/**
 * Checks if a string is a valid date format (YYYY-MM-DD).
 */
const isValidDate = (dateStr) => {
    if (!dateStr || dateStr === 'null' || typeof dateStr !== 'string') return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
};

/**
 * Generates a contextual email reply using Groq.
 * Unlike extractCommitments, this returns plain text (the reply body),
 * not JSON — because we want natural language for the email draft.
 */
const generateReply = async (subject, sender, body) => {
    try {
        const prompt = `You are a professional email assistant. Write a concise, professional reply to the following email.

Keep the reply:
- Polite and professional
- Brief (2-4 sentences)
- Relevant to the email content

Do NOT include a subject line. Just write the reply body text.

ORIGINAL EMAIL:
Subject: ${subject || '(no subject)'}
From: ${sender || '(unknown sender)'}
Body: ${truncateBody(body)}

YOUR REPLY:`;

        const data = await callGroqWithRetry({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 512,
        });

        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Groq reply generation error:', error.message);
        return null;
    }
};

/**
 * Generates a reminder/follow-up email for an overdue commitment.
 * Used by Phase 6 (Overdue Checker).
 */
const generateReminder = async (commitmentSummary, deadline, originalSubject) => {
    try {
        const prompt = `You are a professional email assistant. Write a polite follow-up/reminder email about an overdue commitment.

Details:
- Commitment: ${commitmentSummary}
- Original Deadline: ${deadline}
- Original Email Subject: ${originalSubject || '(unknown)'}

Write ONLY the email body. Keep it:
- Polite but firm
- Brief (2-3 sentences)
- Professional

YOUR REMINDER:`;

        const data = await callGroqWithRetry({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 512,
        });

        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Groq reminder generation error:', error.message);
        return null;
    }
};

export { extractCommitments, generateReply, generateReminder, categorizeEmail, categorizeEmails, delay };
