"use client";

/**
 * display_section.tsx — Enhanced PlantAnswerDisplay component
 *
 * Exported surface consumed by page.tsx:
 *   import { PlantAnswerDisplay } from "@/app/display_section";
 *
 * Props are defined by PlantAnswerDisplayProps at the bottom of this file.
 * All internal helpers are private to this module.
 */

import { useId } from "react";
import type {
  PlantInfoFocus,
  PlantInfoSections,
} from "@/types/plant-info";

// ─── External helpers (kept as stubs so the file is self-contained) ───────────
// In a real project these live in @/lib/custom-question and @/lib/plant-display.
// We inline minimal versions here so the component compiles without those deps.

type PlantDisplayBlock =
  | { kind: "paragraph"; field: keyof PlantInfoSections; title: string; emphasis?: "hero" | "normal" }
  | { kind: "bullets"; field: keyof PlantInfoSections; title: string; tone: Tone }
  | { kind: "split_bullets"; left: { title: string }; right: { title: string } }
  | { kind: "bullet_merge"; title: string };

type ResolvedLayout = {
  layout: { reportTitle: string; subtitle: string };
  blocks: PlantDisplayBlock[];
};

function resolveDisplayBlocks(
  focus: PlantInfoFocus,
  _sections: PlantInfoSections,
  _customQuestion?: string,
): ResolvedLayout {
  const titles: Record<PlantInfoFocus, { reportTitle: string; subtitle: string }> = {
    balanced: { reportTitle: "Plant Profile", subtitle: "A balanced overview covering benefits, risks, uses, and safety." },
    gardening: { reportTitle: "Grow & Care Guide", subtitle: "Everything you need to cultivate this plant successfully." },
    ecology: { reportTitle: "Ecological Role", subtitle: "How this plant fits into its ecosystem." },
    cultural: { reportTitle: "Cultural History", subtitle: "Heritage context, ethnobotany, and non-medical uses." },
    concise: { reportTitle: "Quick Summary", subtitle: "Essential facts at a glance." },
    custom: { reportTitle: "Custom Answer", subtitle: "AI response to your specific question." },
  };

  const common: PlantDisplayBlock[] = [
    { kind: "paragraph", field: "overview", title: "Overview", emphasis: "hero" },
    { kind: "split_bullets", left: { title: "Advantages" }, right: { title: "Disadvantages" } },
    { kind: "paragraph", field: "uses_and_care_tips", title: "Uses & Care Tips", emphasis: "normal" },
    { kind: "paragraph", field: "traditional_or_cultural_notes", title: "Cultural Notes", emphasis: "normal" },
    { kind: "paragraph", field: "identification_and_safety", title: "Identification & Safety", emphasis: "normal" },
    { kind: "paragraph", field: "disclaimer", title: "Important Notice", emphasis: "normal" },
  ];

  const concise: PlantDisplayBlock[] = [
    { kind: "paragraph", field: "overview", title: "Summary", emphasis: "hero" },
    { kind: "bullet_merge", title: "Key Points" },
    { kind: "paragraph", field: "identification_and_safety", title: "Safety", emphasis: "normal" },
    { kind: "paragraph", field: "disclaimer", title: "Important Notice", emphasis: "normal" },
  ];

  return {
    layout: titles[focus],
    blocks: focus === "concise" ? concise : common,
  };
}

function detectCustomQuestionTopic(q: string): "safety" | "care" | "general" {
  const lower = q.toLowerCase();
  if (/toxic|poison|safe|eat|edible|harm|danger|allerg/.test(lower)) return "safety";
  if (/grow|care|water|soil|prune|propagat|fertiliz|light|sun/.test(lower)) return "care";
  return "general";
}

function customTopicLabel(q: string): string {
  const topic = detectCustomQuestionTopic(q);
  if (topic === "safety") return "Safety & toxicity";
  if (topic === "care") return "Cultivation & care";
  return "General botany";
}

// ─── Density ──────────────────────────────────────────────────────────────────

function totalWords(sections: PlantInfoSections): number {
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

type Density = "compact" | "standard" | "rich";

function getDensity(sections: PlantInfoSections): Density {
  const w = totalWords(sections);
  if (w < 120) return "compact";
  if (w < 350) return "standard";
  return "rich";
}

// ─── Tone ─────────────────────────────────────────────────────────────────────

type Tone = "positive" | "caution" | "neutral";

const TONE_STYLES: Record<Tone, {
  border: string;
  bg: string;
  title: string;
  num: string;
  dot: string;
  dotClass: string;
}> = {
  positive: {
    border: "border-emerald-800/50",
    bg: "bg-emerald-950/20",
    title: "text-emerald-400",
    num: "text-emerald-500",
    dot: "bg-emerald-400",
    dotClass: "bg-emerald-400",
  },
  caution: {
    border: "border-amber-800/50",
    bg: "bg-amber-950/18",
    title: "text-amber-400",
    num: "text-amber-500",
    dot: "bg-amber-400",
    dotClass: "bg-amber-400",
  },
  neutral: {
    border: "border-violet-800/40",
    bg: "bg-violet-950/12",
    title: "text-violet-300",
    num: "text-violet-400",
    dot: "bg-violet-400",
    dotClass: "bg-violet-400",
  },
};

// ─── Model label ──────────────────────────────────────────────────────────────

function modelLabel(model: string | null | undefined): string {
  if (!model || model === "fallback-template") return "Draft";
  return model
    .replace(/^(accounts\/[^/]+\/models\/)?/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-latest$/, "")
    .replace(/^claude-/, "Claude ")
    .replace(/^llama3?-/, "Llama ")
    .replace(/^gemma2?-/, "Gemma ")
    .replace(/^mixtral-/, "Mixtral ")
    .replace(/-\d+b(-.*)?$/, (m) => m.replace(/-/, " "))
    .trim();
}

// ─── Shared badge primitives ──────────────────────────────────────────────────

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-none tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 rounded-full shrink-0 ${color}`}
    />
  );
}

// ─── Header badges ────────────────────────────────────────────────────────────

function ModelBadge({ model, degraded }: { model?: string | null; degraded: boolean }) {
  const label = degraded ? "Draft report" : modelLabel(model);
  return (
    <Pill
      className={
        degraded
          ? "border-blue-700/40 bg-blue-950/30 text-blue-300"
          : "border-zinc-700/50 bg-zinc-900/80 text-zinc-400"
      }
    >
      {!degraded && <Dot color="bg-emerald-400" />}
      {label}
    </Pill>
  );
}

function AnswerModeBadge({ mode }: { mode: "short" | "full" }) {
  return (
    <Pill
      className={
        mode === "short"
          ? "border-sky-700/40 bg-sky-950/30 text-sky-300"
          : "border-violet-700/40 bg-violet-950/30 text-violet-300"
      }
    >
      {mode === "short" ? "⚡ Quick answer" : "📋 Full report"}
    </Pill>
  );
}

function DensityBadge({ density }: { density: Density }) {
  if (density !== "compact") return null;
  return (
    <Pill className="border-zinc-700/40 bg-zinc-800/50 text-zinc-500">
      Summary
    </Pill>
  );
}

// ─── Warning banner ───────────────────────────────────────────────────────────

function WarningBanner({ text }: { text: string }) {
  if (!text?.trim()) return null;
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3"
    >
      {/* Amber left accent */}
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-amber-400 text-base leading-none"
      >
        ⚠
      </span>
      <p className="text-xs leading-relaxed text-amber-100/80">{text}</p>
    </div>
  );
}

// ─── Highlights strip ─────────────────────────────────────────────────────────

function HighlightStrip({
  highlights,
  isCustom,
  density,
}: {
  highlights: string[];
  isCustom: boolean;
  density: Density;
}) {
  if (!highlights.length) return null;

  const label = isCustom ? "Key takeaways" : "At a glance";

  // Compact → horizontal pill chips
  if (density === "compact") {
    return (
      <div className="mt-4 flex flex-wrap gap-2" role="list" aria-label={label}>
        {highlights.map((h, i) => (
          <span
            key={i}
            role="listitem"
            className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-700/30"
          >
            {h}
          </span>
        ))}
      </div>
    );
  }

  // Standard / rich → stacked list with arrow markers
  return (
    <section
      aria-label={label}
      className="mt-5 rounded-xl border border-zinc-700/50 bg-zinc-900/30 px-5 py-4"
    >
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-3">
        {label}
      </h3>
      <ul className="space-y-2">
        {highlights.map((x, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
            <span aria-hidden="true" className="mt-[3px] shrink-0 text-emerald-400 font-bold leading-none">
              ▸
            </span>
            <span className="leading-relaxed">{x}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Disclaimer ───────────────────────────────────────────────────────────────

function DisclaimerBlock({ text }: { text: string }) {
  if (!text?.trim()) return null;
  return (
    <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/30 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">
        Important notice
      </p>
      <p className="text-xs italic leading-relaxed text-zinc-500">{text}</p>
    </div>
  );
}

// ─── BulletList ───────────────────────────────────────────────────────────────

type BulletVariant = "numbered" | "dot" | "check" | "arrow";

function BulletList({
  items,
  tone,
  density,
  labelledBy,
  variant = "numbered",
}: {
  items: string[];
  tone: Tone;
  density: Density;
  labelledBy?: string;
  variant?: BulletVariant;
}) {
  if (!items.length) return null;
  const t = TONE_STYLES[tone];

  // Compact → pill chips
  if (density === "compact") {
    return (
      <div className="mt-3 flex flex-wrap gap-2" role="list" aria-labelledby={labelledBy}>
        {items.map((item, i) => (
          <span
            key={i}
            role="listitem"
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${tone === "positive"
                ? "bg-emerald-900/50 text-emerald-200 ring-emerald-700/40"
                : tone === "caution"
                  ? "bg-amber-900/40 text-amber-200 ring-amber-700/30"
                  : "bg-violet-900/40 text-violet-200 ring-violet-700/30"
              }`}
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  return (
    <ul className="mt-3.5 space-y-3" aria-labelledby={labelledBy}>
      {items.map((x, i) => (
        <li key={`${i}-${x.slice(0, 20)}`} className="flex items-start gap-3">
          {variant === "numbered" && (
            <span
              aria-hidden="true"
              className={`shrink-0 min-w-[1.25rem] font-bold tabular-nums text-sm leading-relaxed ${t.num}`}
            >
              {i + 1}.
            </span>
          )}
          {variant === "dot" && (
            <span
              aria-hidden="true"
              className={`mt-[8px] h-2 w-2 shrink-0 rounded-full ${t.dotClass}`}
            />
          )}
          {variant === "check" && (
            <span aria-hidden="true" className={`shrink-0 font-bold text-sm leading-relaxed ${t.num}`}>
              ✓
            </span>
          )}
          {variant === "arrow" && (
            <span aria-hidden="true" className={`shrink-0 font-bold text-sm leading-relaxed ${t.num}`}>
              ▸
            </span>
          )}
          <span className="text-sm leading-relaxed text-zinc-300">{x}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  content,
  num,
  emphasis,
  headingId,
}: {
  title: string;
  content: string;
  num: number;
  emphasis?: "hero" | "normal";
  headingId: string;
}) {
  if (!content.trim()) return null;

  const isDisclaimer = title.toLowerCase().includes("notice");
  if (isDisclaimer) return <DisclaimerBlock text={content} />;

  const isHero = emphasis === "hero";

  return (
    <section
      aria-labelledby={headingId}
      className={
        isHero
          ? "rounded-2xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/30 via-zinc-950/70 to-zinc-950 p-6 shadow-sm"
          : "rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-5"
      }
    >
      <h3
        id={headingId}
        className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-3 ${isHero ? "text-emerald-400/90" : "text-zinc-500"
          }`}
      >
        {num}. {title}
      </h3>
      <p
        className={`whitespace-pre-wrap leading-relaxed ${isHero ? "text-[15px] leading-7 text-zinc-100" : "text-sm text-zinc-300"
          }`}
      >
        {content}
      </p>
    </section>
  );
}

// ─── BulletCard ───────────────────────────────────────────────────────────────

function BulletCard({
  title,
  items,
  tone,
  num,
  density,
  headingId,
  variant = "numbered",
}: {
  title: string;
  items: string[];
  tone: Tone;
  num: number;
  density: Density;
  headingId: string;
  variant?: BulletVariant;
}) {
  if (!items.length) return null;
  const t = TONE_STYLES[tone];
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-xl border p-5 ${t.border} ${t.bg}`}
    >
      <h3
        id={headingId}
        className={`text-[10px] font-bold uppercase tracking-[0.18em] ${t.title}`}
      >
        {num}. {title}
      </h3>
      <BulletList
        items={items}
        tone={tone}
        density={density}
        labelledBy={headingId}
        variant={variant}
      />
    </section>
  );
}

// ─── SplitBulletCard ──────────────────────────────────────────────────────────

function SplitBulletCard({
  leftTitle,
  rightTitle,
  leftItems,
  rightItems,
  num,
  density,
  headingId,
}: {
  leftTitle: string;
  rightTitle: string;
  leftItems: string[];
  rightItems: string[];
  num: number;
  density: Density;
  headingId: string;
}) {
  if (!leftItems.length && !rightItems.length) return null;
  const leftId = `${headingId}-l`;
  const rightId = `${headingId}-r`;

  return (
    <section
      aria-label={`${leftTitle} and ${rightTitle}`}
      className={`grid gap-4 ${leftItems.length && rightItems.length ? "lg:grid-cols-2" : ""}`}
    >
      {leftItems.length > 0 && (
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-5">
          <h3
            id={leftId}
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400"
          >
            {num}a. {leftTitle}
          </h3>
          <BulletList
            items={leftItems}
            tone="positive"
            density={density}
            labelledBy={leftId}
            variant="check"
          />
        </div>
      )}
      {rightItems.length > 0 && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/18 p-5">
          <h3
            id={rightId}
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400"
          >
            {leftItems.length > 0 ? `${num}b` : num}. {rightTitle}
          </h3>
          <BulletList
            items={rightItems}
            tone="caution"
            density={density}
            labelledBy={rightId}
            variant="dot"
          />
        </div>
      )}
    </section>
  );
}

// ─── MergedBulletCard ────────────────────────────────────────────────────────

function MergedBulletCard({
  title,
  advantages,
  disadvantages,
  num,
  density,
  headingId,
}: {
  title: string;
  advantages: string[];
  disadvantages: string[];
  num: number;
  density: Density;
  headingId: string;
}) {
  if (!advantages.length && !disadvantages.length) return null;

  if (density === "compact") {
    return (
      <section
        aria-labelledby={headingId}
        className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 p-5"
      >
        <h3
          id={headingId}
          className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 mb-3"
        >
          {num}. {title}
        </h3>
        <div className="flex flex-wrap gap-2" role="list">
          {advantages.map((a, i) => (
            <span
              key={`pro-${i}`}
              role="listitem"
              className="rounded-full bg-emerald-900/50 px-3 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-700/40"
            >
              {a}
            </span>
          ))}
          {disadvantages.map((d, i) => (
            <span
              key={`con-${i}`}
              role="listitem"
              className="rounded-full bg-rose-900/40 px-3 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-700/30"
            >
              {d}
            </span>
          ))}
        </div>
      </section>
    );
  }

  const merged = [...advantages, ...disadvantages];
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 p-5"
    >
      <h3
        id={headingId}
        className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300"
      >
        {num}. {title}
      </h3>
      <ul className="mt-3.5 space-y-2.5">
        {merged.map((x, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400"
            />
            <span className="text-sm leading-relaxed text-zinc-300">{x}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Custom: short answer layout ──────────────────────────────────────────────

function CustomShortAnswerLayout({
  sections,
  question,
  reportId,
}: {
  sections: PlantInfoSections;
  question: string;
  reportId: string;
}) {
  const topic = detectCustomQuestionTopic(question);
  const hasFacts = sections.advantages.length > 0;
  const hasCaveats = sections.disadvantages.length > 0;
  const hasContext = sections.uses_and_care_tips.trim().length > 0;
  const hasVerify = sections.identification_and_safety.trim().length > 0;

  const factId = `${reportId}-facts`;
  const caveatId = `${reportId}-caveats`;

  return (
    <div className="mt-6 space-y-4">
      {/* Direct answer */}
      <div className="rounded-xl border border-sky-700/40 bg-gradient-to-br from-sky-950/40 via-zinc-950/80 to-zinc-950 p-6 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-400/80 mb-2">
          Answer
        </p>
        <p className="text-[15px] leading-7 font-medium text-zinc-100">
          {sections.overview}
        </p>
      </div>

      {/* Facts + caveats */}
      {(hasFacts || hasCaveats) && (
        <div
          className={`grid gap-3 ${hasFacts && hasCaveats ? "sm:grid-cols-2" : ""}`}
        >
          {hasFacts && (
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
              <h3
                id={factId}
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400 mb-3"
              >
                {topic === "safety"
                  ? "Risk factors"
                  : topic === "care"
                    ? "Key facts"
                    : "Supporting evidence"}
              </h3>
              <ul className="space-y-2">
                {sections.advantages.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-emerald-400"
                    />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasCaveats && (
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/18 p-4">
              <h3
                id={caveatId}
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400 mb-3"
              >
                Caveats &amp; limits
              </h3>
              <ul className="space-y-2">
                {sections.disadvantages.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <span
                      aria-hidden="true"
                      className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-amber-400"
                    />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Extra context */}
      {hasContext && (
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2">
            More context
          </p>
          <p className="text-sm leading-relaxed text-zinc-300">
            {sections.uses_and_care_tips}
          </p>
        </div>
      )}

      {/* Verification note */}
      {hasVerify && (
        <p className="flex items-start gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-4 py-2.5 text-xs text-zinc-500 leading-relaxed">
          <span className="shrink-0 mt-0.5" aria-hidden="true">🔍</span>
          <span>{sections.identification_and_safety}</span>
        </p>
      )}

      {/* Disclaimer */}
      {sections.disclaimer.trim() && (
        <p className="text-[11px] italic text-zinc-600 px-1 leading-relaxed">
          {sections.disclaimer}
        </p>
      )}
    </div>
  );
}

// ─── Custom: full answer layout ───────────────────────────────────────────────

function CustomFullAnswerLayout({
  sections,
  density,
  reportId,
}: {
  sections: PlantInfoSections;
  density: Density;
  reportId: string;
}) {
  let n = 0;
  const next = () => ++n;

  const overviewId = `${reportId}-overview`;
  const detailId = `${reportId}-detail`;
  const factsId = `${reportId}-facts`;
  const caveatsId = `${reportId}-caveats`;
  const stepsId = `${reportId}-steps`;
  const verifyId = `${reportId}-verify`;

  const hasDetail = sections.uses_and_care_tips.trim().length > 0;
  const hasFacts = sections.advantages.length > 0;
  const hasCaveats = sections.disadvantages.length > 0;
  const hasSteps = sections.traditional_or_cultural_notes.trim().length > 0;
  const hasVerify = sections.identification_and_safety.trim().length > 0;

  return (
    <div className="mt-6 space-y-4">
      {/* 1. Direct answer */}
      <section
        aria-labelledby={overviewId}
        className="rounded-xl border border-violet-800/40 bg-gradient-to-br from-violet-950/30 via-zinc-950/80 to-zinc-950 p-6 shadow-sm"
      >
        <h3
          id={overviewId}
          className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-400 mb-3"
        >
          {next()}. Direct answer
        </h3>
        <p className="text-[15px] leading-7 text-zinc-100 whitespace-pre-wrap">
          {sections.overview}
        </p>
      </section>

      {/* 2. In-depth response */}
      {hasDetail && (
        <section
          aria-labelledby={detailId}
          className="rounded-xl border border-emerald-800/35 bg-zinc-950/50 p-6"
        >
          <h3
            id={detailId}
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400 mb-3"
          >
            {next()}. In-depth response
          </h3>
          <p className="text-sm leading-7 text-zinc-200 whitespace-pre-wrap">
            {sections.uses_and_care_tips}
          </p>
        </section>
      )}

      {/* 3+4. Facts & caveats */}
      {(hasFacts || hasCaveats) && (
        <div className={`grid gap-4 ${hasFacts && hasCaveats ? "lg:grid-cols-2" : ""}`}>
          {hasFacts && (
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-5">
              <h3
                id={factsId}
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400 mb-1"
              >
                {next()}. Supporting facts
              </h3>
              <ul className="mt-3 space-y-3">
                {sections.advantages.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                    <span
                      aria-hidden="true"
                      className={`shrink-0 mt-[3px] font-bold text-emerald-500 min-w-[1.25rem] tabular-nums`}
                    >
                      {i + 1}.
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasCaveats && (
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/18 p-5">
              <h3
                id={caveatsId}
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400 mb-1"
              >
                {hasFacts ? `${n}b` : next()}. Uncertainties &amp; caveats
              </h3>
              <ul className="mt-3 space-y-3">
                {sections.disadvantages.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <span
                      aria-hidden="true"
                      className="mt-[8px] h-2 w-2 shrink-0 rounded-full bg-amber-400"
                    />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Further context */}
      {hasSteps && (
        <section
          aria-labelledby={stepsId}
          className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-5"
        >
          <h3
            id={stepsId}
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 mb-3"
          >
            {next()}. Further context
          </h3>
          <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {sections.traditional_or_cultural_notes}
          </p>
        </section>
      )}

      {/* Verification */}
      {hasVerify && (
        <section
          aria-labelledby={verifyId}
          className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 px-5 py-4"
        >
          <h3
            id={verifyId}
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2"
          >
            {next()}. Verification &amp; safety
          </h3>
          <p className="text-sm leading-relaxed text-zinc-400">
            {sections.identification_and_safety}
          </p>
        </section>
      )}

      {/* Disclaimer */}
      {sections.disclaimer.trim() && (
        <p className="text-[11px] italic text-zinc-600 px-1 leading-relaxed">
          {sections.disclaimer}
        </p>
      )}
    </div>
  );
}

// ─── RenderBlock ──────────────────────────────────────────────────────────────

function RenderBlock({
  block,
  sections,
  visibleIndex,
  density,
}: {
  block: PlantDisplayBlock;
  sections: PlantInfoSections;
  visibleIndex: number;
  density: Density;
}) {
  const headingId = useId();
  const num = visibleIndex;

  if (block.kind === "paragraph") {
    const raw = sections[block.field as keyof PlantInfoSections];
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) return null;
    if (block.field === "disclaimer") return <DisclaimerBlock text={text} />;
    return (
      <SectionCard
        title={block.title}
        content={text}
        num={num}
        emphasis={block.emphasis}
        headingId={headingId}
      />
    );
  }

  if (block.kind === "bullets") {
    const raw = sections[block.field as keyof PlantInfoSections];
    const items = Array.isArray(raw)
      ? raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
    if (!items.length) return null;
    const tone = (block as { tone: Tone }).tone;
    const variant: BulletVariant =
      tone === "positive" ? "check" : tone === "caution" ? "dot" : "numbered";
    return (
      <BulletCard
        title={block.title}
        items={items}
        tone={tone}
        num={num}
        density={density}
        headingId={headingId}
        variant={variant}
      />
    );
  }

  if (block.kind === "split_bullets") {
    const leftItems = sections.advantages.filter((s) => s.trim());
    const rightItems = sections.disadvantages.filter((s) => s.trim());
    if (!leftItems.length && !rightItems.length) return null;
    const sb = block as { left: { title: string }; right: { title: string } };
    return (
      <SplitBulletCard
        leftTitle={sb.left.title}
        rightTitle={sb.right.title}
        leftItems={leftItems}
        rightItems={rightItems}
        num={num}
        density={density}
        headingId={headingId}
      />
    );
  }

  if (block.kind === "bullet_merge") {
    const advantages = sections.advantages.filter((s) => s.trim());
    const disadvantages = sections.disadvantages.filter((s) => s.trim());
    if (!advantages.length && !disadvantages.length) return null;
    return (
      <MergedBulletCard
        title={(block as { title: string }).title}
        advantages={advantages}
        disadvantages={disadvantages}
        num={num}
        density={density}
        headingId={headingId}
      />
    );
  }

  return null;
}

// ─── Content peek ─────────────────────────────────────────────────────────────

function blockHasContent(
  block: PlantDisplayBlock,
  sections: PlantInfoSections,
): boolean {
  if (block.kind === "paragraph") {
    const raw = sections[block.field as keyof PlantInfoSections];
    return typeof raw === "string" && raw.trim().length > 0;
  }
  if (block.kind === "bullets") {
    const raw = sections[block.field as keyof PlantInfoSections];
    return (
      Array.isArray(raw) &&
      raw.some((s) => typeof s === "string" && s.trim().length > 0)
    );
  }
  if (block.kind === "split_bullets") {
    return (
      sections.advantages.some((s) => s.trim()) ||
      sections.disadvantages.some((s) => s.trim())
    );
  }
  if (block.kind === "bullet_merge") {
    return (
      sections.advantages.some((s) => s.trim()) ||
      sections.disadvantages.some((s) => s.trim())
    );
  }
  return false;
}

// ─── VisibleBlockList ─────────────────────────────────────────────────────────

function VisibleBlockList({
  blocks,
  sections,
  density,
}: {
  blocks: PlantDisplayBlock[];
  sections: PlantInfoSections;
  density: Density;
}) {
  let visibleCount = 0;
  return (
    <>
      {blocks.map((block, i) => {
        if (blockHasContent(block, sections)) visibleCount += 1;
        return (
          <RenderBlock
            key={`${block.kind}-${i}`}
            block={block}
            sections={sections}
            visibleIndex={visibleCount}
            density={density}
          />
        );
      })}
    </>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlantAnswerDisplayProps {
  /** Focus mode used to generate this report. */
  focus: PlantInfoFocus;
  /** Human-readable focus label (e.g. "Grow & care guide"). */
  focusLabel: string | null;
  /** User's custom question; only present when focus === "custom". */
  customQuestion?: string | null;
  /** Structured sections parsed from the model response. */
  sections: PlantInfoSections;
  /** Whether the response is a draft template rather than a live completion. */
  degraded?: boolean;
  /** Soft warning shown in the report header. */
  warning?: string | null;
  /** 2–4 at-a-glance bullet points. */
  highlights?: string[];
  /** Raw model identifier string (e.g. "claude-3-haiku-20240307"). */
  model?: string | null;
  /**
   * Answer mode for custom-focus reports.
   * "short" = concise Q&A; "full" = rich multi-section.
   * Only meaningful when focus === "custom".
   */
  answerMode?: "short" | "full";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PlantAnswerDisplay({
  focus,
  focusLabel,
  customQuestion,
  sections,
  degraded = false,
  warning,
  highlights = [],
  model,
  answerMode,
}: PlantAnswerDisplayProps) {
  const { layout, blocks } = resolveDisplayBlocks(
    focus,
    sections,
    customQuestion ?? undefined,
  );
  const density = getDensity(sections);
  const isCustom = focus === "custom";
  const reportId = useId();

  // Derive answerMode from content when not explicitly provided
  const effectiveMode: "short" | "full" =
    answerMode ??
    (isCustom
      ? density === "compact" ||
        (sections.overview.length < 120 &&
          sections.uses_and_care_tips.length < 250)
        ? "short"
        : "full"
      : "full");

  // ── Outer article style ──────────────────────────────────────────────────────
  const containerPadding =
    isCustom && effectiveMode === "short"
      ? "p-5"
      : density === "compact"
        ? "p-4"
        : density === "standard"
          ? "p-5"
          : "p-6";

  const articleBorderBg = isCustom
    ? effectiveMode === "short"
      ? degraded
        ? "border-sky-800/40 bg-gradient-to-b from-sky-950/20 via-zinc-950/95 to-zinc-950"
        : "border-sky-700/30 bg-gradient-to-b from-sky-950/15 via-zinc-950/90 to-zinc-950"
      : degraded
        ? "border-violet-800/40 bg-gradient-to-b from-violet-950/20 via-zinc-950/95 to-zinc-950"
        : "border-violet-700/35 bg-gradient-to-b from-violet-950/15 via-zinc-950/90 to-zinc-950"
    : degraded
      ? "border-blue-800/40 bg-gradient-to-b from-blue-950/25 via-zinc-950/90 to-zinc-950"
      : "border-zinc-700/60 bg-zinc-950/80";

  return (
    <article
      aria-labelledby={reportId}
      className={`rounded-2xl border shadow-lg ${containerPadding} ${articleBorderBg}`}
    >
      {/* ── Header ── */}
      <header className="border-b border-zinc-800/80 pb-5">
        {/* Eyebrow */}
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          {isCustom
            ? effectiveMode === "short"
              ? "Quick answer"
              : "Custom Q&A"
            : "Plant write-up"}
        </p>

        {/* Title + subtitle */}
        <h2
          id={reportId}
          className="mt-1 text-lg font-semibold tracking-tight text-zinc-100"
        >
          {layout.reportTitle}
        </h2>
        <p className="mt-1 text-sm text-zinc-400">{layout.subtitle}</p>

        {/* Custom question callout */}
        {isCustom && customQuestion?.trim() && (
          <div
            className={`mt-4 rounded-xl border px-4 py-4 ${effectiveMode === "short"
                ? "border-sky-700/40 bg-sky-950/25"
                : "border-violet-700/40 bg-violet-950/25"
              }`}
          >
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.18em] ${effectiveMode === "short"
                  ? "text-sky-400/90"
                  : "text-violet-400/90"
                }`}
            >
              Your question
            </p>
            <p
              className={`mt-2 text-sm font-medium leading-relaxed ${effectiveMode === "short"
                  ? "text-sky-50/95"
                  : "text-violet-50/95"
                }`}
            >
              {customQuestion.trim()}
            </p>
          </div>
        )}

        {/* Badge row */}
        <div
          className="mt-4 flex flex-wrap gap-2"
          role="list"
          aria-label="Report metadata"
        >
          {/* Focus label badge (non-custom only) */}
          {!isCustom && focusLabel && (
            <Pill
              className="border-emerald-700/50 bg-emerald-950/50 text-emerald-200"
            >
              {focusLabel}
            </Pill>
          )}

          {/* Topic badge (custom only) */}
          {isCustom && customQuestion?.trim() && (
            <Pill className="border-violet-600/45 bg-violet-950/40 text-violet-100">
              Topic: {customTopicLabel(customQuestion)}
            </Pill>
          )}

          {/* Answer mode (custom only) */}
          {isCustom && <AnswerModeBadge mode={effectiveMode} />}

          {/* Model */}
          <ModelBadge model={model} degraded={degraded} />

          {/* Density (compact non-custom) */}
          {!isCustom && !degraded && <DensityBadge density={density} />}
        </div>

        {/* Warning banner */}
        {warning && <WarningBanner text={warning} />}
      </header>

      {/* ── Body ── */}
      {isCustom && customQuestion?.trim() ? (
        /* Custom Q&A: adaptive layouts */
        effectiveMode === "short" ? (
          <CustomShortAnswerLayout
            sections={sections}
            question={customQuestion}
            reportId={reportId}
          />
        ) : (
          <CustomFullAnswerLayout
            sections={sections}
            density={density}
            reportId={reportId}
          />
        )
      ) : (
        <>
          {/* Highlights */}
          <HighlightStrip
            highlights={highlights}
            isCustom={isCustom}
            density={density}
          />

          {/* Numbered content blocks */}
          <div
            className={`mt-5 flex flex-col ${density === "compact"
                ? "gap-3"
                : density === "standard"
                  ? "gap-4"
                  : "gap-5"
              }`}
          >
            <VisibleBlockList
              blocks={blocks}
              sections={sections}
              density={density}
            />
          </div>
        </>
      )}
    </article>
  );
}