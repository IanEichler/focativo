import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/data/status-badge";
import { allergenChips, attributeChips, formatAmount } from "@/domains/catalog/characteristics";
import { AllergensForm, AttributesForm, NutritionForm } from "@/domains/catalog/components/characteristics-forms";
import { CharacteristicChips } from "@/domains/catalog/components/product-visuals";
import { getCharacteristicsScope, getEffectiveCharacteristics, type ProductDetail } from "@/domains/catalog/queries";
import type { TenantContext } from "@/domains/tenants/context";
import { cn } from "@/lib/utils";

const PRESENCE_TONE = { TRUE: "warning", FALSE: "success", UNKNOWN: "neutral" } as const;
const PRESENCE_LABEL = { TRUE: "Contém", FALSE: "Não contém", UNKNOWN: "Não informado" } as const;

export async function CharacteristicsTab({
  context,
  product,
  scope,
}: {
  context: TenantContext;
  product: ProductDetail;
  scope: string | undefined;
}) {
  const variant = product.hasVariants ? product.variants.find((item) => item.id === scope) : undefined;
  const variantId = variant?.id ?? null;
  const base = `/app/produtos/${product.id}?aba=caracteristicas`;

  const scopeNav = product.hasVariants ? (
    <nav aria-label="Escopo das características" className="flex flex-wrap gap-1.5">
      {[
        { id: null, label: "Produto (todas as variações)" },
        ...product.variants.map((item) => ({ id: item.id, label: item.name })),
      ].map((item) => (
        <Link
          key={item.id ?? "product"}
          href={item.id ? `${base}&escopo=${item.id}` : base}
          scroll={false}
          aria-current={variantId === item.id ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-small font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            variantId === item.id
              ? "border-primary bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  ) : null;

  if (!context.can("catalog.write")) {
    return (
      <div className="flex flex-col gap-4">
        {scopeNav}
        <ReadOnlyCharacteristics variantId={variantId ?? product.defaultVariant.id} />
      </div>
    );
  }

  const data = await getCharacteristicsScope(context, product.id, variantId);
  const scopeLabel = variant
    ? `Variação ${variant.name}: valores preenchidos substituem os do produto.`
    : "Valores do produto, herdados por todas as variações.";

  return (
    <div className="flex flex-col gap-4">
      {scopeNav}
      <p className="text-small text-muted-foreground">{scopeLabel}</p>

      <Card>
        <CardHeader>
          <CardTitle>Características</CardTitle>
          <CardDescription>Sabor, peso, alegações e outros atributos estruturados.</CardDescription>
        </CardHeader>
        <CardContent>
          <AttributesForm key={`attributes-${variantId}`} productId={product.id} variantId={variantId} data={data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alérgenos e restrições</CardTitle>
          <CardDescription>Informação de segurança: registre apenas o que consta na fonte.</CardDescription>
        </CardHeader>
        <CardContent>
          <AllergensForm key={`allergens-${variantId}`} productId={product.id} variantId={variantId} data={data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informação nutricional</CardTitle>
          <CardDescription>Valores por porção, conforme rótulo ou ficha técnica.</CardDescription>
        </CardHeader>
        <CardContent>
          <NutritionForm key={`nutrition-${variantId}`} productId={product.id} variantId={variantId} data={data} />
        </CardContent>
      </Card>
    </div>
  );
}

async function ReadOnlyCharacteristics({ variantId }: { variantId: string }) {
  const effective = await getEffectiveCharacteristics(variantId);
  const nutrientsByCode = new Map(effective.nutrients.map((nutrient) => [nutrient.code, nutrient]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <CharacteristicChips
            chips={[...attributeChips(effective.attributes), ...allergenChips(effective.allergens)]}
            empty="Nenhuma característica cadastrada."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alérgenos</CardTitle>
          <CardDescription>“Não informado” não significa ausência.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-border">
            {effective.allergens.map((allergen) => (
              <li key={allergen.code} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-body">{allergen.name}</span>
                <span className="flex items-center gap-2">
                  {allergen.mayContainTraces && <span className="text-caption text-warning">pode conter traços</span>}
                  <StatusBadge tone={PRESENCE_TONE[allergen.presence]}>{PRESENCE_LABEL[allergen.presence]}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Informação nutricional</CardTitle>
          {effective.nutrition && (
            <CardDescription>
              Porção de {formatAmount(effective.nutrition.servingSize, effective.nutrition.servingUnit)}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {effective.nutrition ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nutriente</TableHead>
                  <TableHead className="text-right">Por porção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(effective.nutrition.values).map(([code, amount]) => {
                  const nutrient = nutrientsByCode.get(code);
                  return (
                    <TableRow key={code}>
                      <TableCell>{nutrient?.name ?? code}</TableCell>
                      <TableCell className="text-right tabular">
                        {formatAmount(amount, nutrient?.unit ?? null)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-body text-muted-foreground">Tabela nutricional não cadastrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
