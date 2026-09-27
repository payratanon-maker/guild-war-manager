import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "./route";

const originalPublicKey = process.env.DISCORD_PUBLIC_KEY;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyHex = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("hex");
const timestamp = String(Math.floor(Date.now() / 1000));

afterEach(() => {
  if (originalPublicKey === undefined) delete process.env.DISCORD_PUBLIC_KEY;
  else process.env.DISCORD_PUBLIC_KEY = originalPublicKey;
});

function request(payload: unknown, validSignature = true) {
  const body = JSON.stringify(payload);
  const signature = sign(
    null,
    Buffer.from(timestamp + body),
    privateKey,
  ).toString("hex");
  return new Request("https://gwm.invalid/api/discord/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-timestamp": timestamp,
      "x-signature-ed25519": validSignature ? signature : "0".repeat(128),
    },
    body,
  });
}

describe("Discord interaction endpoint", () => {
  it("rejects invalid signatures and acknowledges signed PING requests", async () => {
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
    const invalid = await POST(request({ type: 1 }, false));
    expect(invalid.status).toBe(401);
    const ping = await POST(request({ type: 1 }));
    expect(ping.status).toBe(200);
    await expect(ping.json()).resolves.toEqual({ type: 1 });
  });

  it("rejects oversized bodies before signature work", async () => {
    process.env.DISCORD_PUBLIC_KEY = publicKeyHex;
    const response = await POST(
      new Request("https://gwm.invalid/api/discord/interactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(65 * 1024),
        },
        body: " ".repeat(65 * 1024),
      }),
    );
    expect(response.status).toBe(413);
  });
});
