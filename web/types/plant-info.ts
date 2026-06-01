/**
 * plant-info.ts — Enhanced type definitions for PlantAI Leaf Identifier
 * Matches all imports and usage in page.tsx exactly.
 */

// ─── Core section structure ───────────────────────────────────────────────────

/** Structured plant description returned by /api/plant-info */
export type PlantInfoSections = {
  /** 1–3 sentence overview / direct answer for the chosen focus */
  overview: string;
  /** Positive traits, benefits, or supporting evidence (bullet list) */
  advantages: string[];
  /** Risks, downsides, caveats, or limitations (bullet list) */
  disadvantages: string[];
  /** Growing instructions, uses, care tips, or in-depth elaboration */
  uses_and_care_tips: string;
  /** Heritage context, ethnobotany, non-medical cultural uses */
  traditional_or_cultural_notes: string;
  /** ID features, lookalike warnings, safety guidance */
  identification_and_safety: string;
  /** Mandatory medical / professional advice disclaimer */
  disclaimer: string;
};

// ─── Focus modes ─────────────────────────────────────────────────────────────

/**
 * Report focus selected by the user in the sidebar.
 *
 * | Value      | Layout used                           |
 * |------------|---------------------------------------|
 * | balanced   | Full structured report (all sections) |
 * | gardening  | Care-centric (light/soil/water/pests) |
 * | ecology    | Habitat, wildlife, conservation       |
 * | cultural   | Heritage context, non-medical uses    |
 * | concise    | Key-points only (compact density)     |
 * | custom     | User-supplied question → Q&A layout   |
 */
export type PlantInfoFocus =
  | "balanced"
  | "gardening"
  | "ecology"
  | "cultural"
  | "concise"
  | "custom";

// ─── Web-search types ─────────────────────────────────────────────────────────

/** Which search provider was used (or null if none). */
export type WebSearchProvider = "serpapi" | "google_cse" | null;

/** A single search result hit. */
export type WebSearchHit = {
  title: string;
  snippet: string;
  url: string;
};

/** Full web-search metadata attached to every /api/plant-info response. */
export type PlantInfoWebSearch = {
  /** Whether the user requested web search for this report. */
  requested: boolean;
  /** Whether search was actually executed and results were used. */
  used: boolean;
  /** The provider that ran the search, or null when skipped. */
  provider: WebSearchProvider;
  /** Up to `numSearchResults` hits (default 5). Empty when not used. */
  results: WebSearchHit[];
  /** Human-readable reason search was skipped (e.g. "No API key configured"). */
  note?: string;
};

// ─── Degraded-mode reason ─────────────────────────────────────────────────────

/**
 * Why the response fell back to a draft / template.
 *
 * - `provider_unavailable` — the LLM provider returned an error.
 * - `missing_api_key`      — required env var was absent at runtime.
 */
export type DegradedReason = "provider_unavailable" | "missing_api_key";

// ─── Answer mode (custom focus only) ─────────────────────────────────────────

/**
 * Only present when `focus === "custom"`.
 *
 * - `"short"` — one-shot factual answer rendered with `CustomShortAnswerLayout`.
 * - `"full"`  — multi-section deep-dive rendered with `CustomFullAnswerLayout`.
 */
export type AnswerMode = "short" | "full";

// ─── Full API response ────────────────────────────────────────────────────────

/**
 * Shape of the JSON body returned by POST /api/plant-info.
 *
 * Both `text` (raw markdown fallback) and `sections` (structured) are
 * present when parsing succeeded; only `text` is guaranteed when the
 * model returned unparseable output.
 */
export type PlantInfoResponse = {
  /** Raw markdown text (always present; used as fallback when sections is null). */
  text: string;

  /**
   * Structured sections parsed from the model's JSON output.
   * `null` when the model returned unparseable content.
   */
  sections: PlantInfoSections | null;

  /** Echo of the focus mode used to generate this report. */
  focus: PlantInfoFocus;

  /**
   * The user's custom question, echoed back by the server.
   * Only present when `focus === "custom"`.
   */
  customQuestion?: string;

  /** Human-readable label for the focus (e.g. "Grow & care guide"). */
  focusLabel?: string;

  /**
   * Model identifier string (e.g. "claude-3-haiku-20240307").
   * Absent when the response is a static template.
   */
  model?: string;

  /**
   * `true` when the response is a template / draft rather than a live
   * model completion (e.g. provider down or API key missing).
   */
  degraded?: boolean;

  /** Structured reason for degraded mode. */
  degradedReason?: DegradedReason;

  /**
   * Free-text warning shown in the report header banner.
   * Used for soft disclaimers that don't justify hard errors.
   */
  warning?: string;

  /**
   * 2–4 one-line bullets surfaced in "at a glance" / draft-mode UI.
   * Always `string[]`; empty array when none.
   */
  highlights?: string[];

  /** Full web-search metadata; always present in the response envelope. */
  webSearch: PlantInfoWebSearch;

  /**
   * Answer mode for custom-focus reports.
   * `"short"` = concise Q&A card; `"full"` = rich multi-section layout.
   * Only present when `focus === "custom"`.
   */
  answerMode?: AnswerMode;
};

// ─── Runtime type guards ──────────────────────────────────────────────────────

/**
 * Narrows an unknown value to `PlantInfoSections`.
 * Used in page.tsx after JSON.parse to validate the API response shape.
 */
export function isPlantInfoSections(
  value: unknown,
): value is PlantInfoSections {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<PlantInfoSections>;
  return (
    typeof s.overview === "string" &&
    Array.isArray(s.advantages) &&
    Array.isArray(s.disadvantages) &&
    typeof s.uses_and_care_tips === "string" &&
    typeof s.traditional_or_cultural_notes === "string" &&
    typeof s.identification_and_safety === "string" &&
    typeof s.disclaimer === "string"
  );
}

/**
 * Narrows an unknown value to `PlantInfoWebSearch`.
 * Used in page.tsx to validate the webSearch envelope from the API.
 */
export function isPlantInfoWebSearch(
  value: unknown,
): value is PlantInfoWebSearch {
  if (!value || typeof value !== "object") return false;
  const ws = value as Partial<PlantInfoWebSearch>;
  return (
    typeof ws.requested === "boolean" &&
    typeof ws.used === "boolean" &&
    (ws.provider === "serpapi" ||
      ws.provider === "google_cse" ||
      ws.provider === null) &&
    Array.isArray(ws.results)
  );
}

/**
 * Narrows an unknown value to `AnswerMode`.
 */
export function isAnswerMode(value: unknown): value is AnswerMode {
  return value === "short" || value === "full";
}

/**
 * Narrows an unknown value to `PlantInfoFocus`.
 */
export function isPlantInfoFocus(value: unknown): value is PlantInfoFocus {
  return (
    value === "balanced" ||
    value === "gardening" ||
    value === "ecology" ||
    value === "cultural" ||
    value === "concise" ||
    value === "custom"
  );
}

// ─── Display helpers (used by display_section.tsx) ───────────────────────────

/**
 * Returns `true` when a `PlantInfoSections` object has enough content to
 * render a full multi-section report rather than a compact summary.
 */
export function hasSufficientContent(sections: PlantInfoSections): boolean {
  const wordCount = [
    sections.overview,
    sections.uses_and_care_tips,
    sections.traditional_or_cultural_notes,
    sections.identification_and_safety,
    ...sections.advantages,
    ...sections.disadvantages,
  ]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  return wordCount >= 120;
}

/**
 * Returns the total word count across all text fields in a `PlantInfoSections`
 * object. Used by `display_section.tsx` to derive layout density.
 */
export function sectionWordCount(sections: PlantInfoSections): number {
  return [
    sections.overview,
    sections.uses_and_care_tips,
    sections.traditional_or_cultural_notes,
    sections.identification_and_safety,
    ...sections.advantages,
    ...sections.disadvantages,
  ]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

// ─── Focus metadata ───────────────────────────────────────────────────────────

/** Static metadata for each focus mode, mirroring FOCUS_OPTIONS in page.tsx. */
export const FOCUS_META: Record<
  PlantInfoFocus,
  { label: string; hint: string }
> = {
  balanced: {
    label: "Balanced overview",
    hint: "Pros, cons, uses, and safety in one report",
  },
  gardening: {
    label: "Grow & care guide",
    hint: "Cultivation — light, soil, water, pests",
  },
  ecology: {
    label: "Ecological role",
    hint: "Habitat, wildlife, invasiveness, conservation",
  },
  cultural: {
    label: "Cultural history",
    hint: "Heritage context and non-medical uses",
  },
  concise: {
    label: "Short summary",
    hint: "Essential key points only",
  },
  custom: {
    label: "Ask my own question…",
    hint: "Write any question — AI answers your exact wording",
  },
};
