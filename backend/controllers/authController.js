import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import EmailConnection from '../models/EmailConnection.js';
import { getGmailClient } from '../utils/connectionHelper.js';
import { registerGoogleWatch } from '../services/watchService.js';

// Initialize OAuth2 client (used only for the login/connect flow)
const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Scopes required for Gmail access
const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.events',
];

// @desc    Redirect user to Google OAuth consent screen (first-time login)
// @route   GET /auth/google
const googleLogin = (req, res) => {
    try {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent',
        });

        res.redirect(authUrl);
    } catch (error) {
        console.error('Google login error:', error.message);
        res.status(500).json({ message: 'Failed to initiate Google login' });
    }
};

// @desc    Connect an additional Google account to the logged-in user
// @route   GET /auth/google/connect
// The user's JWT is passed as OAuth "state" so the callback knows
// to add the connection to the existing user instead of creating a new one.
const googleConnect = (req, res) => {
    try {
        const token = req.query.token;

        if (!token) {
            return res.status(400).json({ message: 'Token query param is required. Use /auth/google/connect?token=<your_jwt>' });
        }

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent',
            state: token,  // Pass JWT as state — callback will decode it
        });

        res.redirect(authUrl);
    } catch (error) {
        console.error('Google connect error:', error.message);
        res.status(500).json({ message: 'Failed to initiate Google connect' });
    }
};

// @desc    Handle Google OAuth callback (login OR connect)
// @route   GET /auth/google/callback
const googleCallback = async (req, res) => {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).json({ message: 'Authorization code missing' });
        }

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user info from Google
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();

        let user;

        if (state) {
            // --- CONNECT flow: adding account to existing user ---
            // Decode the JWT from state to find the existing user
            const decoded = jwt.verify(state, process.env.JWT_SECRET);
            user = await User.findById(decoded.id);

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
        } else {
            // --- LOGIN flow: create or find user ---
            user = await User.findOneAndUpdate(
                { providerId: `google_${userInfo.id}` },
                {
                    providerId: `google_${userInfo.id}`,
                    email: userInfo.email,
                    name: userInfo.name,
                },
                { upsert: true, returnDocument: 'after' }
            );
        }

        // Create or update EmailConnection (same for both flows)
        const connection = await EmailConnection.findOneAndUpdate(
            { userId: user._id, providerAccountId: userInfo.id },
            {
                userId: user._id,
                provider: 'google',
                providerAccountId: userInfo.id,
                emailAddress: userInfo.email,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || undefined,
            },
            { upsert: true, returnDocument: 'after' }
        );

        // Register Gmail push notifications (non-blocking — don't slow down login)
        registerGoogleWatch(connection).catch((err) =>
            console.error('Watch registration failed:', err.message)
        );

        // Generate JWT (always based on User identity)
        const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: '7d',
        });

        // Redirect to frontend with token
        res.redirect(`${process.env.FRONTEND_URL}?token=${jwtToken}`);
    } catch (error) {
        console.error('Google callback error:', error.message);
        res.status(500).json({ message: 'OAuth callback failed' });
    }
};

// @desc    Get profile of authenticated user (works for both Google and Microsoft)
// @route   GET /auth/profile
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get the user's first EmailConnection
        const connection = await EmailConnection.findOne({ userId: user._id });

        if (!connection) {
            return res.status(404).json({ message: 'No email connection found' });
        }

        if (connection.provider === 'microsoft') {
            // Microsoft: fetch profile from Graph API
            const { getFreshMicrosoftToken } = await import('../utils/microsoftTokenHelper.js');
            const accessToken = await getFreshMicrosoftToken(connection);

            const response = await fetch('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const msProfile = await response.json();

            res.json({
                emailAddress: msProfile.mail || msProfile.userPrincipalName,
                name: user.name || msProfile.displayName,
            });
        } else {
            // Google: fetch profile from Gmail API
            const gmail = getGmailClient(connection);
            const { data: profile } = await gmail.users.getProfile({ userId: 'me' });

            res.json({
                emailAddress: profile.emailAddress,
                messagesTotal: profile.messagesTotal,
                threadsTotal: profile.threadsTotal,
                name: user.name,
            });
        }
    } catch (error) {
        console.error('Get profile error:', error.message);
        res.status(500).json({ message: 'Failed to fetch profile' });
    }
};

export { googleLogin, googleConnect, googleCallback, getProfile };
