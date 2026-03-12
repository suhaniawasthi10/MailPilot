import * as msal from '@azure/msal-node';

const msalConfig = {
    auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        authority: 'https://login.microsoftonline.com/common',
    },
};

export const msalClient = new msal.ConfidentialClientApplication(msalConfig);

export const MICROSOFT_SCOPES = [
    'openid',
    'profile',
    'email',
    'User.Read',
    'Mail.Read',
    'Mail.ReadWrite',
    'Calendars.ReadWrite',
];

export const MICROSOFT_REDIRECT_URI =
    process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5000/auth/microsoft/callback';
