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

type StockTickerItem = {
  symbol: string;
  label: string;
  price: number;
  change: number;
  percentChange: number;
};

export async function GET() {
  console.log(
    "STOCK API SYMBOLS REQUESTED",
    STOCK_QUOTE_CONFIGS.map((config) => config.symbol)
  );

  const items: StockTickerItem[] = [
    { symbol: "AAPL", label: "Apple", price: 306.31, change: -5.75, percentChange: -1.84 },
    { symbol: "MSFT", label: "Microsoft", price: 420.12, change: 2.15, percentChange: 0.51 },
    { symbol: "NVDA", label: "Nvidia", price: 1120.5, change: 18.22, percentChange: 1.65 },
    { symbol: "SPY", label: "S&P 500", price: 531.42, change: 4.12, percentChange: 0.78 },
    { symbol: "QQQ", label: "Nasdaq", price: 456.27, change: 6.24, percentChange: 1.39 },
    { symbol: "DIA", label: "Dow Jones", price: 392.84, change: -0.92, percentChange: -0.23 },
    { symbol: "AMZN", label: "Amazon", price: 188.67, change: 1.44, percentChange: 0.77 },
    { symbol: "GOOGL", label: "Alphabet", price: 177.95, change: -0.88, percentChange: -0.49 },
    { symbol: "META", label: "Meta", price: 503.22, change: 3.21, percentChange: 0.64 },
    { symbol: "TSLA", label: "Tesla", price: 176.4, change: -4.16, percentChange: -2.3 },
    { symbol: "AMD", label: "AMD", price: 164.73, change: 2.03, percentChange: 1.25 },
    { symbol: "NFLX", label: "Netflix", price: 661.14, change: 5.43, percentChange: 0.83 },
    { symbol: "JPM", label: "JPMorgan", price: 201.08, change: 0.71, percentChange: 0.35 },
    { symbol: "BAC", label: "Bank of America", price: 39.67, change: -0.19, percentChange: -0.48 },
    { symbol: "XOM", label: "ExxonMobil", price: 117.22, change: 0.94, percentChange: 0.81 },
    { symbol: "DIS", label: "Disney", price: 109.54, change: -0.67, percentChange: -0.61 },
    { symbol: "IWM", label: "Russell 2000", price: 207.19, change: 1.58, percentChange: 0.77 },
  ];

  const finalPayload = { items };
  console.log("STOCK API RESPONSE", finalPayload);
  console.log("STOCK API ITEMS RETURNED", items);
  console.log("STOCK API FINAL JSON", finalPayload);
  return NextResponse.json(finalPayload, { status: 200 });
}
