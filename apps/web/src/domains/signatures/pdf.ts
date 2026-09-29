import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { maskCpfCnpj } from "@/lib/masks";

export interface SignatureEvidence {
  version: 1 | 2;
  requestId: string;
  documentName: string;
  originalSha256: string;
  signerName: string;
  signerDocument: string;
  signerEmail: string;
  accepted: true;
  consentVersion: string;
  consentText: string;
  signedAt: string;
  verifiedAt?: string;
  viewedAt: string;
  authentication: "email_otp" | "unique_link";
  ip: string | null;
  userAgent: string;
  signatureImageSha256: string | null;
}

export async function appendSignatureReceipt(original: Uint8Array, evidence: SignatureEvidence, seal: string, signature?: Uint8Array) {
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 788;
  const clean = (text: string) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, " ");
  function paragraph(text: string, title = false) {
    const chosenFont = title ? bold : font;
    const size = title ? 12 : 10;
    const words = clean(text).split(/\s+/).flatMap(word => word.length > 65 ? word.match(/.{1,60}/g)! : [word]);
    let line = "";
    const draw = () => {
      if (y < 60) { page = pdf.addPage([595.28, 841.89]); y = 788; }
      page.drawText(line, { x: 45, y, size, font: chosenFont, color: rgb(0.15,0.15,0.15) }); y -= 15;
    };
    for (const word of words) {
      if (line && chosenFont.widthOfTextAtSize(`${line} ${word}`, size) > 505) { draw(); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) draw();
    y -= 7;
  }
  paragraph("Comprovante de assinatura eletrônica", true);
  paragraph(`Contrato: ${evidence.documentName}`);
  paragraph(`Identificador: ${evidence.requestId}`);
  paragraph(`Nome declarado: ${evidence.signerName}`);
  paragraph(`CPF/CNPJ informado: ${maskCpfCnpj(evidence.signerDocument) || "Não informado"}`);
  if (evidence.authentication === "email_otp") {
    paragraph(`Contato confirmado por código: ${evidence.signerEmail}`);
    paragraph(`Confirmação do contato (UTC): ${evidence.verifiedAt}`);
  } else {
    paragraph("Método: acesso por link exclusivo e aceite expresso, sem confirmação por e-mail.");
    if (evidence.signerEmail) paragraph(`E-mail informado no contrato (não verificado): ${evidence.signerEmail}`);
  }
  paragraph(`Documento disponibilizado (UTC): ${evidence.viewedAt}`);
  paragraph(`Aceite registrado (UTC): ${evidence.signedAt}`);
  paragraph(`IP do acesso: ${evidence.ip ?? "Não disponível (proxy não configurado)"}`);
  paragraph(`Navegador informado: ${evidence.userAgent.slice(0, 200) || "Não informado"}`);
  paragraph("Manifestação de vontade", true);
  paragraph(evidence.consentText);
  paragraph(`Versão do aceite: ${evidence.consentVersion}`);
  if (signature) {
    const png = await pdf.embedPng(signature);
    if (png.width > 2048 || png.height > 2048) throw new Error("signature_image_too_large");
    if (y < 165) { page = pdf.addPage([595.28, 841.89]); y = 788; }
    const scale = Math.min(280 / png.width, 75 / png.height);
    page.drawImage(png, { x: 45, y: y - png.height * scale, width: png.width * scale, height: png.height * scale });
    y -= png.height * scale + 15;
    paragraph("Grafia fornecida pela signatária (complementar ao aceite registrado).");
  }
  paragraph("Integridade e registro", true);
  paragraph(`SHA-256 do PDF original: ${evidence.originalSha256}`);
  paragraph(`Selo HMAC-SHA-256 das evidências: ${seal}`);
  paragraph(evidence.authentication === "email_otp"
    ? "Este comprovante foi emitido pelo sistema da contratante. A confirmação por e-mail registra o acesso ao contato informado; não é uma certificação de identidade civil nem uma assinatura qualificada ICP-Brasil."
    : "Este comprovante registra o acesso por link e o aceite declarado. Não houve confirmação de identidade por e-mail ou código. Não é uma certificação de identidade civil nem uma assinatura qualificada ICP-Brasil.");
  pdf.setTitle(evidence.documentName);
  return Buffer.from(await pdf.save());
}
