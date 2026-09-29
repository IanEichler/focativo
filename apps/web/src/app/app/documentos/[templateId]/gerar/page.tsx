import { redirect } from "next/navigation";
import { firstParam } from "@/lib/url";

export default async function GenerateContractRedirect({ params, searchParams }: PageProps<"/app/documentos/[templateId]/gerar">) {
  const { templateId } = await params;
  const customerId = firstParam((await searchParams).clienteId);
  if (!customerId || ![customerId, templateId].every(value => /^[0-9a-f-]{36}$/i.test(value))) redirect("/app/clientes");
  redirect(`/app/clientes/${customerId}/contratos/${templateId}/novo`);
}
