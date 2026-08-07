import type { Api } from "@earendil-works/pi-ai";

// PDF chat attachments, bridged over pi's image content parts.
//
// pi-ai has no document/file content part -- a UserMessage carries only text and images -- but
// its API adapters copy an ImageContent's mimeType into the provider payload verbatim. So a PDF
// attachment travels the agent pipeline disguised as an ImageContent with mimeType
// application/pdf (see the history replay in agent.ts), and the disguise is fixed up per API at
// the last moment, in the onPayload hook that ai-models.ts installs on every model handle:
//
// - google-generative-ai: nothing to fix. Gemini natively accepts application/pdf inlineData,
//   which is exactly what the adapter emits.
// - anthropic-messages: the adapter emits {type: "image", source: {type: "base64", media_type:
//   "application/pdf", data}}; Anthropic's real PDF block is the same object tagged "document".
// - openai-responses: the adapter emits {type: "input_image", image_url:
//   "data:application/pdf;base64,..."}; OpenAI wants {type: "input_file", filename, file_data}
//   with the same data URL. The filename is synthesized -- the payload no longer knows the
//   original name, which the replay instead surfaces in an adjacent text part.
// - openai-completions (Workers AI, Ollama): no document input exists; uploads are rejected
//   (chat-attachment-validation.ts) and replay degrades a PDF to a text marker.
//
// Drop this bridge if pi gains a first-class document content type (upstream ask filed; see
// plans/pi-impl.md §8).

/** The one non-image MIME type that may ride a pi ImageContent part. */
export const PDF_MIME_TYPE = "application/pdf";

/** Whether PDF attachments can reach this pi API (natively or via bridgePdfAttachments()). */
export function modelApiSupportsPdfAttachments(api: Api): boolean {
  return api === "anthropic-messages" || api === "openai-responses" ||
      api === "google-generative-ai";
}

/**
 * Rewrite the PDF-carrying image blocks of a provider request payload into the provider's native
 * document part. Returns the rewritten payload, or undefined when nothing needed rewriting
 * (matching pi's onPayload contract, where undefined keeps the payload unchanged).
 */
export function bridgePdfAttachments(api: Api, payload: unknown): unknown | undefined {
  switch (api) {
    case "anthropic-messages": return bridgeAnthropicMessages(payload);
    case "openai-responses": return bridgeOpenAiResponses(payload);
    default: return undefined;
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === "object" && value !== null;

// Rewrite the elements of each user message's content array, returning undefined when no element
// changed. PDF parts appear only in user messages (tool-result media rides nested blocks that a
// top-level scan never matches), so other roles pass through untouched.
function rewriteUserContent(
    messages: unknown,
    rewritePart: (part: unknown) => unknown | undefined): unknown[] | undefined {
  if (!Array.isArray(messages)) return undefined;
  let changed = false;
  const result = messages.map((message) => {
    if (!isRecord(message) || message.role !== "user" || !Array.isArray(message.content)) {
      return message;
    }
    let messageChanged = false;
    const content = message.content.map((part) => {
      const rewritten = rewritePart(part);
      if (rewritten === undefined) return part;
      messageChanged = true;
      return rewritten;
    });
    if (!messageChanged) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? result : undefined;
}

function bridgeAnthropicMessages(payload: unknown): unknown | undefined {
  if (!isRecord(payload)) return undefined;
  const messages = rewriteUserContent(payload.messages, (part) => {
    if (isRecord(part) && part.type === "image" && isRecord(part.source) &&
        part.source.media_type === PDF_MIME_TYPE) {
      // Anthropic's PDF block is the image block with a different tag; every other field (the
      // base64 source, any cache_control marker) carries over unchanged.
      return { ...part, type: "document" };
    }
    return undefined;
  });
  return messages && { ...payload, messages };
}

function bridgeOpenAiResponses(payload: unknown): unknown | undefined {
  if (!isRecord(payload)) return undefined;
  const input = rewriteUserContent(payload.input, (part) => {
    if (isRecord(part) && part.type === "input_image" && typeof part.image_url === "string" &&
        part.image_url.startsWith(`data:${PDF_MIME_TYPE};`)) {
      // file_data takes the same data URL; `detail` is an image-only field and is dropped.
      return { type: "input_file", filename: "attachment.pdf", file_data: part.image_url };
    }
    return undefined;
  });
  return input && { ...payload, input };
}
