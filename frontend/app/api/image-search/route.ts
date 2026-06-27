import { NextResponse } from "next/server";

/**
 * /api/image-search — Fetches plant reference images from Wikipedia/Wikimedia Commons.
 * Free, no API key required. Returns 2-3 relevant plant images.
 */

type ImageResult = {
  url: string;
  title: string;
  source: string;
};

// ─── Wikipedia API: get page images ──────────────────────────────────────────

async function searchWikipediaImages(plantName: string): Promise<ImageResult[]> {
  const results: ImageResult[] = [];

  try {
    // Step 1: Search for the Wikipedia page
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", `${plantName} plant`);
    searchUrl.searchParams.set("srlimit", "1");
    searchUrl.searchParams.set("origin", "*");

    const searchRes = await fetch(searchUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) return [];

    const searchData = (await searchRes.json()) as {
      query?: {
        search?: Array<{ title: string; pageid: number }>;
      };
    };

    const page = searchData.query?.search?.[0];
    if (!page) return [];

    // Step 2: Get images from the page
    const imagesUrl = new URL("https://en.wikipedia.org/w/api.php");
    imagesUrl.searchParams.set("action", "query");
    imagesUrl.searchParams.set("format", "json");
    imagesUrl.searchParams.set("titles", page.title);
    imagesUrl.searchParams.set("prop", "images");
    imagesUrl.searchParams.set("imlimit", "15");
    imagesUrl.searchParams.set("origin", "*");

    const imagesRes = await fetch(imagesUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!imagesRes.ok) return [];

    const imagesData = (await imagesRes.json()) as {
      query?: {
        pages?: Record<
          string,
          { images?: Array<{ title: string }> }
        >;
      };
    };

    const pages = imagesData.query?.pages;
    if (!pages) return [];

    const imageFiles: string[] = [];
    for (const pageData of Object.values(pages)) {
      if (pageData.images) {
        for (const img of pageData.images) {
          const t = img.title.toLowerCase();
          // Filter to actual plant images (skip icons, logos, maps, commons-logo)
          if (
            (t.endsWith(".jpg") || t.endsWith(".jpeg") || t.endsWith(".png") || t.endsWith(".webp")) &&
            !t.includes("icon") &&
            !t.includes("logo") &&
            !t.includes("map") &&
            !t.includes("flag") &&
            !t.includes("commons") &&
            !t.includes("wikispecies") &&
            !t.includes("edit-") &&
            !t.includes("symbol")
          ) {
            imageFiles.push(img.title);
          }
        }
      }
    }

    if (imageFiles.length === 0) return [];

    // Step 3: Get actual image URLs (take first 3)
    const filesToFetch = imageFiles.slice(0, 3);
    const imageInfoUrl = new URL("https://en.wikipedia.org/w/api.php");
    imageInfoUrl.searchParams.set("action", "query");
    imageInfoUrl.searchParams.set("format", "json");
    imageInfoUrl.searchParams.set("titles", filesToFetch.join("|"));
    imageInfoUrl.searchParams.set("prop", "imageinfo");
    imageInfoUrl.searchParams.set("iiprop", "url|extmetadata");
    imageInfoUrl.searchParams.set("iiurlwidth", "400");
    imageInfoUrl.searchParams.set("origin", "*");

    const infoRes = await fetch(imageInfoUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!infoRes.ok) return [];

    const infoData = (await infoRes.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title: string;
            imageinfo?: Array<{
              url: string;
              thumburl?: string;
              extmetadata?: {
                ObjectName?: { value: string };
                ImageDescription?: { value: string };
              };
            }>;
          }
        >;
      };
    };

    const infoPages = infoData.query?.pages;
    if (!infoPages) return [];

    for (const pageInfo of Object.values(infoPages)) {
      const ii = pageInfo.imageinfo?.[0];
      if (ii) {
        const imgUrl = ii.thumburl || ii.url;
        if (imgUrl) {
          const cleanTitle = pageInfo.title
            .replace(/^File:/, "")
            .replace(/\.[^.]+$/, "")
            .replace(/_/g, " ");

          results.push({
            url: imgUrl,
            title: cleanTitle || plantName,
            source: "Wikipedia",
          });
        }
      }
    }
  } catch {
    // Return whatever we have so far
  }

  return results.slice(0, 3);
}

// ─── Google CSE image search (optional, if keys are configured) ──────────────

async function googleImageSearch(
  plantName: string,
  apiKey: string,
  cx: string,
): Promise<ImageResult[]> {
  try {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cx);
    url.searchParams.set("q", `${plantName} plant leaf`);
    url.searchParams.set("searchType", "image");
    url.searchParams.set("num", "3");
    url.searchParams.set("imgSize", "medium");
    url.searchParams.set("safe", "active");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      items?: Array<{
        title?: string;
        link?: string;
        image?: { contextLink?: string };
      }>;
    };

    return (data.items ?? []).slice(0, 3).map((item) => ({
      url: item.link ?? "",
      title: item.title ?? plantName,
      source: "Google",
    })).filter((r) => r.url.length > 0);
  } catch {
    return [];
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: { plantName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON." }, { status: 400 });
  }

  const plantName = typeof body.plantName === "string" ? body.plantName.trim() : "";
  if (!plantName) {
    return NextResponse.json({ detail: "plantName is required." }, { status: 400 });
  }

  let images: ImageResult[] = [];

  // Try Google CSE first (if configured)
  const cseKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_ID?.trim();
  if (cseKey && cx) {
    images = await googleImageSearch(plantName, cseKey, cx);
  }

  // Fallback to Wikipedia
  if (images.length === 0) {
    images = await searchWikipediaImages(plantName);
  }

  return NextResponse.json({ images });
}
