import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import { maskCpfCnpj } from "@/lib/masks";
import { locationStatusLabels, type SignatureLocation } from "./location";

export interface SignatureEvidence {
  version: 1 | 2 | 3;
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
  location?: SignatureLocation;
  userAgent: string;
  signatureImageSha256: string | null;
}

const FOOTER_HEIGHT = 92;
const clean = (text: string) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, " ");

/** The unsigned source stays archived unchanged; only its signed presentation gains a footer. */
async function contractWithFooterSpace(original: Uint8Array) {
  const source = await PDFDocument.load(original);
  const pdf = await PDFDocument.create();
  for (const sourcePage of source.getPages()) {
    const crop = sourcePage.getCropBox();
    const rotation = ((sourcePage.getRotation().angle % 360) + 360) % 360;
    const sideways = rotation === 90 || rotation === 270;
    const width = sideways ? crop.height : crop.width;
    const height = sideways ? crop.width : crop.height;
    const embedded = await pdf.embedPage(sourcePage, {
      left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height,
    });
    const page = pdf.addPage([width, height]);
    const scale = (height - FOOTER_HEIGHT - 8) / height;
    if (scale <= 0) throw new Error("contract_page_too_small");
    const left = (width - width * scale) / 2;
    page.drawPage(embedded, {
      x: left + (rotation === 180 || rotation === 270 ? width * scale : 0),
      y: FOOTER_HEIGHT + 8 + (rotation === 90 || rotation === 180 ? height * scale : 0),
      width: crop.width * scale, height: crop.height * scale, rotate: degrees(-rotation),
    });
  }
  return pdf;
}

function signatureFooters(pdf: PDFDocument, evidence: SignatureEvidence, seal: string, font: PDFFont, bold: PDFFont, receiptPage: number) {
  const pages = pdf.getPages();
  const signedAt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC", dateStyle: "short", timeStyle: "medium",
  }).format(new Date(evidence.signedAt));
  for (const [index, page] of pages.entries()) {
    const width = page.getWidth();
    const margin = Math.min(36, width * 0.06);
    const available = width - margin * 2;
    const color = rgb(0.25, 0.29, 0.34);
    page.drawLine({ start: { x: margin, y: 87 }, end: { x: width - margin, y: 87 }, thickness: 0.6, color: rgb(0.7, 0.73, 0.76) });
    const line = (text: string, y: number, size: number, chosenFont = font) => {
      const value = clean(text);
      page.drawText(value, { x: margin, y, size: Math.min(size, available / chosenFont.widthOfTextAtSize(value, 1)), font: chosenFont, color });
    };
    // Keep very long names readable; the full declared name remains in the receipt.
    let name = clean(evidence.signerName);
    while (name.length > 1 && bold.widthOfTextAtSize(`Assinado eletronicamente por: ${name}`, 9) > available) name = name.slice(0, -1);
    if (name !== clean(evidence.signerName)) name = `${name.slice(0, -3)}...`;
    line(`Assinado eletronicamente por: ${name}`, 72, 9, bold);
    line(`Aceite registrado: ${signedAt} UTC | Página ${index + 1} de ${pages.length}`, 58, 8);
    line(`Registro: ${evidence.requestId} | Comprovante: página ${receiptPage}`, 44, 7.5);
    line(`SHA-256 do original: ${evidence.originalSha256}`, 29, 6.5);
    line(`Selo das evidências (HMAC-SHA-256): ${seal}`, 16, 6.5);
  }
}

export async function appendSignatureReceipt(original: Uint8Array, evidence: SignatureEvidence, seal: string, signature?: Uint8Array) {
  const pdf = await contractWithFooterSpace(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const receiptPage = pdf.getPageCount() + 1;
  let page = pdf.addPage([595.28, 841.89]);
  let y = 788;
  function paragraph(text: string, title = false) {
    const chosenFont = title ? bold : font;
    const size = title ? 12 : 10;
    const words = clean(text).split(/\s+/).flatMap(word => word.length > 65 ? word.match(/.{1,60}/g)! : [word]);
    let line = "";
    const draw = () => {
      if (y < FOOTER_HEIGHT + 20) { page = pdf.addPage([595.28, 841.89]); y = 788; }
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
  if (evidence.location?.status === "captured") {
    paragraph(`Localização informada pelo navegador: latitude ${evidence.location.latitude.toFixed(6)}, longitude ${evidence.location.longitude.toFixed(6)}.`);
    paragraph(`Precisão informada: ${evidence.location.accuracyMeters.toFixed(1)} metros. Coleta (UTC): ${evidence.location.capturedAt}`);
    paragraph("Origem: geolocalização do navegador com permissão. As coordenadas são fornecidas pelo dispositivo e não constituem verificação independente da localização ou identidade.");
  } else if (evidence.location) {
    paragraph(`Localização: ${locationStatusLabels[evidence.location.status]}.`);
  }
  paragraph(`Navegador informado: ${evidence.userAgent.slice(0, 200) || "Não informado"}`);
  paragraph("Manifestação de vontade", true);
  paragraph(evidence.consentText);
  paragraph(`Versão do aceite: ${evidence.consentVersion}`);
  if (signature) {
    const png = await pdf.embedPng(signature);
    if (png.width > 2048 || png.height > 2048) throw new Error("signature_image_too_large");
    if (y < FOOTER_HEIGHT + 120) { page = pdf.addPage([595.28, 841.89]); y = 788; }
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
  signatureFooters(pdf, evidence, seal, font, bold, receiptPage);
  pdf.setTitle(evidence.documentName);
  return Buffer.from(await pdf.save());
}
