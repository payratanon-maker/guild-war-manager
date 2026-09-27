"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createWar(form: FormData) {
  await requireRole("OFFICER");
  const warDate = String(form.get("warDate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(warDate)) redirect("/builder?error=war");
  const supabase = await createClient();
  const { error } = await supabase.from("wars").insert({ war_date: warDate });
  if (error) redirect("/builder?error=war");
  revalidatePath("/builder");
  revalidatePath("/members");
  revalidatePath("/");
  redirect("/builder");
}
export async function finalizeWar(form: FormData) {
  await requireRole("OFFICER");
  const id = String(form.get("warId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/builder?error=war");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wars")
    .update({ status: "finalized" })
    .eq("id", id)
    .eq("status", "preparing")
    .select("id")
    .single();
  if (error || !data) redirect("/builder?error=finalize");
  revalidatePath("/builder");
  revalidatePath("/history");
  revalidatePath("/members");
  revalidatePath("/");
  redirect(`/history/${id}`);
}
