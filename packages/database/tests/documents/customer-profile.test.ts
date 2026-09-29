import { beforeAll, expect, it } from "vitest";
import { useTestDatabase } from "../../src/harness/test-db";

const db = useTestDatabase();
let tenantId: string;
let ownerId: string;
let sequence = 0;
beforeAll(async () => {
  ({ tenantId, ownerId } = await db.createTenantWithOwner("Contratos"));
});
async function customer() {
  const [row] = await db
    .as(ownerId)
    .query<{ id: string }>(
      "insert into public.customers(tenant_id,name,whatsapp) values ($1,'Cliente original',$2) returning id",
      [tenantId, `6598000${String(++sequence).padStart(4, "0")}`],
    );
  return row!.id;
}
async function fill(id: string, values: Record<string, unknown>, userId = ownerId) {
  const [row] = await db
    .as(userId)
    .rpc<{ customer_fill_missing_from_contract: number }>("customer_fill_missing_from_contract", {
      p_customer_id: id,
      p_values: JSON.stringify(values),
    });
  return row!.customer_fill_missing_from_contract;
}

it("fills missing profile values while preserving the original name and contact", async () => {
  const id = await customer();
  expect(
    await fill(id, {
      name: "Nome do contrato",
      whatsapp: "11911112222",
      document: "12345678900",
      email: "teste@example.com",
      birthday: "1990-05-20",
      rg: "RG123",
      profession: "Professora",
      address: "Rua A, 10",
      city_state: "Cuiabá / MT",
      postal_code: "78000000",
    }),
  ).toBe(8);
  const [row] = await db
    .as(ownerId)
    .query("select name,document,email,rg,address,postal_code from public.customers where id=$1", [id]);
  expect(row).toMatchObject({
    name: "Cliente original",
    document: "12345678900",
    email: "teste@example.com",
    rg: "RG123",
    address: "Rua A, 10",
    postal_code: "78000000",
  });
  expect(await fill(id, { email: "other@example.com", rg: "Other", address: "Other" })).toBe(0);
});

it("serializes simultaneous fills without overwriting whichever saved first", async () => {
  const id = await customer();
  const counts = await Promise.all([fill(id, { rg: "Primeiro" }), fill(id, { rg: "Segundo" })]);
  expect(counts.sort()).toEqual([0, 1]);
});

it("ignores unknown, empty and commercial fields", async () => {
  expect(
    await fill(await customer(), { rg: " ", valor_final: "100", tenant_id: "wrong", notes: "Não deve gravar" }),
  ).toBe(0);
});

it("rolls back all fields when a new profile value violates a constraint", async () => {
  const id = await customer();
  await expect(fill(id, { rg: "RG123", postal_code: "12" })).rejects.toThrow();
  const [row] = await db.as(ownerId).query("select rg,postal_code from public.customers where id=$1", [id]);
  expect(row).toEqual({ rg: null, postal_code: null });
});

it("cannot change another tenant's profile", async () => {
  const other = await db.createTenantWithOwner("Outra clínica");
  await expect(fill(await customer(), { rg: "Invadido" }, other.ownerId)).rejects.toThrow("not_found");
});

it("does not grant anonymous access to the function", async () => {
  await expect(
    db.anon.rpc("customer_fill_missing_from_contract", { p_customer_id: await customer(), p_values: "{}" }),
  ).rejects.toThrow("permission denied");
});
