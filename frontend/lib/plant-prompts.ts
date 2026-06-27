import type { PlantInfoFocus } from "@/types/plant-info";
import { focusLabel } from "@/lib/plant-fallback";
import { detectAnswerMode } from "@/lib/custom-question";

// ─── Shared JSON schema instruction ───────────────────────────────────────────

const JSON_SCHEMA = `OUTPUT: One valid JSON object only — no markdown fences, no prose, no commentary.

Required keys (all must be present):
  "overview"                    → string
  "advantages"                  → string[]  (non-empty items only)
  "disadvantages"               → string[]  (non-empty items only)
  "uses_and_care_tips"          → string
  "traditional_or_cultural_notes" → string  (may be "" if not applicable)
  "identification_and_safety"   → string
  "disclaimer"                  → string

Rules: double quotes, no trailing commas, no null values, no nested objects.`;

// ─── Per-focus field specifications ───────────────────────────────────────────

const FOCUS_RULES: Record<PlantInfoFocus, string> = {
  balanced: `${JSON_SCHEMA}

STYLE — Balanced overview (the ONLY mode that uses generic pros vs. cons):
• overview           2–5 sentences: plant identity, key traits, photo-ID uncertainty.
• advantages         4–8 bullets — general benefits (ecological, ornamental, practical).
• disadvantages      4–8 bullets — general risks (toxicity, invasiveness, look-alike confusion).
• uses_and_care_tips One paragraph covering non-medical uses AND general care basics.
• traditional_or_cultural_notes  One short paragraph if significant history exists; else "".
• identification_and_safety      Verification steps + safety caution.
• disclaimer         One sentence: educational use only, not medical advice.`,

  gardening: `${JSON_SCHEMA}

STYLE — Gardening & care (cultivation focus, NOT a generic pros/cons essay):
• overview           2–4 sentences on growing this plant (hardiness, size, garden role).
• advantages         4–8 bullets labeled CULTIVATION HIGHLIGHTS — ease of growth, ornamental
                     value, harvest potential, companion planting, container suitability.
• disadvantages      4–8 bullets labeled GARDENING CHALLENGES — pest susceptibility, watering
                     demands, climate limits, toxicity risk for pets/children.
• uses_and_care_tips LONGEST section (≥ 6 sentences): light, soil, water, fertilizer, pruning,
                     container growing, seasonal tasks, common pests & solutions.
• traditional_or_cultural_notes "" unless directly relevant to garden history.
• identification_and_safety  Confirm species before applying care advice; mis-ID risks.
• disclaimer         One sentence: informational only, consult local extension services.`,

  ecology: `${JSON_SCHEMA}

STYLE — Ecology & environment (habitat/wildlife focus, NOT gardening how-to):
• overview           2–4 sentences: native range, preferred habitat, ecological role.
• advantages         4–8 bullets — ECOLOGICAL BENEFITS ONLY (pollinators, wildlife food,
                     soil stabilization, native habitat support, carbon sequestration).
• disadvantages      4–8 bullets — ENVIRONMENTAL RISKS ONLY (invasive spread, habitat
                     displacement, allelopathy, pollen allergies in sensitive ecosystems).
• uses_and_care_tips Habitat preferences, invasive status, conservation context — NOT
                     home potting schedules.
• traditional_or_cultural_notes "" unless ecological folklore is scientifically notable.
• identification_and_safety  Mis-ID risks affecting conservation decisions.
• disclaimer         One sentence: educational/informational only.`,

  cultural: `${JSON_SCHEMA}

STYLE — Cultural & historical (heritage context; NEVER medical dosages or ingestion advice):
• overview           2–4 sentences: cultural recognition and regional significance.
• advantages         4–8 bullets — CULTURAL SIGNIFICANCE (heritage use, art, festivals,
                     religious symbolism, educational value) — NOT ecological or gardening.
• disadvantages      4–8 bullets — CAUTIONS (misinformation risk, regional variation,
                     mis-identification, loss of traditional knowledge).
• uses_and_care_tips Documented non-medical uses: ornamental, craft, cuisine as general
                     cultural facts only — no dosage, no ingestion instructions.
• traditional_or_cultural_notes REQUIRED non-empty paragraph: folklore, mythology,
                     ceremonial use, or historical trade significance.
• identification_and_safety  Cultural use does not replace botanical identification.
• disclaimer         One sentence: not medical advice; consult ethnobotanists.`,

  // custom is built dynamically below — placeholder
  custom: JSON_SCHEMA,

  concise: `${JSON_SCHEMA}

STYLE — Short summary (brief everywhere; advantages + disadvantages merged in the UI):
• overview           1–2 sentences only — the essential identity fact.
• advantages         EXACTLY 3 short bullets (key positives or facts).
• disadvantages      EXACTLY 3 short bullets (key risks or caveats).
• uses_and_care_tips 2–3 sentences maximum.
• traditional_or_cultural_notes "" or one short sentence if notable.
• identification_and_safety  2–3 sentences maximum.
• disclaimer         One short sentence.`,
};

// ─── Custom Q&A prompt — SHORT mode ──────────────────────────────────────────

function buildShortCustomRules(q: string): string {
  return `${JSON_SCHEMA}

STYLE — Short Q&A (DIRECT ANSWER mode for a brief factual question):
The user's question is: "${q}"

This is a SHORT-ANSWER question. Be crisp and direct. DO NOT write a long essay.

Field mapping:
• overview           ONE concise answer sentence (1–2 sentences MAX). State the answer plainly.
                     Example: "Yes, this plant is toxic to cats." or "No, it is not invasive in this region."
• advantages         3–5 short bullet points — SUPPORTING EVIDENCE for your answer.
                     Each bullet must be a single statement of fact, ≤ 15 words.
                     Format: plain strings, no markdown, no leading dashes.
• disadvantages      2–4 short bullet points — KEY CAVEATS, exceptions, or mis-ID risks.
                     Each bullet ≤ 15 words.
• uses_and_care_tips 2–3 sentences ONLY. Expand the answer slightly with practical context.
                     Do NOT pad this — stop when you've said what's needed.
• traditional_or_cultural_notes "" (leave blank)
• identification_and_safety  One sentence warning about photo-ID uncertainty.
• disclaimer         One short sentence: educational use only.`;
}

// ─── Custom Q&A prompt — FULL mode ────────────────────────────────────────────

function buildFullCustomRules(q: string): string {
  return `${JSON_SCHEMA}

STYLE — Full Q&A report (DETAILED ANSWER mode for a complex or multi-part question):
The user's question is: "${q}"

This question requires a THOROUGH, multi-section response.

Field mapping:
• overview           3–5 sentences. Restate the question briefly, then give the key answer
                     with important qualifications. State photo-ID uncertainty.
• advantages         4–7 bullets — CONFIRMED FACTS / EVIDENCE directly supporting the answer.
                     Each bullet is specific, educational, and plant-specific (not generic).
                     No markdown, no leading dashes — plain strings only.
• disadvantages      3–6 bullets — UNCERTAINTIES, CAVEATS, LIMITS to the answer.
                     Mis-ID risk, regional variation, missing context, exceptions.
                     Each bullet is a distinct point, ≤ 25 words.
• uses_and_care_tips MAIN DETAILED ANSWER — ≥ 5 sentences of practical, educational depth.
                     Use clear prose. Cover all meaningful sub-topics of the question.
                     This is the most important field — do NOT truncate it.
• traditional_or_cultural_notes If the question involves history/culture, add context here.
                     Otherwise write "".
• identification_and_safety  Verification steps and safety warnings relevant to this question.
• disclaimer         One professional educational disclaimer sentence.`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildPlantInfoUserPrompt(
  plantName: string,
  focus: PlantInfoFocus,
  classificationNote: string,
  searchBlock: string,
  customQuestion?: string,
): string {
  const note = classificationNote.trim()
    ? `\nClassifier context (may be inaccurate): ${classificationNote.trim()}`
    : "";

  const search =
    searchBlock.trim().length > 0
      ? `\n\n─── Web search snippets (supplementary only) ───\n${searchBlock.trim()}\n────────────────────────────────────────────────\nUse snippets to ground factual claims; prefer caution when snippets conflict.\n`
      : "";

  // Custom focus: choose short vs. full mode dynamically
  if (focus === "custom") {
    const q = customQuestion?.trim() ?? "";
    const mode = detectAnswerMode(q);
    const rules = mode === "short"
      ? buildShortCustomRules(q)
      : buildFullCustomRules(q);

    return `You are a knowledgeable botanist answering a question about a plant identified from a leaf photo.

Plant label (classifier guess — may be wrong): "${plantName}".${note}

USER QUESTION: "${q}"

Answer mode: ${mode === "short" ? "SHORT — be direct and concise" : "FULL — be thorough and detailed"}.

Instructions:
1. Answer the USER QUESTION directly. Never substitute a generic plant essay.
2. Be specific and factual. Every sentence must earn its place.
3. NEVER provide medical dosages, ingestion instructions, or treatment advice.
4. If a definitive answer needs in-person verification, say so, then give the best educational guidance.

${rules}${search}`;
  }

  // Non-custom focus
  const styleHint =
    focus === "balanced"
      ? "Use advantages/disadvantages as classic pros and cons."
      : focus === "concise"
        ? "Keep all sections brief; advantages and disadvantages will be merged in the UI as key points."
        : `Do NOT write a generic balanced pros/cons essay. Fill advantages/disadvantages with ${focus}-specific bullet content only.`;

  return `You are producing a structured plant information report from a leaf photo identification.

Plant label: "${plantName}".${note}

Selected report style: ${focusLabel(focus)} ("${focus}").
Answer ONLY what this style specifies. ${styleHint}

${FOCUS_RULES[focus]}${search}`;
}

/**
 * Exported so the API route can detect answer mode without re-running detectAnswerMode
 * (avoids importing from custom-question.ts in two places).
 */
export { detectAnswerMode };
