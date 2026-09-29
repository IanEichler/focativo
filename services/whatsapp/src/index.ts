import express, { type Request } from "express";
import { config } from "./config";
import { router } from "./routes";
import { resumeSavedSessions, stopSessions } from "./sessions";

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

const server = app.listen(config.port, () => {
  console.log(`[whatsapp-service] ouvindo na porta ${config.port} (app: ${config.mainAppUrl})`);
  void resumeSavedSessions();
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  const timeout = setTimeout(() => process.exit(1), 15000);
  timeout.unref();
  await stopSessions();
  clearTimeout(timeout);
  process.exit(0);
}
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
