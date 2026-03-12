/**
 * Microsoft Graph API Service
 *
 * Handles all Microsoft Graph API calls for mail and calendar.
 * Automatically refreshes access tokens before each request.
 */

import { getFreshMicrosoftToken } from '../utils/microsoftTokenHelper.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Helper: make an authenticated Graph API request
const graphRequest = async (accessToken, endpoint, options = {}) => {
    const response = await fetch(`${GRAPH_BASE}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Graph API error (${response.status}): ${error}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
};

/**
 * Fetch latest 5 emails from Outlook inbox.
 */
export const fetchMicrosoftEmails = async (connection, limit = 10) => {
    const accessToken = await getFreshMicrosoftToken(connection);

    const data = await graphRequest(accessToken, '/me/mailFolders/inbox/messages?' + new URLSearchParams({
        $top: String(limit),
        $orderby: 'receivedDateTime desc',
        $select: 'id,conversationId,subject,from,bodyPreview,body,receivedDateTime',
    }));

    return (data.value || []).map((msg) => ({
        providerMessageId: msg.id,
        providerThreadId: msg.conversationId,
        subject: msg.subject || '',
        sender: msg.from?.emailAddress
            ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>`
            : '(unknown)',
        snippet: msg.bodyPreview || '',
        body: msg.body?.content || msg.bodyPreview || '',
        receivedAt: new Date(msg.receivedDateTime),
    }));
};

/**
 * Create a draft reply in Outlook.
 */
export const createMicrosoftDraft = async (connection, to, subject, body, conversationId) => {
    const accessToken = await getFreshMicrosoftToken(connection);

    const draft = await graphRequest(accessToken, '/me/messages', {
        method: 'POST',
        body: JSON.stringify({
            subject: `Re: ${subject}`,
            body: {
                contentType: 'text',
                content: body,
            },
            toRecipients: [
                {
                    emailAddress: { address: to },
                },
            ],
            conversationId: conversationId || undefined,
            isDraft: true,
        }),
    });

    return {
        draftId: draft.id,
    };
};

/**
 * Create a calendar event in Outlook.
 */
export const createMicrosoftCalendarEvent = async (connection, summary, date, description) => {
    const accessToken = await getFreshMicrosoftToken(connection);

    const event = await graphRequest(accessToken, '/me/events', {
        method: 'POST',
        body: JSON.stringify({
            subject: summary,
            body: {
                contentType: 'text',
                content: description,
            },
            start: {
                dateTime: `${date}T00:00:00`,
                timeZone: 'UTC',
            },
            end: {
                dateTime: `${date}T23:59:59`,
                timeZone: 'UTC',
            },
            isAllDay: true,
            reminderMinutesBeforeStart: 1440,
            isReminderOn: true,
        }),
    });

    return {
        eventId: event.id,
        eventLink: event.webLink,
    };
};
