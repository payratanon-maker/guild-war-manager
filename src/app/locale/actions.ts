"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
export async function setLocale(form: FormData) {
  const value = form.get("locale") === "th" ? "th" : "en";
  (await cookies()).set("gwm-locale", value, {
    sameSite: "lax",
    path: "/",
    maxAge: 31536000,
  });
  revalidatePath("/", "layout");
}
