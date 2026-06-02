import { NextResponse } from "next/server";

const STOCK_QUOTE_CONFIGS = [
  { symbol: "AAPL", label: "Apple" },
  { symbol: "MSFT", label: "Microsoft" },
  { symbol: "NVDA", label: "Nvidia" },
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq" },
  { symbol: "DIA", label: "Dow Jones" },
  { symbol: "AMZN", label: "Amazon" },
  { symbol: "GOOGL", label: "Alphabet" },
  { symbol: "META", label: "Meta" },
  { symbol: "TSLA", label: "Tesla" },
  { symbol: "AMD", label: "AMD" },
  { symbol: "NFLX", label: "Netflix" },
  { symbol: "JPM", label: "JPMorgan" },
  { symbol: "BAC", label: "Bank of America" },
  { symbol: "XOM", label: "ExxonMobil" },
  { symbol: "DIS", label: "Disney" },
  { symbol: "IWM", label: "Russell 2000" },
] as const;

type StockQuoteConfig = (typeof STOCK_QUOTE_CONFIGS)[number];

type StockTickerItem = {
  symbol: string;
  label: string;
  price: number;
  change: number;
  percentChange: number;
};

function parseNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchFinnhubQuote(config: StockQuoteConfig, apiKey: string) {
  console.log("FINNHUB REQUEST SYMBOL", config.symbol);

  const response = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(config.symbol)}&token=${encodeURIComponent(apiKey)}`,
    {
      cache: "no-store",
      next: { revalidate: 0 },
    }
  );

  const responseBodyText = await response.text();

  console.log("FINNHUB RAW RESPONSE", {
    symbol: config.symbol,
    ok: response.ok,
    status: response.status,
    body: responseBodyText,
  });

  if (!response.ok) {
    return null;
  }

  let payload: { c?: number; d?: number; dp?: number } | null = null;

  try {
    payload = JSON.parse(responseBodyText) as { c?: number; d?: number; dp?: number };
  } catch (error) {
    console.error("FINNHUB RESPONSE PARSE FAILED", { symbol: config.symbol, error });
    return null;
  }

  const price = parseNumber(payload?.c);
  const change = parseNumber(payload?.d);
  const percentChange = parseNumber(payload?.dp);

  console.log("API STOCK RAW AAPL", {
    symbol: config.symbol,
    raw: payload,
  });

  if (price === null || change === null || percentChange === null || price <= 0) {
    return null;
  }

  return {
    symbol: config.symbol,
    label: config.label,
    price,
    change,
    percentChange,
  } satisfies StockTickerItem;
}

export async function GET() {
  const finnhubApiKey = process.env.FINNHUB_API_KEY?.trim();

  console.log("FINNHUB API KEY PRESENT", Boolean(finnhubApiKey));

  if (!finnhubApiKey) {
    const noKeyPayload = {
      items: [] as StockTickerItem[],
    };
    console.log("STOCK API RESPONSE", noKeyPayload);
    console.log("STOCK API PARSED ITEMS", noKeyPayload.items);
    console.log("API STOCK ITEMS RETURNED", noKeyPayload.items);
    console.log("STOCK API EXACT ITEMS", noKeyPayload.items);
    console.log("STOCK API FINAL JSON", noKeyPayload);
    console.log("FINNHUB VALID ITEMS COUNT", noKeyPayload.items.length);
    console.log("STOCK API FINAL COUNT", noKeyPayload.items.length);
    return NextResponse.json(noKeyPayload, { status: 200 });
  }

  try {
    const results = await Promise.allSettled(
      STOCK_QUOTE_CONFIGS.map((config) => fetchFinnhubQuote(config, finnhubApiKey))
    );
    console.log("STOCK API RESPONSE", results);

    const items = results
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((item) => item !== null) as StockTickerItem[];

    console.log("STOCK API PARSED ITEMS", items);
    console.log("API STOCK ITEMS RETURNED", items);
    console.log("STOCK API EXACT ITEMS", items);
    console.log("FINNHUB VALID ITEMS COUNT", items.length);
    console.log("STOCK API FINAL COUNT", items.length);

    const finalPayload = {
      items,
    };

    console.log("STOCK API FINAL JSON", finalPayload);
    return NextResponse.json(finalPayload, { status: 200 });
  } catch (error) {
    console.error("Stocks API load failed", error);
    const errorPayload = {
      items: [] as StockTickerItem[],
    };
    console.log("STOCK API RESPONSE", { error: error instanceof Error ? error.message : String(error) });
    console.log("STOCK API PARSED ITEMS", errorPayload.items);
    console.log("API STOCK ITEMS RETURNED", errorPayload.items);
    console.log("STOCK API EXACT ITEMS", errorPayload.items);
    console.log("STOCK API FINAL JSON", errorPayload);
    console.log("FINNHUB VALID ITEMS COUNT", errorPayload.items.length);
    console.log("STOCK API FINAL COUNT", errorPayload.items.length);
    return NextResponse.json(errorPayload, { status: 200 });
  }
}
