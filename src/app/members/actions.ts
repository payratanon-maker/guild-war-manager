"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { guildClasses } from "@/lib/guild-classes";
import { attendanceStatuses } from "@/domain/model";

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
const fail = (reason: string) =>
  redirect(`/members?error=${encodeURIComponent(reason)}`);

export async function savePlayer(form: FormData) {
  await requireRole("ADMIN");
  const id = String(form.get("id") ?? "");
  const displayName = String(form.get("displayName") ?? "").trim();
  const currentClass = String(form.get("currentClass") ?? "");
  if (
    displayName.length < 1 ||
    displayName.length > 100 ||
    !guildClasses.some((item) => item.id === currentClass) ||
    (id && !validId(id))
  )
    fail("validation");
  const supabase = await createClient();
  const fields = { display_name: displayName, current_class: currentClass };
  if (id) {
    const { data, error } = await supabase
      .from("guild_players")
      .update(fields)
      .eq("id", id)
      .select("id")
      .single();
    if (error || !data) fail("save");
  } else {
    const { error } = await supabase.from("guild_players").insert(fields);
    if (error) fail("save");
  }
  revalidatePath("/members");
  revalidatePath("/");
  redirect("/members");
}

export async function setArchived(form: FormData) {
  await requireRole("ADMIN");
  const id = String(form.get("id") ?? "");
  if (!validId(id)) fail("validation");
  const archived = form.get("archived") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guild_players")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) fail("archive");
  revalidatePath("/members");
  revalidatePath("/");
  redirect("/members");
}

export async function setAttendance(form: FormData) {
  await requireRole("OFFICER");
  const playerId = String(form.get("playerId") ?? "");
  const warId = String(form.get("warId") ?? "");
  const status = String(form.get("status") ?? "");
  if (
    !validId(playerId) ||
    !validId(warId) ||
    !attendanceStatuses.includes(status as (typeof attendanceStatuses)[number])
  )
    fail("validation");
  const supabase = await createClient();
  const { data: war } = await supabase
    .from("wars")
    .select("status")
    .eq("id", warId)
    .single();
  if (war?.status !== "preparing") fail("war");
  const { data: existing } = await supabase
    .from("war_attendance")
    .select("status")
    .eq("war_id", warId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from("war_attendance")
      .update({ status })
      .eq("war_id", warId)
      .eq("player_id", playerId)
      .select("player_id")
      .single();
    if (error || !data) fail("attendance");
  } else {
    const { error } = await supabase
      .from("war_attendance")
      .insert({ war_id: warId, player_id: playerId, status });
    if (error) fail("attendance");
  }
  revalidatePath("/members");
  revalidatePath("/");
  revalidatePath("/builder");
  redirect("/members");
}
