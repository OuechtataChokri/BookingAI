/**
 * Provider-neutral AI contracts.
 * The booking system only depends on these types. Gemini is one implementation
 * (see gemini.ts); another provider can be added by implementing `AiProvider`
 * without touching the booking engine, tools or WhatsApp code.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  /** Standard JSON Schema describing the arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolExecutor {
  declarations: ToolDeclaration[];
  /** Must never throw: failures are returned as { ok: false, ... } for the model to explain. */
  execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  modelCalls: number;
}

export interface AiRunInput {
  systemInstruction: string;
  history: ChatTurn[]; // must end with the latest user message
  tools: ToolExecutor;
  maxToolRounds?: number;
}

export interface AiRunResult {
  text: string;
  usage: AiUsage;
  toolCalls: Array<{ name: string; ok: boolean }>;
}

export type AiErrorCode = "not_configured" | "rate_limited" | "unavailable" | "blocked" | "empty" | "tool_loop" | "unknown";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface AiProvider {
  readonly name: string;
  generate(input: AiRunInput): Promise<AiRunResult>;
}
