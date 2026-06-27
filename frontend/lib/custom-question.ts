/**
 * custom-question.ts — Topic detection and semantic title generation for custom questions
 *
 * Analyzes user questions to:
 * 1. Detect question intent (safety, care, distribution, ecology, culture, identification, general)
 * 2. Determine answer depth (short factual vs. full multi-section)
 * 3. Generate topic-aware section titles for display-section.tsx rendering
 *
 * Integrates with: plant-display.ts (applyCustomTitles), display_section.tsx (customTopicLabel)
 * Styled via: TONE_STYLES in display_section.tsx
 */

// ─── Topic classification ──────────────────────────────────────────────────

/**
 * Seven topic categories that trigger different content strategies:
 *
 * - "safety"       → Toxicity, allergens, pet/child risks (amber/caution tone)
 * - "care"         → Growing, watering, light, soil (positive tone with cautions)
 * - "distribution" → Where it grows, regional prevalence (neutral tone)
 * - "ecology"      → Habitat, invasiveness, wildlife value (mixed positive/caution)
 * - "culture"      → History, folklore, heritage uses (neutral/violet tone)
 * - "identification" → How to tell species apart, lookalikes (neutral tone)
 * - "general"      → Default for unclear or mixed questions (neutral)
 */
export type CustomQuestionTopic =
  | "safety"
  | "care"
  | "distribution"
  | "ecology"
  | "culture"
  | "identification"
  | "general";

/**
 * Semantic section titles that adapt to the detected topic.
 * Used by display_section.tsx to label report sections contextually.
 *
 * Example:
 * - Safety question: "overview" → "Safety summary", "detailed" → "Detailed safety assessment"
 * - Care question: "overview" → "Quick answer", "detailed" → "Growing & care guide"
 */
export type CustomSectionTitles = {
  overview: string; // Lead paragraph / direct answer
  detailed: string; // In-depth elaboration (uses_and_care_tips field)
  facts: string; // Supporting bullet points (advantages field)
  caveats: string; // Limitations / counters (disadvantages field)
  steps: string; // Actionable next steps (traditional_or_cultural_notes field)
  verification: string; // Safety / verification note (identification_and_safety field)
};

/**
 * Answer depth mode for custom questions.
 * Short-answer questions get a concise direct response.
 * Full-answer questions receive a multi-section report.
 *
 * Determined by: question length, syntax patterns, explicit phrases.
 */
export type CustomAnswerMode = "short" | "full";

// ─── Short-answer detection patterns ───────────────────────────────────────

/**
 * Regex patterns for questions expecting yes/no or factual single-line answers.
 * Questions matching these patterns + short length → "short" answer mode.
 *
 * Covers:
 * - Auxiliaries: "Is...", "Does...", "Can...", "Will..."
 * - WH-questions seeking facts: "What color?", "Where does it grow?", "How tall?"
 * - Binary prompts: "toxic?", "edible?", "poisonous?"
 */
const SHORT_ANSWER_PATTERNS: RegExp[] = [
  /^(is|are|does|do|can|will|was|has|have|did|could|should|would)\b/i,
  /^(what (color|colour|size|height|shape|smell|taste|name|family|genus|type|kind))/i,
  /^(how (many|much|long|tall|wide|big|old|fast|often|deep))/i,
  /^(where (is|does|can|do|are|was|did|grow|found|native|live|come from))/i,
  /^(when (does|do|is|was|will|should|can))/i,
  /^(which (part|region|season|month|country|state))/i,
  /\b(yes or no|true or false|toxic\?|edible\?|safe\?|poisonous\?|invasive\?)\b/i,
];

/**
 * Detects whether a custom question should receive a brief direct answer or a full report.
 *
 * Heuristics:
 * 1. Short questions (<80 chars) matching SHORT_ANSWER_PATTERNS → "short"
 * 2. Questions with "how to", "explain", "describe", "tell me" → "full"
 * 3. Multi-part questions (multiple "?" or "and...?") → "full"
 * 4. Default: short (<60 chars), full (≥60 chars)
 *
 * Used by: display_section.tsx to select CustomShortAnswerLayout vs CustomFullAnswerLayout
 */
export function detectAnswerMode(question: string): CustomAnswerMode {
  const q = question.trim();

  // Pattern 1: Short syntactic questions
  if (q.length < 80 && SHORT_ANSWER_PATTERNS.some((p) => p.test(q))) {
    return "short";
  }

  // Pattern 2: Explicit pedagogical requests
  if (
    /\b(how to|how do i|explain|tell me (about|more)|describe|what are the|give me|walk me|detail|elaborate)\b/i.test(
      q,
    )
  ) {
    return "full";
  }

  // Pattern 3: Multi-question compound
  if (/\band\b.{10,}|[?].*[?]/.test(q)) {
    return "full";
  }

  // Default: length-based
  return q.length < 60 ? "short" : "full";
}

// ─── Topic detection ──────────────────────────────────────────────────────

/**
 * Classifies a custom question into one of seven topic categories.
 * Uses keyword patterns to infer user intent.
 *
 * Fallback: "general" for ambiguous or mixed-topic questions.
 */
export function detectCustomQuestionTopic(
  question: string,
): CustomQuestionTopic {
  const q = question.toLowerCase();

  // Safety: toxicity, edibility, allergens, pet/child safety
  if (
    /\b(toxic|poison|dangerous|safe|safety|eat|edible|consume|ingest|pet|dog|cat|child|allerg|irritat)\b/.test(
      q,
    )
  ) {
    return "safety";
  }

  // Care: cultivation, watering, light, soil, propagation
  if (
    /\b(grow|care|water|soil|fertiliz|prun|plant|garden|indoor|pot|sunlight|shade|winter|hardiness)\b/.test(
      q,
    )
  ) {
    return "care";
  }

  // Distribution: geographic range, regional occurrence
  if (
    /\b(where|which region|found|distribution|native range|in india|location|state)\b/.test(
      q,
    )
  ) {
    return "distribution";
  }

  // Ecology: habitat, invasiveness, wildlife, conservation
  if (
    /\b(native|invasive|ecolog|wildlife|pollinat|habitat|environment|conservation|biodivers)\b/.test(
      q,
    )
  ) {
    return "ecology";
  }

  // Culture: history, folklore, heritage, traditions
  if (
    /\b(culture|history|tradition|folklore|heritage|symbol|religious|ceremon)\b/.test(
      q,
    )
  ) {
    return "culture";
  }

  // Identification: how to tell apart, lookalikes, distinguishing features
  if (
    /\b(identify|identification|look.?alike|confus|species|tell apart|difference between)\b/.test(
      q,
    )
  ) {
    return "identification";
  }

  // Default: general / unclassified
  return "general";
}

// ─── Semantic title mapping ───────────────────────────────────────────────

/**
 * Maps (topic, section) → semantic title.
 *
 * For example, if user asks "Is this toxic?":
 * - topic = "safety"
 * - overview → "Safety summary"
 * - detailed → "Detailed safety assessment"
 * - facts → "Known risk factors"
 * - caveats → "Uncertainties & mis-ID risks"
 *
 * Ensures each section heading contextualizes content for the user's intent.
 */
const TITLE_MAP: Record<CustomQuestionTopic, CustomSectionTitles> = {
  safety: {
    overview: "Safety summary",
    detailed: "Detailed safety assessment",
    facts: "Known risk factors",
    caveats: "Uncertainties & mis-ID risks",
    steps: "Protective measures",
    verification: "Confirm identity before acting",
  },
  care: {
    overview: "Quick answer",
    detailed: "Growing & care guide",
    facts: "Cultivation essentials",
    caveats: "Common pitfalls",
    steps: "Recommended care steps",
    verification: "Confirm species before care",
  },
  distribution: {
    overview: "Direct location answer",
    detailed: "Regional distribution details",
    facts: "Geographic evidence",
    caveats: "Distribution limits",
    steps: "How to verify locally",
    verification: "Location confidence note",
  },
  ecology: {
    overview: "Ecological summary",
    detailed: "Habitat & environmental impact",
    facts: "Ecological benefits",
    caveats: "Environmental concerns",
    steps: "Responsible planting",
    verification: "Field verification",
  },
  culture: {
    overview: "Cultural summary",
    detailed: "Historical & cultural context",
    facts: "Documented significance",
    caveats: "Cautions & regional variation",
    steps: "Further research",
    verification: "Source verification",
  },
  identification: {
    overview: "Identification summary",
    detailed: "How to verify this plant",
    facts: "Key identifying traits",
    caveats: "Look-alikes & confusion risks",
    steps: "Step-by-step verification",
    verification: "Safety while identifying",
  },
  general: {
    overview: "Direct answer",
    detailed: "In-depth response",
    facts: "Supporting facts",
    caveats: "Limits & caveats",
    steps: "Practical next steps",
    verification: "Verification & safety",
  },
};

/**
 * Returns topic-specific section titles for a custom question.
 *
 * Usage in plant-display.ts (applyCustomTitles):
 *   const titles = customSectionTitles(userQuestion);
 *   block.title = titles.overview;  // "Safety summary" or "Quick answer" etc.
 */
export function customSectionTitles(question: string): CustomSectionTitles {
  const topic = detectCustomQuestionTopic(question);
  return TITLE_MAP[topic];
}

// ─── Topic label (for display) ─────────────────────────────────────────────

/**
 * Human-readable label for the detected topic.
 * Displayed as a badge in the custom question header (display_section.tsx).
 *
 * Example: "Safety & toxicity", "Growing & care", "Identification"
 */
const TOPIC_LABELS: Record<CustomQuestionTopic, string> = {
  safety: "Safety & toxicity",
  care: "Growing & care",
  distribution: "Distribution & region",
  ecology: "Ecology & environment",
  culture: "Cultural & historical",
  identification: "Identification",
  general: "General",
};

/**
 * Retrieves the human-readable badge label for a question's detected topic.
 *
 * Usage: CustomAnswerDisplay header shows the topic label as a Pill component.
 */
export function customTopicLabel(question: string): string {
  const topic = detectCustomQuestionTopic(question);
  return TOPIC_LABELS[topic];
}
