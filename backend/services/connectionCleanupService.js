/**
 * Connection Cleanup Service
 *
 * Single place that knows how to fully tear down an EmailConnection:
 *   - unsubscribe the provider (Gmail watch / Graph subscription)
 *   - delete vectors from Pinecone
 *   - delete commitments + emails
 *   - delete the connection itself
 *
 * Used by both `DELETE /api/connections/:id` and `DELETE /api/user` so the
 * cleanup logic doesn't drift between those two paths.
 *
 * Provider unsubscribes are best-effort: tokens may already be revoked,
 * subscriptions may have expired, etc. We log and continue so a partial
 * failure never strands the user with undeletable data.
 */

import Email from '../models/Email.js';
import Commitment from '../models/Commitment.js';
import EmailConnection from '../models/EmailConnection.js';
import { getGmailClient } from '../utils/connectionHelper.js';
import { getFreshMicrosoftToken } from '../utils/microsoftTokenHelper.js';
import { Pinecone } from '@pinecone-database/pinecone';

// Pinecone allows up to 1000 IDs per deleteMany call.
const PINECONE_DELETE_BATCH = 1000;

const getPineconeIndex = () => {
    const apiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME;
    if (!apiKey || !indexName) return null;
    return new Pinecone({ apiKey }).index(indexName);
};

const unsubscribeGoogle = async (connection) => {
    if (!connection.historyId) return;
    try {
        const gmail = getGmailClient(connection);
        await gmail.users.stop({ userId: 'me' });
    } catch (err) {
        console.error(`Google watch stop failed for ${connection.emailAddress}:`, err.message);
    }
};

const unsubscribeMicrosoft = async (connection) => {
    if (!connection.watchSubscriptionId) return;
    try {
        const accessToken = await getFreshMicrosoftToken(connection);
        const response = await fetch(
            `https://graph.microsoft.com/v1.0/subscriptions/${connection.watchSubscriptionId}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!response.ok && response.status !== 404) {
            const error = await response.text();
            console.error(`Microsoft subscription delete returned ${response.status}: ${error}`);
        }
    } catch (err) {
        console.error(`Microsoft subscription delete failed for ${connection.emailAddress}:`, err.message);
    }
};

const deletePineconeVectorsFor = async (emails) => {
    const index = getPineconeIndex();
    if (!index) return;

    const ids = [];
    for (const email of emails) {
        for (let i = 0; i < (email.chunkCount || 0); i++) {
            ids.push(`${email._id.toString()}#${i}`);
        }
    }
    if (ids.length === 0) return;

    for (let i = 0; i < ids.length; i += PINECONE_DELETE_BATCH) {
        const batch = ids.slice(i, i + PINECONE_DELETE_BATCH);
        try {
            await index.deleteMany(batch);
        } catch (err) {
            console.error(`Pinecone deleteMany failed (${batch.length} ids):`, err.message);
        }
    }
};

/**
 * Fully delete a connection: unsubscribe, drop vectors, drop docs.
 * Each step is wrapped so a single failure doesn't abort the rest.
 */
export const deleteConnectionFully = async (connection) => {
    if (connection.provider === 'google') {
        await unsubscribeGoogle(connection);
    } else if (connection.provider === 'microsoft') {
        await unsubscribeMicrosoft(connection);
    }

    const emails = await Email.find({ connectionId: connection._id }).select('_id chunkCount');
    await deletePineconeVectorsFor(emails);

    await Commitment.deleteMany({ connectionId: connection._id });
    await Email.deleteMany({ connectionId: connection._id });
    await EmailConnection.findByIdAndDelete(connection._id);
};
