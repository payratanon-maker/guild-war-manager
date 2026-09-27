import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Guild War Manager",
  description: "A home for your guild's war operations.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={await getLocale()}>
      <body>{children}</body>
    </html>
  );
}
