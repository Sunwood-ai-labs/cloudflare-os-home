import { Cursor } from "@gadgets/workshop-shared/gatekeeper";

export type { Cursor };

// ── Plain data types ────────────────────────────────────────────────

/** An email address with optional display name. */
export type EmailAddress = {
  address: string;
  name?: string;
}

export type GmailThreadInfo = {
  id: string;
  /** Preview text when Gmail includes one for this response format. */
  snippet?: string;
  subject: string;
  messageCount: number;
}

export type GmailMessageInfo = {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  timestamp: Date;
  labels: GmailLabel[];
}

/** Email content in available formats. Both fields may be absent for bodyless messages. */
export type EmailContent = {
  text?: string;
  html?: string;
}

// ── Capability interfaces ───────────────────────────────────────────
// These are RPC stubs — all methods are async. Capabilities can be
// passed across Worker boundaries and retain their access rights.

/** A single entry from the thread cursor, including metadata and a thread capability. */
export type GmailThreadEntry = {
  info: GmailThreadInfo;
  thread: GmailThread;
}

export interface GmailSession {
  /** List the most recent threads available to this binding (the inbox for a
   *  whole-mailbox binding, or the connected search/label scope). Returns a
   *  cursor that lazily fetches pages from the Gmail API as consumed. */
  listThreads(): Promise<Cursor<GmailThreadEntry>>;

  /** Search for threads matching a Gmail query (e.g. "from:bob@example.com").
   *  Returns a cursor that lazily fetches pages as consumed. */
  search(query: string): Promise<Cursor<GmailThreadEntry>>;

  /** Compose and send a new email. Only available when the whole mailbox is
   *  connected; on a search- or label-scoped binding this throws (use a
   *  message's reply()/forward() instead). */
  send(to: string[], subject: string, body: string): Promise<void>;
}

export interface GmailThread {
  /** Get thread metadata (subject, snippet, message count, etc). */
  getMetadata(): Promise<GmailThreadInfo>;

  /** Get all messages in the thread as capabilities. */
  messages(): Promise<GmailMessage[]>;

  /**
   * Get the subset of messages in the thread that `address` sent or was a
   * recipient of (to/cc/bcc).
   *
   * Use this when composing a reply addressed to `address` so the thread
   * history the agent reads matches the history that `address` can see —
   * avoiding accidental leaks of side-conversations that branched off the
   * thread without that recipient.
   *
   * Caveats:
   * - Bcc recipients: a message Bcc'd to `address` is included here, but
   *   only if this mailbox is the one that sent it (Bcc headers are
   *   stripped from recipients' copies).
   * - Distribution lists: if a message was sent to a list that `address`
   *   is a member of, it will NOT be included because the gatekeeper has
   *   no way to enumerate list membership. Consumers that care about this
   *   should pass the list address in addition to the individual's.
   * - Address matching is case-insensitive and exact; aliases are not
   *   resolved. Pass all known addresses for a person if needed.
   */
  messagesVisibleTo(address: string): Promise<GmailMessage[]>;

  /** Remove from inbox (add to archive). */
  archive(): Promise<void>;

  /** Move to trash. */
  trash(): Promise<void>;

  /** Mark all messages in thread as read. */
  markRead(): Promise<void>;

  /** Mark all messages in thread as unread. */
  markUnread(): Promise<void>;
}

export interface GmailMessage {
  /** Get message metadata (from, to, subject, timestamp, labels). */
  getMetadata(): Promise<GmailMessageInfo>;

  /** Get the thread this message belongs to. */
  thread(): Promise<GmailThread>;

  /** Get the message content. Returns plain text and/or HTML as available. */
  getContent(): Promise<EmailContent>;

  /** Reply to the sender only. */
  reply(body: string): Promise<void>;

  /** Reply to all recipients. */
  replyAll(body: string): Promise<void>;

  /** Forward the message to new recipients. */
  forward(to: string[], body?: string): Promise<void>;
}

// ── Gmail labels ────────────────────────────────────────────────────

/** Well-known Gmail system label names. */
export type GmailSystemLabel =
  | "INBOX" | "TRASH" | "SPAM" | "UNREAD" | "STARRED"
  | "IMPORTANT" | "SENT" | "DRAFT" | "CHAT"
  | "CATEGORY_PRIMARY" | "CATEGORY_PERSONAL" | "CATEGORY_SOCIAL"
  | "CATEGORY_PROMOTIONS" | "CATEGORY_UPDATES" | "CATEGORY_FORUMS";

/** A Gmail label — either a well-known system label or a custom user label. */
export type GmailLabel =
  | { id: string; name: GmailSystemLabel; type: "system" }
  | { id: string; name: string; type: "custom" };
