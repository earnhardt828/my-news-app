export async function GET() {
  return Response.json({
    guardian: Boolean(process.env.GUARDIAN_API_KEY),
    nyt: Boolean(process.env.NYT_API_KEY),
    currents: Boolean(process.env.CURRENTS_API_KEY),
    guardianLength: process.env.GUARDIAN_API_KEY?.length || 0,
    nytLength: process.env.NYT_API_KEY?.length || 0,
    currentsLength: process.env.CURRENTS_API_KEY?.length || 0,
  });
}
