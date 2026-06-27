/**
 * plant-display.ts — Enhanced layout resolver for plant focus modes
 *
 * Integrates with display-section.tsx styling system:
 * - Tone-based color schemes (positive/caution/neutral)
 * - Density-aware rendering (compact/standard/rich)
 * - Structured block definitions for polymorphic rendering
 * - Custom question title mapping from custom-question.ts
 *
 * Consumed by: display_section.tsx (RenderBlock, VisibleBlockList)
 * Imports: @/lib/custom-question, @/types/plant-info, @/lib/plant-fallback
 */

import { customSectionTitles } from "@/lib/custom-question";
import type { PlantInfoFocus, PlantInfoSections } from "@/types/plant-info";
import { focusLabel } from "@/lib/plant-fallback";

// ─── Section field type ────────────────────────────────────────────────────

type SectionField = keyof PlantInfoSections;

// ─── Block definitions ─────────────────────────────────────────────────────

/**
 * Polymorphic block type for rendering plant sections.
 * Each variant maps to a React component in display_section.tsx:
 * - "paragraph"       → SectionCard
 * - "bullets"         → BulletCard
 * - "split_bullets"   → SplitBulletCard
 * - "bullet_merge"    → MergedBulletCard
 */
export type PlantDisplayBlock =
  | {
      kind: "paragraph";
      field: SectionField;
      title: string;
      emphasis?: "hero" | "normal";
    }
  | {
      kind: "bullets";
      field: "advantages" | "disadvantages";
      title: string;
      tone: "positive" | "caution" | "neutral";
    }
  | {
      kind: "split_bullets";
      left: { field: "advantages"; title: string };
      right: { field: "disadvantages"; title: string };
    }
  | { kind: "bullet_merge"; title: string };

/**
 * Layout metadata for a focus mode:
 * - reportTitle: main heading (e.g., "Balanced plant overview")
 * - subtitle: descriptive tagline
 * - blocks: ordered sequence of rendering directives
 */
export type PlantFocusLayout = {
  reportTitle: string;
  subtitle: string;
  blocks: PlantDisplayBlock[];
};

// ─── Focus mode layouts ─────────────────────────────────────────────────────

/**
 * Static layout definitions for each focus mode.
 * Maps to FOCUS_OPTIONS in page.tsx and styled via TONE_STYLES in display_section.tsx:
 * - positive (emerald): advantages, benefits
 * - caution (amber): disadvantages, risks
 * - neutral (violet): cultural, historical, general
 */
export const PLANT_FOCUS_LAYOUTS: Record<PlantInfoFocus, PlantFocusLayout> = {
  balanced: {
    reportTitle: "Plant Profile",
    subtitle: "A balanced overview covering benefits, risks, uses, and safety.",
    blocks: [
      {
        kind: "paragraph",
        field: "overview",
        title: "Overview",
        emphasis: "hero",
      },
      {
        kind: "split_bullets",
        left: { field: "advantages", title: "Advantages" },
        right: { field: "disadvantages", title: "Disadvantages" },
      },
      {
        kind: "paragraph",
        field: "uses_and_care_tips",
        title: "Uses & Care Tips",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "traditional_or_cultural_notes",
        title: "Cultural Notes",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "identification_and_safety",
        title: "Identification & Safety",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "disclaimer",
        title: "Important Notice",
        emphasis: "normal",
      },
    ],
  },
  gardening: {
    reportTitle: "Grow & Care Guide",
    subtitle: "Everything you need to cultivate this plant successfully.",
    blocks: [
      {
        kind: "paragraph",
        field: "overview",
        title: "Growing Profile",
        emphasis: "hero",
      },
      {
        kind: "paragraph",
        field: "uses_and_care_tips",
        title: "Care & Maintenance",
        emphasis: "normal",
      },
      {
        kind: "bullets",
        field: "advantages",
        title: "Cultivation Highlights",
        tone: "positive",
      },
      {
        kind: "bullets",
        field: "disadvantages",
        title: "Common Challenges",
        tone: "caution",
      },
      {
        kind: "paragraph",
        field: "identification_and_safety",
        title: "Before You Plant",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "disclaimer",
        title: "Important Notice",
        emphasis: "normal",
      },
    ],
  },
  ecology: {
    reportTitle: "Ecological Role",
    subtitle: "How this plant fits into its ecosystem.",
    blocks: [
      {
        kind: "paragraph",
        field: "overview",
        title: "Ecological Profile",
        emphasis: "hero",
      },
      {
        kind: "bullets",
        field: "advantages",
        title: "Ecological Benefits",
        tone: "positive",
      },
      {
        kind: "bullets",
        field: "disadvantages",
        title: "Environmental Risks",
        tone: "caution",
      },
      {
        kind: "paragraph",
        field: "uses_and_care_tips",
        title: "Habitat & Conservation",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "identification_and_safety",
        title: "Field ID & Safety",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "disclaimer",
        title: "Important Notice",
        emphasis: "normal",
      },
    ],
  },
  cultural: {
    reportTitle: "Cultural History",
    subtitle: "Heritage context, ethnobotany, and non-medical uses.",
    blocks: [
      {
        kind: "paragraph",
        field: "overview",
        title: "Introduction",
        emphasis: "hero",
      },
      {
        kind: "paragraph",
        field: "traditional_or_cultural_notes",
        title: "Historical Context",
        emphasis: "normal",
      },
      {
        kind: "bullets",
        field: "advantages",
        title: "Cultural Significance",
        tone: "neutral",
      },
      {
        kind: "bullets",
        field: "disadvantages",
        title: "Cautions & Risks",
        tone: "caution",
      },
      {
        kind: "paragraph",
        field: "uses_and_care_tips",
        title: "Documented Uses",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "identification_and_safety",
        title: "Identification & Safety",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "disclaimer",
        title: "Important Notice",
        emphasis: "normal",
      },
    ],
  },
  concise: {
    reportTitle: "Quick Summary",
    subtitle: "Essential facts at a glance.",
    blocks: [
      {
        kind: "paragraph",
        field: "overview",
        title: "Summary",
        emphasis: "hero",
      },
      { kind: "bullet_merge", title: "Key Points" },
      {
        kind: "paragraph",
        field: "identification_and_safety",
        title: "Safety",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "disclaimer",
        title: "Important Notice",
        emphasis: "normal",
      },
    ],
  },
  custom: {
    reportTitle: "Custom Answer",
    subtitle: "AI response to your specific question.",
    blocks: [
      {
        kind: "paragraph",
        field: "overview",
        title: "Direct Answer",
        emphasis: "hero",
      },
      {
        kind: "paragraph",
        field: "uses_and_care_tips",
        title: "Detailed Response",
        emphasis: "normal",
      },
      {
        kind: "split_bullets",
        left: { field: "advantages", title: "Supporting Facts" },
        right: { field: "disadvantages", title: "Limits & Caveats" },
      },
      {
        kind: "paragraph",
        field: "identification_and_safety",
        title: "Verification",
        emphasis: "normal",
      },
      {
        kind: "paragraph",
        field: "disclaimer",
        title: "Important Notice",
        emphasis: "normal",
      },
    ],
  },
};

// ─── Dynamic title application for custom questions ──────────────────────

/**
 * Applies custom section titles from the user's question to the layout.
 * Maps question topics to semantic titles (e.g., "care" → "Growing & care guide").
 *
 * Example: Question "Is it toxic?" applies safety titles to the custom layout.
 */
function applyCustomTitles(
  layout: PlantFocusLayout,
  question: string,
): PlantFocusLayout {
  const t = customSectionTitles(question);
  const blocks = layout.blocks.map((block) => {
    if (block.kind === "paragraph") {
      if (block.field === "overview") return { ...block, title: t.overview };
      if (block.field === "uses_and_care_tips")
        return { ...block, title: t.detailed };
      if (block.field === "traditional_or_cultural_notes")
        return { ...block, title: t.steps };
      if (block.field === "identification_and_safety")
        return { ...block, title: t.verification };
      return block;
    }
    if (block.kind === "split_bullets") {
      return {
        ...block,
        left: { ...block.left, title: t.facts },
        right: { ...block.right, title: t.caveats },
      };
    }
    if (block.kind === "bullets" && block.field === "advantages") {
      return { ...block, title: t.facts };
    }
    if (block.kind === "bullets" && block.field === "disadvantages") {
      return { ...block, title: t.caveats };
    }
    return block;
  });
  return { ...layout, blocks };
}

/**
 * Retrieves and optionally customizes the layout for a focus mode.
 * For custom focus, applies topic-aware title remapping from the question.
 */
export function getFocusLayout(
  focus: PlantInfoFocus,
  customQuestion?: string,
): PlantFocusLayout {
  const base = PLANT_FOCUS_LAYOUTS[focus];
  if (focus !== "custom" || !customQuestion?.trim()) return base;

  const q = customQuestion.trim();
  const withTitles = applyCustomTitles(base, q);

  return {
    ...withTitles,
    subtitle: `Answering: "${q.length > 200 ? `${q.slice(0, 197)}…` : q}"`,
  };
}

// ─── Section value extractors ───────────────────────────────────────────

/**
 * Safely extracts string content from a section field.
 * Returns trimmed string or empty string if not found or not a string.
 */
function paragraphValue(
  sections: PlantInfoSections,
  field: SectionField,
): string {
  const v = sections[field];
  if (typeof v === "string") return v.trim();
  return "";
}

/**
 * Safely extracts bullet list from advantages/disadvantages array.
 * Filters out empty strings and returns trimmed items.
 */
function bulletValue(
  sections: PlantInfoSections,
  field: "advantages" | "disadvantages",
): string[] {
  return sections[field].map((s) => s.trim()).filter(Boolean);
}

// ─── Block resolution (omits empty blocks) ──────────────────────────────

/**
 * Resolves a layout to only blocks with actual content.
 * Used by display_section.tsx to skip rendering empty sections.
 *
 * Returns: { layout, blocks } where blocks are filtered to content-bearing items.
 */
export function resolveDisplayBlocks(
  focus: PlantInfoFocus,
  sections: PlantInfoSections,
  customQuestion?: string,
): { layout: PlantFocusLayout; blocks: PlantDisplayBlock[] } {
  const layout = getFocusLayout(focus, customQuestion);
  const blocks: PlantDisplayBlock[] = [];

  for (const block of layout.blocks) {
    if (block.kind === "paragraph") {
      if (paragraphValue(sections, block.field)) blocks.push(block);
      continue;
    }

    if (block.kind === "bullets") {
      if (bulletValue(sections, block.field).length > 0) blocks.push(block);
      continue;
    }

    if (block.kind === "split_bullets") {
      const hasL = bulletValue(sections, block.left.field).length > 0;
      const hasR = bulletValue(sections, block.right.field).length > 0;
      if (hasL || hasR) blocks.push(block);
      continue;
    }

    if (block.kind === "bullet_merge") {
      const merged = [
        ...bulletValue(sections, "advantages"),
        ...bulletValue(sections, "disadvantages"),
      ];
      if (merged.length > 0) blocks.push(block);
    }
  }

  return { layout, blocks };
}

// ─── Highlights extraction (at-a-glance bullets) ─────────────────────────

/**
 * Extracts 2–4 key takeaways from a report for the highlight strip.
 * Used in HighlightStrip component (display_section.tsx).
 *
 * Strategy varies by focus:
 * - gardening/ecology: top advantages + caution
 * - cultural: cultural notes + top significance
 * - concise: combined pros/cons
 * - custom: first facts, key detail, caveats
 */
export function buildFocusHighlights(
  focus: PlantInfoFocus,
  sections: PlantInfoSections,
): string[] {
  switch (focus) {
    case "gardening":
    case "ecology":
      return [
        ...bulletValue(sections, "advantages").slice(0, 2),
        ...bulletValue(sections, "disadvantages").slice(0, 1),
      ].slice(0, 4);

    case "cultural": {
      const cultural = paragraphValue(
        sections,
        "traditional_or_cultural_notes",
      );
      return [
        ...(cultural ? [cultural.slice(0, 160)] : []),
        ...bulletValue(sections, "advantages").slice(0, 2),
      ].filter(Boolean);
    }

    case "concise":
      return [
        ...bulletValue(sections, "advantages"),
        ...bulletValue(sections, "disadvantages"),
      ].slice(0, 5);

    case "custom": {
      const detailed = paragraphValue(sections, "uses_and_care_tips");
      const firstLine = detailed.split(/[.!?]/)[0]?.trim();
      const context = paragraphValue(sections, "traditional_or_cultural_notes");

      return [
        ...bulletValue(sections, "advantages").slice(0, 2),
        ...(firstLine ? [firstLine] : []),
        ...(context
          ? [context.slice(0, 120)]
          : bulletValue(sections, "disadvantages").slice(0, 1)),
      ].filter(Boolean);
    }

    default:
      // balanced
      return [
        ...bulletValue(sections, "advantages").slice(0, 2),
        ...bulletValue(sections, "disadvantages").slice(0, 2),
      ].slice(0, 4);
  }
}

// ─── Markdown export (for sharing/printing) ─────────────────────────────

/**
 * Formats resolved blocks into well-structured Markdown.
 * Includes metadata (plant name, topic, source degradation status).
 * Used for export, sharing, or fallback plain-text rendering.
 */
export function formatSectionsMarkdown(
  focus: PlantInfoFocus,
  sections: PlantInfoSections,
  meta: { plantName: string; degraded?: boolean; customQuestion?: string },
): string {
  const { layout, blocks } = resolveDisplayBlocks(
    focus,
    sections,
    meta.customQuestion,
  );
  const fl = focusLabel(focus, meta.customQuestion);
  const source = meta.degraded
    ? "Enhanced draft report"
    : "AI-generated report";

  const questionLine =
    focus === "custom" && meta.customQuestion?.trim()
      ? `**Your question:** ${meta.customQuestion.trim()}  \n`
      : "";

  const lines: string[] = [
    `# ${layout.reportTitle}`,
    `**Plant:** ${meta.plantName}  \n${questionLine}**Focus:** ${fl}  \n**Source:** ${source}`,
    `_${layout.subtitle}_`,
  ];

  let n = 0;
  for (const block of blocks) {
    n += 1;

    if (block.kind === "paragraph") {
      const content = paragraphValue(sections, block.field);
      lines.push(`## ${n}. ${block.title}\n\n${content}`);
    } else if (block.kind === "bullets") {
      const items = bulletValue(sections, block.field);
      lines.push(
        `## ${n}. ${block.title}\n\n${items.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
      );
    } else if (block.kind === "split_bullets") {
      const left = bulletValue(sections, block.left.field);
      const right = bulletValue(sections, block.right.field);
      const parts: string[] = [
        `## ${n}. ${block.left.title} & ${block.right.title}`,
      ];

      if (left.length) {
        parts.push(
          `### ${block.left.title}\n\n${left.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
        );
      }
      if (right.length) {
        parts.push(
          `### ${block.right.title}\n\n${right.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
        );
      }

      lines.push(parts.join("\n\n"));
    } else if (block.kind === "bullet_merge") {
      const merged = [
        ...bulletValue(sections, "advantages"),
        ...bulletValue(sections, "disadvantages"),
      ];
      lines.push(
        `## ${n}. ${block.title}\n\n${merged.map((x, i) => `${i + 1}. ${x}`).join("\n")}`,
      );
    }
  }

  return lines.join("\n\n");
}
