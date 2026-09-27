import { createPublicKey, verify } from "node:crypto";

const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordRequest(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyHex: string,
  nowMs = Date.now(),
) {
  if (
    !signature ||
    !timestamp ||
    !/^[0-9a-f]{128}$/i.test(signature) ||
    !/^\d{10,13}$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/i.test(publicKeyHex)
  )
    return false;
  const timestampSeconds = Number(timestamp);
  const nowSeconds = nowMs / 1000;
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > 300
  )
    return false;
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([spkiPrefix, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(timestamp + body),
      publicKey,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
