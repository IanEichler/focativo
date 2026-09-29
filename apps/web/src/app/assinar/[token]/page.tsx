import type { Metadata } from "next";
import { PublicSignatureForm } from "@/domains/signatures/components/public-signature-form";

export const metadata: Metadata = { title: "Assinar contrato", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function SignaturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-4 py-8 sm:px-6">
    <header><h1 className="text-2xl font-semibold">Assinatura de contrato</h1><p className="mt-1 text-muted-foreground">Confira o documento e registre sua assinatura.</p></header>
    <PublicSignatureForm token={token} />
  </main>;
}
