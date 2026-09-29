import { z } from "zod";
import { getTenantContext } from "@/domains/tenants/context";
import { lookupCustomers } from "@/domains/customers/queries";
import { lookupVariants } from "@/domains/inventory/queries";
import { searchVariants } from "@/domains/catalog/search";

const requirement = z.object({
  level: z.enum(["PREFERENCE", "NUTRITIONAL_CHARACTERISTIC", "HEALTH_RELATED"]).optional(),
  type: z.enum([
    "ALLERGEN_ABSENT",
    "ALLERGEN_PRESENT",
    "ATTRIBUTE_EQUALS",
    "NUTRITION_MAX",
    "NUTRITION_MIN",
    "PRICE_MAX",
  ]),
  code: z.string().max(100).optional(),
  value: z.union([z.string().max(100), z.number(), z.boolean()]).optional(),
});
const paramsSchema = z.object({
  kind: z.enum(["customers", "inventory", "products"]),
  q: z.string().trim().max(100).default(""),
  inStock: z.enum(["true", "false"]).default("false"),
  requirements: z
    .string()
    .max(2000)
    .default("[]")
    .transform((raw, ctx) => {
      try {
        return z.array(requirement).max(10).parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid requirements" });
        return z.NEVER;
      }
    }),
});
const headers = { "Cache-Control": "private, no-store" };

/** Read-only searches can run independently and be aborted by the browser. */
export async function GET(request: Request) {
  const parsed = paramsSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Busca inválida." }, { status: 400, headers });
  const context = await getTenantContext();
  if (!context) return Response.json({ error: "Entre novamente para pesquisar." }, { status: 401, headers });
  const { kind, q, inStock, requirements } = parsed.data;
  const permission = { customers: "customers.read", inventory: "inventory.read", products: "catalog.read" } as const;
  if (!context.can(permission[kind]))
    return Response.json({ error: "Sem acesso à pesquisa." }, { status: 403, headers });
  try {
    const items =
      kind === "customers"
        ? await lookupCustomers(context, q)
        : kind === "inventory"
          ? await lookupVariants(context, q)
          : (await searchVariants(context, { query: q, inStockOnly: inStock === "true", requirements, limit: 15 }))
              .rows;
    return Response.json(items, { headers });
  } catch {
    return Response.json({ error: "Não foi possível pesquisar. Tente novamente." }, { status: 500, headers });
  }
}
