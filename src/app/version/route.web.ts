export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID || "dev" },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
