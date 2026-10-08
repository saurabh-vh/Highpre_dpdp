/**
 * Structured logging. JSON lines in production (easy to ship to any log
 * service), readable lines in development. Never log secrets or personal data:
 * pass ids and counts, not emails or names.
 */
type Fields = Record<string, unknown>;
type Level = "info" | "warn" | "error";

function write(level: Level, event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test") return;
  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
    (level === "error" ? console.error : console.log)(line);
    return;
  }
  const extra = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : "";
  (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(`[${level}] ${event}${extra}`);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
