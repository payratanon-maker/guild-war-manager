import type { AuthError } from "@supabase/supabase-js";

export function safeAuthError(error: AuthError) {
  return {
    code: error.code ?? "unknown",
    status: error.status,
    message: error.message
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[redacted]")
      .replace(/[\r\n\t]/g, " ")
      .slice(0, 200),
  };
}
