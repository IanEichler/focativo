import express, { type Request } from "express";
import { config } from "./config";
import { router } from "./routes";
import { resumeSavedSessions } from "./sessions";

const app = express();

app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use(router);

app.listen(config.port, () => {
  console.log(`[whatsapp-service] ouvindo na porta ${config.port} (app: ${config.mainAppUrl})`);
  void resumeSavedSessions();
});
