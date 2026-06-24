import Anthropic from "@anthropic-ai/sdk";

function isOverloaded(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 529 || status === 503 || status === 500 || /overload/i.test(String((e as Error)?.message));
}

export async function callClaudeWithRetry(anthropic: Anthropic, params: Anthropic.MessageCreateParams, tries = 4): Promise<Anthropic.Message> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await anthropic.messages.create(params) as Anthropic.Message; }
    catch (e) { lastErr = e; if (isOverloaded(e) && i < tries - 1) { await new Promise((r) => setTimeout(r, 600 * (i + 1))); continue; } throw e; }
  }
  throw lastErr;
}

export function isClaudeOverloaded(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 529 || status === 503 || /overload/i.test(String((e as Error)?.message));
}
