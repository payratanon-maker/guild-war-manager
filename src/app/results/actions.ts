"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function fail(warId: string) {
  redirect(`/results?war=${encodeURIComponent(warId)}&error=stats`);
}
export async function saveWarResult(form: FormData) {
  await requireRole("OFFICER");
  const assignmentId = String(form.get("assignmentId") ?? "");
  const warId = String(form.get("warId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId) || !/^[0-9a-f-]{36}$/i.test(warId))
    fail(warId);
  const fields = [
    "kills",
    "deaths",
    "assists",
    "damage",
    "healing",
    "damage_taken",
    "tower_damage",
    "revives",
  ] as const;
  const values: Record<string, number | null> = {};
  for (const field of fields) {
    const raw = String(form.get(field) ?? "").trim();
    if (field === "revives" && raw === "") {
      values[field] = null;
      continue;
    }
    if (!/^\d+$/.test(raw)) fail(warId);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) fail(warId);
    values[field] = value;
  }
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("war_assignments")
    .select("war_id")
    .eq("id", assignmentId)
    .eq("war_id", warId)
    .single();
  if (!assignment) fail(warId);
  const { data: existing } = await supabase
    .from("war_player_stats")
    .select("war_assignment_id")
    .eq("war_assignment_id", assignmentId)
    .maybeSingle();
  if (existing) {
    const { data, error } = await supabase
      .from("war_player_stats")
      .update(values)
      .eq("war_assignment_id", assignmentId)
      .select("war_assignment_id")
      .single();
    if (error || !data) fail(warId);
  } else {
    const { error } = await supabase
      .from("war_player_stats")
      .insert({ war_assignment_id: assignmentId, ...values });
    if (error) fail(warId);
  }
  revalidatePath("/results");
  revalidatePath("/statistics");
  revalidatePath("/");
  revalidatePath(`/history/${warId}`);
  redirect(`/results?war=${warId}`);
}
