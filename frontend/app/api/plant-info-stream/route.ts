import Groq from "groq-sdk";
import { formatSearchContext, webSearchPlantContext } from "@/lib/web-search";
import { focusLabel } from "@/lib/plant-fallback";
import type { PlantInfoFocus, PlantInfoWebSearch } from "@/types/plant-info";
import { detectAnswerMode } from "@/lib/plant-prompts";

// ─── Constants ───────────────────────────────────────────────────────────────

const FOCUS_VALUES: PlantInfoFocus[] = [
  "balanced", "gardening", "ecology", "cultural", "concise", "custom",
];
const CUSTOM_QUESTION_MIN = 10;
const CUSTOM_QUESTION_MAX = 500;

// ─── Utilities ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function envNumber(name: string, fallback: number, lo: number, hi: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
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

// ─── Markdown system prompt ──────────────────────────────────────────────────

function buildMarkdownSystemPrompt(
  focus: PlantInfoFocus,
  customQuestion?: string,
): string {
  const shared = `You are an expert botanist AI assistant producing beautifully formatted plant reports.

CRITICAL RULES:
- Use Markdown formatting: ## headings, **bold**, *italic*, bullet lists, numbered lists, > blockquotes
- Write educationally and informatively — NEVER provide medical diagnosis, treatment, dosages, or ingestion instructions
- If the plant may be toxic or confused with a toxic look-alike, state this clearly
- Do not claim certainty from a photo label; classifiers can be wrong
- Use clear, neutral language — accurate about risks without fearmongering
- When web search snippets are provided, use them to ground factual claims
- Output MUST be formatted Markdown. Do NOT output JSON.`;

  if (focus === "custom" && customQuestion?.trim()) {
    const mode = detectAnswerMode(customQuestion);
    return `${shared}

The user asked a custom question about a plant. Answer it ${mode === "short" ? "concisely and directly" : "thoroughly with detailed sections"}.

Format your response as Markdown using standard icons:
${mode === "short" ? `## 📋 Answer
Give a direct, concise answer (2-3 sentences).

## ✅ Key Facts
- Bullet points of supporting evidence

## ⚠️ Caveats
- Important limitations or warnings

> **Note:** Brief educational disclaimer.` : `## 📋 Answer
Give a comprehensive overview answer (3-5 sentences).

## 📖 Detailed Analysis
Thorough multi-paragraph explanation covering all aspects of the question.

## ✅ Supporting Evidence
- Numbered or bulleted detailed facts

## ⚠️ Caveats & Limitations
- Important warnings, exceptions, uncertainties

## 📖 Additional Context
Any relevant cultural, ecological, or practical context.

> **Disclaimer:** Educational information only — not medical or professional advice.`}

User's question: "${customQuestion.trim()}"`;
  }

  const focusInstructions: Record<PlantInfoFocus, string> = {
    balanced: `Write a **Balanced Plant Profile** with these sections:

## 📋 Overview
2-5 sentence overview of the plant, its key traits, and photo-ID uncertainty.

## ✅ Advantages & Benefits
- 4-8 bullet points covering ecological, ornamental, and practical benefits

## ⚠️ Risks & Considerations
- 4-8 bullet points covering toxicity, invasiveness, look-alike confusion

## 📖 Uses & Care
Paragraph covering non-medical uses AND general care basics.

## 📖 Cultural & Traditional Notes
Brief paragraph about cultural significance (if any).

## 🔍 Identification & Safety
Verification steps and safety cautions.

> **Disclaimer:** Educational use only — not medical advice.`,

    gardening: `Write a **Gardening & Care Guide** with these sections:

## 📋 Growing Overview
2-4 sentences about growing this plant (hardiness, size, garden role).

## ✅ Cultivation Highlights
- 4-8 bullet points: ease of growth, ornamental value, harvest potential, companion planting

## ⚠️ Gardening Challenges
- 4-8 bullet points: pest susceptibility, watering demands, climate limits, toxicity

## 📖 Complete Care Guide
**Detailed section** (6+ sentences): light, soil, water, fertilizer, pruning, container growing, seasonal tasks, common pests & solutions.

## 🔍 Identification Notes
Confirm species before applying care advice; mis-ID risks.

> **Note:** Informational only — consult local extension services for region-specific advice.`,

    ecology: `Write an **Ecological Profile** with these sections:

## 🌐 Habitat & Range
2-4 sentences: native range, preferred habitat, ecological role.

## ✅ Ecological Benefits
- 4-8 bullets: pollinators, wildlife food, soil stabilization, carbon sequestration

## ⚠️ Environmental Risks
- 4-8 bullets: invasive spread, habitat displacement, allelopathy

## 📖 Conservation & Habitat Details
Habitat preferences, invasive status, conservation context.

## 🔍 Identification Notes
Mis-ID risks affecting conservation decisions.

> **Note:** Educational information only.`,

    cultural: `Write a **Cultural & Historical Profile** with these sections:

## 📋 Cultural Significance
2-4 sentences about cultural recognition and regional significance.

## ✅ Heritage & Uses
- 4-8 bullets: heritage use, art, festivals, religious symbolism, educational value

## ⚠️ Cautions
- 4-8 bullets: misinformation risk, regional variation, mis-identification

## 📖 Traditional & Folklore
**Required non-empty paragraph:** folklore, mythology, ceremonial use, historical trade significance.

## 📖 Non-Medical Uses
Documented non-medical uses: ornamental, craft, cuisine as general cultural facts.

## 🔍 Identification Notes
Cultural use does not replace botanical identification.

> **Note:** Not medical advice — consult ethnobotanists for traditional use.`,

    concise: `Write a **Quick Summary** — keep everything SHORT:

## 📋 Summary
1-2 sentences only — the essential identity fact.

## ✅ Key Points
- 3 short positives
- ⚠️ 3 short risks/caveats

## 📖 Brief Care Notes
2-3 sentences maximum.

> **Note:** Educational use only.`,

    custom: "", // Handled above
  };

  return `${shared}

${focusInstructions[focus]}`;
}

// ─── Route Handler (SSE Streaming) ────────────────────────────────────────────

export async function POST(request: Request) {
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
    return new Response(JSON.stringify({ detail: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const plantName = typeof body.plantName === "string" ? body.plantName.trim() : "";
  if (!plantName) {
    return new Response(JSON.stringify({ detail: "plantName is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const focus = normalizeFocus(body.focus);
  const customQuestion = normalizeCustomQuestion(body.customQuestion);

  if (focus === "custom" && customQuestion.length < CUSTOM_QUESTION_MIN) {
    return new Response(
      JSON.stringify({
        detail: `Custom question must be ${CUSTOM_QUESTION_MIN}–${CUSTOM_QUESTION_MAX} characters.`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!apiKey) {
    return new Response(
      JSON.stringify({ detail: "GROQ_API_KEY not configured." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const classificationNote =
    typeof body.classificationNote === "string" ? body.classificationNote.trim() : "";

  // ── Web search ──
  const wantSearch = body.includeWebSearch === true;
  const defaultNum = envNumber("WEB_SEARCH_NUM_RESULTS", 5, 1, 10);
  const numSearch =
    typeof body.numSearchResults === "number" && Number.isFinite(body.numSearchResults)
      ? clamp(Math.floor(body.numSearchResults), 1, 10)
      : defaultNum;

  const webMeta: PlantInfoWebSearch = {
    requested: wantSearch,
    used: false,
    provider: null,
    results: [],
  };

  let searchContext = "";
  if (wantSearch) {
    try {
      const { provider, results } = await webSearchPlantContext(plantName, numSearch);
      webMeta.provider = provider;
      webMeta.results = results;
      if (provider && results.length > 0) {
        webMeta.used = true;
        searchContext = formatSearchContext(results);
      }
    } catch {
      // silently skip search failures during streaming
    }
  }

  // ── Build prompts ──
  const systemInstruction = buildMarkdownSystemPrompt(focus, customQuestion);

  const note = classificationNote
    ? `\nClassifier context (may be inaccurate): ${classificationNote}`
    : "";
  const search = searchContext
    ? `\n\n─── Web search snippets (supplementary only) ───\n${searchContext}\n────────────────────────────────────────────────\nUse these snippets to ground factual claims.\n`
    : "";

  const userPrompt = `Plant identified from leaf photo: "${plantName}".${note}

Report style: ${focusLabel(focus)}${focus === "custom" && customQuestion ? `\nUser question: "${customQuestion}"` : ""}
${search}
Write a well-formatted Markdown report following the structure specified in your instructions.`;

  // ── Model config ──
  const modelId = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
  const temperatureBase = envNumber("GROQ_TEMPERATURE", 0.65, 0, 2);
  const temperature = focus === "concise"
    ? Math.min(temperatureBase, 0.5)
    : focus === "custom"
      ? Math.min(temperatureBase, 0.4)
      : temperatureBase;
  const maxTokens = focus === "concise"
    ? envNumber("GROQ_MAX_OUTPUT_TOKENS_CONCISE", 1024, 256, 8192)
    : envNumber("GROQ_MAX_OUTPUT_TOKENS", 8192, 512, 8192);

  // ── SSE stream ──
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send web search metadata as first event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "meta", webSearch: webMeta, focus, model: modelId })}\n\n`),
        );

        const client = new Groq({ apiKey });
        const chatStream = await client.chat.completions.create({
          model: modelId,
          max_tokens: maxTokens,
          temperature,
          top_p: envNumber("GROQ_TOP_P", 0.9, 0, 1),
          stream: true,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
        });

        for await (const chunk of chatStream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`),
            );
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Stream failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
