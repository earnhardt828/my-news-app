import { NextResponse } from "next/server";

const STOCK_SYMBOLS = ["AAPL", "MSFT", "NVDA"] as const;
type DisplayStockSymbol = (typeof STOCK_SYMBOLS)[number];

const STOCK_LABELS: Record<DisplayStockSymbol, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "Nvidia",
};

type StockTickerItem = {
  symbol: DisplayStockSymbol;
  label: string;
  price: number;
  change: number | null;
  percentChange: number | null;
  source: string;
};

function parseNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchFinnhubQuote(symbol: DisplayStockSymbol, apiKey: string) {
  console.log("FINNHUB REQUEST SYMBOL", symbol);

  const response = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`,
    {
      cache: "no-store",
      next: { revalidate: 0 },
    }
  );

  const responseBodyText = await response.text();

  console.log("FINNHUB RAW RESPONSE", {
    symbol,
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
    console.error("FINNHUB RESPONSE PARSE FAILED", { symbol, error });
    return null;
  }

  const price = parseNumber(payload?.c);
  const change = parseNumber(payload?.d);
  const percentChange = parseNumber(payload?.dp);

  if (price === null || price <= 0) {
    return null;
  }

  return {
    symbol,
    label: STOCK_LABELS[symbol],
    price,
    change,
    percentChange,
    source: "Finnhub",
  } satisfies StockTickerItem;
}

async function fetchAlphaVantageQuote(symbol: DisplayStockSymbol, apiKey: string) {
  const response = await fetch(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
      symbol
    )}&apikey=${encodeURIComponent(apiKey)}`,
    {
      cache: "no-store",
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    "Global Quote"?: Record<string, string>;
  };

  const quote = payload["Global Quote"] ?? {};
  const price = Number(quote["05. price"] ?? "");
  const change = Number(quote["09. change"] ?? "");
  const percentRaw = quote["10. change percent"]?.replace("%", "") ?? "";
  const percentChange = Number(percentRaw);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    symbol,
    label: STOCK_LABELS[symbol],
    price,
    change: Number.isFinite(change) ? change : null,
    percentChange: Number.isFinite(percentChange) ? percentChange : null,
    source: "Alpha Vantage",
  } satisfies StockTickerItem;
}

export async function GET() {
  const finnhubApiKey = process.env.FINNHUB_API_KEY?.trim();
  const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim();

  console.log("FINNHUB API KEY PRESENT", Boolean(finnhubApiKey));

  if (!finnhubApiKey && !alphaVantageApiKey) {
    console.log("STOCK API RESPONSE", { source: "no-api-key", stocks: [] });
    console.log("STOCK API PARSED ITEMS", []);
    console.log("STOCK API FINAL JSON", { stocks: [], source: "no-api-key" });
    console.log("FINNHUB VALID ITEMS COUNT", 0);
    console.log("STOCK API FINAL COUNT", 0);
    return NextResponse.json({ stocks: [] as StockTickerItem[], source: "no-api-key" }, { status: 200 });
  }

  try {
    const fetcher =
      finnhubApiKey
        ? (symbol: DisplayStockSymbol) => fetchFinnhubQuote(symbol, finnhubApiKey)
        : (symbol: DisplayStockSymbol) =>
            fetchAlphaVantageQuote(symbol, alphaVantageApiKey as string);

    const results = await Promise.allSettled(STOCK_SYMBOLS.map((symbol) => fetcher(symbol)));
    console.log("STOCK API RESPONSE", results);
    const stocks = results
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((item): item is StockTickerItem => item !== null);

    console.log("STOCK API PARSED ITEMS", stocks);
    console.log("FINNHUB VALID ITEMS COUNT", stocks.length);
    console.log("STOCK API FINAL COUNT", stocks.length);

    const finalPayload = {
      stocks,
      source:
        stocks.length > 0
          ? finnhubApiKey
            ? "finnhub"
            : "alpha-vantage"
          : finnhubApiKey
            ? "finnhub-empty"
            : "alpha-vantage-empty",
    };

    console.log("STOCK API FINAL JSON", finalPayload);

    return NextResponse.json(finalPayload, { status: 200 });
  } catch (error) {
    console.error("Stocks API load failed", error);
    console.log("STOCK API RESPONSE", { error: error instanceof Error ? error.message : String(error) });
    console.log("STOCK API PARSED ITEMS", []);
    console.log("STOCK API FINAL JSON", { stocks: [], source: "error" });
    console.log("FINNHUB VALID ITEMS COUNT", 0);
    console.log("STOCK API FINAL COUNT", 0);
    return NextResponse.json({ stocks: [] as StockTickerItem[], source: "error" }, { status: 200 });
  }
}
