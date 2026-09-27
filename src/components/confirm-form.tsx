"use client";

import type { FormEvent, ReactNode } from "react";

type ServerAction = (formData: FormData) => void | Promise<void>;

export function ConfirmForm({
  action,
  confirmation,
  className,
  children,
}: {
  action: ServerAction;
  confirmation: string;
  className?: string;
  children: ReactNode;
}) {
  function confirmSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(confirmation)) event.preventDefault();
  }

  return (
    <form action={action} className={className} onSubmit={confirmSubmit}>
      {children}
    </form>
  );
}
