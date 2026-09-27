"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Party } from "@/domain/model";

export async function moveFormationPlayer(input: {
  playerId: string;
  party: Party | null;
  squad: number | null;
  slot: number | null;
}) {
  await requireRole("OFFICER");
  if (
    !/^[0-9a-f-]{36}$/i.test(input.playerId) ||
    (input.party !== null && input.party !== "A" && input.party !== "B") ||
    (input.party === null && (input.squad !== null || input.slot !== null)) ||
    (input.party !== null &&
      (!Number.isInteger(input.squad) ||
        input.squad! < 1 ||
        input.squad! > 5)) ||
    (input.slot !== null &&
      (!Number.isInteger(input.slot) || input.slot < 1 || input.slot > 6))
  ) {
    return { ok: false, error: "Invalid destination" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_formation_player", {
    moved_player_id: input.playerId,
    destination_party: input.party,
    destination_squad: input.squad,
    destination_slot: input.slot,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/builder");
  revalidatePath("/");
  revalidatePath("/members");
  return { ok: true as const };
}

export async function setAssignmentUltimate(
  playerId: string,
  ultimateId: string | null,
) {
  await requireRole("OFFICER");
  if (
    !/^[0-9a-f-]{36}$/i.test(playerId) ||
    (ultimateId !== null && !/^[0-9a-f-]{36}$/i.test(ultimateId))
  ) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("current_formation_assignments")
    .update({ ultimate_id: ultimateId })
    .eq("player_id", playerId)
    .select("player_id")
    .single();
  if (error || !data) return { ok: false };
  revalidatePath("/builder");
  return { ok: true };
}
