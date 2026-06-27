import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import {
  buildFocusHighlights,
  formatSectionsMarkdown,
} from "@/lib/plant-display";
import { buildFallbackSections, focusLabel } from "@/lib/plant-fallback";
import { buildPlantInfoUserPrompt, detectAnswerMode } from "@/lib/plant-prompts";
import { formatSearchContext, webSearchPlantContext } from "@/lib/web-search";
import type {
  PlantInfoFocus,
  PlantInfoSections,
  PlantInfoWebSearch,
} from "@/types/plant-info";

// ─── Constants ───────────────────────────────────────────────────────────────

const FOCUS_VALUES: PlantInfoFocus[] = [
  "balanced",
  "gardening",
  "ecology",
  "cultural",
  "concise",
  "custom",
];

const CUSTOM_QUESTION_MIN = 10;
const CUSTOM_QUESTION_MAX = 500;

const DEFAULT_FALLBACK_MODELS = ["llama3-70b-8192", "gemma2-9b-it"];

// ─── Utilities ────────────────────────────────────────────────────────────────

type Bucket = { count: number; resetAt: number };
const RATE_BUCKETS = new Map<string, Bucket>();

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function envNumber(
  name: string,
  fallback: number,
  lo: number,
  hi: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
}

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

function checkRateLimit(request: Request): string | null {
  const maxRequests = envNumber("PLANT_INFO_RATE_LIMIT", 12, 1, 200);
  const windowSec = envNumber("PLANT_INFO_RATE_WINDOW_SEC", 60, 10, 3600);
  const now = Date.now();
  const key = getClientIp(request);
  const prev = RATE_BUCKETS.get(key);
  if (!prev || prev.resetAt <= now) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return null;
  }
  if (prev.count >= maxRequests) {
    const waitSec = Math.max(1, Math.ceil((prev.resetAt - now) / 1000));
    return `Too many requests. Try again in about ${waitSec}s.`;
  }
  prev.count += 1;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGroqError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /\b(429|500|502|503|504)\b/.test(msg) ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("timeout") ||
    msg.toLowerCase().includes("overloaded")
  );
}

function normalizeFocus(v: unknown): PlantInfoFocus {
  if (typeof v !== "string") return "balanced";
  const x = v.trim().toLowerCase() as PlantInfoFocus;
  return FOCUS_VALUES.includes(x) ? x : "balanced";
}

function normalizeCustomQuestion(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, CUSTOM_QUESTION_MAX);
}

function parseFallbackModels(primary: string): string[] {
  const raw = process.env.GROQ_FALLBACK_MODELS?.trim();
  const models = raw
    ? raw
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    : DEFAULT_FALLBACK_MODELS;
  return models.filter((m) => m.length > 0 && m !== primary);
}

// ─── JSON / Section Parsing ───────────────────────────────────────────────────

function extractJsonBlock(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  return fence ? fence[1].trim() : t;
}

function parseBulletField(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

function isStringArray(
  v: unknown,
  minLen: number,
  maxLen: number,
): v is string[] {
  if (!Array.isArray(v)) return false;
  if (v.length < minLen || v.length > maxLen) return false;
  return v.every((x) => typeof x === "string" && x.trim().length > 0);
}

function parseSections(
  raw: string,
  focus: PlantInfoFocus,
): PlantInfoSections | null {
  const blob = extractJsonBlock(raw);
  let data: unknown;
  try {
    data = JSON.parse(blob);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;

  const overview = typeof o.overview === "string" ? o.overview.trim() : "";
  const uses =
    typeof o.uses_and_care_tips === "string" ? o.uses_and_care_tips.trim() : "";
  const trad =
    typeof o.traditional_or_cultural_notes === "string"
      ? o.traditional_or_cultural_notes.trim()
      : "";
  const idSafe =
    typeof o.identification_and_safety === "string"
      ? o.identification_and_safety.trim()
      : "";
  const disclaimer =
    typeof o.disclaimer === "string" ? o.disclaimer.trim() : "";
  const advantages = parseBulletField(o.advantages);
  const disadvantages = parseBulletField(o.disadvantages);

  // All modes require these fields
  if (!overview || !uses || !idSafe || !disclaimer) return null;

  // Per-focus structural checks
  switch (focus) {
    case "balanced":
      if (
        !isStringArray(advantages, 3, 12) ||
        !isStringArray(disadvantages, 3, 12)
      )
        return null;
      break;
    case "gardening":
      if (uses.length < 100) return null;
      if (advantages.length < 2 && disadvantages.length < 2) return null;
      break;
    case "ecology":
      if (uses.length < 60) return null;
      if (advantages.length < 2 || disadvantages.length < 2) return null;
      break;
    case "cultural":
      if (!trad || trad.length < 40) return null;
      if (advantages.length < 2 || disadvantages.length < 2) return null;
      break;
    case "concise":
      if (advantages.length !== 3 || disadvantages.length !== 3) return null;
      if (overview.length > 500) return null;
      break;
    case "custom": {
      // Short-answer mode: looser constraints — brief overview + few bullets is correct
      const isShortResponse = overview.length < 120 && uses.length < 250;
      if (isShortResponse) {
        // Short mode: just need an overview + at least 1 bullet + disclaimer
        if (!overview || advantages.length < 1) return null;
      } else {
        // Full mode: require substantive content
        if (overview.length < 60 || uses.length < 100) return null;
        if (advantages.length < 2 || disadvantages.length < 1) return null;
      }
      break;
    }
  }

  return {
    overview,
    advantages,
    disadvantages,
    uses_and_care_tips: uses,
    traditional_or_cultural_notes: trad,
    identification_and_safety: idSafe,
    disclaimer,
  };
}

// ─── Focus Matching Heuristic ─────────────────────────────────────────────────

function sectionsMatchFocus(
  sections: PlantInfoSections,
  focus: PlantInfoFocus,
  customQuestion?: string,
): boolean {
  const blob =
    `${sections.overview} ${sections.uses_and_care_tips} ${sections.traditional_or_cultural_notes}`.toLowerCase();

  switch (focus) {
    case "custom": {
      const q = customQuestion?.trim() ?? "";
      if (
        sections.overview.length < 80 ||
        sections.uses_and_care_tips.length < 200
      )
        return false;
      if (sections.advantages.length < 3 || sections.disadvantages.length < 2)
        return false;
      if (q.length < CUSTOM_QUESTION_MIN)
        return sections.uses_and_care_tips.length >= 250;
      const tokens = q
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4)
        .slice(0, 10);
      if (tokens.length === 0) return sections.uses_and_care_tips.length >= 250;
      const hits = tokens.filter((t) => blob.includes(t)).length;
      return (
        hits >= Math.min(2, tokens.length) ||
        sections.uses_and_care_tips.length >= 300
      );
    }
    case "gardening":
      return (
        sections.uses_and_care_tips.length >= 80 &&
        /\b(light|water|soil|prun|fertil|container|watering|mulch|pest|irrigat|grow|garden)\b/.test(
          blob,
        )
      );
    case "ecology":
      return /\b(native|invasive|pollinat|ecosystem|wildlife|habitat|biodivers|conservation|range)\b/.test(
        blob,
      );
    case "cultural":
      return sections.traditional_or_cultural_notes.trim().length >= 40;
    case "concise":
      return (
        sections.advantages.length === 3 &&
        sections.disadvantages.length === 3 &&
        sections.overview.length <= 450
      );
    default:
      return true;
  }
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function focusSystemInstruction(
  focus: PlantInfoFocus,
  customQuestion?: string,
): string {
  const shared = `You are an educational writing assistant for botany and plant literacy.

Hard rules:
- Educational and informational only. Never provide medical diagnosis, treatment, dosages, or instructions to ingest plants.
- If the plant may be toxic, allergenic, or confused with a toxic look-alike, state this clearly. Encourage expert identification for safety.
- Do not claim certainty from a photo label; classifiers can be wrong.
- Use clear, neutral language — accurate about risks without fearmongering.
- When web search snippets are provided, use them to ground factual claims; treat them as supplementary, not authoritative.
- Output MUST be a single valid JSON object only. No markdown fences, no preamble, no commentary.`;

  if (focus === "custom" && customQuestion?.trim()) {
    return `${shared}

The user asked a custom question. Produce a precise, professional Q&A report:
- Answer the question directly in "overview" (brief answer) and "uses_and_care_tips" (detailed answer).
- "advantages" = confirmed relevant facts; "disadvantages" = caveats or uncertainties — NOT generic plant pros/cons.
- Put numbered next steps in "traditional_or_cultural_notes" when the question is practical.
- Be detailed, accurate, and educational. State photo-ID limits clearly.

User question: "${customQuestion.trim()}"`;
  }

  return `${shared}

Active style: "${focus}" (${focusLabel(focus)}).
Write exclusively for this style. Do NOT produce a generic balanced essay unless the style is "balanced".`;
}

// ─── Response Builder ─────────────────────────────────────────────────────────

function buildStylePayload(
  plantName: string,
  focus: PlantInfoFocus,
  webMeta: PlantInfoWebSearch,
  opts: {
    sections: PlantInfoSections;
    model: string;
    degraded: boolean;
    warning?: string;
    degradedReason?: "provider_unavailable" | "missing_api_key";
    customQuestion?: string;
    answerMode?: "short" | "full";
  },
) {
  const fl = focusLabel(focus, opts.customQuestion);
  const text = formatSectionsMarkdown(focus, opts.sections, {
    plantName,
    degraded: opts.degraded,
    customQuestion: opts.customQuestion,
  });
  const highlights = buildFocusHighlights(focus, opts.sections);

  return {
    text,
    sections: opts.sections,
    focus,
    customQuestion: focus === "custom" ? opts.customQuestion : undefined,
    focusLabel: fl,
    model: opts.model,
    degraded: opts.degraded,
    degradedReason: opts.degradedReason,
    warning: opts.warning,
    highlights: highlights.length > 0 ? highlights : undefined,
    webSearch: webMeta,
    answerMode: focus === "custom" ? opts.answerMode : undefined,
  };
}

// ─── Groq Caller ─────────────────────────────────────────────────────────────

async function generateForModel(opts: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  topP: number;
}): Promise<string> {
  const {
    apiKey,
    model,
    systemInstruction,
    userPrompt,
    maxTokens,
    temperature,
    topP,
  } = opts;
  const attempts = 3;
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const client = new Groq({ apiKey });
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        // Use proper system + user message separation
        messages: [
          { role: "system", content: systemInstruction },
          {
            role: "user",
            content: `${userPrompt}\n\nRespond with a single raw JSON object only (no markdown code fences, no commentary).`,
          },
        ],
      });

      const text = response.choices[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("Empty response from Groq");
      return text;
    } catch (e) {
      lastError = e;
      if (!isTransientGroqError(e) || i === attempts - 1) break;
      await sleep(600 * (i + 1));
    }
  }
  throw lastError ?? new Error("Groq request failed.");
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const blocked = checkRateLimit(request);
  if (blocked) {
    return NextResponse.json({ detail: blocked }, { status: 429 });
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();

  let body: {
    plantName?: unknown;
    classificationNote?: unknown;
    focus?: unknown;
    customQuestion?: unknown;
    includeWebSearch?: unknown;
    numSearchResults?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  const plantName =
    typeof body.plantName === "string" ? body.plantName.trim() : "";
  if (!plantName) {
    return NextResponse.json(
      { detail: "plantName is required." },
      { status: 400 },
    );
  }

  const focus = normalizeFocus(body.focus);
  const customQuestion = normalizeCustomQuestion(body.customQuestion);
  const answerMode = focus === "custom" && customQuestion
    ? detectAnswerMode(customQuestion)
    : undefined;

  if (focus === "custom" && customQuestion.length < CUSTOM_QUESTION_MIN) {
    return NextResponse.json(
      {
        detail: `For a custom question, provide customQuestion (${CUSTOM_QUESTION_MIN}–${CUSTOM_QUESTION_MAX} characters).`,
      },
      { status: 400 },
    );
  }

  const wantSearch = body.includeWebSearch === true;
  const defaultNum = envNumber("WEB_SEARCH_NUM_RESULTS", 5, 1, 10);
  const numSearch =
    typeof body.numSearchResults === "number" &&
    Number.isFinite(body.numSearchResults)
      ? clamp(Math.floor(body.numSearchResults), 1, 10)
      : defaultNum;

  const classificationNote =
    typeof body.classificationNote === "string"
      ? body.classificationNote.trim()
      : "";

  const modelId = process.env.GROQ_MODEL?.trim() || "llama3-70b-8192";

  const temperatureBase = envNumber("GROQ_TEMPERATURE", 0.65, 0, 2);
  const temperature =
    focus === "concise"
      ? Math.min(temperatureBase, 0.5)
      : focus === "custom"
        ? Math.min(temperatureBase, 0.4)
        : temperatureBase;
  const topP = envNumber("GROQ_TOP_P", 0.9, 0, 1);
  const maxTokens =
    focus === "concise"
      ? envNumber("GROQ_MAX_OUTPUT_TOKENS_CONCISE", 1024, 256, 8192)
      : focus === "custom"
        ? envNumber("GROQ_MAX_OUTPUT_TOKENS_CUSTOM", 8192, 1024, 8192)
        : envNumber("GROQ_MAX_OUTPUT_TOKENS", 8192, 512, 8192);

  // ── Web search ──
  const webMeta: PlantInfoWebSearch = {
    requested: wantSearch,
    used: false,
    provider: null,
    results: [],
  };

  let searchContext = "";
  if (wantSearch) {
    try {
      const { provider, results } = await webSearchPlantContext(
        plantName,
        numSearch,
      );
      webMeta.provider = provider;
      webMeta.results = results;
      if (provider && results.length > 0) {
        webMeta.used = true;
        searchContext = formatSearchContext(results);
      } else {
        webMeta.note =
          "Web search skipped: set SERPAPI_API_KEY or GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID on the server.";
      }
    } catch (e) {
      webMeta.note = e instanceof Error ? e.message : "Web search failed.";
    }
  }

  const userPrompt = buildPlantInfoUserPrompt(
    plantName,
    focus,
    classificationNote,
    searchContext,
    customQuestion,
  );
  const systemInstruction = focusSystemInstruction(focus, customQuestion);

  // ── Fallback when no API key ──
  if (!apiKey) {
    const fallback = buildFallbackSections(
      plantName,
      focus,
      classificationNote,
      webMeta.results,
      customQuestion,
    );
    return NextResponse.json(
      buildStylePayload(plantName, focus, webMeta, {
        sections: fallback,
        model: "fallback-template",
        degraded: true,
        degradedReason: "missing_api_key",
        customQuestion: focus === "custom" ? customQuestion : undefined,
        answerMode,
        warning:
          focus === "custom"
            ? "Live Groq is not configured. Showing a draft answer to your question. Add GROQ_API_KEY in web/.env.local for AI-generated answers."
            : "Live Groq is not configured. Showing an enhanced draft report in your selected style. Add GROQ_API_KEY in web/.env.local for AI-generated text.",
      }),
    );
  }

  // ── Try primary + fallback models ──
  try {
    const candidates = [modelId, ...parseFallbackModels(modelId)];
    let rawText = "";
    let usedModel = modelId;
    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        rawText = await generateForModel({
          apiKey,
          model: candidate,
          systemInstruction,
          userPrompt,
          maxTokens,
          temperature,
          topP,
        });
        usedModel = candidate;
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        if (!isTransientGroqError(e)) break;
      }
    }

    if (lastError) throw lastError;

    if (!rawText?.trim()) {
      return NextResponse.json(
        { detail: "Empty response from Groq." },
        { status: 502 },
      );
    }

    let sections = parseSections(rawText.trim(), focus);
    let degraded = false;
    let warning: string | undefined;

    if (!sections) {
      sections = buildFallbackSections(
        plantName,
        focus,
        classificationNote,
        webMeta.results,
        customQuestion,
      );
      degraded = true;
      warning =
        focus === "custom"
          ? "Groq returned an unexpected format. Showing a draft answer to your question instead."
          : "Groq returned an unexpected format. Showing a detailed style-specific draft report instead.";
    } else if (!sectionsMatchFocus(sections, focus, customQuestion)) {
      sections = buildFallbackSections(
        plantName,
        focus,
        classificationNote,
        webMeta.results,
        customQuestion,
      );
      degraded = true;
      warning =
        focus === "custom"
          ? "Groq did not fully address your question. Showing a draft answer aligned to what you asked."
          : `Groq did not fully match the ${focusLabel(focus)} style. Showing a detailed draft aligned to your selection.`;
    }

    return NextResponse.json(
      buildStylePayload(plantName, focus, webMeta, {
        sections,
        model: usedModel,
        degraded,
        warning,
        customQuestion: focus === "custom" ? customQuestion : undefined,
        answerMode,
      }),
    );
  } catch {
    const fallback = buildFallbackSections(
      plantName,
      focus,
      classificationNote,
      webMeta.results,
      customQuestion,
    );
    return NextResponse.json(
      buildStylePayload(plantName, focus, webMeta, {
        sections: fallback,
        model: "fallback-template",
        degraded: true,
        degradedReason: "provider_unavailable",
        customQuestion: focus === "custom" ? customQuestion : undefined,
        warning:
          focus === "custom"
            ? "Groq is temporarily unavailable. Showing a draft answer to your custom question."
            : `Groq is temporarily unavailable. Showing a detailed ${focusLabel(focus)} draft report.`,
      }),
      { status: 200 },
    );
  }
}
