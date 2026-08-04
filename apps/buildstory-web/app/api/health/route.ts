export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", service: "buildstory-web" },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
