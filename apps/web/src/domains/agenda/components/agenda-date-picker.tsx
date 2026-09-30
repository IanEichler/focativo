"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { buildHref } from "@/lib/url";
import { validCalendarDate } from "../calendar";

export function AgendaDatePicker({ date }: { date: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <input
      key={date}
      type="date"
      defaultValue={date}
      aria-label="Escolher data da agenda"
      aria-busy={pending}
      className="h-9 min-w-0 rounded-lg border border-input bg-card px-3 text-small shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onChange={(event) => {
        const value = event.target.value;
        if (validCalendarDate(value))
          start(() =>
            router.replace(buildHref("/app/agenda", params, { data: value, page: undefined }), { scroll: false }),
          );
      }}
    />
  );
}
