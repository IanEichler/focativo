"use client";

import { ListPlus, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/data/status-badge";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { SwitchField, TextareaField } from "@/components/forms/fields";
import { fieldError, FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSheet, SheetFormLayout } from "@/components/forms/form-sheet";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCpfCnpj } from "@/lib/br-documents";
import { toCode } from "@/lib/codes";
import { IDLE, type ActionState } from "@/lib/errors";
import {
  deleteTaxonomyItemAction,
  saveAttributeAction,
  saveAttributeOptionAction,
  saveBrandAction,
  saveCategoryAction,
  saveSupplierAction,
} from "../actions/taxonomy";
import { ATTRIBUTE_TYPE_LABEL, ATTRIBUTE_TYPES } from "../labels";
import type { TaxonomyData } from "../queries";

type Deletable = Parameters<typeof deleteTaxonomyItemAction>[0];

const NONE = "__none__";

function ActiveBadge({ active }: { active: boolean }) {
  return <StatusBadge tone={active ? "success" : "neutral"}>{active ? "Ativo" : "Inativo"}</StatusBadge>;
}

function checkedValue(values: Record<string, string> | undefined, field: string, fallback: boolean) {
  return values ? values[field] === "on" : fallback;
}

/** Linha de ações (editar / excluir) reutilizada pelos gerenciadores. */
function RowActions({
  label,
  entity,
  id,
  inUse,
  renderEdit,
  extra,
}: {
  label: string;
  entity: Deletable;
  id: string;
  inUse: number;
  renderEdit: (open: boolean, setOpen: (open: boolean) => void) => React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${label}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Editar
          </DropdownMenuItem>
          {extra}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renderEdit(editing, setEditing)}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Excluir ${label}?`}
        description={
          inUse > 0
            ? `Está em uso por ${inUse} registro(s). Se a exclusão for bloqueada, desative o item para ocultá-lo.`
            : "Esta ação não pode ser desfeita."
        }
        confirmLabel="Excluir"
        destructive
        onConfirm={() => deleteTaxonomyItemAction(entity, id)}
      />
    </>
  );
}

function SheetFooter({ onCancel, label }: { onCancel: () => void; label: string }) {
  return (
    <>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <SubmitButton pendingLabel="Salvando…">{label}</SubmitButton>
    </>
  );
}

function useSheetForm(action: (prev: ActionState, formData: FormData) => Promise<ActionState>, onDone: () => void) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, IDLE);
  useActionFeedback(state, { onSuccess: onDone });
  const values = state.status === "error" ? (state.values as Record<string, string> | undefined) : undefined;
  return { state, formAction, values };
}

// -----------------------------------------------------------------------------
// Categorias
// -----------------------------------------------------------------------------

type Category = TaxonomyData["categories"][number];

function CategoryForm({
  category,
  categories,
  onDone,
}: {
  category?: Category;
  categories: Category[];
  onDone: () => void;
}) {
  const { state, formAction, values } = useSheetForm(saveCategoryAction, onDone);

  // Não permite escolher a própria categoria ou descendentes como pai; limita a 3 níveis.
  const blocked = new Set<string>();
  if (category) {
    blocked.add(category.id);
    for (const item of categories) {
      if (item.path.startsWith(`${category.path} › `)) blocked.add(item.id);
    }
  }
  const parents = categories.filter((item) => !blocked.has(item.id) && item.depth < 2);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col" noValidate>
      {category && <input type="hidden" name="id" value={category.id} />}
      <SheetFormLayout footer={<SheetFooter onCancel={onDone} label="Salvar" />}>
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <TextField
          label="Nome"
          name="name"
          required
          autoFocus
          defaultValue={values?.name ?? category?.name}
          error={fieldError(state, "name")}
        />
        <SelectField
          label="Categoria pai"
          name="parentId"
          options={[
            { value: NONE, label: "Nenhuma (categoria principal)" },
            ...parents.map((item) => ({ value: item.id, label: item.path })),
          ]}
          defaultValue={values?.parentId ?? category?.parentId ?? NONE}
          error={fieldError(state, "parentId")}
        />
        <TextareaField
          label="Descrição"
          name="description"
          maxLength={500}
          defaultValue={values?.description ?? category?.description ?? undefined}
        />
        <SwitchField
          label="Ativa"
          name="isActive"
          defaultChecked={checkedValue(values, "isActive", category?.isActive ?? true)}
        />
      </SheetFormLayout>
    </form>
  );
}

export function CategoryManager({ categories, canWrite }: { categories: Category[]; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex justify-end">
          <FormSheet
            title="Nova categoria"
            trigger={
              <Button>
                <Plus /> Nova categoria
              </Button>
            }
          >
            {(close) => <CategoryForm categories={categories} onDone={close} />}
          </FormSheet>
        </div>
      )}
      {categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria"
          description="Organize o catálogo em até 3 níveis (ex.: Suplementos › Proteínas)."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Produtos</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && (
                  <TableHead className="w-12">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <span className="font-medium" style={{ paddingLeft: category.depth * 20 }}>
                      {category.depth > 0 && <span className="mr-1.5 text-subtle">└</span>}
                      {category.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular">{category.productCount}</TableCell>
                  <TableCell>
                    <ActiveBadge active={category.isActive} />
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <RowActions
                        label={category.name}
                        entity="categories"
                        id={category.id}
                        inUse={category.productCount}
                        renderEdit={(open, setOpen) => (
                          <FormSheet title="Editar categoria" open={open} onOpenChange={setOpen}>
                            {(close) => <CategoryForm category={category} categories={categories} onDone={close} />}
                          </FormSheet>
                        )}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Marcas
// -----------------------------------------------------------------------------

type Brand = TaxonomyData["brands"][number];

function BrandForm({ brand, onDone }: { brand?: Brand; onDone: () => void }) {
  const { state, formAction, values } = useSheetForm(saveBrandAction, onDone);
  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col" noValidate>
      {brand && <input type="hidden" name="id" value={brand.id} />}
      <SheetFormLayout footer={<SheetFooter onCancel={onDone} label="Salvar" />}>
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <TextField
          label="Nome"
          name="name"
          required
          autoFocus
          defaultValue={values?.name ?? brand?.name}
          error={fieldError(state, "name")}
        />
        <SwitchField
          label="Ativa"
          name="isActive"
          defaultChecked={checkedValue(values, "isActive", brand?.isActive ?? true)}
        />
      </SheetFormLayout>
    </form>
  );
}

export function BrandManager({ brands, canWrite }: { brands: Brand[]; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex justify-end">
          <FormSheet
            title="Nova marca"
            trigger={
              <Button>
                <Plus /> Nova marca
              </Button>
            }
          >
            {(close) => <BrandForm onDone={close} />}
          </FormSheet>
        </div>
      )}
      {brands.length === 0 ? (
        <EmptyState title="Nenhuma marca" description="Marcas ajudam na busca e nos filtros do atendimento." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Produtos</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && (
                  <TableHead className="w-12">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell className="font-medium">{brand.name}</TableCell>
                  <TableCell className="text-right tabular">{brand.productCount}</TableCell>
                  <TableCell>
                    <ActiveBadge active={brand.isActive} />
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <RowActions
                        label={brand.name}
                        entity="brands"
                        id={brand.id}
                        inUse={brand.productCount}
                        renderEdit={(open, setOpen) => (
                          <FormSheet title="Editar marca" open={open} onOpenChange={setOpen}>
                            {(close) => <BrandForm brand={brand} onDone={close} />}
                          </FormSheet>
                        )}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Fornecedores
// -----------------------------------------------------------------------------

type Supplier = TaxonomyData["suppliers"][number];

function SupplierForm({ supplier, onDone }: { supplier?: Supplier; onDone: () => void }) {
  const { state, formAction, values } = useSheetForm(saveSupplierAction, onDone);
  const pick = (field: keyof Supplier & string, fallback: string | null | undefined) =>
    values?.[field] ?? fallback ?? undefined;
  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col" noValidate>
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <SheetFormLayout footer={<SheetFooter onCancel={onDone} label="Salvar" />}>
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <TextField
          label="Nome"
          name="name"
          required
          autoFocus
          defaultValue={pick("name", supplier?.name)}
          error={fieldError(state, "name")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Razão social"
            name="legalName"
            defaultValue={pick("legalName", supplier?.legalName)}
            error={fieldError(state, "legalName")}
          />
          <TextField
            label="CPF ou CNPJ"
            name="document"
            inputMode="numeric"
            defaultValue={pick("document", supplier?.document ? formatCpfCnpj(supplier.document) : null)}
            error={fieldError(state, "document")}
          />
          <TextField
            label="Contato"
            name="contactName"
            defaultValue={pick("contactName", supplier?.contactName)}
            error={fieldError(state, "contactName")}
          />
          <TextField
            label="Telefone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={pick("phone", supplier?.phone)}
            error={fieldError(state, "phone")}
          />
          <TextField
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            defaultValue={pick("email", supplier?.email)}
            error={fieldError(state, "email")}
            containerClassName="sm:col-span-2"
          />
        </div>
        <TextareaField
          label="Observações"
          name="notes"
          maxLength={1000}
          defaultValue={pick("notes", supplier?.notes)}
        />
        <SwitchField
          label="Ativo"
          name="isActive"
          defaultChecked={checkedValue(values, "isActive", supplier?.isActive ?? true)}
        />
      </SheetFormLayout>
    </form>
  );
}

export function SupplierManager({ suppliers, canWrite }: { suppliers: Supplier[]; canWrite: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex justify-end">
          <FormSheet
            title="Novo fornecedor"
            trigger={
              <Button>
                <Plus /> Novo fornecedor
              </Button>
            }
          >
            {(close) => <SupplierForm onDone={close} />}
          </FormSheet>
        </div>
      )}
      {suppliers.length === 0 ? (
        <EmptyState
          title="Nenhum fornecedor"
          description="Fornecedores são vinculados a produtos e aos lotes recebidos."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Fornecedor</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="text-right">Produtos</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && (
                  <TableHead className="w-12">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{supplier.name}</span>
                      {supplier.document && (
                        <span className="text-small text-muted-foreground tabular">
                          {formatCpfCnpj(supplier.document)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-col text-small">
                      <span>{supplier.contactName ?? "—"}</span>
                      <span className="text-muted-foreground">{supplier.email ?? supplier.phone ?? ""}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{supplier.productCount}</TableCell>
                  <TableCell>
                    <ActiveBadge active={supplier.isActive} />
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <RowActions
                        label={supplier.name}
                        entity="suppliers"
                        id={supplier.id}
                        inUse={supplier.productCount}
                        renderEdit={(open, setOpen) => (
                          <FormSheet title="Editar fornecedor" open={open} onOpenChange={setOpen}>
                            {(close) => <SupplierForm supplier={supplier} onDone={close} />}
                          </FormSheet>
                        )}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Características (atributos dinâmicos)
// -----------------------------------------------------------------------------

type Attribute = TaxonomyData["attributes"][number];

function AttributeForm({ attribute, onDone }: { attribute?: Attribute; onDone: () => void }) {
  const { state, formAction, values } = useSheetForm(saveAttributeAction, onDone);
  const [name, setName] = useState(values?.name ?? attribute?.name ?? "");
  const [codeTouched, setCodeTouched] = useState(false);
  const [code, setCode] = useState(values?.code ?? attribute?.code ?? "");
  const [dataType, setDataType] = useState(values?.dataType ?? attribute?.dataType ?? "ENUM");
  const effectiveCode = attribute || codeTouched ? code : toCode(name);
  const type = attribute?.dataType ?? dataType;

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col" noValidate>
      {attribute && <input type="hidden" name="id" value={attribute.id} />}
      <SheetFormLayout footer={<SheetFooter onCancel={onDone} label="Salvar" />}>
        <FormMessage state={state.status === "error" ? state : IDLE} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nome"
            name="name"
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldError(state, "name")}
          />
          <TextField
            label="Código técnico"
            name="code"
            required={!attribute}
            disabled={Boolean(attribute)}
            value={effectiveCode}
            onChange={(event) => {
              setCodeTouched(true);
              setCode(event.target.value);
            }}
            description={attribute ? "Imutável: usado pelo motor de compatibilidade." : "Gerado a partir do nome."}
            error={fieldError(state, "code")}
          />
        </div>
        {attribute ? (
          <p className="text-body">
            Tipo: <strong>{ATTRIBUTE_TYPE_LABEL[attribute.dataType]}</strong>
            <span className="text-muted-foreground"> (não pode ser alterado)</span>
          </p>
        ) : (
          <SelectField
            label="Tipo de valor"
            name="dataType"
            required
            options={ATTRIBUTE_TYPES.map((item) => ({
              value: item.value,
              label: `${item.label} — ${item.description}`,
            }))}
            defaultValue={dataType}
            onValueChange={setDataType}
            error={fieldError(state, "dataType")}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Grupo"
            name="groupName"
            placeholder="Ex.: Dietas, Embalagem"
            defaultValue={values?.groupName ?? attribute?.groupName ?? undefined}
          />
          {type === "NUMBER" && (
            <TextField
              label="Unidade"
              name="unit"
              placeholder="g, ml, mg…"
              defaultValue={values?.unit ?? attribute?.unit ?? undefined}
              error={fieldError(state, "unit")}
            />
          )}
        </div>
        <TextareaField
          label="Descrição"
          name="description"
          maxLength={300}
          defaultValue={values?.description ?? attribute?.description ?? undefined}
        />
        <div className="grid gap-2">
          <SwitchField
            label="Pesquisável"
            name="isSearchable"
            defaultChecked={checkedValue(values, "isSearchable", attribute?.isSearchable ?? true)}
            description="Considerada na busca de produtos."
          />
          <SwitchField
            label="Filtrável"
            name="isFilterable"
            defaultChecked={checkedValue(values, "isFilterable", attribute?.isFilterable ?? false)}
            description="Pode ser usada como filtro."
          />
          <SwitchField
            label="Usada na compatibilidade"
            name="isCompatibilityEnabled"
            defaultChecked={checkedValue(values, "isCompatibilityEnabled", attribute?.isCompatibilityEnabled ?? false)}
            description="Disponível para o motor que responde ao que o cliente procura."
          />
          {(type === "ENUM" || type === "TEXT") && (
            <SwitchField
              label="Diferencia variações"
              name="isVariantAxis"
              defaultChecked={checkedValue(values, "isVariantAxis", attribute?.isVariantAxis ?? false)}
              description="Ex.: sabor, tamanho."
            />
          )}
          <SwitchField
            label="Ativa"
            name="isActive"
            defaultChecked={checkedValue(values, "isActive", attribute?.isActive ?? true)}
          />
        </div>
      </SheetFormLayout>
    </form>
  );
}

function OptionsEditor({ attribute, onDone }: { attribute: Attribute; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveAttributeOptionAction, IDLE);
  const [pending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);
  useActionFeedback(state, { onSuccess: () => setFormKey((key) => key + 1) });

  const remove = (optionId: string) =>
    startTransition(async () => {
      const result = await deleteTaxonomyItemAction("product_attribute_options", optionId);
      if (result.status === "success") toast.success(result.message);
      else if (result.status === "error") toast.error(result.message);
    });

  return (
    <SheetFormLayout
      footer={
        <Button type="button" variant="outline" onClick={onDone}>
          Concluir
        </Button>
      }
    >
      <form key={formKey} action={formAction} className="flex items-end gap-2" noValidate>
        <input type="hidden" name="attributeId" value={attribute.id} />
        <TextField
          label="Nova opção"
          name="label"
          placeholder="Ex.: Chocolate"
          containerClassName="flex-1"
          error={fieldError(state, "label")}
        />
        <SubmitButton pendingLabel="…">Adicionar</SubmitButton>
      </form>
      <FormMessage state={state.status === "error" ? state : IDLE} />
      {attribute.options.length === 0 ? (
        <p className="text-body text-muted-foreground">Nenhuma opção cadastrada.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {attribute.options.map((option) => (
            <li key={option.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2">
                {option.label}
                {!option.isActive && <Badge variant="outline">Inativa</Badge>}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir opção ${option.label}`}
                disabled={pending}
                onClick={() => remove(option.id)}
              >
                {pending ? <Spinner /> : <Trash2 />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SheetFormLayout>
  );
}

export function AttributeManager({ attributes, canWrite }: { attributes: Attribute[]; canWrite: boolean }) {
  const [optionsFor, setOptionsFor] = useState<Attribute | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-muted-foreground">
        Características estruturadas descrevem produtos de qualquer segmento e alimentam busca, filtros e o motor de
        compatibilidade. Alérgenos e tabela nutricional têm estrutura própria no produto.
      </p>
      {canWrite && (
        <div className="flex justify-end">
          <FormSheet
            title="Nova característica"
            trigger={
              <Button>
                <Plus /> Nova característica
              </Button>
            }
          >
            {(close) => <AttributeForm onDone={close} />}
          </FormSheet>
        </div>
      )}
      {attributes.length === 0 ? (
        <EmptyState
          title="Nenhuma característica"
          description="Ex.: sabor (lista), peso líquido (número), vegano (sim/não)."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Característica</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden lg:table-cell">Uso</TableHead>
                <TableHead className="text-right">Produtos</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && (
                  <TableHead className="w-12">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {attributes.map((attribute) => (
                <TableRow key={attribute.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{attribute.name}</span>
                      <span className="font-mono text-caption text-muted-foreground">{attribute.code}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {ATTRIBUTE_TYPE_LABEL[attribute.dataType]}
                    {attribute.dataType === "ENUM" && (
                      <span className="text-muted-foreground"> · {attribute.options.length} opções</span>
                    )}
                    {attribute.unit && <span className="text-muted-foreground"> · {attribute.unit}</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {attribute.isFilterable && <Badge variant="secondary">Filtro</Badge>}
                      {attribute.isCompatibilityEnabled && <Badge variant="secondary">Compatibilidade</Badge>}
                      {attribute.isVariantAxis && <Badge variant="secondary">Variação</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{attribute.usageCount}</TableCell>
                  <TableCell>
                    <ActiveBadge active={attribute.isActive} />
                  </TableCell>
                  {canWrite && (
                    <TableCell className="text-right">
                      <RowActions
                        label={attribute.name}
                        entity="product_attributes"
                        id={attribute.id}
                        inUse={attribute.usageCount}
                        extra={
                          attribute.dataType === "ENUM" ? (
                            <DropdownMenuItem onSelect={() => setOptionsFor(attribute)}>
                              <ListPlus /> Opções
                            </DropdownMenuItem>
                          ) : undefined
                        }
                        renderEdit={(open, setOpen) => (
                          <FormSheet title="Editar característica" open={open} onOpenChange={setOpen}>
                            {(close) => <AttributeForm attribute={attribute} onDone={close} />}
                          </FormSheet>
                        )}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <FormSheet
        title={optionsFor ? `Opções de ${optionsFor.name}` : "Opções"}
        open={optionsFor !== null}
        onOpenChange={(open) => !open && setOptionsFor(null)}
      >
        {(close) =>
          optionsFor ? (
            <OptionsEditor
              attribute={attributes.find((item) => item.id === optionsFor.id) ?? optionsFor}
              onDone={close}
            />
          ) : null
        }
      </FormSheet>
    </div>
  );
}
