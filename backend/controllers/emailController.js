import Email from '../models/Email.js';
import User from '../models/User.js';
import { getVerifiedConnection, getGmailClient } from '../utils/connectionHelper.js';
import { generateReply as generateReplyFn, generateComposeText, categorizeEmails } from '../services/groqService.js';
import { fetchMicrosoftEmails, createMicrosoftDraft } from '../services/microsoftService.js';
import { getEmailBody, getHeader } from '../utils/emailParser.js';

// --- GOOGLE: sync emails via Gmail API (parallel batch fetch) ---
const syncGoogleEmails = async (connection, limit) => {
    const gmail = getGmailClient(connection);

    const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: limit,
        q: 'category:primary -in:spam',
    });

    const messages = response.data.messages || [];
    if (messages.length === 0) return [];

    // Fetch all message details in parallel (batches of 20 to avoid rate limits)
    const BATCH_SIZE = 20;
    const emailData = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            batch.map((msg) =>
                gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                })
            )
        );

        for (const details of results) {
            const { payload, internalDate } = details.data;
            const headers = payload.headers;

            emailData.push({
                providerMessageId: details.data.id,
                providerThreadId: details.data.threadId,
                subject: getHeader(headers, 'Subject'),
                sender: getHeader(headers, 'From'),
                snippet: payload.snippet,
                body: getEmailBody(payload),
                receivedAt: new Date(parseInt(internalDate)),
            });
        }
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
        const limit = Math.min(Math.max(parseInt(req.body.limit) || 25, 1), 100);

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

        // Categorize uncategorized emails in the background (single LLM call)
        const uncategorized = savedEmails.filter((e) => e.category === 'uncategorized');
        if (uncategorized.length > 0) {
            (async () => {
                const categories = await categorizeEmails(
                    uncategorized.map(e => ({ subject: e.subject, sender: e.sender, snippet: e.snippet }))
                );
                for (let i = 0; i < uncategorized.length; i++) {
                    await Email.findByIdAndUpdate(uncategorized[i]._id, { category: categories[i] });
                }
            })().catch((err) => console.error('Background categorization error:', err.message));
        }
    } catch (error) {
        console.error('Sync emails error:', error.message);
        res.status(500).json({ message: 'Failed to sync emails' });
    }
};

// @desc    Get synced emails for a specific connection (paginated)
// @route   GET /api/emails?connectionId=xxx&page=1&limit=20&category=work
const getEmails = async (req, res) => {
    try {
        const { connectionId, category } = req.query;

        if (!connectionId) {
            return res.status(400).json({ message: 'connectionId query param is required' });
        }

        const connection = await getVerifiedConnection(connectionId, req.user.id);
        if (!connection) {
            return res.status(404).json({ message: 'Connection not found or not yours' });
        }

        // Pagination: default page 1, default 20 per page, max 50
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
        const skip = (page - 1) * limit;

        // Build query — optionally filter by category
        const query = { connectionId: connection._id };
        if (category && category !== 'all') {
            query.category = category;
        }

        // Run count + fetch in parallel for speed
        const [total, emails] = await Promise.all([
            Email.countDocuments(query),
            Email.find(query)
                .sort({ receivedAt: -1 })
                .skip(skip)
                .limit(limit),
        ]);

        res.json({
            emails,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get emails error:', error.message);
        res.status(500).json({ message: 'Failed to fetch emails' });
    }
};

// --- GOOGLE: create Gmail draft (supports HTML for signatures) ---
const createGoogleDraft = async (connection, email, replyText, signature) => {
    const gmail = getGmailClient(connection);

    // Build HTML body with signature
    const escapedReply = replyText.replace(/\n/g, '<br>');
    const htmlBody = signature
        ? `${escapedReply}<br><br>--<br>${signature}`
        : escapedReply;

    const rawMessage = [
        `To: ${email.sender}`,
        `Subject: Re: ${email.subject}`,
        `In-Reply-To: ${email.providerMessageId}`,
        `Content-Type: text/html; charset=utf-8`,
        '',
        htmlBody,
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

        const { customPrompt } = req.body || {};

        // Step 1: Generate reply with Groq + fetch user signature in parallel
        const [replyText, user] = await Promise.all([
            generateReplyFn(email.subject, email.sender, email.body, customPrompt),
            User.findById(req.user.id).select('emailSignature'),
        ]);

        if (!replyText) {
            return res.status(500).json({ message: 'Failed to generate reply' });
        }

        const signature = user?.emailSignature || '';

        // Step 2: Create draft via provider-specific API
        let result;
        if (connection.provider === 'microsoft') {
            // Extract email address from "Name <email>" format
            const senderMatch = email.sender.match(/<(.+?)>/);
            const toAddress = senderMatch ? senderMatch[1] : email.sender;
            result = await createMicrosoftDraft(connection, toAddress, email.subject, replyText, email.providerThreadId);
        } else {
            result = await createGoogleDraft(connection, email, replyText, signature);
        }

        // Include signature in the reply text shown to user
        const fullReplyText = signature
            ? `${replyText}\n\n--\n${signature.replace(/<[^>]+>/g, '')}`
            : replyText;

        res.json({
            message: 'Draft created successfully',
            draftId: result.draftId,
            replyText: fullReplyText,
        });
    } catch (error) {
        console.error('Generate draft error:', error.message);
        res.status(500).json({ message: 'Failed to generate draft' });
    }
};

// @desc    Send a reply email directly (Google OR Microsoft)
// @route   POST /api/emails/send-reply/:emailId
// @body    { replyText }
const sendReply = async (req, res) => {
    try {
        const { replyText } = req.body;
        if (!replyText) {
            return res.status(400).json({ message: 'replyText is required' });
        }

        const email = await Email.findById(req.params.emailId);
        if (!email) {
            return res.status(404).json({ message: 'Email not found' });
        }

        const connection = await getVerifiedConnection(email.connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized for this email' });
        }

        // Fetch user signature
        const user = await User.findById(req.user.id).select('emailSignature');
        const signature = user?.emailSignature || '';

        if (connection.provider === 'google') {
            const gmail = getGmailClient(connection);

            const escapedReply = replyText.replace(/\n/g, '<br>');
            const htmlBody = signature
                ? `${escapedReply}<br><br>--<br>${signature}`
                : escapedReply;

            const rawMessage = [
                `To: ${email.sender}`,
                `Subject: Re: ${email.subject}`,
                `In-Reply-To: ${email.providerMessageId}`,
                `Content-Type: text/html; charset=utf-8`,
                '',
                htmlBody,
            ].join('\n');

            const encodedMessage = Buffer.from(rawMessage)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage,
                    threadId: email.providerThreadId,
                },
            });
        } else {
            // Microsoft: send reply
            const { sendMicrosoftReply } = await import('../services/microsoftService.js');
            const senderMatch = email.sender.match(/<(.+?)>/);
            const toAddress = senderMatch ? senderMatch[1] : email.sender;
            await sendMicrosoftReply(connection, toAddress, email.subject, replyText, email.providerThreadId);
        }

        res.json({ message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Send reply error:', error.message);
        res.status(500).json({ message: 'Failed to send reply' });
    }
};

const composeEmail = async (req, res) => {
    try {
        const { to, subject, body, connectionId } = req.body;
        if (!to || !body) {
            return res.status(400).json({ message: 'to and body are required' });
        }

        const connection = await getVerifiedConnection(connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized for this connection' });
        }

        // Fetch user signature
        const user = await User.findById(req.user.id).select('emailSignature');
        const signature = user?.emailSignature || '';

        const escapedBody = body.replace(/\n/g, '<br>');
        const htmlBody = signature
            ? `${escapedBody}<br><br>--<br>${signature}`
            : escapedBody;

        if (connection.provider === 'google') {
            const gmail = getGmailClient(connection);

            const rawMessage = [
                `To: ${to}`,
                `Subject: ${subject || '(No subject)'}`,
                `Content-Type: text/html; charset=utf-8`,
                '',
                htmlBody,
            ].join('\n');

            const encodedMessage = Buffer.from(rawMessage)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodedMessage },
            });
        } else {
            // Microsoft
            const { getFreshMicrosoftToken } = await import('../utils/microsoftTokenHelper.js');
            const accessToken = await getFreshMicrosoftToken(connection);

            const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: {
                        subject: subject || '(No subject)',
                        body: { contentType: 'HTML', content: htmlBody },
                        toRecipients: [{ emailAddress: { address: to } }],
                    },
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Microsoft send failed: ${error}`);
            }
        }

        res.json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error('Compose email error:', error.message);
        res.status(500).json({ message: 'Failed to send email' });
    }
};

const generateCompose = async (req, res) => {
    try {
        const { prompt, subject, to } = req.body;
        if (!prompt) {
            return res.status(400).json({ message: 'prompt is required' });
        }

        const [text, user] = await Promise.all([
            generateComposeText(prompt, subject, to),
            User.findById(req.user.id).select('emailSignature'),
        ]);

        if (!text) {
            return res.status(500).json({ message: 'Failed to generate email' });
        }

        const signature = user?.emailSignature || '';
        const fullText = signature
            ? `${text}\n\n--\n${signature.replace(/<[^>]+>/g, '')}`
            : text;

        res.json({ text: fullText });
    } catch (error) {
        console.error('Generate compose error:', error.message);
        res.status(500).json({ message: 'Failed to generate email' });
    }
};

// @desc    Get all messages in a thread
// @route   GET /api/emails/thread/:emailId
const getThread = async (req, res) => {
    try {
        const email = await Email.findById(req.params.emailId);
        if (!email) {
            return res.status(404).json({ message: 'Email not found' });
        }

        const connection = await getVerifiedConnection(email.connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (connection.provider === 'google') {
            const gmail = getGmailClient(connection);

            // Fetch full thread from Gmail
            const { data: thread } = await gmail.users.threads.get({
                userId: 'me',
                id: email.providerThreadId,
                format: 'full',
            });

            const messages = thread.messages.map((msg) => {
                const headers = msg.payload.headers;
                return {
                    id: msg.id,
                    threadId: msg.threadId,
                    sender: getHeader(headers, 'From'),
                    to: getHeader(headers, 'To'),
                    cc: getHeader(headers, 'Cc'),
                    subject: getHeader(headers, 'Subject'),
                    body: getEmailBody(msg.payload),
                    receivedAt: new Date(parseInt(msg.internalDate)),
                    snippet: msg.snippet,
                };
            });

            res.json({ threadId: email.providerThreadId, subject: email.subject, messages });
        } else {
            // Microsoft: fetch messages in the same conversation
            const { getFreshMicrosoftToken } = await import('../utils/microsoftTokenHelper.js');
            const accessToken = await getFreshMicrosoftToken(connection);

            const response = await fetch(
                `https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId eq '${email.providerThreadId}'&$orderby=receivedDateTime asc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,body,receivedDateTime`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                throw new Error('Failed to fetch Microsoft thread');
            }

            const data = await response.json();
            const messages = (data.value || []).map((msg) => ({
                id: msg.id,
                threadId: msg.conversationId,
                sender: msg.from?.emailAddress
                    ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
                    : '(unknown)',
                to: (msg.toRecipients || []).map((r) => `${r.emailAddress.name} <${r.emailAddress.address}>`).join(', '),
                cc: (msg.ccRecipients || []).map((r) => `${r.emailAddress.name} <${r.emailAddress.address}>`).join(', '),
                subject: msg.subject || '',
                body: msg.body?.content || msg.bodyPreview || '',
                receivedAt: new Date(msg.receivedDateTime),
                snippet: msg.bodyPreview || '',
            }));

            res.json({ threadId: email.providerThreadId, subject: email.subject, messages });
        }
    } catch (error) {
        console.error('Get thread error:', error.message);
        res.status(500).json({ message: 'Failed to fetch thread' });
    }
};

// @desc    Forward an email
// @route   POST /api/emails/forward/:emailId
// @body    { to, message (optional) }
const forwardEmail = async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to) {
            return res.status(400).json({ message: 'to is required' });
        }

        const email = await Email.findById(req.params.emailId);
        if (!email) {
            return res.status(404).json({ message: 'Email not found' });
        }

        const connection = await getVerifiedConnection(email.connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const user = await User.findById(req.user.id).select('emailSignature');
        const signature = user?.emailSignature || '';

        const forwardNote = message ? `${message.replace(/\n/g, '<br>')}<br><br>` : '';
        const originalBody = email.body || email.snippet || '';
        const htmlBody = `${forwardNote}${signature ? `--<br>${signature}<br><br>` : ''}---------- Forwarded message ----------<br>From: ${email.sender}<br>Subject: ${email.subject}<br><br>${originalBody.replace(/\n/g, '<br>')}`;

        if (connection.provider === 'google') {
            const gmail = getGmailClient(connection);

            const rawMessage = [
                `To: ${to}`,
                `Subject: Fwd: ${email.subject}`,
                `Content-Type: text/html; charset=utf-8`,
                '',
                htmlBody,
            ].join('\n');

            const encodedMessage = Buffer.from(rawMessage)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodedMessage },
            });
        } else {
            const { getFreshMicrosoftToken } = await import('../utils/microsoftTokenHelper.js');
            const accessToken = await getFreshMicrosoftToken(connection);

            const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: {
                        subject: `Fwd: ${email.subject}`,
                        body: { contentType: 'HTML', content: htmlBody },
                        toRecipients: [{ emailAddress: { address: to } }],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Microsoft forward failed');
            }
        }

        res.json({ message: 'Email forwarded successfully' });
    } catch (error) {
        console.error('Forward email error:', error.message);
        res.status(500).json({ message: 'Failed to forward email' });
    }
};

// @desc    Send reply to a specific thread message (reply / reply-all)
// @route   POST /api/emails/thread-reply
// @body    { connectionId, threadId, messageId, to, cc, subject, replyText }
const sendThreadReply = async (req, res) => {
    try {
        const { connectionId, threadId, messageId, to, cc, subject, replyText } = req.body;
        if (!to || !replyText) {
            return res.status(400).json({ message: 'to and replyText are required' });
        }

        const connection = await getVerifiedConnection(connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const user = await User.findById(req.user.id).select('emailSignature');
        const signature = user?.emailSignature || '';
        const escapedReply = replyText.replace(/\n/g, '<br>');
        const htmlBody = signature
            ? `${escapedReply}<br><br>--<br>${signature}`
            : escapedReply;

        if (connection.provider === 'google') {
            const gmail = getGmailClient(connection);

            const headers = [
                `To: ${to}`,
                ...(cc ? [`Cc: ${cc}`] : []),
                `Subject: Re: ${subject || ''}`,
                ...(messageId ? [`In-Reply-To: ${messageId}`] : []),
                `Content-Type: text/html; charset=utf-8`,
                '',
                htmlBody,
            ].join('\n');

            const encodedMessage = Buffer.from(headers)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage,
                    threadId: threadId,
                },
            });
        } else {
            const { getFreshMicrosoftToken } = await import('../utils/microsoftTokenHelper.js');
            const accessToken = await getFreshMicrosoftToken(connection);

            const recipients = to.split(',').map((addr) => ({
                emailAddress: { address: addr.trim() },
            }));
            const ccRecipients = cc
                ? cc.split(',').map((addr) => ({ emailAddress: { address: addr.trim() } }))
                : [];

            const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: {
                        subject: `Re: ${subject || ''}`,
                        body: { contentType: 'HTML', content: htmlBody },
                        toRecipients: recipients,
                        ccRecipients,
                        conversationId: threadId || undefined,
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Microsoft thread reply failed');
            }
        }

        res.json({ message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Thread reply error:', error.message);
        res.status(500).json({ message: 'Failed to send reply' });
    }
};

export { syncEmails, getEmails, generateDraft, sendReply, composeEmail, generateCompose, getThread, forwardEmail, sendThreadReply };
