# MailPilot — AI Chief of Staff for Email

> An intelligent email management platform that syncs your inbox, extracts actionable commitments using AI, tracks deadlines, and lets you reply — all from one place.

[![Live Demo](https://img.shields.io/badge/Live-mail--pilot.vercel.app-indigo?style=for-the-badge)](https://mail-pilot-wheat.vercel.app)
[![Built With](https://img.shields.io/badge/AI-Groq%20LLaMA%203.3-orange?style=for-the-badge)]()
[![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Node%20%2B%20MongoDB-green?style=for-the-badge)]()

---

## The Problem

Email is where commitments go to die. Buried in threads are deadlines, follow-ups, and action items that are easy to miss. Traditional email clients don't understand *what* you need to do — they only show you *what* you received.

## The Solution

MailPilot connects to your Gmail or Outlook, uses LLMs to extract every commitment, deadline, and reply-needed flag from your emails, then tracks them in a smart dashboard. It also auto-categorizes your inbox, generates AI-powered replies, and supports full threaded conversations with reply, reply-all, and forward — all without leaving the app.

---

## Features

### Email Intelligence
- **AI Commitment Extraction** — Automatically detects action items, deadlines, and reply-needed flags from email content using Groq LLaMA 3.3 70B
- **Smart Categorization** — Classifies emails into 9 categories (Personal, Work, Newsletter, Marketing, Receipt, Calendar, Notification, Cold Email) with a single batched LLM call
- **Priority Inbox** — Surfaces important emails first, pushes noise down

### Email Client
- **Full Thread View** — See entire conversation threads like Gmail, not just individual messages
- **Reply / Reply All / Forward** — Per-message actions on every thread message
- **Compose Email** — Floating compose button accessible from any page with rich text support
- **HTML Email Rendering** — Renders images, formatting, and rich content in a sandboxed iframe
- **Real-time Sync** — New emails appear instantly via Google Pub/Sub webhooks and WebSockets

### AI-Powered Writing
- **Generate AI Reply** — One-click smart reply generation that saves as a Gmail/Outlook draft
- **Custom Prompt** — Tell the AI *how* to reply: "Decline politely", "Ask for a deadline extension", "Accept and suggest a meeting"
- **Write with AI (Compose)** — Generate entire emails from a prompt in the compose modal
- **Custom Email Signature** — Rich text signature editor with auto-append to all outgoing emails

### Commitment Tracking
- **Dashboard Overview** — Stats for synced emails, pending commitments, overdue items, and reply-needed count
- **Mark Complete / Revert** — Toggle commitment status with one click
- **Overdue Detection** — Highlights overdue items and can auto-generate reminder draft emails
- **Calendar Integration** — Add commitment deadlines directly to Google Calendar or Outlook Calendar
- **Auto-Cleanup** — Completed commitments are automatically purged after 30 days

### Multi-Account
- **Google + Microsoft** — Connect multiple Gmail and Outlook accounts simultaneously
- **Account Switcher** — Switch between connected accounts from the sidebar
- **Per-Account Isolation** — Emails, commitments, and sync are scoped per connection

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Vite 7 |
| **Backend** | Node.js, Express 5, ES Modules |
| **Database** | MongoDB Atlas with Mongoose |
| **AI/LLM** | Groq API (LLaMA 3.3 70B Versatile) |
| **Auth** | Google OAuth 2.0, Microsoft MSAL, JWT |
| **Real-time** | Socket.IO, Google Pub/Sub, Microsoft Graph Webhooks |
| **Email APIs** | Gmail API v1, Microsoft Graph API v1.0 |
| **Deployment** | Vercel (frontend) + Railway (backend) |

---

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────┐     OAuth 2.0     ┌──────────────┐
│   React UI  │◄──────────────────►│   Express API    │◄────────────────►│  Gmail API   │
│  (Vercel)   │     REST API       │   (Railway)      │                  │  Graph API   │
└─────────────┘                    └──────┬───────────┘                  └──────────────┘
                                          │
                              ┌───────────┼───────────┐
                              ▼           ▼           ▼
                        ┌──────────┐ ┌─────────┐ ┌─────────────┐
                        │ MongoDB  │ │  Groq   │ │  Pub/Sub    │
                        │  Atlas   │ │  LLM    │ │  Webhooks   │
                        └──────────┘ └─────────┘ └─────────────┘
```

**Key architectural decisions:**

- **Batched LLM calls** — Instead of one API call per email, categories and commitments are extracted in a single batched prompt, reducing latency by 10x
- **Parallel Gmail fetching** — Emails are fetched in batches of 20 using `Promise.all` instead of sequentially
- **Incremental webhook sync** — Only new emails are fetched using Gmail's `history.list()` with `startHistoryId`, not the full inbox
- **Provider-agnostic data model** — `providerThreadId` and `providerMessageId` abstract away Gmail vs Outlook differences
- **Sandboxed HTML rendering** — Email bodies render in `<iframe sandbox="allow-same-origin">` to prevent XSS while preserving images and formatting

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google` | Initiate Google OAuth login |
| GET | `/auth/google/connect` | Connect additional Gmail account |
| GET | `/auth/microsoft` | Initiate Microsoft OAuth login |
| GET | `/auth/microsoft/connect` | Connect additional Outlook account |
| GET | `/auth/profile` | Get authenticated user profile |

### Emails
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/emails` | List synced emails (paginated) |
| GET | `/api/emails/thread/:id` | Get full conversation thread |
| POST | `/api/emails/sync` | Sync latest emails from provider |
| POST | `/api/emails/generate-draft/:id` | Generate AI reply + save as draft |
| POST | `/api/emails/send-reply/:id` | Send reply (or send existing draft) |
| POST | `/api/emails/thread-reply` | Reply / Reply-all within a thread |
| POST | `/api/emails/forward/:id` | Forward an email |
| POST | `/api/emails/compose` | Compose and send new email |
| POST | `/api/emails/generate-compose` | AI-generate email body |

### Commitments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/commitments` | List commitments (paginated) |
| POST | `/api/commitments/extract` | Extract commitments from unprocessed emails |
| POST | `/api/commitments/check-overdue` | Detect overdue items + generate reminders |
| POST | `/api/commitments/:id/calendar` | Add deadline to calendar |
| PATCH | `/api/commitments/:id` | Update status (complete/pending) |

### Connections & User
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/connections` | List connected email accounts |
| DELETE | `/api/connections/:id` | Disconnect account (cascade deletes data) |
| GET | `/api/user/signature` | Fetch email signature |
| PUT | `/api/user/signature` | Save email signature (HTML) |

### Webhooks (no auth — called by Google/Microsoft)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/google` | Google Pub/Sub push notification |
| POST | `/webhooks/microsoft` | Microsoft Graph change notification |

---

## Rate Limiting

| Tier | Limit | Scope |
|------|-------|-------|
| General API | 100 req/min | All authenticated endpoints |
| Auth | 5 req/min | Login and registration |
| AI Endpoints | 3 req/min | Groq LLM calls (generate-draft, extract, etc.) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account
- Google Cloud Console project (Gmail API + Pub/Sub enabled)
- Microsoft Azure App Registration (optional, for Outlook)
- Groq API key

### 1. Clone the repository
```bash
git clone https://github.com/your-username/mailpilot.git
cd mailpilot
```

### 2. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# Fill in your environment variables (see below)
npm run dev
```

### 3. Frontend setup
```bash
cd frontend
npm install
# Create .env with VITE_API_URL=http://localhost:5000
npm run dev
```

### Environment Variables

```env
# Server
PORT=5000
MONGO_URI=mongodb+srv://...
FRONTEND_URL=http://localhost:5173

# Authentication
JWT_SECRET=your-jwt-secret
TOKEN_ENCRYPTION_KEY=your-32-char-encryption-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# Microsoft OAuth (optional)
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret

# AI
GROQ_API_KEY=your-groq-api-key

# Webhooks (for production)
GOOGLE_PUBSUB_TOPIC=projects/your-project/topics/gmail-push
WEBHOOK_BASE_URL=https://your-backend.railway.app
MICROSOFT_WEBHOOK_SECRET=your-webhook-secret
```

---

## Project Structure

```
mailpilot/
├── frontend/
│   ├── src/
│   │   ├── pages/           # Dashboard, Emails, Commitments, Settings, Login
│   │   ├── components/      # Layout, ComposeEmail, Toast, Skeleton, PriorityBadge
│   │   ├── context/         # ConnectionContext, SocketContext
│   │   ├── lib/             # API client, formatDate, avatarColor, cache
│   │   ├── types/           # TypeScript interfaces
│   │   └── App.tsx          # Router + protected routes
│   ├── vercel.json          # SPA routing for Vercel
│   └── package.json
│
├── backend/
│   ├── models/              # User, Email, EmailConnection, Commitment
│   ├── controllers/         # emailController, commitmentController, authControllers
│   ├── services/            # groqService, watchService, webhookSyncService,
│   │                        # socketService, cleanupService, microsoftService
│   ├── routes/              # emailRoutes, commitmentRoutes, connectionRoutes,
│   │                        # webhookRoutes, authRoutes, userRoutes
│   ├── middleware/          # auth (JWT), validate, rateLimit
│   ├── utils/               # connectionHelper, emailParser, encryption, tokenHelpers
│   ├── config/              # db.js (MongoDB connection)
│   └── server.js            # Express + Socket.IO + scheduler init
│
└── README.md
```

---

## How the AI Works

### Commitment Extraction Pipeline
```
Unprocessed Emails → Batch Prompt → Groq LLaMA 3.3 70B → JSON Response
                                                              │
                                          ┌───────────────────┤
                                          ▼                   ▼
                                    {summary}           {deadline}
                                    {priority}          {replyRequired}
```

A single LLM call processes up to 10 emails at once, extracting structured JSON with:
- **Summary** — What the commitment is
- **Deadline** — Parsed date (if mentioned)
- **Priority** — high / medium / low based on urgency signals
- **Reply Required** — Whether the sender expects a response

### Email Categorization
Emails are batch-classified into 9 categories using keyword signals, sender patterns, and content analysis — all in one LLM call with forced JSON output.

---

## Deployment

### Frontend → Vercel
- Framework: Vite
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment: `VITE_API_URL` pointing to Railway backend

### Backend → Railway
- Root directory: `backend`
- Start command: `npm start`
- All environment variables configured in Railway dashboard
- MongoDB Atlas whitelisted with `0.0.0.0/0` for Railway access

---

## Security

- **OAuth 2.0** with PKCE for Google and Microsoft authentication
- **JWT tokens** for API authentication with expiry
- **AES-256 encryption** for stored OAuth tokens at rest
- **Rate limiting** on all endpoints (tiered by sensitivity)
- **Sandboxed iframes** for HTML email rendering (prevents XSS)
- **CORS** restricted to frontend origin
- **Webhook verification** — Microsoft webhooks validated via `clientState` secret
- **Input validation** — MongoDB ObjectId validation on all parameterized routes
- **No credential exposure** — tokens excluded from connection list API responses

---

## License

MIT

---

<p align="center">
  Built with Groq AI, React, and Node.js<br>
  <strong>MailPilot</strong> — Never miss a commitment again.
</p>
