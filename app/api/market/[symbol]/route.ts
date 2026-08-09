import { NextResponse } from "next/server";
import { fetchCandles, fetchOrderBook, fetchTrades, SYMBOL_MAP } from "@/lib/binance";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!SYMBOL_MAP[symbol]) {
    return NextResponse.json({ error: "Unknown symbol" }, { status: 404 });
  }

  try {
    const [candles, orderBook, trades] = await Promise.all([
      fetchCandles(symbol),
      fetchOrderBook(symbol),
      fetchTrades(symbol),
    ]);
    return NextResponse.json({ candles, orderBook, trades });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch market data" },
      { status: 502 }
    );
  }
}
