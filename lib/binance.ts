// Live market data pulled from Binance's public REST API (no key required).
// Fetched server-side by the /api routes so the browser never talks to
// Binance directly. This is real market data — but nothing here places
// orders; there is no authenticated Binance account involved anywhere.

const BASE_URL = "https://api.binance.com/api/v3";

export const SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT",
  ADA: "ADAUSDT",
  DOGE: "DOGEUSDT",
  AVAX: "AVAXUSDT",
  LINK: "LINKUSDT",
  LTC: "LTCUSDT",
  DOT: "DOTUSDT",
  BCH: "BCHUSDT",
  UNI: "UNIUSDT",
  ATOM: "ATOMUSDT",
  ETC: "ETCUSDT",
  FIL: "FILUSDT",
  NEAR: "NEARUSDT",
};

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OrderBookRow = {
  price: number;
  size: number;
  total: number;
};

export type Trade = {
  id: string;
  time: number;
  side: "buy" | "sell";
  price: number;
  size: number;
};

export type Ticker = {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
};

async function binanceFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Binance API error ${res.status} for ${path}`);
  }
  return res.json();
}

export async function fetchTicker(symbol: string): Promise<Ticker> {
  const pair = SYMBOL_MAP[symbol];
  const data = await binanceFetch<{
    lastPrice: string;
    priceChange: string;
    priceChangePercent: string;
  }>(`/ticker/24hr?symbol=${pair}`);
  return {
    symbol,
    lastPrice: Number(data.lastPrice),
    priceChange: Number(data.priceChange),
    priceChangePercent: Number(data.priceChangePercent),
  };
}

export async function fetchAllTickers(): Promise<Ticker[]> {
  return Promise.all(Object.keys(SYMBOL_MAP).map(fetchTicker));
}

export async function fetchCandles(
  symbol: string,
  interval = "1h",
  limit = 180
): Promise<Candle[]> {
  const pair = SYMBOL_MAP[symbol];
  const data = await binanceFetch<
    [number, string, string, string, string, string, ...unknown[]][]
  >(`/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
  return data.map(([openTime, open, high, low, close, volume]) => ({
    time: Math.floor(openTime / 1000),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
  }));
}

export async function fetchOrderBook(
  symbol: string,
  limit = 12
): Promise<{ bids: OrderBookRow[]; asks: OrderBookRow[] }> {
  const pair = SYMBOL_MAP[symbol];
  const data = await binanceFetch<{
    bids: [string, string][];
    asks: [string, string][];
  }>(`/depth?symbol=${pair}&limit=${limit}`);

  let bidTotal = 0;
  const bids: OrderBookRow[] = data.bids.map(([price, size]) => {
    bidTotal += Number(size);
    return { price: Number(price), size: Number(size), total: bidTotal };
  });

  let askTotal = 0;
  const asks: OrderBookRow[] = data.asks.map(([price, size]) => {
    askTotal += Number(size);
    return { price: Number(price), size: Number(size), total: askTotal };
  });

  return { bids, asks };
}

export async function fetchTrades(symbol: string, limit = 20): Promise<Trade[]> {
  const pair = SYMBOL_MAP[symbol];
  const data = await binanceFetch<
    { id: number; price: string; qty: string; time: number; isBuyerMaker: boolean }[]
  >(`/trades?symbol=${pair}&limit=${limit}`);

  return data
    .slice()
    .reverse()
    .map((t) => ({
      id: String(t.id),
      time: Math.floor(t.time / 1000),
      side: t.isBuyerMaker ? "sell" : "buy",
      price: Number(t.price),
      size: Number(t.qty),
    }));
}
