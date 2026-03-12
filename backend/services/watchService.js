/**
 * Watch Service
 *
 * Manages the lifecycle of email watches/subscriptions:
 * - Google: gmail.users.watch() → Pub/Sub push notifications
 * - Microsoft: Graph API subscriptions → webhook POST notifications
 *
 * Watches expire (Google: 7 days, Microsoft: ~3 days), so we also
 * run a renewal scheduler that checks every 6 hours.
 */

import { getGmailClient } from '../utils/connectionHelper.js';
import { getFreshMicrosoftToken } from '../utils/microsoftTokenHelper.js';
import EmailConnection from '../models/EmailConnection.js';

/**
 * Register a Gmail push notification watch.
 *
 * How it works:
 * 1. We call gmail.users.watch() with our Pub/Sub topic
 * 2. Google responds with a historyId and expiration
 * 3. Whenever this mailbox gets a new email, Google publishes a message
 *    to our Pub/Sub topic, which triggers our webhook endpoint
 *
 * @param {Object} connection - The EmailConnection document
 */
export const registerGoogleWatch = async (connection) => {
    const topic = process.env.GOOGLE_PUBSUB_TOPIC;
    if (!topic) {
        console.warn('GOOGLE_PUBSUB_TOPIC not set — skipping Google watch registration');
        return;
    }

    try {
        const gmail = getGmailClient(connection);

        // Tell Google to notify us about inbox changes
        const { data } = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: topic,
                labelIds: ['INBOX'],
            },
        });

        // data.historyId = the current point in the mailbox history
        // data.expiration = when this watch expires (ms since epoch)
        await EmailConnection.findByIdAndUpdate(connection._id, {
            historyId: data.historyId,
            watchResourceId: data.resourceId || '',
            watchExpiration: new Date(parseInt(data.expiration)),
        });

        console.log(`Google watch registered for ${connection.emailAddress}, expires ${new Date(parseInt(data.expiration)).toISOString()}`);
    } catch (error) {
        // Non-fatal: the app works without real-time sync (user can still manual sync)
        console.error(`Failed to register Google watch for ${connection.emailAddress}:`, error.message);
    }
};

/**
 * Register a Microsoft Graph API subscription for mail notifications.
 *
 * How it works:
 * 1. We POST to /subscriptions with our webhook URL
 * 2. Microsoft immediately validates our webhook (sends a GET with a token)
 * 3. Once validated, Microsoft POSTs to our webhook whenever new mail arrives
 *
 * @param {Object} connection - The EmailConnection document
 */
export const registerMicrosoftSubscription = async (connection) => {
    const webhookBase = process.env.WEBHOOK_BASE_URL;
    const secret = process.env.MICROSOFT_WEBHOOK_SECRET;
    if (!webhookBase) {
        console.warn('WEBHOOK_BASE_URL not set — skipping Microsoft subscription');
        return;
    }

    try {
        const accessToken = await getFreshMicrosoftToken(connection);

        // Microsoft subscriptions expire after max 4230 minutes (~3 days) for mail
        const expiration = new Date();
        expiration.setDate(expiration.getDate() + 3);

        const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                changeType: 'created',
                notificationUrl: `${webhookBase}/webhooks/microsoft`,
                resource: 'me/mailFolders/inbox/messages',
                expirationDateTime: expiration.toISOString(),
                clientState: secret || 'mailpilot-webhook',
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Graph subscription error (${response.status}): ${error}`);
        }

        const subscription = await response.json();

        await EmailConnection.findByIdAndUpdate(connection._id, {
            watchSubscriptionId: subscription.id,
            watchExpiration: new Date(subscription.expirationDateTime),
        });

        console.log(`Microsoft subscription registered for ${connection.emailAddress}, expires ${subscription.expirationDateTime}`);
    } catch (error) {
        console.error(`Failed to register Microsoft subscription for ${connection.emailAddress}:`, error.message);
    }
};

/**
 * Renew watches/subscriptions that are expiring within the next 24 hours.
 * Called by the scheduler every 6 hours.
 */
export const renewExpiringWatches = async () => {
    const soon = new Date();
    soon.setHours(soon.getHours() + 24);

    try {
        const expiring = await EmailConnection.find({
            watchExpiration: { $lt: soon, $ne: null },
        });

        if (expiring.length === 0) return;

        console.log(`Renewing ${expiring.length} expiring watch(es)...`);

        for (const connection of expiring) {
            if (connection.provider === 'google') {
                await registerGoogleWatch(connection);
            } else if (connection.provider === 'microsoft') {
                await registerMicrosoftSubscription(connection);
            }
        }
    } catch (error) {
        console.error('Watch renewal error:', error.message);
    }
};

/**
 * Start the renewal scheduler.
 * Runs immediately on startup (to catch expired watches while server was down),
 * then every 6 hours.
 */
export const startWatchRenewalScheduler = () => {
    // Run once immediately
    renewExpiringWatches();

    // Then every 6 hours
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    setInterval(renewExpiringWatches, SIX_HOURS);

    console.log('Watch renewal scheduler started (runs every 6 hours)');
};
