"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { saveBusinessHoursAction } from "../actions";
import type { BusinessHoursRow } from "../queries";

const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface DayState {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

function buildInitialState(hours: BusinessHoursRow[]): DayState[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const saved = hours.find((h) => h.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      opensAt: saved?.opensAt?.slice(0, 5) ?? "09:00",
      closesAt: saved?.closesAt?.slice(0, 5) ?? "18:00",
      isClosed: saved?.isClosed ?? dayOfWeek === 0,
    };
  });
}

/** Sem nenhum horário salvo ainda, cada dia aqui já nasce com um padrão (9h-18h,
 * domingo fechado) só pra dar um ponto de partida — nada é persistido até "Salvar". */
export function BusinessHoursCard({ hours }: { hours: BusinessHoursRow[] }) {
  const [days, setDays] = useState<DayState[]>(() => buildInitialState(hours));
  const [pending, startTransition] = useTransition();

  function update(dayOfWeek: number, patch: Partial<DayState>) {
    setDays((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
  }

  function save() {
    startTransition(async () => {
      const result = await saveBusinessHoursAction(
        days.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          opensAt: d.isClosed ? null : d.opensAt,
          closesAt: d.isClosed ? null : d.closesAt,
          isClosed: d.isClosed,
        })),
      );
      if (result.status === "success") toast.success(result.message);
      else if (result.status === "error") toast.error(result.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horário de funcionamento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {days.map((day) => (
          <div key={day.dayOfWeek} className="flex flex-wrap items-center gap-3">
            <span className="w-24 shrink-0 text-body font-medium">{DAY_LABELS[day.dayOfWeek]}</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={!day.isClosed}
                onCheckedChange={(checked) => update(day.dayOfWeek, { isClosed: !checked })}
              />
              <span className="w-16 text-small text-muted-foreground">{day.isClosed ? "Fechado" : "Aberto"}</span>
            </div>
            {!day.isClosed && (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-28"
                  value={day.opensAt}
                  onChange={(e) => update(day.dayOfWeek, { opensAt: e.target.value })}
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="time"
                  className="w-28"
                  value={day.closesAt}
                  onChange={(e) => update(day.dayOfWeek, { closesAt: e.target.value })}
                />
              </div>
            )}
          </div>
        ))}
        <Button onClick={save} disabled={pending} className="mt-2 self-start">
          {pending && <Spinner />}
          Salvar horário
        </Button>
      </CardContent>
    </Card>
  );
}
