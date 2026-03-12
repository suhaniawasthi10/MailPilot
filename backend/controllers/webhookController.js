/**
 * Webhook Controller
 *
 * These endpoints are called by GOOGLE and MICROSOFT servers,
 * NOT by our frontend. That's why they have:
 * - No JWT auth middleware (Google/Microsoft don't have our JWTs)
 * - No rate limiting (we trust these providers)
 * - Fast responses (providers expect quick acknowledgment)
 *
 * The actual processing happens asynchronously AFTER we respond,
 * because providers will retry if we take too long.
 */

import { handleGoogleNotification, handleMicrosoftNotification } from '../services/webhookSyncService.js';

/**
 * Google Pub/Sub push endpoint.
 *
 * When Gmail detects a change, Google Pub/Sub sends us a POST like:
 * {
 *   "message": {
 *     "data": "<base64 encoded JSON>",     // { emailAddress, historyId }
 *     "messageId": "123",
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 *
 * We MUST respond 200 quickly, or Google will retry (and we'd process duplicates).
 */
export const googleWebhook = (req, res) => {
    // Respond immediately — Google requires fast acknowledgment
    res.status(200).send('OK');

    // Process the notification asynchronously (fire-and-forget)
    const messageData = req.body?.message?.data;
    if (messageData) {
        handleGoogleNotification(messageData).catch((err) => {
            console.error('Google webhook processing error:', err.message);
        });
    }
};

/**
 * Microsoft Graph webhook endpoint.
 *
 * This endpoint handles TWO types of requests:
 *
 * 1. VALIDATION (when we first create a subscription):
 *    Microsoft sends a POST with a query param ?validationToken=xyz
 *    We must respond with 200 and the token as plain text.
 *    This proves we own the webhook URL.
 *
 * 2. NOTIFICATION (when new email arrives):
 *    Microsoft sends POST with body:
 *    { "value": [{ subscriptionId, clientState, resource, ... }] }
 *    We verify clientState matches our secret, then process.
 */
export const microsoftWebhook = (req, res) => {
    // --- Handle validation request ---
    const validationToken = req.query.validationToken;
    if (validationToken) {
        // Microsoft is verifying our webhook URL exists
        // We MUST respond with the token as plain text
        return res.status(200).contentType('text/plain').send(validationToken);
    }

    // --- Handle actual notification ---
    // Respond immediately with 202 Accepted
    res.status(202).send('Accepted');

    const notifications = req.body?.value;
    if (!notifications || !Array.isArray(notifications)) return;

    // Verify the clientState matches our secret (prevents spoofed notifications)
    const expectedSecret = process.env.MICROSOFT_WEBHOOK_SECRET || 'mailpilot-webhook';
    const validNotifications = notifications.filter((n) => n.clientState === expectedSecret);

    if (validNotifications.length === 0) {
        console.warn('Microsoft webhook: all notifications failed clientState verification');
        return;
    }

    // Process asynchronously
    handleMicrosoftNotification(validNotifications).catch((err) => {
        console.error('Microsoft webhook processing error:', err.message);
    });
};
