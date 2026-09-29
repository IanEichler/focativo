export type GenerateDocumentState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      docxBase64: string;
      pdfBase64: string;
      fileName: string;
      profileMessage?: string;
      profileWarning?: boolean;
      signatureDocumentId?: string;
      signatureUrl?: string;
      signatureWarning?: string;
    };

export const GENERATE_IDLE: GenerateDocumentState = { status: "idle" };
