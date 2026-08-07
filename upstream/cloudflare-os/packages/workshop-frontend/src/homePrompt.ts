import { MAX_GATEKEEPER_APP_PROMPT_LENGTH } from "./gatekeeperAppNavigation";

export function homePromptFromSearch(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const prompt = value.trim();
  if (!prompt || prompt.length > MAX_GATEKEEPER_APP_PROMPT_LENGTH) return undefined;
  return prompt;
}
