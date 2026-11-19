import "server-only";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { env } from "@/lib/env";
import { logError, logInfo } from "@/lib/logger";
import { AiError, type AiProvider, type AiRunInput, type AiRunResult, type AiUsage } from "@/lib/ai/provider";

/**
 * Google Gemini provider, built on the official Google Gen AI SDK (@google/genai).
 * - API key comes from GEMINI_API_KEY (server only).
 * - Model comes from GEMINI_MODEL.
 * - Function calling is executed in a loop: model -> tool(s) -> model -> ... -> text.
 * - If the configured model is overloaded or times out, falls back automatically
 *   to gemini-3.5-flash-lite so customer conversations keep working.
 */

const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === "number" ? s : undefined;
  }
  return undefined;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(
    apiKey = env.geminiApiKey,
    private model = env.geminiModel,
  ) {
    if (!apiKey) throw new AiError("not_configured", "GEMINI_API_KEY is not set");
    this.client = new GoogleGenAI({ apiKey });
  }

  private async requestModel(modelName: string, contents: Content[], input: AiRunInput, timeoutMs: number, maxRetries: number) {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: input.systemInstruction,
            temperature: 0.3,
            maxOutputTokens: 1024,
            tools: [
              {
                functionDeclarations: input.tools.declarations.map((d) => ({
                  name: d.name,
                  description: d.description,
                  parametersJsonSchema: d.parameters,
                })),
              },
            ],
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });
      } catch (err) {
        lastErr = err;
        const status = statusOf(err);
        if ((status === 429 || status === 503 || status === 500) && attempt < maxRetries) {
          await sleep(600 * (attempt + 1));
          continue;
        }
        break;
      }
    }
    throw lastErr;
  }

  private async callModel(modelName: string, contents: Content[], input: AiRunInput) {
    const canFallback = modelName !== FALLBACK_MODEL;
    try {
      const response = await this.requestModel(modelName, contents, input, canFallback ? 15_000 : 25_000, canFallback ? 0 : 2);
      return { response, usedModel: modelName };
    } catch (err) {
      const status = statusOf(err);
      const shouldFallback = canFallback && (isAbortError(err) || status === 503 || status === 500 || status === 429 || status === 404);
      if (shouldFallback) {
        logInfo("gemini:fallback", `primary model ${modelName} failed (${status ?? (err instanceof Error ? err.name : "error")}), using ${FALLBACK_MODEL}`);
        try {
          const response = await this.requestModel(FALLBACK_MODEL, contents, input, 25_000, 1);
          return { response, usedModel: FALLBACK_MODEL };
        } catch (fbErr) {
          err = fbErr;
        }
      }

      const finalStatus = statusOf(err);
      logError("gemini:request", err instanceof Error ? err.message.slice(0, 200) : "unknown", { status: finalStatus });
      if (finalStatus === 429) throw new AiError("rate_limited", "Gemini rate limit reached");
      if (finalStatus === 400 || finalStatus === 401 || finalStatus === 403 || finalStatus === 404) {
        throw new AiError("unknown", `Gemini request rejected (${finalStatus})`);
      }
      throw new AiError("unavailable", "Gemini is temporarily unavailable");
    }
  }

  async generate(input: AiRunInput): Promise<AiRunResult> {
    const contents: Content[] = input.history.map((t) => ({
      role: t.role === "user" ? "user" : "model",
      parts: [{ text: t.text }],
    }));

    let activeModel = this.model;
    const usage: AiUsage = { model: activeModel, inputTokens: 0, outputTokens: 0, totalTokens: 0, modelCalls: 0 };
    const toolCalls: AiRunResult["toolCalls"] = [];
    const maxRounds = input.maxToolRounds ?? 6;

    for (let round = 0; round <= maxRounds; round++) {
      const { response, usedModel } = await this.callModel(activeModel, contents, input);
      activeModel = usedModel;
      usage.model = usedModel;
      usage.modelCalls += 1;
      usage.inputTokens += response.usageMetadata?.promptTokenCount ?? 0;
      usage.outputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;
      usage.totalTokens += response.usageMetadata?.totalTokenCount ?? 0;

      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        const text = response.text?.trim();
        if (!text) {
          const blocked = response.promptFeedback?.blockReason;
          throw new AiError(blocked ? "blocked" : "empty", blocked ? `Blocked: ${blocked}` : "Empty model response");
        }
        return { text, usage, toolCalls };
      }

      // Keep the model turn exactly as returned (it may carry thought signatures).
      const modelContent = response.candidates?.[0]?.content;
      contents.push(modelContent ?? { role: "model", parts: calls.map((c) => ({ functionCall: c })) });

      const responseParts: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? "";
        const result = await input.tools.execute(name, (call.args ?? {}) as Record<string, unknown>);
        toolCalls.push({ name, ok: result.ok !== false });
        responseParts.push({ functionResponse: { name, response: { output: result }, ...(call.id ? { id: call.id } : {}) } });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    throw new AiError("tool_loop", "Too many tool rounds");
  }
}
