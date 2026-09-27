"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function fail(reason = "ultimate"): never {
  redirect("/settings?error=" + encodeURIComponent(reason));
}
export async function addUltimate(form: FormData) {
  await requireRole("ADMIN");
  const code = String(form.get("code") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (!/^[a-z0-9_]{1,50}$/.test(code) || name.length < 1 || name.length > 100)
    fail();
  const supabase = await createClient();
  const { error } = await supabase.from("ultimates").insert({ code, name });
  if (error) fail();
  revalidatePath("/settings");
  revalidatePath("/builder");
  redirect("/settings");
}
export async function uploadUltimateIcon(form: FormData) {
  await requireRole("ADMIN");
  const id = String(form.get("id") ?? "");
  const file = form.get("icon");
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > 2097152 ||
    !["image/png", "image/webp"].includes(file.type)
  )
    fail();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng =
    file.type === "image/png" &&
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
  const isWebp =
    file.type === "image/webp" &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isPng && !isWebp) fail();
  const supabase = await createClient();
  const extension = isPng ? "png" : "webp";
  const path = `${id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("ultimate-icons")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) fail();
  const { data, error } = await supabase
    .from("ultimates")
    .update({ icon_storage_path: path })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    await supabase.storage.from("ultimate-icons").remove([path]);
    fail();
  }
  revalidatePath("/settings");
  revalidatePath("/builder");
  redirect("/settings");
}

export async function saveDiscordPlayerLink(form: FormData) {
  await requireRole("ADMIN");
  const playerId = String(form.get("playerId") ?? "");
  const discordUserId = String(form.get("discordUserId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(playerId) || !/^\d{17,20}$/.test(discordUserId))
    fail("discord");
  const supabase = await createClient();
  const { error } = await supabase
    .from("discord_player_links")
    .insert({ player_id: playerId, discord_user_id: discordUserId });
  if (error) fail("discord");
  revalidatePath("/settings");
  redirect("/settings");
}

export async function removeDiscordPlayerLink(form: FormData) {
  await requireRole("ADMIN");
  const playerId = String(form.get("playerId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) fail("discord");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discord_player_links")
    .delete()
    .eq("player_id", playerId)
    .select("player_id")
    .single();
  if (error || !data) fail("discord");
  revalidatePath("/settings");
  redirect("/settings");
}
