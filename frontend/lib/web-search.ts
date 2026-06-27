/**
 * web-search.ts — Web search providers for plant context.
 *
 * Provider chain (tries in order, uses first available):
 *   1. SerpAPI      — requires SERPAPI_API_KEY (paid, best quality)
 *   2. Google CSE   — requires GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID (free tier: 100/day)
 *   3. Wikipedia    — FREE, no key needed (always available as fallback)
 */

import type { WebSearchHit } from "@/types/plant-info";

export type WebSearchProvider = "serpapi" | "google_cse" | "wikipedia" | null;

export type WebSearchOutcome = {
  provider: WebSearchProvider;
  results: WebSearchHit[];
};

function normalizeHttpUrl(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

// ─── SerpAPI (paid, best quality) ────────────────────────────────────────────

async function serpApiSearch(
  query: string,
  apiKey: string,
  num: number,
): Promise<WebSearchHit[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", String(Math.min(Math.max(num, 1), 10)));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`SerpAPI HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
    error?: string;
  };
  if (data.error) throw new Error(data.error);
  const organic = data.organic_results ?? [];
  return organic.slice(0, num)
    .map((r) => ({
      title: (r.title ?? "Untitled").trim() || "Untitled",
      snippet: (r.snippet ?? "").trim(),
      url: normalizeHttpUrl(r.link),
    }))
    .filter((r) => r.url.length > 0);
}

// ─── Google CSE (free tier: 100 queries/day) ─────────────────────────────────

async function googleCseSearch(
  query: string,
  apiKey: string,
  cx: string,
  num: number,
): Promise<WebSearchHit[]> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(Math.max(num, 1), 10)));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Google CSE HTTP ${res.status} ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    items?: Array<{ title?: string; snippet?: string; link?: string }>;
  };
  const items = data.items ?? [];
  return items.map((r) => ({
    title: (r.title ?? "Untitled").trim() || "Untitled",
    snippet: (r.snippet ?? "").trim(),
    url: normalizeHttpUrl(r.link),
  })).filter((r) => r.url.length > 0);
}

// ─── Wikipedia API (FREE — no key needed) ────────────────────────────────────

async function wikipediaSearch(
  plantName: string,
  maxResults: number,
): Promise<WebSearchHit[]> {
  const results: WebSearchHit[] = [];

  try {
    // Step 1: Search Wikipedia for relevant articles
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", `${plantName} plant`);
    searchUrl.searchParams.set("srlimit", String(Math.min(maxResults, 10)));
    searchUrl.searchParams.set("origin", "*");

    const searchRes = await fetch(searchUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return [];

    const searchData = (await searchRes.json()) as {
      query?: {
        search?: Array<{ title: string; snippet: string; pageid: number }>;
      };
    };

    const articles = searchData.query?.search ?? [];
    if (articles.length === 0) return [];

    // Step 2: Get extracts (summaries) for each article
    const titles = articles.slice(0, maxResults).map((a) => a.title);
    const extractUrl = new URL("https://en.wikipedia.org/w/api.php");
    extractUrl.searchParams.set("action", "query");
    extractUrl.searchParams.set("format", "json");
    extractUrl.searchParams.set("titles", titles.join("|"));
    extractUrl.searchParams.set("prop", "extracts|info");
    extractUrl.searchParams.set("exintro", "1");
    extractUrl.searchParams.set("explaintext", "1");
    extractUrl.searchParams.set("exsentences", "3");
    extractUrl.searchParams.set("inprop", "url");
    extractUrl.searchParams.set("origin", "*");

    const extractRes = await fetch(extractUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!extractRes.ok) {
      // Fallback: use the search snippets directly
      return articles.slice(0, maxResults).map((a) => ({
        title: a.title,
        snippet: a.snippet.replace(/<[^>]*>/g, "").trim(),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g, "_"))}`,
      }));
    }

    const extractData = (await extractRes.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title: string;
            extract?: string;
            fullurl?: string;
          }
        >;
      };
    };

    const pages = extractData.query?.pages;
    if (!pages) {
      return articles.slice(0, maxResults).map((a) => ({
        title: a.title,
        snippet: a.snippet.replace(/<[^>]*>/g, "").trim(),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g, "_"))}`,
      }));
    }

    for (const page of Object.values(pages)) {
      if (page.title && page.extract) {
        results.push({
          title: page.title,
          snippet: page.extract.slice(0, 300).trim(),
          url:
            page.fullurl ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
        });
      }
    }
  } catch {
    // Return whatever we have
  }

  return results.slice(0, maxResults);
}

// ─── Format context for LLM prompt ──────────────────────────────────────────

export function formatSearchContext(results: WebSearchHit[]): string {
  if (!results.length) return "";
  const lines = [
    "Here are relevant web search snippets (may be incomplete or wrong; do not treat as medical advice):",
    "",
  ];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.snippet || "(no snippet)"}`);
    lines.push(`   URL: ${r.url}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ─── Unified search: tries providers in order ────────────────────────────────

/**
 * Run web search using the first available provider.
 *
 * Chain: SerpAPI → Google CSE → Wikipedia (always available, free)
 */
export async function webSearchPlantContext(
  plantName: string,
  maxResults: number,
): Promise<WebSearchOutcome> {
  const q = `${plantName} plant botany uses cultivation toxicity ornamental`;

  // 1. SerpAPI (paid, best quality)
  const serp = process.env.SERPAPI_API_KEY?.trim();
  if (serp) {
    try {
      const results = await serpApiSearch(q, serp, maxResults);
      if (results.length > 0) {
        return { provider: "serpapi", results };
      }
    } catch {
      // Fall through to next provider
    }
  }

  // 2. Google CSE (free tier: 100/day)
  const cseKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_ID?.trim();
  if (cseKey && cx) {
    try {
      const results = await googleCseSearch(q, cseKey, cx, maxResults);
      if (results.length > 0) {
        return { provider: "google_cse", results };
      }
    } catch {
      // Fall through to next provider
    }
  }

  // 3. Wikipedia (FREE — always available)
  try {
    const results = await wikipediaSearch(plantName, maxResults);
    if (results.length > 0) {
      return { provider: "wikipedia", results };
    }
  } catch {
    // All providers failed
  }

  return { provider: null, results: [] };
}
