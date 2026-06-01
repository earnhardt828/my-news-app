import { NextResponse } from "next/server";

const STOCK_SYMBOLS = ["SPY", "QQQ", "DIA", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"] as const;
type DisplayStockSymbol = (typeof STOCK_SYMBOLS)[number];

const STOCK_LABELS: Record<DisplayStockSymbol, string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq",
  DIA: "Dow Jones",
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "Nvidia",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  META: "Meta",
  TSLA: "Tesla",
};

const STOCK_SYMBOL_CANDIDATES: Record<DisplayStockSymbol, string[]> = {
  SPY: ["SPY", "IVV", "VOO"],
  QQQ: ["QQQ", "QQQM"],
  DIA: ["DIA", "DJIA"],
  AAPL: ["AAPL"],
  MSFT: ["MSFT"],
  NVDA: ["NVDA"],
  AMZN: ["AMZN"],
  GOOGL: ["GOOGL"],
  META: ["META"],
  TSLA: ["TSLA"],
};

type StockTickerItem = {
  symbol: DisplayStockSymbol;
  label: string;
  price: number | null;
  change: number | null;
  percentChange: number | null;
  source: string;
};

function parseFinnhubQuoteValue(raw: unknown) {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }

  return raw;
}

async function fetchFinnhubQuoteForSymbol(requestSymbol: string, apiKey: string) {
  console.log("FINNHUB REQUEST SYMBOL", requestSymbol);

  const response = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(requestSymbol)}&token=${encodeURIComponent(apiKey)}`,
    {
      cache: "no-store",
      next: { revalidate: 0 },
    }
  );

  console.log("FINNHUB RESPONSE STATUS", { symbol: requestSymbol, status: response.status, ok: response.ok });

  const responseBodyText = await response.text();
  console.log("FINNHUB RESPONSE BODY", { symbol: requestSymbol, body: responseBodyText });

  if (!response.ok) {
    return null;
  }

  let payload: {
    c?: number;
    d?: number;
    dp?: number;
  } | null = null;

  try {
    payload = JSON.parse(responseBodyText) as {
      c?: number;
      d?: number;
      dp?: number;
    };
  } catch (error) {
    console.error("FINNHUB RESPONSE PARSE FAILED", { symbol: requestSymbol, error });
    return null;
  }

  const parsedPrice = parseFinnhubQuoteValue(payload.c);
  const parsedChange = typeof payload.d === "number" && Number.isFinite(payload.d) ? payload.d : null;
  const parsedPercentChange =
    typeof payload.dp === "number" && Number.isFinite(payload.dp) ? payload.dp : null;

  console.log("STOCK PRICE PARSED", {
    symbol: requestSymbol,
    price: parsedPrice,
    change: parsedChange,
    percentChange: parsedPercentChange,
  });

  if (parsedPrice === null) {
    return null;
  }

  return {
    requestSymbol,
    price: parsedPrice,
    change: parsedChange,
    percentChange: parsedPercentChange,
  };
}

async function fetchFinnhubQuote(symbol: DisplayStockSymbol, apiKey: string) {
  const candidates = STOCK_SYMBOL_CANDIDATES[symbol];

  for (const [index, candidate] of candidates.entries()) {
    const quote = await fetchFinnhubQuoteForSymbol(candidate, apiKey);

    if (quote) {
      console.log("STOCK SYMBOL USED", { displaySymbol: symbol, requestSymbol: candidate });

      if (index > 0) {
        console.log("STOCK SYMBOL FALLBACK_USED", { displaySymbol: symbol, requestSymbol: candidate });
      }

      return {
        symbol,
        label: STOCK_LABELS[symbol],
        price: quote.price,
        change: quote.change,
        percentChange: quote.percentChange,
        source: "Finnhub",
      } satisfies StockTickerItem;
    }
  }

  console.log("STOCK SYMBOL FAILED", { displaySymbol: symbol, tried: candidates });
  return null;
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

  return {
    symbol,
    label: STOCK_LABELS[symbol],
    price: Number.isFinite(price) ? price : null,
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
    return NextResponse.json({ stocks: [] as StockTickerItem[], source: "no-api-key" }, { status: 200 });
  }

  try {
    const fetcher =
      finnhubApiKey
        ? (symbol: DisplayStockSymbol) => fetchFinnhubQuote(symbol, finnhubApiKey)
        : (symbol: DisplayStockSymbol) =>
            fetchAlphaVantageQuote(symbol, alphaVantageApiKey as string);

    const payloads = await Promise.allSettled(STOCK_SYMBOLS.map((symbol) => fetcher(symbol)));
    const stocks = payloads
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter(
        (item): item is StockTickerItem =>
          item !== null &&
          item.price !== null &&
          Number.isFinite(item.price) &&
          item.price > 0
      );

    console.log("STOCK API FINAL COUNT", stocks.length);

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
