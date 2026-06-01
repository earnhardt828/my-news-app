import { NextResponse } from "next/server";

const STOCK_SYMBOLS = ["SPY", "QQQ", "DIA", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"] as const;

type StockTickerItem = {
  symbol: string;
  price: number | null;
  change: number | null;
  percentChange: number | null;
  source: string;
};

async function fetchFinnhubQuote(symbol: string, apiKey: string) {
  const response = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`,
    {
      cache: "no-store",
      next: { revalidate: 0 },
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    c?: number;
    d?: number;
    dp?: number;
  };

  return {
    symbol,
    price: typeof payload.c === "number" ? payload.c : null,
    change: typeof payload.d === "number" ? payload.d : null,
    percentChange: typeof payload.dp === "number" ? payload.dp : null,
    source: "Finnhub",
  } satisfies StockTickerItem;
}

async function fetchAlphaVantageQuote(symbol: string, apiKey: string) {
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

  return {
    symbol,
    price: Number.isFinite(price) ? price : null,
    change: Number.isFinite(change) ? change : null,
    percentChange: Number.isFinite(percentChange) ? percentChange : null,
    source: "Alpha Vantage",
  } satisfies StockTickerItem;
}

export async function GET() {
  const finnhubApiKey = process.env.FINNHUB_API_KEY?.trim();
  const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim();

  if (!finnhubApiKey && !alphaVantageApiKey) {
    return NextResponse.json({ stocks: [] as StockTickerItem[], source: "no-api-key" }, { status: 200 });
  }

  try {
    const fetcher =
      finnhubApiKey
        ? (symbol: string) => fetchFinnhubQuote(symbol, finnhubApiKey)
        : (symbol: string) => fetchAlphaVantageQuote(symbol, alphaVantageApiKey as string);

    const payloads = await Promise.allSettled(STOCK_SYMBOLS.map((symbol) => fetcher(symbol)));
    const stocks = payloads
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((item): item is StockTickerItem => Boolean(item));

    return NextResponse.json(
      {
        stocks,
        source: finnhubApiKey ? "finnhub" : "alpha-vantage",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Stocks API load failed", error);
    return NextResponse.json({ stocks: [] as StockTickerItem[], source: "error" }, { status: 200 });
  }
}
