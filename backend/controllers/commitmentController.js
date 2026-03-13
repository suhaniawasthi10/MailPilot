/**
 * Commitment Controller
 *
 * All functions operate using connectionId instead of userId.
 * connectionId is passed in the request body (POST) or query (GET).
 * For resource-specific routes (/:id), ownership is verified via the
 * commitment's connectionId.
 *
 * Provider routing: checkOverdue and addToCalendar use Google or Microsoft
 * APIs based on connection.provider.
 */

import Email from '../models/Email.js';
import Commitment from '../models/Commitment.js';
import { getVerifiedConnection, getGmailClient, getCalendarClient } from '../utils/connectionHelper.js';
import { extractCommitmentsBatch, generateReminder } from '../services/groqService.js';
import { createMicrosoftDraft, createMicrosoftCalendarEvent } from '../services/microsoftService.js';

// @desc    Process unprocessed emails through Groq LLM
// @route   POST /api/commitments/extract
// @body    { connectionId }
const processEmails = async (req, res) => {
    try {
        const { connectionId } = req.body;

        if (!connectionId) {
            return res.status(400).json({ message: 'connectionId is required' });
        }

        const connection = await getVerifiedConnection(connectionId, req.user.id);
        if (!connection) {
            return res.status(404).json({ message: 'Connection not found or not yours' });
        }

        const unprocessedEmails = await Email.find({
            connectionId: connection._id,
            isProcessed: false,
        });

        if (unprocessedEmails.length === 0) {
            return res.json({
                message: 'No unprocessed emails found. Try syncing emails first.',
                commitments: [],
            });
        }

        // Batch extract all commitments in a single LLM call
        const extractions = await extractCommitmentsBatch(
            unprocessedEmails.map(e => ({ subject: e.subject, sender: e.sender, body: e.body }))
        );

        const newCommitments = [];
        for (let i = 0; i < unprocessedEmails.length; i++) {
            const email = unprocessedEmails[i];
            const extraction = extractions[i];

            const commitment = await Commitment.create({
                connectionId: connection._id,
                emailId: email._id,
                summary: extraction.summary,
                deadline: extraction.deadline,
                replyRequired: extraction.replyRequired,
                priority: extraction.priority,
            });

            newCommitments.push(commitment);
            await Email.findByIdAndUpdate(email._id, { isProcessed: true });
        }

        res.json({
            message: `Processed ${newCommitments.length} emails`,
            commitments: newCommitments,
        });
    } catch (error) {
        console.error('Process emails error:', error.message);
        res.status(500).json({ message: 'Failed to process emails' });
    }
};

// @desc    Get all commitments for a specific connection
// @route   GET /api/commitments?connectionId=xxx
const getCommitments = async (req, res) => {
    try {
        const { connectionId } = req.query;

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

        const query = { connectionId: connection._id };

        const [total, commitments] = await Promise.all([
            Commitment.countDocuments(query),
            Commitment.find(query)
                .populate('emailId', 'subject sender snippet receivedAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
        ]);

        res.json({
            commitments,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get commitments error:', error.message);
        res.status(500).json({ message: 'Failed to fetch commitments' });
    }
};

// @desc    Toggle commitment status (pending ↔ completed)
// @route   PATCH /api/commitments/:id
const updateCommitment = async (req, res) => {
    try {
        const commitment = await Commitment.findById(req.params.id);

        if (!commitment) {
            return res.status(404).json({ message: 'Commitment not found' });
        }

        const connection = await getVerifiedConnection(commitment.connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized for this commitment' });
        }

        const newStatus = req.body.status || 'completed';
        commitment.status = newStatus;
        // Track when it was completed (for auto-cleanup after 30 days)
        commitment.completedAt = newStatus === 'completed' ? new Date() : null;
        await commitment.save();

        res.json(commitment);
    } catch (error) {
        console.error('Update commitment error:', error.message);
        res.status(500).json({ message: 'Failed to update commitment' });
    }
};

// --- GOOGLE: create reminder draft via Gmail ---
const createGoogleReminderDraft = async (connection, sender, subject, reminderText) => {
    const gmail = getGmailClient(connection);

    const rawMessage = [
        `To: ${sender || ''}`,
        `Subject: Reminder: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        '',
        reminderText,
    ].join('\n');

    const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const draft = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
            message: { raw: encodedMessage },
        },
    });

    return { draftId: draft.data.id };
};

// @desc    Find overdue commitments and generate reminder drafts (Google OR Microsoft)
// @route   POST /api/commitments/check-overdue
// @body    { connectionId }
const checkOverdue = async (req, res) => {
    try {
        const { connectionId } = req.body;

        if (!connectionId) {
            return res.status(400).json({ message: 'connectionId is required' });
        }

        const connection = await getVerifiedConnection(connectionId, req.user.id);
        if (!connection) {
            return res.status(404).json({ message: 'Connection not found or not yours' });
        }

        const overdueCommitments = await Commitment.find({
            connectionId: connection._id,
            status: 'pending',
            deadline: { $lt: new Date(), $ne: null },
        }).populate('emailId', 'subject sender providerThreadId');

        if (overdueCommitments.length === 0) {
            return res.json({
                message: 'No overdue commitments found',
                overdue: [],
            });
        }

        const results = [];

        for (const commitment of overdueCommitments) {
            const reminderText = await generateReminder(
                commitment.summary,
                commitment.deadline.toISOString().split('T')[0],
                commitment.emailId?.subject
            );

            if (!reminderText) continue;

            const sender = commitment.emailId?.sender || '';
            const subject = commitment.emailId?.subject || commitment.summary;

            // Provider-based draft creation
            let result;
            if (connection.provider === 'microsoft') {
                const senderMatch = sender.match(/<(.+?)>/);
                const toAddress = senderMatch ? senderMatch[1] : sender;
                result = await createMicrosoftDraft(connection, toAddress, subject, reminderText);
            } else {
                result = await createGoogleReminderDraft(connection, sender, subject, reminderText);
            }

            results.push({
                commitment: commitment.summary,
                deadline: commitment.deadline,
                draftId: result.draftId,
                reminderText,
            });
        }

        res.json({
            message: `Found ${overdueCommitments.length} overdue commitments, created ${results.length} reminder drafts`,
            overdue: results,
        });
    } catch (error) {
        console.error('Check overdue error:', error.message);
        res.status(500).json({ message: 'Failed to check overdue commitments' });
    }
};

// --- GOOGLE: add event to Google Calendar ---
const addToGoogleCalendar = async (connection, commitment) => {
    const calendar = getCalendarClient(connection);
    const deadlineDate = commitment.deadline.toISOString().split('T')[0];

    const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: commitment.summary,
            description: `From email: ${commitment.emailId?.subject || 'N/A'}\nSender: ${commitment.emailId?.sender || 'N/A'}\nPriority: ${commitment.priority}`,
            start: { date: deadlineDate },
            end: { date: deadlineDate },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 1440 },
                ],
            },
        },
    });

    return {
        eventId: event.data.id,
        eventLink: event.data.htmlLink,
    };
};

// @desc    Add a commitment's deadline to calendar (Google OR Microsoft)
// @route   POST /api/commitments/:id/calendar
const addToCalendar = async (req, res) => {
    try {
        const commitment = await Commitment.findById(req.params.id)
            .populate('emailId', 'subject sender');

        if (!commitment) {
            return res.status(404).json({ message: 'Commitment not found' });
        }

        const connection = await getVerifiedConnection(commitment.connectionId, req.user.id);
        if (!connection) {
            return res.status(403).json({ message: 'Not authorized for this commitment' });
        }

        if (!commitment.deadline) {
            return res.status(400).json({ message: 'This commitment has no deadline to add to calendar' });
        }

        // Provider-based calendar event creation
        let result;
        const description = `From email: ${commitment.emailId?.subject || 'N/A'}\nSender: ${commitment.emailId?.sender || 'N/A'}\nPriority: ${commitment.priority}`;
        const deadlineDate = commitment.deadline.toISOString().split('T')[0];

        if (connection.provider === 'microsoft') {
            result = await createMicrosoftCalendarEvent(connection, commitment.summary, deadlineDate, description);
        } else {
            result = await addToGoogleCalendar(connection, commitment);
        }

        res.json({
            message: 'Event added to calendar',
            eventId: result.eventId,
            eventLink: result.eventLink,
        });
    } catch (error) {
        console.error('Add to calendar error:', error.message);
        res.status(500).json({ message: 'Failed to add to calendar' });
    }
};

export { processEmails, getCommitments, updateCommitment, checkOverdue, addToCalendar };
