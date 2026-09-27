"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getExtractionProvider } from "@/lib/extraction-provider";
import { parseReviewedRows } from "@/domain/extraction";

const validId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
const fail = (query: string): never =>
  redirect("/results/extraction?error=" + query);

function validImage(type: string, bytes: Uint8Array) {
  if (type === "image/png")
    return (
      bytes.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    );
  if (type === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (type === "image/webp")
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

export async function registerWarScreenshot(
  warId: string,
  storagePath: string,
) {
  const account = await requireRole("OFFICER");
  const supabase = await createClient();
  if (
    !validId(warId) ||
    !new RegExp("^" + warId + "/[0-9a-f-]{36}\\.(png|jpg|webp)$", "i").test(
      storagePath,
    )
  )
    return { ok: false as const, reason: "upload" };
  const { data: war } = await supabase
    .from("wars")
    .select("id,status")
    .eq("id", warId)
    .single();
  if (war?.status !== "finalized")
    return { ok: false as const, reason: "upload" };
  const { data: participants, error: participantsError } = await supabase
    .from("war_assignments")
    .select("id,player_name_snapshot")
    .eq("war_id", warId)
    .order("party")
    .order("squad_number")
    .order("slot_number");
  if (participantsError || !participants?.length)
    return { ok: false as const, reason: "upload" };
  const { data: image, error: downloadError } = await supabase.storage
    .from("war-result-screenshots")
    .download(storagePath);
  if (
    downloadError ||
    !image ||
    image.size < 1 ||
    image.size > 10 * 1024 * 1024
  )
    return { ok: false as const, reason: "upload" };
  const bytes = new Uint8Array(await image.arrayBuffer());
  const mimeType = image.type;
  if (!validImage(mimeType, bytes))
    return { ok: false as const, reason: "upload" };
  const { data: upload, error: insertError } = await supabase
    .from("war_result_uploads")
    .insert({
      war_id: warId,
      storage_path: storagePath,
      uploaded_by: account.id,
    })
    .select("id")
    .single();
  if (insertError || !upload) return { ok: false as const, reason: "upload" };
  let output;
  try {
    output = await getExtractionProvider().extract({
      image: bytes,
      mimeType: mimeType as "image/png" | "image/jpeg" | "image/webp",
      participants: participants.map((row) => ({
        assignmentId: row.id,
        playerName: row.player_name_snapshot,
      })),
    });
  } catch {
    output = {
      provider: "manual-review",
      records: [],
      diagnostics: { mode: "manual", reason: "PROVIDER_FAILED" },
    };
  }
  const { data: candidate, error: candidateError } = await supabase
    .from("war_extraction_candidates")
    .insert({
      upload_id: upload.id,
      provider: output.provider,
      candidate_payload: {
        version: 1,
        records: output.records,
        diagnostics: output.diagnostics,
      },
    })
    .select("id")
    .single();
  if (candidateError || !candidate) {
    await supabase.from("war_result_uploads").delete().eq("id", upload.id);
    return { ok: false as const, reason: "upload" };
  }
  revalidatePath("/results/extraction");
  return { ok: true as const, candidateId: candidate.id };
}

export async function saveExtractionReview(form: FormData) {
  await requireRole("OFFICER");
  const candidateId = String(form.get("candidateId") ?? "");
  if (!validId(candidateId)) fail("review");
  let records;
  try {
    records = parseReviewedRows(String(form.get("records") ?? ""));
  } catch {
    redirect("/results/extraction?candidate=" + candidateId + "&error=review");
  }
  const supabase = await createClient();
  const { data: candidate } = await supabase
    .from("war_extraction_candidates")
    .select("upload_id,candidate_payload")
    .eq("id", candidateId)
    .single();
  if (!candidate) return fail("review");
  const { data: upload } = await supabase
    .from("war_result_uploads")
    .select("war_id")
    .eq("id", candidate.upload_id)
    .single();
  if (!upload) return fail("review");
  const assignmentIds = records.map((record) => record.assignmentId);
  const { data: assignments, error } = await supabase
    .from("war_assignments")
    .select("id")
    .eq("war_id", upload.war_id)
    .in("id", assignmentIds);
  if (error || assignments?.length !== assignmentIds.length) fail("review");
  const previousPayload =
    candidate.candidate_payload &&
    typeof candidate.candidate_payload === "object" &&
    !Array.isArray(candidate.candidate_payload)
      ? (candidate.candidate_payload as Record<string, unknown>)
      : {};
  const payload = {
    ...previousPayload,
    version: 1,
    records: records.map((record) => ({
      assignmentId: record.assignmentId,
      playerName: record.playerName,
      confidence: record.confidence,
      stats: record.stats,
    })),
    reviewDiagnostics: { mode: "human-reviewed" },
  };
  const { error: reviewError } = await supabase.rpc(
    "review_extraction_candidate",
    { target_id: candidateId, corrected: payload },
  );
  if (reviewError) fail("review");
  revalidatePath("/results/extraction");
  redirect("/results/extraction?candidate=" + candidateId + "&saved=1");
}

export async function confirmExtraction(form: FormData) {
  await requireRole("OFFICER");
  const candidateId = String(form.get("candidateId") ?? "");
  if (!validId(candidateId)) fail("confirm");
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_extraction_candidate", {
    target_id: candidateId,
  });
  if (error) fail("confirm");
  revalidatePath("/results");
  revalidatePath("/statistics");
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/results/extraction");
  redirect("/results/extraction?candidate=" + candidateId + "&confirmed=1");
}

export async function rejectExtraction(form: FormData) {
  const account = await requireRole("OFFICER");
  const candidateId = String(form.get("candidateId") ?? "");
  if (!validId(candidateId)) fail("review");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("war_extraction_candidates")
    .update({
      status: "rejected",
      reviewed_by: account.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .in("status", ["pending", "reviewed"])
    .select("id")
    .single();
  if (error || !data) fail("review");
  revalidatePath("/results/extraction");
  redirect("/results/extraction");
}
