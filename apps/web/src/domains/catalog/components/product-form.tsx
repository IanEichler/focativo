"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { DecimalField, SwitchField, TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSheet, SheetFormLayout } from "@/components/forms/form-sheet";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Button } from "@/components/ui/button";
import { toDecimalInput } from "@/lib/decimal";
import { IDLE, type ActionState } from "@/lib/errors";
import { saveProductAction } from "../actions/products";
import { PRODUCT_UNITS } from "../labels";
import type { CategoryOption, NamedOption } from "../queries";
import type { ProductField } from "../schemas";

export interface ProductFormValues {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  supplierId: string | null;
  unit: string;
  salePrice: number;
  promoPrice: number | null;
  costPrice: number | null;
  minStock: number;
  sku: string | null;
  barcode: string | null;
  trackLots: boolean;
  isActive: boolean;
  hasVariants: boolean;
}

export interface ProductFormOptions {
  categories: CategoryOption[];
  brands: NamedOption[];
  suppliers: NamedOption[];
}

const NONE = "__none__";

function withNone(items: { value: string; label: string }[], label: string) {
  return [{ value: NONE, label }, ...items];
}

export function ProductFormSheet({
  trigger,
  product,
  options,
  canEditCost,
}: {
  trigger: React.ReactNode;
  product?: ProductFormValues;
  options: ProductFormOptions;
  canEditCost: boolean;
}) {
  return (
    <FormSheet
      trigger={trigger}
      size="lg"
      title={product ? "Editar produto" : "Novo produto"}
      description={product ? product.name : "Cadastre o produto; variações, características e estoque vêm em seguida."}
    >
      {(close) => <ProductForm product={product} options={options} canEditCost={canEditCost} onDone={close} />}
    </FormSheet>
  );
}

function ProductForm({
  product,
  options,
  canEditCost,
  onDone,
}: {
  product?: ProductFormValues;
  options: ProductFormOptions;
  canEditCost: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState<ActionState<ProductField>, FormData>(saveProductAction, IDLE);
  const values = state.status === "error" ? state.values : undefined;
  const pick = (field: ProductField, fallback: string | null | undefined) => values?.[field] ?? fallback ?? undefined;
  const simple = !product?.hasVariants;

  useActionFeedback(state, {
    onSuccess: (result) => {
      onDone();
      if (!product && result.id) router.push(`/app/produtos/${result.id}`);
    },
  });

  const categoryOptions = withNone(
    options.categories
      .filter((category) => category.isActive || category.id === product?.categoryId)
      .map((category) => ({ value: category.id, label: category.path })),
    "Sem categoria",
  );
  const brandOptions = withNone(
    options.brands
      .filter((brand) => brand.isActive || brand.id === product?.brandId)
      .map((brand) => ({ value: brand.id, label: brand.name })),
    "Sem marca",
  );
  const supplierOptions = withNone(
    options.suppliers
      .filter((supplier) => supplier.isActive || supplier.id === product?.supplierId)
      .map((supplier) => ({ value: supplier.id, label: supplier.name })),
    "Sem fornecedor",
  );

  // Checkboxes não enviados = desligados; no reenvio após erro, respeita o que foi submetido.
  const checked = (field: ProductField, fallback: boolean) => (values ? values[field] === "on" : fallback);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col" noValidate>
      {product && <input type="hidden" name="productId" value={product.id} />}
      {canEditCost && <input type="hidden" name="canEditCost" value="on" />}
      <SheetFormLayout
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
            <SubmitButton pendingLabel="Salvando…">{product ? "Salvar alterações" : "Cadastrar produto"}</SubmitButton>
          </>
        }
      >
        <FormMessage state={state.status === "error" ? state : IDLE} />

        <section className="flex flex-col gap-4">
          <TextField
            label="Nome"
            name="name"
            required
            autoFocus
            placeholder="Ex.: Whey Protein Isolado 900g"
            defaultValue={pick("name", product?.name)}
            error={fieldError(state, "name")}
          />
          <TextareaField
            label="Descrição"
            name="description"
            rows={3}
            maxLength={5000}
            defaultValue={pick("description", product?.description)}
            error={fieldError(state, "description")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Categoria"
              name="categoryId"
              options={categoryOptions}
              defaultValue={pick("categoryId", product?.categoryId) ?? NONE}
              error={fieldError(state, "categoryId")}
            />
            <SelectField
              label="Marca"
              name="brandId"
              options={brandOptions}
              defaultValue={pick("brandId", product?.brandId) ?? NONE}
              error={fieldError(state, "brandId")}
            />
            <SelectField
              label="Fornecedor principal"
              name="supplierId"
              options={supplierOptions}
              defaultValue={pick("supplierId", product?.supplierId) ?? NONE}
              error={fieldError(state, "supplierId")}
            />
            <SelectField
              label="Unidade de venda"
              name="unit"
              options={PRODUCT_UNITS}
              defaultValue={pick("unit", product?.unit) ?? "UN"}
              error={fieldError(state, "unit")}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="text-body font-semibold">Preços</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <DecimalField
              label="Preço de venda"
              name="salePrice"
              prefix="R$"
              required
              defaultValue={pick("salePrice", toDecimalInput(product?.salePrice))}
              error={fieldError(state, "salePrice")}
            />
            <DecimalField
              label="Preço promocional"
              name="promoPrice"
              prefix="R$"
              description="Opcional"
              defaultValue={pick("promoPrice", toDecimalInput(product?.promoPrice))}
              error={fieldError(state, "promoPrice")}
            />
            {canEditCost && simple && (
              <DecimalField
                label="Custo"
                name="costPrice"
                prefix="R$"
                description="Visível só para gestão"
                defaultValue={pick("costPrice", toDecimalInput(product?.costPrice))}
                error={fieldError(state, "costPrice")}
              />
            )}
          </div>
          {!simple && (
            <p className="text-small text-muted-foreground">
              Preço base herdado pelas variações sem preço próprio. Custos são definidos por variação.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="text-body font-semibold">Identificação e estoque</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {simple && (
              <>
                <TextField
                  label="SKU"
                  name="sku"
                  placeholder="WHEY-ISO-900"
                  autoComplete="off"
                  className="uppercase"
                  defaultValue={pick("sku", product?.sku)}
                  error={fieldError(state, "sku")}
                />
                <TextField
                  label="Código de barras"
                  name="barcode"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={pick("barcode", product?.barcode)}
                  error={fieldError(state, "barcode")}
                />
              </>
            )}
            <DecimalField
              label="Estoque mínimo"
              name="minStock"
              placeholder="0"
              description="Alerta de estoque baixo"
              defaultValue={pick("minStock", product ? toDecimalInput(product.minStock, 3) : undefined)}
              error={fieldError(state, "minStock")}
            />
          </div>
          <SwitchField
            label="Controlar lotes e validade"
            name="trackLots"
            defaultChecked={checked("trackLots", product?.trackLots ?? false)}
            description="Entradas exigem lote; saídas seguem FEFO (vence primeiro, sai primeiro). Só pode ser alterado com estoque zerado."
          />
          <SwitchField
            label="Produto ativo"
            name="isActive"
            defaultChecked={checked("isActive", product?.isActive ?? true)}
            description="Produtos inativos não aparecem para venda."
          />
        </section>
      </SheetFormLayout>
    </form>
  );
}
