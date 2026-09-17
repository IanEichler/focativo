"use client";

import { Archive, ImagePlus, MoreHorizontal, Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { IDLE, type ActionState } from "@/lib/errors";
import { PRODUCT_IMAGE_TYPES } from "@/lib/storage";
import {
  archiveProductAction,
  removeProductImageAction,
  setProductActiveAction,
  uploadProductImageAction,
} from "../actions/products";
import { ProductThumbnail } from "./product-visuals";

export function ProductStatusMenu({
  productId,
  productName,
  isActive,
}: {
  productId: string;
  productName: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const toggleActive = () =>
    startTransition(async () => {
      const result = await setProductActiveAction(productId, !isActive);
      if (result.status === "success") toast.success(result.message);
      else if (result.status === "error") toast.error(result.message);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Mais ações do produto" disabled={pending}>
            {pending ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={toggleActive}>
            {isActive ? <PowerOff /> : <Power />}
            {isActive ? "Desativar produto" : "Ativar produto"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmArchive(true)}>
            <Archive /> Arquivar produto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Arquivar produto?"
        description={`${productName} sairá do catálogo. O histórico de estoque e auditoria é preservado. É necessário que o estoque esteja zerado.`}
        confirmLabel="Arquivar"
        destructive
        onConfirm={() => archiveProductAction(productId)}
        onSuccess={() => router.push("/app/produtos")}
      />
    </>
  );
}

export function ProductImageEditor({
  productId,
  productName,
  imagePath,
  canEdit,
}: {
  productId: string;
  productName: string;
  imagePath: string | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadProductImageAction, IDLE);
  const [removing, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useActionFeedback(state, { toastOnError: true });

  const remove = () =>
    startTransition(async () => {
      const result = await removeProductImageAction(productId);
      if (result.status === "success") toast.success(result.message);
      else if (result.status === "error") toast.error(result.message);
    });

  return (
    <div className="flex flex-col items-start gap-3">
      <ProductThumbnail path={imagePath} name={productName} size={160} className="rounded-xl" />
      {canEdit && (
        <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={productId} />
          <label className="inline-flex">
            <input
              type="file"
              name="image"
              accept={PRODUCT_IMAGE_TYPES.join(",")}
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                if (event.currentTarget.files?.length) formRef.current?.requestSubmit();
              }}
            />
            <span
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-[13px] font-medium hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              aria-busy={pending}
            >
              {pending ? <Spinner /> : <ImagePlus className="size-4" />}
              {imagePath ? "Trocar imagem" : "Enviar imagem"}
            </span>
          </label>
          {imagePath && (
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={removing || pending}>
              {removing ? <Spinner /> : <Trash2 />} Remover
            </Button>
          )}
        </form>
      )}
      {canEdit && <p className="text-caption text-muted-foreground">JPG, PNG ou WebP até 2 MB.</p>}
    </div>
  );
}
