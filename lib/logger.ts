/**
 * Minimal structured logger. Never logs secrets, tokens, or message bodies.
 */
const SENSITIVE = /(token|secret|password|authorization|api[_-]?key)["']?\s*[:=]\s*["']?[^\s"',}]+/gi;

function sanitize(value: unknown): string {
  let text: string;
  if (value instanceof Error) text = `${value.name}: ${value.message}`;
  else if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.replace(SENSITIVE, "$1=[redacted]").slice(0, 1000);
}

export function logError(scope: string, error: unknown, meta?: Record<string, string | number | boolean | null | undefined>) {
  console.error(`[bookai] ${scope}: ${sanitize(error)}`, meta ? sanitize(meta) : "");
}

export function logInfo(scope: string, message: string, meta?: Record<string, string | number | boolean | null | undefined>) {
  console.info(`[bookai] ${scope}: ${message}`, meta ? sanitize(meta) : "");
}
