export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { ok: true, commit: process.env.APP_RELEASE_SHA ?? "development" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
