import { redirect } from "next/navigation";
import { firstParam } from "@/lib/url";

export default async function DocumentsRedirect({ searchParams }: PageProps<"/app/documentos">) {
  const customerId = firstParam((await searchParams).clienteId);
  redirect(customerId && /^[0-9a-f-]{36}$/i.test(customerId)
    ? `/app/clientes/${customerId}?aba=contratos` : "/app/clientes");
}
