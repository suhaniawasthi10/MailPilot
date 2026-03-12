import { google } from 'googleapis';
import EmailConnection from '../models/EmailConnection.js';

// Verify a connection belongs to the logged-in user and return it
export const getVerifiedConnection = async (connectionId, userId) => {
    return await EmailConnection.findOne({ _id: connectionId, userId });
};

// Create an OAuth2 client that auto-refreshes tokens and persists them
const createOAuth2Client = (connection) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({
        access_token: connection.accessToken,
        refresh_token: connection.refreshToken,
    });

    // Listen for new tokens (fires when access token is refreshed)
    oauth2Client.on('tokens', async (tokens) => {
        try {
            const update = { accessToken: tokens.access_token };
            if (tokens.refresh_token) {
                update.refreshToken = tokens.refresh_token;
            }
            await EmailConnection.findByIdAndUpdate(connection._id, update);
        } catch (err) {
            console.error('Failed to persist refreshed tokens:', err.message);
        }
    });

    return oauth2Client;
};

// Create an authenticated Gmail client from a connection's tokens
export const getGmailClient = (connection) => {
    const oauth2Client = createOAuth2Client(connection);
    return google.gmail({ version: 'v1', auth: oauth2Client });
};

// Create an authenticated Google Calendar client from a connection's tokens
export const getCalendarClient = (connection) => {
    const oauth2Client = createOAuth2Client(connection);
    return google.calendar({ version: 'v3', auth: oauth2Client });
};
