import { Router, type Request, type Response } from "express";
import { config } from "./config";
import { connectSession, disconnectSession, getContactInfo, getSessionState, sendMedia, sendText } from "./sessions";
import { verifySignature } from "./signature";

export const router: Router = Router();

/**
 * Confia apenas em chamadas assinadas pelo app principal (mesmo segredo do
 * webhook, na direção inversa). O corpo já chega parseado como Buffer bruto
 * (ver express.raw() em index.ts) para a assinatura bater byte a byte.
 */
router.use((req: Request, res: Response, next) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? "";
  const signature = req.header("x-service-signature");
  if (!verifySignature(raw, signature, config.serviceSecret)) {
    res.status(401).json({ error: "invalid_signature" });
    return;
  }
  next();
});

router.post("/sessions/:tenantId/connect", async (req, res) => {
  try {
    await connectSession(req.params.tenantId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/sessions/:tenantId/disconnect", async (req, res) => {
  try {
    await disconnectSession(req.params.tenantId);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/sessions/:tenantId/status", (req, res) => {
  const state = getSessionState(req.params.tenantId);
  res.json({
    status: state.status,
    qrCode: state.qrCode ?? undefined,
    phoneNumber: state.phoneNumber ?? undefined,
    errorMessage: state.errorMessage ?? undefined,
  });
});

router.post("/sessions/:tenantId/send", async (req, res) => {
  const { to, type, text, mediaUrl, caption, filename, chatId } = req.body ?? {};
  if (typeof to !== "string" || typeof type !== "string") {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const targetChatId = typeof chatId === "string" ? chatId : undefined;
  try {
    let externalMessageId: string;
    if (type === "text") {
      if (typeof text !== "string") throw new Error("invalid_payload");
      externalMessageId = await sendText(req.params.tenantId, to, text, targetChatId);
    } else if (type === "image" || type === "document") {
      if (typeof mediaUrl !== "string") throw new Error("invalid_payload");
      externalMessageId = await sendMedia(req.params.tenantId, to, mediaUrl, { caption, filename }, targetChatId);
    } else {
      throw new Error("invalid_payload");
    }
    res.json({ externalMessageId });
  } catch (error) {
    res.status(422).json({ error: String(error) });
  }
});

router.post("/sessions/:tenantId/contact", async (req, res) => {
  const { phone, chatId } = req.body ?? {};
  if (typeof phone !== "string") {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  try {
    const contact = await getContactInfo(req.params.tenantId, phone, typeof chatId === "string" ? chatId : undefined);
    res.json(contact ?? {});
  } catch (error) {
    res.status(422).json({ error: String(error) });
  }
});
