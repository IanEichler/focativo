"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/domains/notifications/queries";

const DOT_TONE: Record<NotificationItem["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notificações (${total})`}>
          <Bell />
          {total > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
            >
              {total > 99 ? "99+" : total}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-body font-medium text-foreground">Notificações</p>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-small text-muted-foreground">Tudo em dia por aqui.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 text-body hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", DOT_TONE[item.tone])} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 text-muted-foreground tabular">{item.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
