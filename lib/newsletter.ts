// Digest content sourced entirely from free, no-key public sources:
// CoinGecko (market dominance), public RSS feeds (news), QuickChart (chart image).

import Parser from "rss-parser";

const rssParser = new Parser();
const NEWS_FEEDS = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "CoinTelegraph" },
];

export type DominanceEntry = { symbol: string; pct: number };

export type DigestData = {
  dominance: DominanceEntry[];
  totalMarketCapUsd: number;
  marketCapChange24h: number;
  news: { title: string; url: string; source: string }[];
  chartImageUrl: string;
};

export async function fetchDominance(): Promise<{
  dominance: DominanceEntry[];
  totalMarketCapUsd: number;
  marketCapChange24h: number;
}> {
  const res = await fetch("https://api.coingecko.com/api/v3/global", { cache: "no-store" });
  if (!res.ok) throw new Error("CoinGecko global API error " + res.status);
  const json = await res.json();
  const pctMap = json.data.market_cap_percentage as Record<string, number>;
  const dominance = Object.entries(pctMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([symbol, pct]) => ({ symbol: symbol.toUpperCase(), pct }));
  return {
    dominance,
    totalMarketCapUsd: json.data.total_market_cap.usd,
    marketCapChange24h: json.data.market_cap_change_percentage_24h_usd,
  };
}

type NewsItem = { title: string; url: string; source: string; publishedAt: number };

export async function fetchNews(limit = 5): Promise<DigestData["news"]> {
  const perFeed = await Promise.allSettled(
    NEWS_FEEDS.map(async (feed): Promise<NewsItem[]> => {
      const parsed = await rssParser.parseURL(feed.url);
      return (parsed.items ?? []).map((item) => ({
        title: item.title ?? "",
        url: item.link ?? "",
        source: feed.source,
        publishedAt: item.pubDate ? new Date(item.pubDate).getTime() : 0,
      }));
    })
  );

  const items: NewsItem[] = [];
  for (const result of perFeed) {
    if (result.status === "fulfilled") items.push(...result.value);
  }

  return items
    .filter((item) => item.title && item.url)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit)
    .map(({ title, url, source }) => ({ title, url, source }));
}

export function buildDominanceChartUrl(dominance: DominanceEntry[]): string {
  const others = Math.max(0, 100 - dominance.reduce((sum, d) => sum + d.pct, 0));
  const labels = [...dominance.map((d) => d.symbol), "Others"];
  const data = [...dominance.map((d) => Math.round(d.pct * 10) / 10), Math.round(others * 10) / 10];
  const config = {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: ["#F0B429", "#34D399", "#60A5FA", "#F472B6", "#A78BFA", "#FB923C", "#8B95A5"],
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "right", labels: { font: { size: 14 } } },
        title: { display: true, text: "Market Cap Dominance", font: { size: 18 } },
      },
    },
  };
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?c=${encoded}&w=560&h=340&backgroundColor=white`;
}

export async function buildDigest(): Promise<DigestData> {
  const [{ dominance, totalMarketCapUsd, marketCapChange24h }, news] = await Promise.all([
    fetchDominance(),
    fetchNews(),
  ]);
  return {
    dominance,
    totalMarketCapUsd,
    marketCapChange24h,
    news,
    chartImageUrl: buildDominanceChartUrl(dominance),
  };
}

function formatUsdCompact(value: number): string {
  if (value >= 1e12) return "$" + (value / 1e12).toFixed(2) + "T";
  if (value >= 1e9) return "$" + (value / 1e9).toFixed(2) + "B";
  return "$" + value.toLocaleString("en-US");
}

export function renderDigestEmailHtml(digest: DigestData, unsubscribeUrl: string): string {
  const changeColor = digest.marketCapChange24h >= 0 ? "#34D399" : "#F26D6D";
  const changeSign = digest.marketCapChange24h >= 0 ? "+" : "";

  const dominanceRows = digest.dominance
    .map(
      (d) => `
        <tr>
          <td style="padding:6px 0;color:#171b21;font-weight:600;">${d.symbol}</td>
          <td style="padding:6px 0;text-align:right;color:#5b6472;">${d.pct.toFixed(1)}%</td>
        </tr>`
    )
    .join("");

  const newsItems = digest.news
    .map(
      (n) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #e5e7eb;">
            <a href="${n.url}" style="color:#171b21;font-weight:600;text-decoration:none;font-size:15px;">${n.title}</a>
            <div style="color:#8b95a5;font-size:12px;margin-top:2px;">${n.source}</div>
          </td>
        </tr>`
    )
    .join("");

  const newsSection =
    digest.news.length > 0
      ? `
        <h2 style="font-size:16px;color:#171b21;margin:0 0 4px;">Top headlines</h2>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${newsItems}
        </table>`
      : "";

  return `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f2f3f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
    <tr>
      <td style="background:#0b0e13;padding:20px 24px;">
        <span style="color:#f0b429;font-weight:800;font-size:20px;">NovaX</span>
        <span style="color:#8b95a5;font-size:13px;margin-left:8px;">Crypto Digest</span>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="color:#171b21;font-size:14px;margin:0 0 16px;">
          Total crypto market cap: <strong>${formatUsdCompact(digest.totalMarketCapUsd)}</strong>
          <span style="color:${changeColor};font-weight:600;">(${changeSign}${digest.marketCapChange24h.toFixed(2)}% / 24h)</span>
        </p>
        <img src="${digest.chartImageUrl}" alt="Market cap dominance chart" width="100%" style="display:block;border-radius:8px;margin-bottom:16px;" />
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          ${dominanceRows}
        </table>
        ${newsSection}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;background:#f7f8fa;color:#8b95a5;font-size:11px;">
        Market data via CoinGecko, news via CoinDesk &amp; CoinTelegraph. Not financial advice.
        <a href="${unsubscribeUrl}" style="color:#8b95a5;">Unsubscribe</a>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
