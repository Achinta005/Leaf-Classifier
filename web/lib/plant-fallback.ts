/**
 * plant-fallback.ts — Fallback / draft report generation
 *
 * When live LLM is unavailable (provider down, API key missing):
 * - Generates rich PlantInfoSections content using templates
 * - Mirrors all 6 focus modes: balanced, gardening, ecology, cultural, concise, custom
 * - Adapts tone and detail based on focus and (for custom) detected question topic
 * - Surfaces regional hints from web search results when available
 *
 * Integrates with: display_section.tsx (degraded flag), custom-question.ts (detectCustomQuestionTopic)
 * Styled via: TONE_STYLES in display_section.tsx (positive/caution/neutral colors)
 */

import { detectCustomQuestionTopic } from "@/lib/custom-question";
import type {
  PlantInfoFocus,
  PlantInfoSections,
  WebSearchHit,
} from "@/types/plant-info";

// ─── Focus label lookup ───────────────────────────────────────────────────

/**
 * Maps focus modes to human-readable labels for fallback report headers.
 * Used when degraded=true to show "Draft report via [label]"
 */
const FOCUS_LABELS: Record<Exclude<PlantInfoFocus, "custom">, string> = {
  balanced: "Balanced overview",
  gardening: "Gardening & care",
  ecology: "Ecology & environment",
  cultural: "Cultural & historical",
  concise: "Short summary",
};

/**
 * Returns a display label for any focus mode (including custom).
 * For custom: truncates user's question if >72 chars.
 */
export function focusLabel(
  focus: PlantInfoFocus,
  customQuestion?: string,
): string {
  if (focus === "custom") {
    const q = customQuestion?.trim() ?? "";
    if (!q) return "Custom question";
    return q.length > 72 ? `${q.slice(0, 69)}…` : q;
  }
  return FOCUS_LABELS[focus];
}

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Universal disclaimer for all draft/fallback reports.
 * Emphasizes educational context and photo-based ID limitations.
 */
const DISCLAIMER =
  "This report is for educational purposes only and is not medical advice. Photo-based identification can be wrong—always confirm the species with multiple features and, when needed, a qualified expert before use, planting, or removal.";

// ─── Helpers: context extraction ───────────────────────────────────────────

/**
 * Cleans classifier context note by removing metadata noise.
 * Removes lines like "Classifier context (may be wrong):" to show only confidence scores.
 */
function cleanNote(note: string): string {
  return note.replace(/\nClassifier context \(may be wrong\): /, "").trim();
}

/**
 * Extracts a comma-separated insight from web search snippets.
 * Used to ground fallback content in real references when available.
 *
 * Example: "Public reference themes include: Wikipedia mentions leaves are..., Field guide states..."
 */
function searchInsight(hits: WebSearchHit[]): string {
  if (!hits.length) return "";
  const snippets = hits
    .slice(0, 3)
    .map((h) => h.snippet.trim())
    .filter(Boolean);
  if (!snippets.length) return "";
  return ` Public reference themes include: ${snippets.join(" ")}`;
}

/**
 * Extracts Indian state names from web search results.
 * Used for distribution questions about Indian regions.
 *
 * Geographic specificity helps users in South Asia locate plants locally.
 */
function extractIndianRegions(hits: WebSearchHit[]): string[] {
  if (!hits.length) return [];
  const text = hits
    .map((h) => `${h.title} ${h.snippet}`)
    .join(" ")
    .toLowerCase();
  const labels = [
    "West Bengal",
    "Odisha",
    "Assam",
    "Kerala",
    "Tamil Nadu",
    "Karnataka",
    "Andhra Pradesh",
    "Telangana",
    "Maharashtra",
    "Uttar Pradesh",
    "Bihar",
    "Northeast India",
    "Eastern India",
    "Southern India",
    "Coastal India",
  ];
  return labels.filter((label) => text.includes(label.toLowerCase()));
}

// ─── Draft input type ─────────────────────────────────────────────────────

/**
 * Minimal context passed to each draft builder.
 * Builders use this + webLine to compose fallback sections.
 */
type DraftInput = {
  plantName: string;
  focus: PlantInfoFocus;
  note: string; // Classifier confidence context (cleaned)
  searchHits?: WebSearchHit[];
};

/**
 * Helper: formats intro sentence with plant name, context, and style hint.
 * Used by all draft builders to set scene for the report.
 */
function introSentence(
  plant: string,
  ctxLine: string,
  styleLine: string,
): string {
  return `Based on your leaf image, the model suggests "${plant}" as the most likely match.${ctxLine} ${styleLine}`;
}

// ─── Main entry point ─────────────────────────────────────────────────────

/**
 * Generates PlantInfoSections for any focus mode when LLM is unavailable.
 * Routes to topic-specific builders for custom focus.
 *
 * Usage: Fallback when /api/plant-info returns degraded=true
 *
 * @param plantName        Classifier's predicted species
 * @param focus            Report focus mode (balanced, gardening, etc.)
 * @param note             Classification confidence scores
 * @param searchHits       Optional web search results to ground content
 * @param customQuestion   User's question (for custom focus)
 */
export function buildFallbackSections(
  plantName: string,
  focus: PlantInfoFocus,
  note: string,
  searchHits: WebSearchHit[] = [],
  customQuestion?: string,
): PlantInfoSections {
  const ctx = cleanNote(note);
  const ctxLine = ctx ? ` Top model scores: ${ctx}.` : "";
  const webLine = searchInsight(searchHits);

  const input: DraftInput = { plantName, focus, note: ctxLine, searchHits };

  // Route to topic-specific builder for custom focus
  if (focus === "custom") {
    return buildCustomDraft(input, webLine, customQuestion?.trim() ?? "");
  }

  // Route to focus-mode builders
  switch (focus) {
    case "gardening":
      return buildGardeningDraft(input, webLine);
    case "ecology":
      return buildEcologyDraft(input, webLine);
    case "cultural":
      return buildCulturalDraft(input, webLine);
    case "concise":
      return buildConciseDraft(input, webLine);
    default:
      return buildBalancedDraft(input, webLine);
  }
}

// ─── Custom focus draft (7 topic subtypes) ────────────────────────────────

/**
 * Generates custom Q&A response by detecting question topic.
 * Routes to safety, care, distribution, ecology, culture, identification, or general handler.
 *
 * Each topic variant:
 * - Emphasizes relevant fields (e.g., safety → identification_and_safety)
 * - Uses appropriate tone and caution levels
 * - Includes region-specific hints from web search when available
 */
function buildCustomDraft(
  { plantName, note, searchHits }: DraftInput,
  webLine: string,
  question: string,
): PlantInfoSections {
  const q = question || "Tell me about this plant";
  const topic = detectCustomQuestionTopic(q);
  const qLower = q.toLowerCase();

  // Region detection for distribution questions
  const asksIndiaRegion =
    /\b(india|indian|which region|where.*india|state)\b/.test(qLower);
  const isBasella = /basella|malabar spinach|basale/i.test(plantName);
  const regionsFromWeb = extractIndianRegions(searchHits ?? []);
  const webRegionLine =
    regionsFromWeb.length > 0
      ? `Web references mention: ${regionsFromWeb.slice(0, 5).join(", ")}.`
      : "";

  const intro = `Question asked: "${q}" The classifier's best match is "${plantName}".${note}${webLine}`;

  // Topic-specific content variants
  const byTopic: Record<
    ReturnType<typeof detectCustomQuestionTopic>,
    Pick<
      PlantInfoSections,
      | "overview"
      | "uses_and_care_tips"
      | "traditional_or_cultural_notes"
      | "advantages"
      | "disadvantages"
    >
  > = {
    safety: {
      overview: `${intro} Direct answer: treat unknown plants as potentially unsafe until species identity is confirmed.`,
      uses_and_care_tips:
        "Toxicity and allergenicity are species-specific and cannot be confirmed from a single leaf image. Look-alike species may differ sharply in risk. Keep children and pets away from unknown plants until verified, avoid ingestion, and use gloves while handling unknown sap or berries. If exposure is suspected, preserve a sample and contact poison control or a veterinarian immediately.",
      traditional_or_cultural_notes: "",
      advantages: [
        "Early caution prevents harm when identity is uncertain.",
        "Poison control and extension services offer region-specific guidance.",
        "Whole-plant photos improve safety assessments dramatically.",
        "Many toxic plants are manageable once correctly identified and placed safely.",
      ],
      disadvantages: [
        "Leaf-only photos cannot rule out toxic look-alikes.",
        "Toxicity varies by plant part, season, and preparation method.",
        "Draft mode cannot replace a toxicologist or veterinarian assessment.",
      ],
    },

    care: {
      overview: `${intro} Direct answer: care depends on confirmed species, hardiness zone, and indoor/outdoor conditions.`,
      uses_and_care_tips:
        "Confirm the plant species first, then match light, soil, and watering to that species. Water by checking soil moisture rather than a fixed schedule. Use a draining potting mix unless the verified species is moisture-loving. Feed lightly during active growth, prune dead or diseased material, and inspect for pests weekly. Adjust care by season and local climate rather than generic online averages.",
      traditional_or_cultural_notes: "",
      advantages: [
        "Consistent monitoring catches pests and watering issues early.",
        "Zone-appropriate placement reduces winter loss and heat stress.",
        "Proper drainage prevents root rot—the most common container failure.",
        "Labeling pots with species names avoids mixed care routines.",
      ],
      disadvantages: [
        "Wrong identification leads to incorrect light, water, and fertilizer programs.",
        "Indoor humidity and draft patterns differ from generic online advice.",
        "Cultivars of the same genus can have opposite care needs.",
      ],
    },

    distribution: {
      overview: asksIndiaRegion
        ? `${intro} Direct answer: if this is truly Basella alba, it is most common in warm, humid parts of India and widely cultivated across eastern and southern states.`
        : `${intro} Direct answer: this species is most common in warm tropical to subtropical regions with suitable humidity.`,
      uses_and_care_tips:
        asksIndiaRegion && isBasella
          ? `For India, Basella alba is commonly grown in kitchen gardens and local markets in eastern and southern belts, especially humid and coastal zones. It is frequently reported from West Bengal, Odisha, Assam, Kerala, Tamil Nadu, Karnataka, Andhra Pradesh, Telangana, and Maharashtra, though prevalence varies by season and market demand. ${webRegionLine} Treat this as a practical distribution estimate, not an official census.`
          : "Distribution should be confirmed using local flora databases, agricultural extension sources, and regional biodiversity records. Photo-based classification provides a candidate species, but exact regional prevalence needs location-based references.",
      traditional_or_cultural_notes: "",
      advantages: [
        "Gives a direct location-focused answer to your question.",
        "Uses climate and cultivation patterns to estimate likely regions.",
        "Encourages local-source verification for district-level accuracy.",
      ],
      disadvantages: [
        "Leaf-photo identification may not confirm the exact species.",
        "State-wise prevalence changes with season and cultivation practices.",
      ],
    },

    ecology: {
      overview: `${intro} Ecological impact and habitat value are highly regional—the same species may be beneficial in one area and invasive in another.`,
      uses_and_care_tips:
        "Determine whether the plant is native, naturalized, or invasive in your area using government invasive-plant lists and regional floras. Assess habitat associations: wetland edges, understory, grassland, or disturbed ground. Consider wildlife interactions: nectar/pollen for pollinators, fruit for birds, larval host roles for butterflies. If planting for restoration, source local ecotypes from reputable native nurseries; avoid wild collection. Monitor spread in gardens; some species require annual management or containment.",
      traditional_or_cultural_notes: "",
      advantages: [
        "Native plantings support pollinators and reduce irrigation needs.",
        "Correct identification improves participation in restoration projects.",
        "Understanding invasive status protects local ecosystems.",
      ],
      disadvantages: [
        "Ecological value cannot be assessed from a leaf photo alone.",
        "Beneficial in one region may be harmful elsewhere.",
        "Wild collection damages natural populations.",
      ],
    },

    culture: {
      overview: `${intro} Cultural significance varies by community and region; verify claims with academic or institutional sources.`,
      uses_and_care_tips:
        "Documented non-medical uses may include ornamental gardening, craft materials, dyes, or heritage food traditions where legally and culturally appropriate. Folklore should be treated as educational context—not evidence of safety or efficacy. Common names often span multiple unrelated species across languages. When teaching, use scientific names and acknowledge source communities when known.",
      traditional_or_cultural_notes: "",
      advantages: [
        "Scientific naming reduces confusion across languages and regions.",
        "Institutional sources filter marketing from documented history.",
        "Cultural context enriches gardens and classroom interpretation.",
      ],
      disadvantages: [
        "Online folklore often mixes species and exaggerates benefits.",
        "Cultural practices may not transfer safely across regions.",
        "Photo identification cannot confirm the plant in historical texts.",
      ],
    },

    identification: {
      overview: `${intro} Reliable identification requires multiple plant features beyond a single leaf.`,
      uses_and_care_tips:
        "Compare leaf arrangement (alternate, opposite, whorled), margins (entire, serrated, lobed), venation (pinnate, palmate, parallel), texture, odor, and hair presence. Note whether the plant is woody or herbaceous. Photograph bark, buds, flowers, and fruit when available. Use at least two independent keys: a regional field guide, university extension tool, or verified herbarium images. Seasonal changes alter leaf shape, especially juvenile vs. mature foliage.",
      traditional_or_cultural_notes: "",
      advantages: [
        "Multiple traits dramatically reduce misidentification risk.",
        "Seasonal follow-up photos resolve many ambiguous cases.",
        "Local experts know regional look-alikes best.",
      ],
      disadvantages: [
        "Juvenile leaves often differ from mature diagnostic features.",
        "Hybrid and cultivar forms may not match guide photos.",
        "Single-leaf classifiers cannot replace botanical keys.",
      ],
    },

    general: {
      overview: `${intro} Based on current evidence, treat this as a best-match estimate and verify key details locally.`,
      uses_and_care_tips:
        "Use the classifier output as a starting point, then validate with whole-plant traits and local references. Prioritize the exact information you're seeking (location, care, safety, or identification) and verify region-specific facts through trusted local sources. For high-stakes decisions, consult a botanist, extension office, or experienced nursery.",
      traditional_or_cultural_notes: "",
      advantages: [
        "Structured observation improves long-term plant literacy.",
        "Local experts provide jurisdiction-specific guidance.",
        "Photo logs help refine identification and care over time.",
      ],
      disadvantages: [
        "Automated labels lack context on region, cultivar, and life stage.",
        "Generic advice may not fit your microclimate or soil.",
        "Draft mode cannot replace live AI for nuanced questions.",
      ],
    },
  };

  const body = byTopic[topic];
  return {
    ...body,
    identification_and_safety:
      "Verify identity with whole-plant traits and at least two independent references before acting on this answer.",
    disclaimer: DISCLAIMER,
  };
}

// ─── Balanced focus draft ──────────────────────────────────────────────────

/**
 * Comprehensive overview suitable for users wanting a general sense of the plant.
 * Covers identification confidence, pros/cons, uses, safety in balanced measure.
 */
function buildBalancedDraft(
  { plantName, note }: DraftInput,
  webLine: string,
): PlantInfoSections {
  return {
    overview:
      introSentence(
        plantName,
        note,
        "This balanced overview covers identification confidence, advantages, disadvantages, uses, and safety.",
      ) + webLine,

    advantages: [
      "Supports home, garden, and educational use when the species is confirmed with a field guide or expert.",
      "Can provide ornamental value, shade, habitat structure, or seasonal interest depending on the true species.",
      "Useful for comparing leaf shape, venation, margin, and arrangement against regional flora resources.",
      "May offer food, fiber, or craft potential only where historically documented and legally permitted.",
      "Encourages structured observation skills that improve long-term plant literacy.",
    ],

    disadvantages: [
      "Single-leaf photos often cannot separate closely related species or cultivars.",
      "Misidentification can lead to incorrect watering, pruning, or unnecessary removal of beneficial plants.",
      "Some look-alikes may be toxic, allergenic, or regulated invasive species in your region.",
      "Care advice from generic summaries may not match your soil, hardiness zone, or microclimate.",
      "Automated labels do not replace pest/disease diagnosis or legal restrictions on collection.",
    ],

    uses_and_care_tips:
      "Treat this label as a starting hypothesis. Compare the leaf with photos of bark, flowers, fruit, and young vs. mature foliage. For home cultivation, confirm hardiness zone, typical mature size, and whether the plant prefers sun or partial shade, moist or well-drained soil, and acidic or neutral pH. Water based on soil moisture rather than a fixed calendar schedule; mulch to reduce evaporation and moderate root temperatures. Fertilize only after confirming species needs—many natives and woodland plants require little supplemental feeding. Prune to remove damaged tissue and improve airflow, timing cuts to the plant's growth cycle. In containers, use drainage holes and size pots to root development. Document seasonal changes to refine identification over time.",

    traditional_or_cultural_notes:
      "Many plants carry regional names, folklore, or landscape traditions that vary widely. Use botanical gardens, university extension publications, and regional floras for context rather than social media claims. Cultural mentions here are general and must not be interpreted as instructions for ingestion or medical use.",

    identification_and_safety:
      "Confirm identity using at least three independent traits (leaf arrangement, vein pattern, stem texture, odor, flowers, or fruit). Photograph the whole plant where permitted. If the plant may be toxic or invasive, avoid handling without gloves and do not transplant until verified. Consult a local nursery, botanist, or extension office for high-stakes decisions (livestock forage, child-accessible areas, restoration plantings).",

    disclaimer: DISCLAIMER,
  };
}

// ─── Gardening focus draft ────────────────────────────────────────────────

/**
 * Practical growing guide emphasizing light, soil, water, pests, containers.
 * Intended for home gardeners and ornamental cultivation.
 */
function buildGardeningDraft(
  { plantName, note }: DraftInput,
  webLine: string,
): PlantInfoSections {
  return {
    overview:
      introSentence(
        plantName,
        note,
        "This report answers your gardening question: how to grow and maintain this plant at home.",
      ) + webLine,

    advantages: [
      "Can be rewarding for home gardeners once species and hardiness zone are confirmed.",
      "Supports learning of seasonal cycles: bud break, flowering, fruiting, and dormancy.",
      "May fit ornamental beds, food gardens, containers, or privacy screens depending on mature size.",
      "Offers opportunities to improve soil organic matter through compost and mulch practices.",
      "Container culture can help manage invasive or tender species where appropriate.",
    ],

    disadvantages: [
      "Wrong identification leads to incorrect sun exposure, irrigation, and fertilizer programs.",
      "Pests and diseases (aphids, scale, fungal leaf spots, root rot) vary by species and climate.",
      "Overwatering and poor drainage are common causes of decline in many garden plants.",
      "Some species are toxic to pets, livestock, or humans if misidentified.",
      "Mature size may exceed available space, creating long-term maintenance burdens.",
    ],

    uses_and_care_tips:
      "Light: Determine whether the species needs full sun (6+ hours), partial shade, or shade; adjust bed placement or use shade cloth in hot climates. Soil: Test pH and drainage; amend with compost for most ornamentals, but avoid over-amending species adapted to poor soils. Watering: Water deeply and infrequently where appropriate, allowing surface to dry slightly between sessions for many species—always verify species-specific needs. Mulch: Apply 5–8 cm organic mulch, keeping material away from stems to reduce rot. Fertilizer: Use a balanced or species-appropriate product at labeled rates; stop feeding late in the season if it encourages tender growth before frost. Pruning: Remove dead, diseased, or crossing branches; sterilize tools between cuts on suspect plants. Pests: Monitor weekly, use mechanical removal and horticultural oils/soaps before broad chemicals when compatible with local guidance. Containers: Choose pots with drainage, repot when roots circle, match pot size to growth rate. Seasonal: Note frost dates, winter protection for tender taxa, and renewal pruning timing.",

    traditional_or_cultural_notes:
      "Garden cultivars may differ from wild forms in size, flower color, and care needs—verify whether your plant is a named cultivar.",

    identification_and_safety:
      "Before applying fertilizers or pesticides, confirm the species and read label restrictions. Wear gloves when handling unknown sap or hairs. Keep children and pets away until toxicity is ruled out. If contact irritation occurs, rinse skin and seek professional advice.",

    disclaimer: DISCLAIMER,
  };
}

// ─── Ecology focus draft ───────────────────────────────────────────────────

/**
 * Habitat role, wildlife value, invasiveness, and conservation implications.
 * Intended for ecologists, restoration practitioners, and conservation-minded gardeners.
 */
function buildEcologyDraft(
  { plantName, note }: DraftInput,
  webLine: string,
): PlantInfoSections {
  return {
    overview:
      introSentence(
        plantName,
        note,
        "This report answers your ecology question: habitat role, wildlife value, and conservation context.",
      ) + webLine,

    advantages: [
      "May support pollinators (bees, butterflies, birds) when flowering and correctly identified.",
      "Can stabilize soil, reduce erosion, or add canopy structure in appropriate ecosystems.",
      "Useful in native-plant landscaping and restoration when sourced ethically and legally.",
      "Can sequester carbon and moderate microclimates as part of perennial vegetation.",
      "Provides educational value for understanding local biodiversity patterns.",
    ],

    disadvantages: [
      "Non-native or invasive populations can displace local flora and simplify ecosystems.",
      "Incorrect identification may cause removal of beneficial natives or retention of harmful invasives.",
      "Allergenic pollen or allelopathic chemicals can affect sensitive individuals and neighboring plants.",
      "Habitat value changes with plant age, management, and surrounding land use.",
      "Wild collection can damage natural populations—prefer nursery-propagated native stock.",
    ],

    uses_and_care_tips:
      "Determine native range and whether the species is indigenous, naturalized, or invasive in your region using government invasive-plant lists and regional floras. Note typical associations: wetland edges, understory, grassland, or disturbed ground. Assess wildlife value: nectar/pollen timing, fruit for birds, larval host relationships. If planting for ecology, choose local ecotypes from reputable native nurseries; avoid wild digging. In restoration, match soil moisture and light to reference sites. Monitor spread—some species require containment or annual management. Report suspected invasives to local conservation authorities when required.",

    traditional_or_cultural_notes:
      "Ecological significance is place-specific; a beneficial species in one region may be problematic elsewhere.",

    identification_and_safety:
      "Do not remove plants from protected areas. Verify identification before participating in volunteer pulls or plantings. Use protective equipment in tick- or poison-ivy-rich habitats. Follow local biosecurity guidance when disposing of invasive plant material (bagging, landfill, not composting seeds).",

    disclaimer: DISCLAIMER,
  };
}

// ─── Cultural focus draft ──────────────────────────────────────────────────

/**
 * Heritage context, ethnobotany, folklore, and non-medical cultural uses.
 * Intended for educators, cultural institutions, and heritage gardeners.
 */
function buildCulturalDraft(
  { plantName, note }: DraftInput,
  webLine: string,
): PlantInfoSections {
  return {
    overview:
      introSentence(
        plantName,
        note,
        "This report answers your cultural question: heritage context and documented non-medical uses.",
      ) + webLine,

    advantages: [
      "Can connect learners to regional heritage, ethnobotanical literature, and landscape traditions.",
      "Supports museum, school, and community garden interpretation when facts are verified.",
      "May explain why a plant appears in art, place names, or seasonal festivals.",
      "Encourages respect for indigenous and local knowledge systems through proper citations.",
      "Helps distinguish ornamental cultural use from unsafe folklore claims.",
    ],

    disadvantages: [
      "Cultural stories are often regional—global generalizations can be misleading.",
      "Common names may apply to multiple unrelated species.",
      "Historical uses must not be read as safe modern instructions.",
      "Commercialization can conflict with cultural stewardship and access rights.",
      "Online summaries frequently mix fact, marketing, and fiction.",
    ],

    uses_and_care_tips:
      "Documented non-medical uses may include ornamental gardening, craft materials, dyes, or heritage food traditions where legally and culturally appropriate. Consult botanical gardens, university ethnobotany departments, and published regional histories. When displaying plants in cultural education, label with scientific names and acknowledge source communities where known. Avoid reproducing sacred or restricted knowledge without permission.",

    traditional_or_cultural_notes:
      "Plants often appear in folklore, religious festivals, traditional crafts, and local naming systems. Treat this section as introductory context: verify every claim with academic or institutional references. Do not infer medicinal efficacy, dosage, or preparation from cultural mention alone. If teaching or exhibiting, collaborate with community experts when describing living cultural relationships to plants.",

    identification_and_safety:
      "Cultural importance does not prove identity from a single leaf photo. Toxic look-alikes may share common names across languages. Never consume or apply plants based on cultural reputation alone.",

    disclaimer: DISCLAIMER,
  };
}

// ─── Concise focus draft ───────────────────────────────────────────────────

/**
 * Brief facts-only summary emphasizing identification confidence and key cautions.
 * Intended for quick reference and field guide comparison.
 */
function buildConciseDraft(
  { plantName, note }: DraftInput,
  webLine: string,
): PlantInfoSections {
  return {
    overview: `${plantName} is the model's best leaf-photo match.${note}${webLine} Short briefing below.`,

    advantages: [
      "Fast orientation for field-guide comparison.",
      "Highlights why cautious identification matters.",
      "Useful checklist before expert consultation.",
    ],

    disadvantages: [
      "Low-confidence matches are common from single leaves.",
      "Similar species may differ in toxicity and care.",
      "Not a substitute for on-site expert review.",
    ],

    uses_and_care_tips:
      "Confirm species, then match light, water, and soil to verified requirements. Prefer local extension or nursery advice for your zone.",

    traditional_or_cultural_notes: "",

    identification_and_safety:
      "Verify with multiple traits or an expert before planting, harvesting, or removing. Assume unknown plants may be irritating or toxic.",

    disclaimer: DISCLAIMER,
  };
}
