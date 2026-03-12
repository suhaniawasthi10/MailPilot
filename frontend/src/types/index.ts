export interface Connection {
  _id: string
  provider: 'google' | 'microsoft'
  emailAddress: string
  createdAt: string
}

export type EmailCategory =
  | 'personal'
  | 'work'
  | 'newsletter'
  | 'marketing'
  | 'receipt'
  | 'calendar'
  | 'notification'
  | 'cold-email'
  | 'uncategorized'

export interface Email {
  _id: string
  connectionId: string
  providerThreadId: string
  providerMessageId: string
  subject: string
  sender: string
  snippet: string
  body: string
  receivedAt: string
  isProcessed: boolean
  category: EmailCategory
}

export interface Commitment {
  _id: string
  connectionId: string
  emailId: Email | string
  summary: string
  deadline: string | null
  replyRequired: boolean
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'completed'
  createdAt: string
}
