import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccountProfile, Role } from "@/domain/model";

const ranks: Record<Role, number> = {
  MEMBER: 1,
  OFFICER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function can(role: Role | null, required: Role) {
  return role !== null && ranks[role] >= ranks[required];
}

export async function getAccount() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const { data: profile } = await supabase
    .from("account_profiles")
    .select("id, username, status, role, decided_at, decided_by")
    .eq("id", data.claims.sub)
    .single();
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    status: profile.status,
    role: profile.role,
    decidedAt: profile.decided_at,
    decidedBy: profile.decided_by,
  } as AccountProfile;
}

export async function requireRole(required: Role = "MEMBER") {
  const account = await getAccount();
  if (!account) redirect("/login");
  if (account.status === "PENDING") redirect("/pending");
  if (account.status === "REJECTED") redirect("/rejected");
  if (!can(account.role, required)) redirect("/unauthorized");
  return account;
}
