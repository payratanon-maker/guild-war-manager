import { describe, expect, it } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import { safeAuthError } from "./auth-error";

describe("safeAuthError", () => {
  it("keeps diagnostic fields while redacting addresses and token-like data", () => {
    const error = new AuthApiError(
      "Email user@example.org rejected with abcdefghijklmnopqrstuvwxyz123456\nnext line",
      422,
      "email_address_invalid",
    );
    expect(safeAuthError(error)).toEqual({
      code: "email_address_invalid",
      status: 422,
      message: "Email [email] rejected with [redacted] next line",
    });
  });
});
