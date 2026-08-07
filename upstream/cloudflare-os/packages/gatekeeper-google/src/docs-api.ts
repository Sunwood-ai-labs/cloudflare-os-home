// Google Docs REST API helpers.
//
// This file wraps the Google Docs API (v1) for use by the Google Docs gatekeeper.
// It follows the same pattern as google-api.ts (which wraps the Gmail API).

import { AccessTokenProvider, fetchWithAuthRetry } from "./auth-retry";

// ---------------------------------------------------------------------------
// Types modeling the Google Docs API response.
// These are internal — not exported to gadgets. Only the fields we actually
// use are included.
// ---------------------------------------------------------------------------

/** Top-level document response from `documents.get`. */
export type GoogleDocsDocument = {
  documentId: string;
  title: string;
  revisionId: string;
  body: { content: StructuralElement[] };
  lists: Record<string, DocList>;
}

/** A list definition, referenced by paragraphs that are list items. */
export type DocList = {
  listProperties: {
    nestingLevels: NestingLevel[];
  };
}

/** Describes the glyph style for one nesting level of a list. */
export type NestingLevel = {
  /** If set, this is an ordered (numbered) list level. Values: "DECIMAL", "ALPHA", etc. */
  glyphType?: string;
  /** If set, this is an unordered (bullet) list level. e.g. "●" */
  glyphSymbol?: string;
}

/** A structural element in the document body. */
export type StructuralElement = {
  startIndex: number;
  endIndex: number;
  paragraph?: Paragraph;
  sectionBreak?: {};
  table?: {};
  tableOfContents?: {};
}

/** A paragraph (including headings, list items, etc.). */
export type Paragraph = {
  elements: ParagraphElement[];
  paragraphStyle: ParagraphStyle;
  bullet?: Bullet;
}

export type ParagraphStyle = {
  namedStyleType: string;
}

/** Present on paragraphs that are list items. */
export type Bullet = {
  listId: string;
  nestingLevel: number;
}

/** An element within a paragraph (text run, horizontal rule, etc.). */
export type ParagraphElement = {
  startIndex: number;
  endIndex: number;
  textRun?: TextRun;
  horizontalRule?: {};
}

export type TextRun = {
  content: string;
  textStyle: TextStyle;
}

export type TextStyle = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  link?: { url: string };
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const DOCS_API_BASE = "https://docs.googleapis.com/v1/documents";

export class GoogleDocsApi {
  constructor(private getAccessToken: AccessTokenProvider) {}

  /** Fetch the full document. */
  async getDocument(documentId: string): Promise<GoogleDocsDocument> {
    let response = await fetchWithAuthRetry(
      `${DOCS_API_BASE}/${encodeURIComponent(documentId)}`,
      {},
      this.getAccessToken,
    );

    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Failed to get document: ${response.status} ${errorText}`);
    }

    return await response.json() as GoogleDocsDocument;
  }

  /**
   * Lightweight revision check. Uses the `fields` query parameter to request
   * only the revisionId, avoiding downloading the full document body.
   *
   * If the API doesn't support field filtering (returns the full doc anyway),
   * that's fine — we just parse revisionId from whatever comes back.
   */
  async getRevisionId(documentId: string): Promise<string> {
    let response = await fetchWithAuthRetry(
      `${DOCS_API_BASE}/${encodeURIComponent(documentId)}?fields=revisionId`,
      {},
      this.getAccessToken,
    );

    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Failed to get revision ID: ${response.status} ${errorText}`);
    }

    let data = await response.json() as { revisionId: string };
    return data.revisionId;
  }

  /**
   * Send a batchUpdate request to modify the document.
   *
   * If `targetRevisionId` is provided, the update is applied against that
   * revision. Google Docs will merge the changes with any concurrent edits
   * (OT-style). The revision ID should come from a previous `getDocument()`
   * call.
   *
   * Returns the new revision ID after the update.
   */
  async batchUpdate(
    documentId: string,
    requests: any[],
    targetRevisionId?: string,
  ): Promise<string> {
    let body: any = { requests };
    if (targetRevisionId) {
      body.writeControl = { targetRevisionId };
    }

    let response = await fetchWithAuthRetry(
      `${DOCS_API_BASE}/${encodeURIComponent(documentId)}:batchUpdate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      this.getAccessToken,
    );

    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Failed to batch update document: ${response.status} ${errorText}`);
    }

    let result = await response.json() as {
      writeControl?: { requiredRevisionId?: string };
    };

    return result.writeControl?.requiredRevisionId ?? "";
  }
}
