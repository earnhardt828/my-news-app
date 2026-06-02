import { NextResponse } from "next/server";

const STOCK_SYMBOL = "AAPL" as const;

type StockTickerItem = {
  symbol: typeof STOCK_SYMBOL;
  label: "Apple";
  price: number;
  change: number;
  percentChange: number;
};

function parseNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchFinnhubQuote(symbol: typeof STOCK_SYMBOL, apiKey: string) {
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

  console.log("API STOCK RAW AAPL", {
    symbol,
    raw: payload,
  });

  if (price === null || change === null || percentChange === null || price <= 0) {
    return null;
  }

  return {
    symbol,
    label: "Apple",
    price,
    change,
    percentChange,
  } satisfies StockTickerItem;
}

const STOCK_API_FALLBACK_ITEM: StockTickerItem = {
  symbol: "AAPL",
  label: "Apple",
  price: 306.31,
  change: -5.75,
  percentChange: -1.8426,
};

export async function GET() {
  const finnhubApiKey = process.env.FINNHUB_API_KEY?.trim();

  console.log("FINNHUB API KEY PRESENT", Boolean(finnhubApiKey));

  if (!finnhubApiKey) {
    const noKeyPayload = {
      items: [STOCK_API_FALLBACK_ITEM],
      debugFallback: true,
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
    const item = await fetchFinnhubQuote(STOCK_SYMBOL, finnhubApiKey);
    const items = item ? [item] : [];
    console.log("STOCK API RESPONSE", item);

    console.log("STOCK API PARSED ITEMS", items);
    console.log("API STOCK ITEMS RETURNED", items);
    console.log("STOCK API EXACT ITEMS", items);
    console.log("FINNHUB VALID ITEMS COUNT", items.length);
    console.log("STOCK API FINAL COUNT", items.length);

    const finalPayload = {
      items,
    };

    console.log("STOCK API FINAL JSON", finalPayload);

    if (items.length > 0) {
      return NextResponse.json(finalPayload, { status: 200 });
    }

    const fallbackPayload = {
      items: [STOCK_API_FALLBACK_ITEM],
      debugFallback: true,
    };

    console.log("STOCK API FINAL JSON", fallbackPayload);
    return NextResponse.json(fallbackPayload, { status: 200 });
  } catch (error) {
    console.error("Stocks API load failed", error);
    const errorPayload = {
      items: [STOCK_API_FALLBACK_ITEM],
      debugFallback: true,
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
