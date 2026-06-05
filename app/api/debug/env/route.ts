export async function GET() {
  return Response.json({
    nytPresent: Boolean(process.env.NYT_API_KEY),
    guardianPresent: Boolean(process.env.GUARDIAN_API_KEY),
    currentsPresent: Boolean(process.env.CURRENTS_API_KEY),
    nytLength: process.env.NYT_API_KEY?.length || 0,
  });
}
