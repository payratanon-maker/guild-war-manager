"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerWarScreenshot } from "./extraction-actions";
import { createClient } from "@/lib/supabase/client";
import type { MessageKey } from "@/lib/i18n";

function matchesSignature(file: File, bytes: Uint8Array) {
  if (file.type === "image/png")
    return (
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    );
  if (file.type === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (file.type === "image/webp")
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

export function ScreenshotUploader({
  wars,
  translate,
}: {
  wars: { id: string; war_number: number; war_date: string }[];
  translate: (key: MessageKey) => string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [warId, setWarId] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("screenshot");
    const file =
      input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    setError(false);
    if (!warId || !file || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError(true);
      return;
    }
    setBusy(true);
    let uploadedPath: string | undefined;
    let safeToCleanup = false;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!matchesSignature(file, bytes)) {
        setError(true);
        return;
      }
      const extension =
        file.type === "image/png"
          ? ".png"
          : file.type === "image/webp"
            ? ".webp"
            : ".jpg";
      const path = warId + "/" + crypto.randomUUID() + extension;
      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from("war-result-screenshots")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (storageError) {
        setError(true);
        return;
      }
      uploadedPath = path;
      const result = await registerWarScreenshot(warId, path);
      if (!result.ok) {
        safeToCleanup = true;
        setError(true);
        return;
      }
      router.push("/results/extraction?candidate=" + result.candidateId);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      if (uploadedPath && safeToCleanup) {
        try {
          await createClient()
            .storage.from("war-result-screenshots")
            .remove([uploadedPath]);
        } catch {
          // A cleanup failure leaves only a private, unregistered source object.
        }
      }
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="toolbar">
      <label>
        {translate("warNumber")}
        <select
          required
          value={warId}
          onChange={(event) => setWarId(event.currentTarget.value)}
        >
          <option value="">—</option>
          {wars.map((war) => (
            <option key={war.id} value={war.id}>
              #{war.war_number} · {war.war_date}
            </option>
          ))}
        </select>
      </label>
      <label>
        {translate("screenshot")}
        <input
          type="file"
          name="screenshot"
          accept="image/png,image/jpeg,image/webp"
          required
          disabled={busy}
        />
      </label>
      {error && <span role="alert">{translate("uploadError")}</span>}
      <button className="primary-button" disabled={busy}>
        {busy ? translate("uploading") : translate("uploadScreenshot")}
      </button>
    </form>
  );
}
