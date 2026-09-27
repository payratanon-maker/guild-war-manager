"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { safeAuthError } from "@/lib/auth-error";
import { emailForUsername } from "@/lib/auth-identity";
import type { AccountStatus, Role } from "@/domain/model";

const validUsername = /^[A-Za-z0-9_]{3,32}$/;
function errorUrl(path: string, code: string) {
  return `${path}?error=${encodeURIComponent(code)}`;
}

export async function register(form: FormData) {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (
    !validUsername.test(username) ||
    password.length < 12 ||
    password !== form.get("confirmPassword")
  ) {
    redirect(errorUrl("/register", "validation"));
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: emailForUsername(username),
    password,
    options: { data: { username } },
  });
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[auth-signup]", safeAuthError(error));
    }
    redirect(errorUrl("/register", "signup"));
  }
  redirect("/pending");
}

export async function login(form: FormData) {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!validUsername.test(username))
    redirect(errorUrl("/login", "credentials"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailForUsername(username),
    password,
  });
  if (error) redirect(errorUrl("/login", "credentials"));
  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function decideAccount(form: FormData) {
  await requireRole("ADMIN");
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "") as AccountStatus;
  const role = String(form.get("role") ?? "") as Role;
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !["APPROVED", "REJECTED"].includes(decision)
  ) {
    redirect(errorUrl("/approvals", "validation"));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_account", {
    target_id: id,
    decision,
    approved_role: decision === "APPROVED" ? role : null,
  });
  if (error) redirect(errorUrl("/approvals", "decision"));
  revalidatePath("/approvals");
  redirect("/approvals");
}
