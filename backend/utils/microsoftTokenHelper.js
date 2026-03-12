import * as msal from '@azure/msal-node';
import EmailConnection from '../models/EmailConnection.js';

const msalConfig = {
    auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        authority: 'https://login.microsoftonline.com/common',
    },
};

const msalClient = new msal.ConfidentialClientApplication(msalConfig);

const SCOPES = [
    'User.Read',
    'Mail.Read',
    'Mail.ReadWrite',
    'Calendars.ReadWrite',
];

/**
 * Get a fresh Microsoft access token for a connection.
 * Uses the refresh token to acquire a new access token via MSAL,
 * persists the updated tokens, and returns the fresh access token.
 * Falls back to the stored token if no refresh token is available.
 */
export const getFreshMicrosoftToken = async (connection) => {
    if (!connection.refreshToken) {
        return connection.accessToken;
    }

    try {
        const result = await msalClient.acquireTokenByRefreshToken({
            refreshToken: connection.refreshToken,
            scopes: SCOPES,
        });

        const update = { accessToken: result.accessToken };
        if (result.refreshToken) {
            update.refreshToken = result.refreshToken;
        }
        await EmailConnection.findByIdAndUpdate(connection._id, update);

        // Update the in-memory connection object so callers use the fresh token
        connection.accessToken = result.accessToken;
        if (result.refreshToken) {
            connection.refreshToken = result.refreshToken;
        }

        return result.accessToken;
    } catch (err) {
        console.error('Microsoft token refresh failed:', err.message);
        // Fall back to existing token — it may still be valid
        return connection.accessToken;
    }
};
