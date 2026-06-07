export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return Response.json({
    apiKeyPresent: Boolean(process.env.GNEWS_API_KEY),
    apiKeyLength: process.env.GNEWS_API_KEY?.length || 0,
  });
}
