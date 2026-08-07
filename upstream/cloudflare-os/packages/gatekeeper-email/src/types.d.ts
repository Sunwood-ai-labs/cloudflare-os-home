export type EmailAddress = {
  /** Display name, e.g. "John Doe". Empty string if not provided. */
  name: string;
  /** Email address, e.g. "john@example.com". */
  address: string;
}

export type EmailAttachment = {
  /** Filename of the attachment, if provided. */
  filename: string | null;
  /** MIME type of the attachment, e.g. "application/pdf". */
  mimeType: string;
  /** Content disposition: "attachment", "inline", or null. */
  disposition: string | null;
  /** The attachment content as an ArrayBuffer. */
  content: ArrayBuffer;
}

/** An inbound email message, parsed into structured fields. */
export type IncomingEmail = {
  /** Sender address. */
  from: EmailAddress;
  /** Recipient addresses. */
  to: EmailAddress[];
  /** CC addresses. */
  cc: EmailAddress[];
  /** Subject line. */
  subject: string;
  /** Sending time in ISO 8601 format. */
  date: string;
  /** Plain text body, if available. */
  text: string | null;
  /** HTML body, if available. */
  html: string | null;
  /** File attachments. */
  attachments: EmailAttachment[];
}

/** Session interface for an email binding. Provides the email address. */
export interface EmailSession {
  /** Returns the full email address (e.g. "name@example.com"). */
  getAddress(): Promise<string>;

  /**
   * Request a callback on each inbound email.
   *
   * @param callback - A persistent stub (must be created with ctx.restore()) implementing the
   *   `EmailHook` interface, which will be called back whenever an email arrives.
   */
  subscribe(callback: RpcStub<EmailHook>): Promise<void>;
}

/**
 * Hook interface for receiving inbound emails. A Gadget implements this
 * as an RpcTarget to receive push notifications when email arrives.
 */
export interface EmailHook {
  /** Called when an email is received at the bound address. */
  receiveEmail(email: IncomingEmail): Promise<void>;
}
