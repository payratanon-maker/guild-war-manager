import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyDiscordRequest } from "./discord-signature";

describe("Discord interaction signature verification", () => {
  it("accepts an Ed25519 signature over the original timestamp and raw body", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicKeyHex = publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("hex");
    const timestamp = "1790000000";
    const body = '{"type":1}';
    const signature = sign(
      null,
      Buffer.from(timestamp + body),
      privateKey,
    ).toString("hex");
    expect(
      verifyDiscordRequest(
        body,
        signature,
        timestamp,
        publicKeyHex,
        1790000000000,
      ),
    ).toBe(true);
    expect(
      verifyDiscordRequest(
        body + " ",
        signature,
        timestamp,
        publicKeyHex,
        1790000000000,
      ),
    ).toBe(false);
  });

  it("rejects malformed, missing, and stale replay signatures", () => {
    expect(verifyDiscordRequest("{}", null, null, "x")).toBe(false);
    expect(
      verifyDiscordRequest(
        "{}",
        "0".repeat(128),
        "1700000000",
        "0".repeat(64),
        1790000000000,
      ),
    ).toBe(false);
  });
});
