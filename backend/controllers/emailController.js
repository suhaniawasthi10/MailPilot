import Email from '../models/Email.js';
import { getVerifiedConnection, getGmailClient } from '../utils/connectionHelper.js';
import { generateReply as generateReplyFn, categorizeEmail } from '../services/groqService.js';
import { fetchMicrosoftEmails, createMicrosoftDraft } from '../services/microsoftService.js';
import { getEmailBody, getHeader } from '../utils/emailParser.js';

// --- GOOGLE: sync emails via Gmail API ---
const syncGoogleEmails = async (connection, limit) => {
    const gmail = getGmailClient(connection);

    const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: limit,
        q: 'category:primary -in:spam',
    });

    const messages = response.data.messages || [];
    const emailData = [];

    for (const msg of messages) {
        const details = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
        });

        const { payload, internalDate } = details.data;
        const headers = payload.headers;

        emailData.push({
            providerMessageId: msg.id,
            providerThreadId: msg.threadId,
            subject: getHeader(headers, 'Subject'),
            sender: getHeader(headers, 'From'),
            snippet: payload.snippet,
            body: getEmailBody(payload),
            receivedAt: new Date(parseInt(internalDate)),
        });
    }

    return emailData;
};

// @desc    Sync latest emails for a specific connection (Google OR Microsoft)
// @route   POST /api/emails/sync
// @body    { connectionId, limit? }
const syncEmails = async (req, res) => {
    try {
        const { connectionId } = req.body;

        if (!connectionId) {
            return res.status(400).json({ message: 'connectionId is required' });
        }

        // Parse limit: default 10, min 1, max 50
        const limit = Math.min(Math.max(parseInt(req.body.limit) || 10, 1), 50);

        const connection = await getVerifiedConnection(connectionId, req.user.id);
        if (!connection) {
            return res.status(404).json({ message: 'Connection not found or not yours' });
        }

        // Provider-based routing
        let emailData;
        if (connection.provider === 'microsoft') {
            emailData = await fetchMicrosoftEmails(connection, limit);
        } else {
            emailData = await syncGoogleEmails(connection, limit);
        }

        // Store all emails in MongoDB (same for both providers)
        const savedEmails = [];
        for (const data of emailData) {
            const email = await Email.findOneAndUpdate(
                { providerMessageId: data.providerMessageId },
                {
                    connectionId: connection._id,
                    ...data,
                },
                { upsert: true, returnDocument: 'after' }
            );
            savedEmails.push(email);
        }

        // Respond immediately — categorization happens in the background
        res.json({
            message: `Synced ${savedEmails.length} emails`,
            emails: savedEmails,
        });

        // Categorize uncategorized emails in the background (non-blocking)
        const uncategorized = savedEmails.filter((e) => e.category === 'uncategorized');
        if (uncategorized.length > 0) {
            (async () => {
                for (const email of uncategorized) {
                    try {
                        const category = await categorizeEmail(email.subject, email.sender, email.snippet);
                        await Email.findByIdAndUpdate(email._id, { category });
                    } catch (err) {
                        console.error(`Categorization failed for ${email._id}:`, err.message);
                    }
                }
                console.log(`Categorized ${uncategorized.length} email(s)`);
            })().catch((err) => console.error('Background categorization error:', err.message));
        }
    } catch (error) {
        console.error('Sync emails error:', error.message);
        res.status(500).json({ message: 'Failed to sync emails' });
    }
};

// @desc    Get all synced emails for a specific connection
// @route   GET /api/emails?connectionId=xxx
const getEmails = async (req, res) => {
    try {
        const { connectionId } = req.query;

        if (!connectionId) {
            return res.status(400).json({ message: 'connectionId query param is required' });
        }

        const connection = await getVerifiedConnection(connectionId, req.user.id);
        if (!connection) {
            return res.status(404).json({ message: 'Connection not found or not yours' });
        }

        const emails = await Email.find({ connectionId: connection._id })
            .sort({ receivedAt: -1 });

        res.json(emails);
    } catch (error) {
        console.error('Get emails error:', error.message);
        res.status(500).json({ message: 'Failed to fetch emails' });
    }
};

// --- GOOGLE: create Gmail draft ---
const createGoogleDraft = async (connection, email, replyText) => {
    const gmail = getGmailClient(connection);

    const rawMessage = [
        `To: ${email.sender}`,
        `Subject: Re: ${email.subject}`,
        `In-Reply-To: ${email.providerMessageId}`,
        `Content-Type: text/plain; charset=utf-8`,
        '',
        replyText,
    ].join('\n');

    const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const draft = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
            message: {
                raw: encodedMessage,
                threadId: email.providerThreadId,
            },
        },
    });

    return { draftId: draft.data.id };
};

// @desc    Generate an AI reply and save it as a draft (Google OR Microsoft)
// @route   POST /api/emails/generate-draft/:emailId
const generateDraft = async (req, res) => {
    try {
        const email = await Email.findById(req.params.emailId);

        if (!email) {
            return res.status(404).json({ message: 'Email not found' });
        }

        const connection = await getVerifiedConnection(email.connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized for this email' });
        }

        // Step 1: Generate reply with Groq (same for both providers)
        const replyText = await generateReplyFn(
            email.subject,
            email.sender,
            email.body
        );

        if (!replyText) {
            return res.status(500).json({ message: 'Failed to generate reply' });
        }

        // Step 2: Create draft via provider-specific API
        let result;
        if (connection.provider === 'microsoft') {
            // Extract email address from "Name <email>" format
            const senderMatch = email.sender.match(/<(.+?)>/);
            const toAddress = senderMatch ? senderMatch[1] : email.sender;
            result = await createMicrosoftDraft(connection, toAddress, email.subject, replyText, email.providerThreadId);
        } else {
            result = await createGoogleDraft(connection, email, replyText);
        }

        res.json({
            message: 'Draft created successfully',
            draftId: result.draftId,
            replyText,
        });
    } catch (error) {
        console.error('Generate draft error:', error.message);
        res.status(500).json({ message: 'Failed to generate draft' });
    }
};

export { syncEmails, getEmails, generateDraft };
