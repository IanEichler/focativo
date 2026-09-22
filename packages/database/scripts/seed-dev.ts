/**
 * Seed de DESENVOLVIMENTO: empresa fictícia "Gorila Suplementos" com um
 * usuário por papel (Fase 1) e um catálogo de suplementos com variações,
 * características, alérgenos, informação nutricional, lotes e estoque
 * (Fase 2). Usa os mesmos fluxos da aplicação (RPCs com a identidade de cada
 * usuário), então valida RLS/RBAC de ponta a ponta.
 *
 *   pnpm --filter @estoque-ia/database seed:dev -- --confirm
 *
 * NUNCA rodar em produção. Idempotente: pode ser executado mais de uma vez —
 * produtos e variações já existentes (por nome) não são duplicados; entradas
 * de estoque usam chave de idempotência determinística.
 *
 * Clientes e CRM (Fase 3), reservas/vendas/pagamentos (Fases 4–5) e uma
 * conta/conversa de WhatsApp (Fase 6, provider DEV) completam o cenário.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, findUserIdByEmail, loadWebEnv, requireEnv } from "./lib/supabase-env";

const TENANT_NAME = "Gorila Suplementos";

const USERS = [
  { email: "owner@gorila.dev", fullName: "Olívia Proprietária", role: "OWNER" },
  { email: "admin@gorila.dev", fullName: "André Administrador", role: "ADMIN" },
  { email: "gerente@gorila.dev", fullName: "Gabriela Gerente", role: "GERENTE" },
  { email: "vendedor@gorila.dev", fullName: "Vitor Vendedor", role: "VENDEDOR" },
] as const;

async function ensureUser(admin: SupabaseClient, email: string, fullName: string, password: string) {
  const existing = await findUserIdByEmail(admin, email);
  if (existing) return existing;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function signedIn(email: string, password: string) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

// -----------------------------------------------------------------------------
// Catálogo (Fase 2)
// -----------------------------------------------------------------------------

type AttributeValueInput = { attribute_id: string; value: boolean | number | string };

interface AttributeMaps {
  attributeIdByCode: Map<string, string>;
  optionIdByKey: Map<string, string>;
}

async function ensureNamedRow(
  owner: SupabaseClient,
  table: "categories" | "brands" | "suppliers",
  tenantId: string,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { data: existing } = await owner
    .from(table)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await owner
    .from(table)
    .insert({ tenant_id: tenantId, name, ...extra })
    .select("id")
    .single();
  if (error) throw new Error(`${table} ${name}: ${error.message}`);
  return data.id;
}

async function loadAttributeMaps(owner: SupabaseClient, tenantId: string): Promise<AttributeMaps> {
  const { data, error } = await owner
    .from("product_attributes")
    .select("id, code, options:product_attribute_options(id, code)")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`load attributes: ${error.message}`);

  const attributeIdByCode = new Map<string, string>();
  const optionIdByKey = new Map<string, string>();
  for (const attribute of data ?? []) {
    attributeIdByCode.set(attribute.code, attribute.id);
    for (const option of attribute.options ?? []) {
      optionIdByKey.set(`${attribute.code}:${option.code}`, option.id);
    }
  }
  return { attributeIdByCode, optionIdByKey };
}

function attrValue(maps: AttributeMaps, code: string, value: boolean | number): AttributeValueInput {
  const attribute_id = maps.attributeIdByCode.get(code);
  if (!attribute_id) throw new Error(`atributo desconhecido no template do segmento: ${code}`);
  return { attribute_id, value };
}

function attrOption(maps: AttributeMaps, code: string, optionCode: string): AttributeValueInput {
  const attribute_id = maps.attributeIdByCode.get(code);
  const optionId = maps.optionIdByKey.get(`${code}:${optionCode}`);
  if (!attribute_id || !optionId) throw new Error(`opção desconhecida: ${code}:${optionCode}`);
  return { attribute_id, value: optionId };
}

async function findProductId(owner: SupabaseClient, tenantId: string, name: string): Promise<string | null> {
  const { data } = await owner.from("products").select("id").eq("tenant_id", tenantId).eq("name", name).maybeSingle();
  return data?.id ?? null;
}

async function getDefaultVariantId(owner: SupabaseClient, productId: string): Promise<string> {
  const { data, error } = await owner
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("is_default", true)
    .single();
  if (error || !data) throw new Error(`variante padrão não encontrada: ${error?.message}`);
  return data.id;
}

interface ProductSeed {
  name: string;
  categoryName: string;
  brandId: string;
  supplierId: string;
  salePrice: number;
  costPrice: number;
  minStock: number;
  trackLots: boolean;
  sku?: string;
  barcode?: string;
  description?: string;
}

/** Cria o produto (com variante padrão) só se ainda não existir; devolve o id. */
async function ensureProduct(
  owner: SupabaseClient,
  tenantId: string,
  categories: Map<string, string>,
  seed: ProductSeed,
) {
  const existing = await findProductId(owner, tenantId, seed.name);
  if (existing) return existing;

  const { data, error } = await owner.rpc("catalog_create_product", {
    p_tenant_id: tenantId,
    p_name: seed.name,
    p_sale_price: seed.salePrice,
    p_description: seed.description,
    p_category_id: categories.get(seed.categoryName),
    p_brand_id: seed.brandId,
    p_supplier_id: seed.supplierId,
    p_track_lots: seed.trackLots,
    p_min_stock: seed.minStock,
    p_sku: seed.sku,
    p_barcode: seed.barcode,
    p_cost_price: seed.costPrice,
  });
  if (error || !data) throw new Error(`produto ${seed.name}: ${error?.message}`);
  console.log(`  produto criado: ${seed.name}`);
  return data;
}

interface VariantSeed {
  name: string;
  sku: string;
  barcode: string;
  costPrice: number;
}

/** Cria a variante (por nome) só se ainda não existir; devolve o id. */
async function ensureVariant(owner: SupabaseClient, productId: string, seed: VariantSeed): Promise<string> {
  const { data: existing } = await owner
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("name", seed.name)
    .is("archived_at", null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await owner.rpc("catalog_upsert_variant", {
    p_product_id: productId,
    p_name: seed.name,
    p_sku: seed.sku,
    p_barcode: seed.barcode,
    p_cost_price: seed.costPrice,
    p_update_cost: true,
  });
  if (error || !data) throw new Error(`variação ${seed.name}: ${error?.message}`);
  console.log(`    variação criada: ${seed.name}`);
  return data;
}

/** Registra uma entrada de estoque com chave determinística (idempotente entre execuções). */
async function seedStockEntry(
  owner: SupabaseClient,
  variantId: string,
  key: string,
  quantity: number,
  lot?: { code: string; expiresInDays: number },
) {
  const { error } = await owner.rpc("inventory_register_entry", {
    p_variant_id: variantId,
    p_quantity: quantity,
    p_idempotency_key: `seed:${key}`,
    p_lot_code: lot?.code,
    p_expires_on: lot ? isoDateInDays(lot.expiresInDays) : undefined,
  });
  if (error) throw new Error(`estoque ${key}: ${error.message}`);
}

function isoDateInDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Move a validade de um lote para o passado, simulando vencimento.
 * inventory_register_entry recusa dar entrada em lote já vencido (regra de
 * negócio correta); um lote válido vence naturalmente com a passagem do
 * tempo, então o seed simula isso com uma atualização direta (service role).
 */
async function backdateLot(admin: SupabaseClient, variantId: string, lotCode: string, daysAgo: number) {
  const { error } = await admin
    .from("stock_lots")
    .update({ expires_on: isoDateInDays(-daysAgo) })
    .eq("variant_id", variantId)
    .eq("lot_code", lotCode);
  if (error) throw new Error(`backdate ${lotCode}: ${error.message}`);
}

async function seedCatalog(owner: SupabaseClient, admin: SupabaseClient, tenantId: string) {
  console.log("Semeando catálogo...");

  const categoryNames = ["Whey Protein", "Creatina", "Pré-treino", "Barras de Proteína", "Vitaminas e Minerais"];
  const categories = new Map<string, string>();
  for (const name of categoryNames) categories.set(name, await ensureNamedRow(owner, "categories", tenantId, name));

  const brandId = await ensureNamedRow(owner, "brands", tenantId, "Max Titanium");
  const supplierId = await ensureNamedRow(owner, "suppliers", tenantId, "Distribuidora FitSupply", {
    contact_name: "Carla Mendes",
    phone: "11988887777",
  });

  const maps = await loadAttributeMaps(owner, tenantId);

  // --- 1. Whey Isolado 900g (2 variações, lotes) --------------------------
  const whey = await ensureProduct(owner, tenantId, categories, {
    name: "Whey Isolado 900g",
    categoryName: "Whey Protein",
    brandId,
    supplierId,
    salePrice: 189.9,
    costPrice: 95,
    minStock: 5,
    trackLots: true,
    description: "Whey protein isolado, baixo teor de carboidratos e gorduras.",
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: whey,
    p_values: [
      attrValue(maps, "net_weight", 900),
      attrOption(maps, "presentation", "po"),
      attrOption(maps, "protein_type", "whey_isolado"),
      attrValue(maps, "sugar_free_claim", true),
    ],
  });
  // Glúten, soja e outros alérgenos não informados permanecem UNKNOWN (nunca "sem X" por omissão).
  await owner.rpc("catalog_set_allergens", {
    p_product_id: whey,
    p_allergens: [
      { code: "milk", presence: "TRUE", source: "LABEL" },
      { code: "lactose", presence: "FALSE", source: "LABEL" },
    ],
  });
  await owner.rpc("catalog_set_nutrition", {
    p_product_id: whey,
    p_nutrition: {
      serving_size: 32,
      serving_unit: "g",
      serving_description: "1 scoop (32 g)",
      servings_per_container: 28,
      source: "LABEL",
      values: { energy: 120, protein: 25, carbohydrates: 2, total_sugars: 1, total_fat: 1, sodium: 95 },
    },
  });

  const wheyChocolate = await ensureVariant(owner, whey, {
    name: "Chocolate",
    sku: "WHEY-ISO-900-CHO",
    barcode: "7891000000011",
    costPrice: 95,
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: whey,
    p_variant_id: wheyChocolate,
    p_values: [attrOption(maps, "flavor", "chocolate")],
  });
  await seedStockEntry(owner, wheyChocolate, "whey-cho-lot1", 15, { code: "WHEY-CHO-01", expiresInDays: 300 });
  await seedStockEntry(owner, wheyChocolate, "whey-cho-lot2", 8, { code: "WHEY-CHO-02", expiresInDays: 20 }); // vencendo em breve

  const wheyBaunilha = await ensureVariant(owner, whey, {
    name: "Baunilha",
    sku: "WHEY-ISO-900-BAU",
    barcode: "7891000000012",
    costPrice: 95,
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: whey,
    p_variant_id: wheyBaunilha,
    p_values: [attrOption(maps, "flavor", "baunilha")],
  });
  await seedStockEntry(owner, wheyBaunilha, "whey-bau-lot1", 10, { code: "WHEY-BAU-01", expiresInDays: 250 });

  // --- 2. Creatina Monohidratada 300g (produto simples) -------------------
  const creatina = await ensureProduct(owner, tenantId, categories, {
    name: "Creatina Monohidratada 300g",
    categoryName: "Creatina",
    brandId,
    supplierId,
    salePrice: 89.9,
    costPrice: 45,
    minStock: 10,
    trackLots: false,
    sku: "CRE-MONO-300",
    barcode: "7891000000021",
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: creatina,
    p_values: [
      attrValue(maps, "net_weight", 300),
      attrOption(maps, "presentation", "po"),
      attrValue(maps, "vegan", true),
    ],
  });
  // Nenhum alérgeno informado: todos permanecem "não informado" (demonstra o estado UNKNOWN).
  await owner.rpc("catalog_set_nutrition", {
    p_product_id: creatina,
    p_nutrition: {
      serving_size: 3,
      serving_unit: "g",
      serving_description: "1 dose (3 g)",
      servings_per_container: 100,
      source: "MANUFACTURER",
      values: { creatine: 3 },
    },
  });
  const creatinaVariant = await getDefaultVariantId(owner, creatina);
  await seedStockEntry(owner, creatinaVariant, "creatina-entry1", 8); // abaixo do mínimo (10) → estoque baixo

  // --- 3. Pré-treino Explosion 300g (3 variações, uma sem estoque) --------
  const preTreino = await ensureProduct(owner, tenantId, categories, {
    name: "Pré-treino Explosion 300g",
    categoryName: "Pré-treino",
    brandId,
    supplierId,
    salePrice: 99.9,
    costPrice: 55,
    minStock: 5,
    trackLots: true,
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: preTreino,
    p_values: [attrValue(maps, "net_weight", 300), attrOption(maps, "presentation", "po")],
  });
  await owner.rpc("catalog_set_nutrition", {
    p_product_id: preTreino,
    p_nutrition: {
      serving_size: 10,
      serving_unit: "g",
      serving_description: "1 scoop (10 g)",
      source: "LABEL",
      values: { caffeine: 200, beta_alanine: 1.6 },
    },
  });

  const preFrutasVermelhas = await ensureVariant(owner, preTreino, {
    name: "Frutas Vermelhas",
    sku: "PRE-EXP-FRV",
    barcode: "7891000000031",
    costPrice: 55,
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: preTreino,
    p_variant_id: preFrutasVermelhas,
    p_values: [attrOption(maps, "flavor", "frutas_vermelhas")],
  });
  await seedStockEntry(owner, preFrutasVermelhas, "pre-frv-lot1", 12, { code: "PRE-FRV-01", expiresInDays: 180 });

  const preLimao = await ensureVariant(owner, preTreino, {
    name: "Limão",
    sku: "PRE-EXP-LIM",
    barcode: "7891000000032",
    costPrice: 55,
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: preTreino,
    p_variant_id: preLimao,
    p_values: [attrOption(maps, "flavor", "limao")],
  });
  await seedStockEntry(owner, preLimao, "pre-lim-lot1", 6, { code: "PRE-LIM-01", expiresInDays: 15 }); // vencendo em breve

  const preBanana = await ensureVariant(owner, preTreino, {
    name: "Banana",
    sku: "PRE-EXP-BAN",
    barcode: "7891000000033",
    costPrice: 55,
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: preTreino,
    p_variant_id: preBanana,
    p_values: [attrOption(maps, "flavor", "banana")],
  });
  // Sem entrada de estoque: variação recém-cadastrada, ainda sem estoque (estado "sem estoque").

  // --- 4. Barra de Proteína Chocolate 60g (com lote vencido) --------------
  const barra = await ensureProduct(owner, tenantId, categories, {
    name: "Barra de Proteína Chocolate 60g",
    categoryName: "Barras de Proteína",
    brandId,
    supplierId,
    salePrice: 12.9,
    costPrice: 6.5,
    minStock: 20,
    trackLots: true,
    sku: "BAR-PROT-CHO-60",
    barcode: "7891000000041",
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: barra,
    p_values: [attrValue(maps, "net_weight", 60)],
  });
  await owner.rpc("catalog_set_allergens", {
    p_product_id: barra,
    p_allergens: [
      { code: "milk", presence: "TRUE", source: "LABEL" },
      { code: "soy", presence: "TRUE", source: "LABEL" },
      { code: "peanut", presence: "FALSE", may_contain_traces: true, source: "LABEL" },
    ],
  });
  await owner.rpc("catalog_set_nutrition", {
    p_product_id: barra,
    p_nutrition: {
      serving_size: 60,
      serving_unit: "g",
      serving_description: "1 barra (60 g)",
      source: "LABEL",
      values: {
        energy: 220,
        protein: 20,
        carbohydrates: 22,
        total_sugars: 5,
        total_fat: 8,
        saturated_fat: 4,
        fiber: 3,
        sodium: 140,
      },
    },
  });
  const barraVariant = await getDefaultVariantId(owner, barra);
  await seedStockEntry(owner, barraVariant, "barra-lot1", 30, { code: "BAR-CHO-01", expiresInDays: 90 });
  await seedStockEntry(owner, barraVariant, "barra-lot2", 5, { code: "BAR-CHO-02", expiresInDays: 25 }); // vencendo em breve
  await seedStockEntry(owner, barraVariant, "barra-lot3", 4, { code: "BAR-CHO-03", expiresInDays: 5 });
  await backdateLot(admin, barraVariant, "BAR-CHO-03", 3); // simula lote vencido (estado "vencido")

  // --- 5. Multivitamínico Diário 60 cápsulas (micronutrientes) ------------
  const vitamina = await ensureProduct(owner, tenantId, categories, {
    name: "Multivitamínico Diário 60 cápsulas",
    categoryName: "Vitaminas e Minerais",
    brandId,
    supplierId,
    salePrice: 49.9,
    costPrice: 22,
    minStock: 8,
    trackLots: true,
    sku: "VIT-MULTI-60",
    barcode: "7891000000051",
  });
  await owner.rpc("catalog_set_attribute_values", {
    p_product_id: vitamina,
    p_values: [attrOption(maps, "presentation", "capsulas"), attrValue(maps, "vegan", false)],
  });
  await owner.rpc("catalog_set_nutrition", {
    p_product_id: vitamina,
    p_nutrition: {
      serving_size: 1,
      serving_unit: "un",
      serving_description: "1 cápsula",
      servings_per_container: 60,
      source: "LABEL",
      values: { vitamin_c: 500, vitamin_d: 25, vitamin_b12: 10, zinc: 15, magnesium: 50 },
    },
  });
  const vitaminaVariant = await getDefaultVariantId(owner, vitamina);
  await seedStockEntry(owner, vitaminaVariant, "vitamina-lot1", 25, { code: "VIT-MULTI-01", expiresInDays: 400 });

  console.log("Catálogo semeado: 5 produtos (Whey, Creatina, Pré-treino, Barra, Multivitamínico).");
  return {
    whey,
    wheyChocolate,
    wheyBaunilha,
    creatina,
    creatinaVariant,
    preTreino,
    preFrutasVermelhas,
  };
}

// -----------------------------------------------------------------------------
// Clientes e CRM (Fase 3)
// -----------------------------------------------------------------------------

interface CustomerSeed {
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  origin?: string;
  tags?: string[];
  responsibleUserId: string;
}

async function ensureCustomer(owner: SupabaseClient, tenantId: string, seed: CustomerSeed): Promise<string> {
  const { data: existing } = await owner
    .from("customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", seed.name)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await owner
    .from("customers")
    .insert({
      tenant_id: tenantId,
      name: seed.name,
      phone: seed.phone,
      whatsapp: seed.whatsapp,
      email: seed.email,
      origin: seed.origin,
      tags: seed.tags ?? [],
      responsible_user_id: seed.responsibleUserId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`cliente ${seed.name}: ${error.message}`);
  console.log(`  cliente criado: ${seed.name}`);
  return data.id;
}

async function ensureOpportunity(
  owner: SupabaseClient,
  tenantId: string,
  customerId: string,
  title: string,
  input: { estimatedValue?: number; origin?: string; responsibleUserId?: string; variantIds?: string[] },
): Promise<string | null> {
  const { data: existing } = await owner
    .from("crm_opportunities")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("title", title)
    .maybeSingle();
  if (existing) return null; // já existe: não recria nem move de novo (evita reabrir negócios fechados no reseed)

  const { data, error } = await owner.rpc("crm_create_opportunity", {
    p_tenant_id: tenantId,
    p_customer_id: customerId,
    p_title: title,
    p_estimated_value: input.estimatedValue,
    p_origin: input.origin,
    p_responsible_user_id: input.responsibleUserId,
    p_variant_ids: input.variantIds,
  });
  if (error || !data) throw new Error(`oportunidade ${title}: ${error?.message}`);
  console.log(`  oportunidade criada: ${title}`);
  return data as string;
}

async function seedCrm(
  owner: SupabaseClient,
  tenantId: string,
  vendedorId: string,
  variants: { wheyBaunilha: string; creatinaVariant: string; preFrutasVermelhas: string },
) {
  console.log("Semeando clientes e CRM...");

  const marina = await ensureCustomer(owner, tenantId, {
    name: "Marina Costa",
    whatsapp: "11987651234",
    origin: "whatsapp",
    tags: ["vip", "intolerante a lactose"],
    responsibleUserId: vendedorId,
  });
  const marinaOpportunity = await ensureOpportunity(owner, tenantId, marina, "Whey sem lactose", {
    estimatedValue: 189.9,
    origin: "whatsapp",
    responsibleUserId: vendedorId,
    variantIds: [variants.wheyBaunilha],
  });
  if (marinaOpportunity) {
    const { data: interessadoStage } = await owner
      .from("crm_stages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", "interessado")
      .single();
    await owner.rpc("crm_move_opportunity", { p_opportunity_id: marinaOpportunity, p_stage_id: interessadoStage!.id });
  }

  const rafael = await ensureCustomer(owner, tenantId, {
    name: "Rafael Nogueira",
    phone: "11976543210",
    email: "rafael.nogueira@example.com",
    origin: "instagram",
    tags: ["atacado"],
    responsibleUserId: vendedorId,
  });
  await ensureOpportunity(owner, tenantId, rafael, "Creatina + Pré-treino", {
    estimatedValue: 189.8,
    origin: "instagram",
    responsibleUserId: vendedorId,
    variantIds: [variants.creatinaVariant, variants.preFrutasVermelhas],
  });

  const juliana = await ensureCustomer(owner, tenantId, {
    name: "Juliana Alves",
    whatsapp: "11965432109",
    origin: "indicacao",
    responsibleUserId: vendedorId,
  });
  const julianaOpportunity = await ensureOpportunity(owner, tenantId, juliana, "Kit whey + multivitamínico", {
    estimatedValue: 239.8,
    origin: "indicacao",
    responsibleUserId: vendedorId,
  });
  if (julianaOpportunity) {
    const { data: wonStage } = await owner
      .from("crm_stages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", "vendido")
      .single();
    await owner.rpc("crm_move_opportunity", { p_opportunity_id: julianaOpportunity, p_stage_id: wonStage!.id });
  }

  const pedro = await ensureCustomer(owner, tenantId, {
    name: "Pedro Lima",
    phone: "11954321098",
    origin: "loja",
    responsibleUserId: vendedorId,
  });
  const pedroOpportunity = await ensureOpportunity(owner, tenantId, pedro, "Barra de proteína (caixa fechada)", {
    estimatedValue: 129.0,
    origin: "loja",
    responsibleUserId: vendedorId,
  });
  if (pedroOpportunity) {
    const { data: lostStage } = await owner
      .from("crm_stages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", "perdido")
      .single();
    await owner.rpc("crm_move_opportunity", {
      p_opportunity_id: pedroOpportunity,
      p_stage_id: lostStage!.id,
      p_lost_reason: "Comprou em outra loja",
    });
  }

  console.log("Clientes e CRM semeados: 4 clientes, 4 oportunidades (novo, interessado, vendido, perdido).");
  return { marina, rafael, juliana, pedro };
}

// -----------------------------------------------------------------------------
// Reservas e vendas (Fase 4)
// -----------------------------------------------------------------------------

/** Devolve o id da reserva PENDING existente ou recém-criada (para poder gerar uma cobrança em cima dela). */
async function ensurePendingReservation(
  owner: SupabaseClient,
  tenantId: string,
  customerId: string,
  customerLabel: string,
  variantId: string,
  quantity: number,
): Promise<string> {
  const { data: existing } = await owner
    .from("reservations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("status", "PENDING")
    .maybeSingle();
  if (existing) return existing.id;

  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 3);
  const { data, error } = await owner.rpc("reservation_create", {
    p_tenant_id: tenantId,
    p_customer_id: customerId,
    p_items: [{ variant_id: variantId, quantity }],
    p_expires_at: expiresAt.toISOString(),
    p_origin: "whatsapp",
    p_notes: "Retirar na loja até o fim de semana.",
  });
  if (error || !data) throw new Error(`reserva ${customerLabel}: ${error?.message}`);
  console.log(`  reserva criada: ${customerLabel} (pendente)`);
  return data;
}

/** Cobrança PIX pendente (Fase 5) para dar dado real ao painel financeiro assim que o seed roda. */
async function ensurePendingCharge(
  owner: SupabaseClient,
  tenantId: string,
  reservationId: string,
  customerLabel: string,
) {
  const { data: existing } = await owner
    .from("payments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("status", "PENDING")
    .maybeSingle();
  if (existing) return;

  const { error } = await owner.rpc("payment_create_charge", {
    p_tenant_id: tenantId,
    p_reservation_id: reservationId,
    p_method: "pix",
  });
  if (error) throw new Error(`cobrança ${customerLabel}: ${error.message}`);
  console.log(`  cobrança PIX pendente criada: ${customerLabel}`);
}

async function seedSalesAndReservations(
  owner: SupabaseClient,
  tenantId: string,
  customers: { marina: string; rafael: string; juliana: string; pedro: string },
  variants: { wheyChocolate: string; wheyBaunilha: string; creatinaVariant: string; preFrutasVermelhas: string },
) {
  console.log("Semeando reservas e vendas...");

  // A reserva original da Marina pode já ter virado venda (conversão testada
  // manualmente); se não houver nenhuma reserva PENDING para ela, cria outra
  // — e também uma para o Rafael, cliente recorrente (já tem venda + reserva).
  const marinaReservationId = await ensurePendingReservation(
    owner,
    tenantId,
    customers.marina,
    "Marina Costa",
    variants.wheyBaunilha,
    2,
  );
  await ensurePendingReservation(owner, tenantId, customers.rafael, "Rafael Nogueira", variants.wheyChocolate, 1);

  // Cobrança PIX pendente sobre a reserva da Marina, exercitando o financeiro (Fase 5).
  await ensurePendingCharge(owner, tenantId, marinaReservationId, "Marina Costa");

  const { error: pedroSaleError } = await owner.rpc("sale_create", {
    p_tenant_id: tenantId,
    p_customer_id: customers.pedro,
    p_items: [{ variant_id: variants.creatinaVariant, quantity: 1 }],
    p_payment_method: "pix",
    p_idempotency_key: "seed:sale:pedro-creatina",
  });
  if (pedroSaleError) throw new Error(`venda Pedro: ${pedroSaleError.message}`);

  const { error: rafaelSaleError } = await owner.rpc("sale_create", {
    p_tenant_id: tenantId,
    p_customer_id: customers.rafael,
    p_items: [{ variant_id: variants.preFrutasVermelhas, quantity: 2 }],
    p_discount_amount: 15,
    p_payment_method: "credit_card",
    p_idempotency_key: "seed:sale:rafael-pretreino",
  });
  if (rafaelSaleError) throw new Error(`venda Rafael: ${rafaelSaleError.message}`);

  console.log("Reservas e vendas semeadas: reservas pendentes + 2 vendas concluídas (uma com desconto).");
}

// -----------------------------------------------------------------------------
// IA: liga o assistente para o tenant de demonstração (Fase 7)
// -----------------------------------------------------------------------------

/** Roda antes do seed de WhatsApp para que a conversa semeada já nasça AI_ACTIVE. */
async function seedAiSettings(owner: SupabaseClient, tenantId: string) {
  const { data: existing } = await owner.rpc("ai_settings_get", { p_tenant_id: tenantId });
  if (existing?.[0]?.enabled) return;

  const { error } = await owner.rpc("ai_settings_update", {
    p_tenant_id: tenantId,
    p_enabled: true,
    p_system_prompt:
      "Você é a assistente da Gorila Suplementos, uma loja de suplementos. Seja simpática, breve e direta nas respostas.",
    p_model: "claude-sonnet-5",
    p_max_tokens_per_reply: 1024,
  });
  if (error) throw new Error(`ai_settings_update: ${error.message}`);
  console.log("IA semeada: assistente ligada com prompt de demonstração (provider real só com ANTHROPIC_API_KEY).");
}

// -----------------------------------------------------------------------------
// WhatsApp: conta conectada (dev) + conversa com histórico (Fase 6)
// -----------------------------------------------------------------------------

async function seedWhatsapp(admin: SupabaseClient, owner: SupabaseClient, tenantId: string, marinaWhatsapp: string) {
  console.log("Semeando WhatsApp...");

  const { error: accountError } = await admin.from("whatsapp_accounts").upsert(
    {
      tenant_id: tenantId,
      status: "CONNECTED",
      phone_number: "5511999990000",
      qr_code: null,
      error_message: null,
      connected_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (accountError) throw new Error(`whatsapp_accounts: ${accountError.message}`);

  const { data: existingMessage } = await owner
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("external_message_id", "seed:whatsapp:marina-in-1")
    .maybeSingle();
  if (existingMessage) return console.log("  conversa de exemplo já existia.");

  await owner.rpc("whatsapp_receive_message", {
    p_tenant_id: tenantId,
    p_whatsapp_number: marinaWhatsapp,
    p_content: "Oi! O whey de baunilha ainda está disponível?",
    p_external_message_id: "seed:whatsapp:marina-in-1",
    p_sender_name: "Marina Costa",
  });

  const { data: marinaCustomer } = await owner
    .from("customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("whatsapp", marinaWhatsapp)
    .single();
  const { data: conversation } = await owner
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", marinaCustomer!.id)
    .single();

  const { data: replyId, error: replyError } = await owner.rpc("message_send", {
    p_conversation_id: conversation!.id,
    p_content: "Oi, Marina! Sim, temos em estoque. Consigo separar 2 unidades para você retirar hoje.",
  });
  if (replyError) throw new Error(`whatsapp reply: ${replyError.message}`);
  await owner.rpc("message_mark_sent", { p_message_id: replyId, p_external_message_id: "seed:whatsapp:marina-out-1" });

  console.log("WhatsApp semeado: conta conectada (dev) + 1 conversa com Marina Costa.");
}

// -----------------------------------------------------------------------------

async function main() {
  loadWebEnv();
  if (!process.argv.includes("--confirm")) {
    console.error("Seed de desenvolvimento. Confirme com --confirm (nunca em produção).");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    console.error("Recusado: ambiente de produção.");
    process.exit(1);
  }

  const password = requireEnv("SEED_DEV_PASSWORD");
  const admin = adminClient();

  for (const user of USERS) {
    await ensureUser(admin, user.email, user.fullName, password);
  }

  const owner = await signedIn(USERS[0].email, password);
  const { data: memberships } = await owner.from("tenant_users").select("tenant_id, tenant:tenants!inner(name)");
  let tenantId = (memberships ?? []).find((row) => (row.tenant as unknown as { name: string }).name === TENANT_NAME)
    ?.tenant_id as string | undefined;

  if (!tenantId) {
    const { data, error } = await owner.rpc("create_tenant", { p_name: TENANT_NAME, p_segment: "supplements" });
    if (error) throw new Error(`create_tenant: ${error.message}`);
    tenantId = data as string;
    await owner
      .from("tenants")
      .update({ legal_name: "Gorila Suplementos LTDA (fictícia)", phone: "11999990000" })
      .eq("id", tenantId);
    console.log(`Empresa criada: ${TENANT_NAME}`);
  }

  for (const user of USERS.slice(1)) {
    const { error } = await owner.rpc("invite_tenant_user", {
      p_tenant_id: tenantId,
      p_email: user.email,
      p_role_code: user.role,
    });
    if (error && error.message !== "already_member") throw new Error(`invite ${user.email}: ${error.message}`);
    const member = await signedIn(user.email, password);
    const { error: acceptError } = await member.rpc("accept_tenant_invitation", { p_tenant_id: tenantId });
    if (acceptError && acceptError.message !== "not_found") {
      throw new Error(`accept ${user.email}: ${acceptError.message}`);
    }
  }

  const variants = await seedCatalog(owner, admin, tenantId);

  const vendedorId = await findUserIdByEmail(admin, "vendedor@gorila.dev");
  if (!vendedorId) throw new Error("vendedor não encontrado após convite");
  const customers = await seedCrm(owner, tenantId, vendedorId, variants);
  await seedSalesAndReservations(owner, tenantId, customers, variants);
  await seedAiSettings(owner, tenantId);
  await seedWhatsapp(admin, owner, tenantId, "11987651234");

  console.log("Seed concluído. Contas (senha em SEED_DEV_PASSWORD):");
  for (const user of USERS) console.log(`  ${user.role.padEnd(9)} ${user.email}`);
}

// Encerra explicitamente: com o cliente HTTP do supabase-js, conexões
// keep-alive do undici às vezes seguem "abertas" o bastante para o Node
// travar no encerramento natural do event loop no Windows (falha nativa do
// libuv em src/win/async.c) mesmo com o trabalho já concluído com sucesso.
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
