import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("catalog taxonomy", () => {
  const db = useTestDatabase();
  let a: { tenantId: string; ownerId: string };
  let b: { tenantId: string; ownerId: string };
  let sellerA: string;

  beforeAll(async () => {
    a = await db.createTenantWithOwner("Gorila Suplementos");
    b = await db.createTenantWithOwner("Loja B");
    sellerA = await db.addActiveMember(a.tenantId, "VENDEDOR");
  });

  async function insertCategory(userId: string, tenantId: string, name: string, parentId: string | null = null) {
    const rows = await db
      .as(userId)
      .query<{ id: string }>(
        "insert into public.categories (tenant_id, name, parent_id) values ($1, $2, $3) returning id",
        [tenantId, name, parentId],
      );
    return rows[0]!.id;
  }

  it("owners manage categories; sellers only read", async () => {
    const id = await insertCategory(a.ownerId, a.tenantId, "Proteínas");
    const visible = await db.as(sellerA).query("select id from public.categories where id = $1", [id]);
    expect(visible).toHaveLength(1);

    await expectDbError(insertCategory(sellerA, a.tenantId, "Hack"), /row-level security/);
    const updated = await db
      .as(sellerA)
      .query("update public.categories set name = 'x' where id = $1 returning id", [id]);
    expect(updated).toHaveLength(0);
  });

  it("isolates categories between tenants", async () => {
    const id = await insertCategory(b.ownerId, b.tenantId, "Categoria B");
    expect(await db.as(a.ownerId).query("select id from public.categories where id = $1", [id])).toHaveLength(0);
    await expectDbError(insertCategory(a.ownerId, b.tenantId, "Intrusa"), /row-level security/);
  });

  it("blocks cross-tenant parent references at the constraint level", async () => {
    const foreignParent = await insertCategory(b.ownerId, b.tenantId, "Pai B");
    await expectDbError(insertCategory(a.ownerId, a.tenantId, "Filha A", foreignParent), /foreign key/);
  });

  it("prevents cycles and more than three levels", async () => {
    const level1 = await insertCategory(a.ownerId, a.tenantId, "Nível 1");
    const level2 = await insertCategory(a.ownerId, a.tenantId, "Nível 2", level1);
    const level3 = await insertCategory(a.ownerId, a.tenantId, "Nível 3", level2);
    await expectDbError(insertCategory(a.ownerId, a.tenantId, "Nível 4", level3), "category_depth");
    await expectDbError(
      db.as(a.ownerId).query("update public.categories set parent_id = $1 where id = $2", [level2, level1]),
      "category_cycle",
    );
  });

  it("enforces unique names per tenant (case-insensitive) but not across tenants", async () => {
    await db.as(a.ownerId).query("insert into public.brands (tenant_id, name) values ($1, 'Max Titanium')", [a.tenantId]);
    await expectDbError(
      db.as(a.ownerId).query("insert into public.brands (tenant_id, name) values ($1, ' max titanium ')", [a.tenantId]),
      /brands_name_unique/,
    );
    await db.as(b.ownerId).query("insert into public.brands (tenant_id, name) values ($1, 'Max Titanium')", [b.tenantId]);
  });

  it("never lets tenant_id be moved through the API", async () => {
    const [brand] = await db
      .as(a.ownerId)
      .query<{ id: string }>("insert into public.brands (tenant_id, name) values ($1, 'Growth') returning id", [
        a.tenantId,
      ]);
    await expectDbError(
      db.as(a.ownerId).query("update public.brands set tenant_id = $1 where id = $2", [b.tenantId, brand!.id]),
      /permission denied/,
    );
  });

  it("validates supplier documents", async () => {
    await expectDbError(
      db
        .as(a.ownerId)
        .query("insert into public.suppliers (tenant_id, name, document) values ($1, 'Distribuidora', '123')", [
          a.tenantId,
        ]),
      /suppliers_document_check/,
    );
  });

  describe("attributes", () => {
    it("installs supplement templates for supplement tenants only", async () => {
      const supplements = await db.as(a.ownerId).rpc<{ create_tenant: string }>("create_tenant", {
        p_name: "Loja Suplementos 2",
        p_segment: "supplements",
      });
      const tenantId = supplements[0]!.create_tenant;
      const codes = await db
        .as(a.ownerId)
        .query<{ code: string }>("select code from public.product_attributes where tenant_id = $1 order by sort_order", [
          tenantId,
        ]);
      expect(codes.map((row) => row.code)).toEqual([
        "flavor",
        "net_weight",
        "presentation",
        "protein_type",
        "sugar_free_claim",
        "vegan",
      ]);
      const flavorOptions = await db.admin.query(
        `select o.code from public.product_attribute_options o
         join public.product_attributes a on a.id = o.attribute_id
         where a.tenant_id = $1 and a.code = 'flavor'`,
        [tenantId],
      );
      expect(flavorOptions.length).toBeGreaterThan(5);

      expect(
        await db.as(a.ownerId).query("select id from public.product_attributes where tenant_id = $1", [a.tenantId]),
      ).toHaveLength(0);
    });

    it("keeps code and data type immutable", async () => {
      const [attribute] = await db
        .as(a.ownerId)
        .query<{ id: string }>(
          "insert into public.product_attributes (tenant_id, code, name, data_type) values ($1, 'size', 'Tamanho', 'TEXT') returning id",
          [a.tenantId],
        );
      await expectDbError(
        db.as(a.ownerId).query("update public.product_attributes set data_type = 'NUMBER' where id = $1", [attribute!.id]),
        /permission denied/,
      );
      await expectDbError(
        db
          .as(a.ownerId)
          .query("insert into public.product_attribute_options (tenant_id, attribute_id, code, label) values ($1, $2, 'p', 'P')", [
            a.tenantId,
            attribute!.id,
          ]),
        "invalid_attribute_value",
      );
    });
  });

  it("exposes global allergen and nutrient catalogs read-only", async () => {
    const allergens = await db.as(sellerA).query<{ code: string }>("select code from public.allergens");
    expect(allergens.map((row) => row.code)).toEqual(expect.arrayContaining(["lactose", "gluten", "milk", "soy"]));
    await expectDbError(
      db.as(a.ownerId).query("insert into public.allergens (code, name) values ('x_test', 'X')"),
      /permission denied/,
    );
  });
});
