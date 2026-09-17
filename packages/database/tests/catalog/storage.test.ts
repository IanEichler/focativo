import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { expectDbError, useTestDatabase } from "../../src/harness/test-db";

describe("product image storage policies", () => {
  const db = useTestDatabase();
  let a: { tenantId: string; ownerId: string };
  let b: { tenantId: string; ownerId: string };
  let sellerA: string;

  beforeAll(async () => {
    a = await db.createTenantWithOwner("Loja A");
    b = await db.createTenantWithOwner("Loja B");
    sellerA = await db.addActiveMember(a.tenantId, "VENDEDOR");
  });

  const upload = (userId: string, path: string) =>
    db
      .as(userId)
      .query("insert into storage.objects (bucket_id, name, owner) values ('product-images', $1, $2) returning id", [
        path,
        userId,
      ]);

  it("allows catalog writers to upload into their own tenant folder", async () => {
    const rows = await upload(a.ownerId, `${a.tenantId}/products/${randomUUID()}/foto.webp`);
    expect(rows).toHaveLength(1);
  });

  it("blocks uploads into another tenant, outside products/ and by sellers", async () => {
    await expectDbError(upload(a.ownerId, `${b.tenantId}/products/${randomUUID()}/x.webp`), /row-level security/);
    await expectDbError(upload(a.ownerId, `${a.tenantId}/outros/${randomUUID()}.webp`), /row-level security/);
    await expectDbError(upload(sellerA, `${a.tenantId}/products/${randomUUID()}/x.webp`), /row-level security/);
  });

  it("image path on product must live under the product folder", async () => {
    const [row] = await db.as(a.ownerId).rpc<{ catalog_create_product: string }>("catalog_create_product", {
      p_tenant_id: a.tenantId,
      p_name: "Produto com foto",
      p_sale_price: 10,
    });
    const productId = row!.catalog_create_product;
    await db.as(a.ownerId).rpc("catalog_set_product_image", {
      p_product_id: productId,
      p_image_path: `${a.tenantId}/products/${productId}/abc.webp`,
    });
    await expectDbError(
      db.as(a.ownerId).rpc("catalog_set_product_image", {
        p_product_id: productId,
        p_image_path: `${b.tenantId}/products/${productId}/abc.webp`,
      }),
      "invalid_input",
    );
  });
});
