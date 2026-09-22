"use client";

import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { adminResetPasswordAction } from "../actions";

// Sem 0/O/1/l/I (ambíguos) — só uma sugestão inicial, o admin master pode
// apagar e digitar a senha que quiser antes de confirmar.
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function suggestPassword(length = 14): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => CHARSET[v % CHARSET.length]).join("");
}

export function ResetPasswordDialog({
  userId,
  userName,
  tenantId,
}: {
  userId: string;
  userName: string;
  tenantId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(() => suggestPassword());
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setResult(null);
      setCopied(false);
      setDraft(suggestPassword());
    }
  }

  function confirm() {
    startTransition(async () => {
      const response = await adminResetPasswordAction(userId, tenantId, draft);
      if (response.status === "error") {
        toast.error(response.message);
        return;
      }
      setResult(response.password);
    });
  }

  async function copyPassword() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <KeyRound /> Redefinir senha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            {result
              ? "Repasse esta senha ao usuário por um canal seguro — ela não fica salva em nenhum lugar e não será mostrada de novo."
              : `Isso substitui imediatamente a senha de ${userName}. Use a sugestão ou digite a senha que quiser (mín. 8 caracteres, com letras e números).`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-3">
            <code className="flex-1 font-mono text-body break-all">{result}</code>
            <Button type="button" variant="outline" size="icon-sm" onClick={copyPassword} aria-label="Copiar senha">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-password-draft" className="text-body font-medium">
              Nova senha
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="reset-password-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="font-mono"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setDraft(suggestPassword())}
                aria-label="Gerar outra sugestão"
              >
                <RefreshCw />
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <DialogClose asChild>
              <Button type="button">Concluído</Button>
            </DialogClose>
          ) : (
            <>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="button" variant="destructive" disabled={pending || draft.length < 8} onClick={confirm}>
                {pending ? "Redefinindo…" : "Redefinir senha"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
