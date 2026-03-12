/**
 * Webhook Sync Service
 *
 * Handles incoming webhook notifications from Google and Microsoft.
 * When a notification arrives saying "new email in inbox", this service:
 * 1. Finds the matching EmailConnection
 * 2. Fetches only the NEW emails (incremental sync)
 * 3. Stores them in MongoDB
 *
 * Key concept - INCREMENTAL SYNC:
 * Instead of re-fetching the last N emails every time (wasteful),
 * we use provider-specific mechanisms to fetch only what changed:
 * - Google: history.list() with startHistoryId
 * - Microsoft: fetch the specific message from the notification
 */

import Email from '../models/Email.js';
import EmailConnection from '../models/EmailConnection.js';
import { getGmailClient } from '../utils/connectionHelper.js';
import { getEmailBody, getHeader } from '../utils/emailParser.js';
import { getFreshMicrosoftToken } from '../utils/microsoftTokenHelper.js';
import { categorizeEmail } from './groqService.js';
import { emitToUser } from './socketService.js';

/**
 * Handle a Google Pub/Sub push notification.
 *
 * Google sends us a base64-encoded JSON message like:
 * { emailAddress: "user@gmail.com", historyId: "12345" }
 *
 * The historyId tells us "something changed at this point."
 * We compare it to our stored historyId to fetch only new messages.
 *
 * @param {string} base64Data - The base64-encoded Pub/Sub message data
 */
export const handleGoogleNotification = async (base64Data) => {
    // Decode the Pub/Sub message
    const decoded = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf-8'));
    const { emailAddress, historyId: newHistoryId } = decoded;

    if (!emailAddress) {
        console.warn('Google notification missing emailAddress');
        return;
    }

    // Find the connection by email address
    const connection = await EmailConnection.findOne({
        provider: 'google',
        emailAddress,
    });

    if (!connection) {
        console.warn(`No Google connection found for ${emailAddress}`);
        return;
    }

    // If we have no stored historyId, we can't do incremental sync
    if (!connection.historyId) {
        return;
    }

    try {
        const gmail = getGmailClient(connection);

        // Fetch history since our last known point
        // This returns only the changes (new messages, label changes, etc.)
        const { data: history } = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: connection.historyId,
            historyTypes: ['messageAdded'],
            labelId: 'INBOX',
        });

        // Update the stored historyId regardless of whether there are new messages
        await EmailConnection.findByIdAndUpdate(connection._id, {
            historyId: newHistoryId,
        });

        // If no new messages, we're done
        if (!history.history || history.history.length === 0) {
            return;
        }

        // Extract new message IDs from the history
        const messageIds = [];
        for (const record of history.history) {
            if (record.messagesAdded) {
                for (const item of record.messagesAdded) {
                    // Only process inbox messages
                    if (item.message.labelIds?.includes('INBOX')) {
                        messageIds.push(item.message.id);
                    }
                }
            }
        }

        // Fetch and store each new message
        let synced = 0;
        const newEmails = [];
        for (const msgId of messageIds) {
            try {
                const { data: details } = await gmail.users.messages.get({
                    userId: 'me',
                    id: msgId,
                    format: 'full',
                });

                const { payload, internalDate } = details;
                const subject = getHeader(payload.headers, 'Subject');
                const sender = getHeader(payload.headers, 'From');
                const snippet = payload.snippet;

                const saved = await Email.findOneAndUpdate(
                    { providerMessageId: msgId },
                    {
                        connectionId: connection._id,
                        providerMessageId: msgId,
                        providerThreadId: details.threadId,
                        subject,
                        sender,
                        snippet,
                        body: getEmailBody(payload),
                        receivedAt: new Date(parseInt(internalDate)),
                    },
                    { upsert: true, returnDocument: 'after' }
                );
                newEmails.push(saved);
                synced++;
            } catch (err) {
                console.error(`Failed to fetch Gmail message ${msgId}:`, err.message);
            }
        }

        if (synced > 0) {
            // Categorize new emails in background, then push via WebSocket
            for (const email of newEmails) {
                try {
                    const category = await categorizeEmail(email.subject, email.sender, email.snippet);
                    await Email.findByIdAndUpdate(email._id, { category });
                    email.category = category;
                } catch (err) {
                    console.error(`Webhook categorization failed for ${email._id}:`, err.message);
                }
                // Push each email to the user's browser in real-time
                emitToUser(connection.userId, 'email:new', email);
            }
        }
    } catch (error) {
        console.error(`Google webhook sync error for ${emailAddress}:`, error.message);
    }
};

/**
 * Handle Microsoft Graph webhook notifications.
 *
 * Microsoft sends an array of notifications, each containing:
 * - subscriptionId: which subscription triggered this
 * - resource: the Graph API path to the new message
 *
 * @param {Array} notifications - Array of notification objects from Microsoft
 */
export const handleMicrosoftNotification = async (notifications) => {
    for (const notification of notifications) {
        const { subscriptionId, resource } = notification;

        // Find the connection by subscription ID
        const connection = await EmailConnection.findOne({
            watchSubscriptionId: subscriptionId,
        });

        if (!connection) {
            console.warn(`No connection found for Microsoft subscription ${subscriptionId}`);
            continue;
        }

        try {
            const accessToken = await getFreshMicrosoftToken(connection);

            // Fetch the specific message that triggered the notification
            // "resource" is something like "me/mailFolders/inbox/messages/{id}"
            const response = await fetch(`https://graph.microsoft.com/v1.0/${resource}`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const error = await response.text();
                console.error(`Failed to fetch Microsoft message: ${error}`);
                continue;
            }

            const msg = await response.json();
            const subject = msg.subject || '';
            const sender = msg.from?.emailAddress
                ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
                : '(unknown)';
            const snippet = msg.bodyPreview || '';

            const saved = await Email.findOneAndUpdate(
                { providerMessageId: msg.id },
                {
                    connectionId: connection._id,
                    providerMessageId: msg.id,
                    providerThreadId: msg.conversationId,
                    subject,
                    sender,
                    snippet,
                    body: msg.body?.content || snippet,
                    receivedAt: new Date(msg.receivedDateTime),
                },
                { upsert: true, returnDocument: 'after' }
            );

            // Categorize the email with AI
            try {
                const category = await categorizeEmail(subject, sender, snippet);
                await Email.findByIdAndUpdate(saved._id, { category });
                saved.category = category;
            } catch (err) {
                console.error(`Webhook categorization failed for ${saved._id}:`, err.message);
            }

            // Push to user's browser in real-time via WebSocket
            emitToUser(connection.userId, 'email:new', saved);

        } catch (error) {
            console.error(`Microsoft webhook sync error for subscription ${subscriptionId}:`, error.message);
        }
    }
};
