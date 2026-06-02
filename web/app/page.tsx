"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlantAnswerDisplay } from "@/app/display_section";
import type { PlantInfoFocus, PlantInfoSections, PlantInfoWebSearch } from "@/types/plant-info";
import { 
  Camera, 
  Upload, 
  Sparkles, 
  Search, 
  Globe, 
  AlertTriangle, 
  CheckCircle2, 
  Users, 
  GraduationCap, 
  BookOpen, 
  Sprout, 
  Compass, 
  Info,
  ChevronDown
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Prediction = { label: string; confidence: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

const FOCUS_OPTIONS: { value: PlantInfoFocus; label: string; icon: any; hint: string }[] = [
  {
    value: "balanced",
    label: "Balanced overview",
    icon: Compass,
    hint: "Pros, cons, uses, and safety in one report",
  },
  {
    value: "gardening",
    label: "How do I grow and care for it?",
    icon: Sprout,
    hint: "Cultivation guide — light, soil, water, pests",
  },
  {
    value: "ecology",
    label: "What is its ecological role?",
    icon: Globe,
    hint: "Habitat, wildlife, invasiveness, conservation",
  },
  {
    value: "cultural",
    label: "What is its cultural history?",
    icon: BookOpen,
    hint: "Heritage context and non-medical uses",
  },
  {
    value: "concise",
    label: "Give me a short summary",
    icon: Info,
    hint: "Brief key points only",
  },
  {
    value: "custom",
    label: "Ask my own question…",
    icon: Sparkles,
    hint: "Write any question — the model answers your wording",
  },
];

const CUSTOM_QUESTION_MIN = 10;
const CUSTOM_QUESTION_MAX = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPredictionArray(value: unknown): value is Prediction[] {
  return (
    Array.isArray(value) &&
    value.every(
      (x) =>
        !!x &&
        typeof x === "object" &&
        typeof (x as { label?: unknown }).label === "string" &&
        typeof (x as { confidence?: unknown }).confidence === "number",
    )
  );
}

function isPlantInfoSections(value: unknown): value is PlantInfoSections {
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

function isPlantInfoWebSearch(value: unknown): value is PlantInfoWebSearch {
  if (!value || typeof value !== "object") return false;
  const ws = value as Partial<PlantInfoWebSearch>;
  return (
    typeof ws.requested === "boolean" &&
    typeof ws.used === "boolean" &&
    (ws.provider === "serpapi" || ws.provider === "google_cse" || ws.provider === null) &&
    Array.isArray(ws.results)
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────


export default function Home() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const writeUpRef = useRef<HTMLDivElement>(null);

  // Image state
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  // Classification state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[] | null>(null);

  // Info/write-up state
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [infoSections, setInfoSections] = useState<PlantInfoSections | null>(null);
  const [infoFocus, setInfoFocus] = useState<PlantInfoFocus>("balanced");
  const [customQuestion, setCustomQuestion] = useState("");
  const [infoCustomQuestion, setInfoCustomQuestion] = useState<string | null>(null);
  const [infoFocusLabel, setInfoFocusLabel] = useState<string | null>(null);
  const [includeWebSearch, setIncludeWebSearch] = useState(false);
  const [infoWebSearch, setInfoWebSearch] = useState<PlantInfoWebSearch | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoWarning, setInfoWarning] = useState<string | null>(null);
  const [infoDegraded, setInfoDegraded] = useState(false);
  const [infoHighlights, setInfoHighlights] = useState<string[]>([]);
  const [infoModel, setInfoModel] = useState<string | null>(null);
  const [infoAnswerMode, setInfoAnswerMode] = useState<"short" | "full" | null>(null);
  const [focusChanged, setFocusChanged] = useState(false);
  // Stable key so the write-up re-mounts only when a new result comes in
  const [writeUpKey, setWriteUpKey] = useState(0);

  const topPrediction = predictions?.[0] ?? null;
  const customQuestionTrimmed = customQuestion.trim();
  const customQuestionValid =
    infoFocus !== "custom" ||
    (customQuestionTrimmed.length >= CUSTOM_QUESTION_MIN &&
      customQuestionTrimmed.length <= CUSTOM_QUESTION_MAX);

  const selectedFocusLabel = useMemo(() => {
    if (infoFocus === "custom") {
      return customQuestionTrimmed.length >= CUSTOM_QUESTION_MIN
        ? `Custom: ${customQuestionTrimmed.slice(0, 48)}${customQuestionTrimmed.length > 48 ? "…" : ""}`
        : "Custom question";
    }
    return FOCUS_OPTIONS.find((o) => o.value === infoFocus)?.label ?? "Balanced overview";
  }, [infoFocus, customQuestionTrimmed]);

  const safeSources = useMemo(
    () =>
      (infoWebSearch?.results ?? [])
        .map((r) => ({ ...r, safeUrl: normalizeHttpUrl(r.url) }))
        .filter((r) => r.safeUrl),
    [infoWebSearch],
  );

  const hasWriteUp = !!(infoSections || infoText);

  // ── Cleanup helpers ──

  const resetPreview = useCallback(() => {
    setPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  const clearInfo = useCallback(() => {
    setInfoText(null);
    setInfoSections(null);
    setInfoWebSearch(null);
    setInfoError(null);
    setInfoWarning(null);
    setInfoDegraded(false);
    setInfoHighlights([]);
    setInfoModel(null);
    setInfoAnswerMode(null);
    setInfoFocusLabel(null);
    setInfoCustomQuestion(null);
  }, []);

  useEffect(() => () => resetPreview(), [resetPreview]);

  // ── File handling ──

  const onFile = useCallback(
    (f: File | null) => {
      if (f && !ALLOWED_IMAGE_TYPES.has(f.type)) {
        setError("Unsupported file type. Please use JPEG, PNG, or WebP.");
        return;
      }
      setError(null);
      setPredictions(null);
      setFocusChanged(false);
      clearInfo();
      resetPreview();
      setFile(f);
      if (f) setPreview(URL.createObjectURL(f));
    },
    [clearInfo, resetPreview],
  );

  // ── Classify ──

  const classify = async () => {
    if (!file) {
      setError("Choose or capture a leaf photo first.");
      return;
    }
    setLoading(true);
    setError(null);
    setPredictions(null);
    setFocusChanged(false);
    clearInfo();

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/classify", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.detail === "string" ? data.detail : res.statusText);
        return;
      }
      if (!isPredictionArray((data as { predictions?: unknown }).predictions)) {
        setError("Unexpected response from server.");
        return;
      }
      setPredictions(data.predictions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch plant info ──

  const fetchPlantInfo = async () => {
    const top = predictions?.[0];
    if (!top?.label) return;

    setInfoLoading(true);
    setInfoError(null);
    clearInfo();

    const note = predictions
      ?.slice(0, 3)
      .map((p) => `${p.label} (${(p.confidence * 100).toFixed(1)}%)`)
      .join("; ");

    try {
      const res = await fetch("/api/plant-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantName: top.label,
          classificationNote: note,
          focus: infoFocus,
          ...(infoFocus === "custom" ? { customQuestion: customQuestionTrimmed } : {}),
          includeWebSearch,
          numSearchResults: 5,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInfoError(typeof data.detail === "string" ? data.detail : res.statusText);
        return;
      }

      // Web search meta
      const ws = (data as { webSearch?: unknown }).webSearch;
      setInfoWebSearch(isPlantInfoWebSearch(ws) ? ws : null);

      // Degraded / highlights / model
      setInfoDegraded(data.degraded === true);
      const highlights = (data as { highlights?: unknown }).highlights;
      setInfoHighlights(
        Array.isArray(highlights) && highlights.every((x) => typeof x === "string")
          ? highlights
          : [],
      );
      setInfoModel(typeof data.model === "string" ? data.model : null);

      // Answer mode (custom Q&A only)
      const rawMode = (data as { answerMode?: unknown }).answerMode;
      setInfoAnswerMode(rawMode === "short" || rawMode === "full" ? rawMode : null);

      // Focus & custom question echo
      const returnedFocus =
        typeof (data as { focus?: unknown }).focus === "string"
          ? ((data as { focus: string }).focus as PlantInfoFocus)
          : infoFocus;
      // Only update focus if the server corrected it (avoids unnecessary re-renders)
      if (returnedFocus !== infoFocus) setInfoFocus(returnedFocus);

      const cq =
        typeof (data as { customQuestion?: unknown }).customQuestion === "string"
          ? (data as { customQuestion: string }).customQuestion.trim()
          : "";
      setInfoCustomQuestion(returnedFocus === "custom" && cq ? cq : null);

      setInfoFocusLabel(
        typeof data.focusLabel === "string"
          ? data.focusLabel
          : (FOCUS_OPTIONS.find((o) => o.value === returnedFocus)?.label ?? null),
      );

      // Warnings
      const warnings: string[] = [];
      if (typeof data.warning === "string" && data.warning.trim()) warnings.push(data.warning);
      if (returnedFocus !== infoFocus) {
        warnings.push(
          `Style mismatch: you selected "${FOCUS_OPTIONS.find((o) => o.value === infoFocus)?.label}", but the server returned "${FOCUS_OPTIONS.find((o) => o.value === returnedFocus)?.label}".`,
        );
      }
      setInfoWarning(warnings.length > 0 ? warnings.join(" ") : null);

      setFocusChanged(false);

      // Content
      const sec = (data as { sections?: unknown }).sections;
      if (isPlantInfoSections(sec)) {
        setInfoSections(sec);
        setInfoText(typeof data.text === "string" ? data.text : null);
      } else if (typeof data.text === "string") {
        setInfoText(data.text);
      } else {
        setInfoError("Unexpected response format from server.");
        return;
      }

      // Bump the key so the write-up card re-mounts with fresh animations
      setWriteUpKey((k) => k + 1);

      // Scroll to the write-up after a short tick
      setTimeout(() => {
        writeUpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (e) {
      setInfoError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setInfoLoading(false);
    }
  };

  // ── Render ──

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top_left,#0f2d1a_0%,#080d0a_50%,#04070505_100%)] text-zinc-100 flex flex-col">


      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      {/* ── Top navigation bar ── */}
      <nav className="shrink-0 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-xl px-6 py-3.5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <Sprout className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400/80">
              Plant AI
            </p>
            <p className="text-sm font-semibold leading-tight text-zinc-100">
              Leaf Identifier
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Classify → Generate structured plant write-up
        </div>
        <div className="flex items-center gap-2">
          {predictions && (
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-700/30">
              {predictions[0]?.label}
            </span>
          )}
        </div>
      </nav>

      {/* ── Main body: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ════════════════════════════════════════
            LEFT SIDEBAR — controls
        ════════════════════════════════════════ */}
        <aside className="w-[360px] lg:w-[400px] shrink-0 flex flex-col border-r border-zinc-800/60 bg-zinc-950/50 backdrop-blur-md overflow-y-auto">

          {/* Sidebar inner padding */}
          <div className="flex flex-col gap-5 p-5">

            {/* ── Section: Upload ── */}
            <section aria-label="Upload image">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Step 1 — Upload
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-950/30 px-3 py-4 text-xs font-semibold text-emerald-200 transition hover:border-emerald-500/60 hover:bg-emerald-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <Camera className="h-5 w-5 text-emerald-400 mb-0.5" />
                  Camera / Gallery
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/40 px-3 py-4 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                >
                  <Upload className="h-5 w-5 text-zinc-400 mb-0.5" />
                  Upload File
                </button>
              </div>

              {/* Classify button */}
              <button
                type="button"
                disabled={!file || loading}
                onClick={classify}
                className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition enabled:hover:bg-zinc-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900" />
                    Classifying…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Search className="h-4 w-4" />
                    Classify Leaf
                  </span>
                )}
              </button>

              {/* Classify error */}
              {error && (
                <p
                  role="alert"
                  className="mt-2.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-200"
                >
                  ⚠️ {error}
                </p>
              )}
            </section>

            {/* ── Divider ── */}
            {predictions && predictions.length > 0 && (
              <div className="h-px bg-zinc-800/70" />
            )}

            {/* ── Section: Classification Results ── */}
            {predictions && predictions.length > 0 && (
              <section aria-label="Classification results">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Step 2 — Results
                </p>
                <div className="space-y-2">
                  {predictions.map((p, idx) => (
                    <div
                      key={`${p.label}-${p.confidence}`}
                      className={`relative overflow-hidden rounded-xl border p-3.5 transition ${
                        idx === 0
                          ? "border-emerald-600/40 bg-gradient-to-r from-emerald-950/60 to-zinc-950/80"
                          : "border-zinc-800/60 bg-zinc-900/30"
                      }`}
                    >
                      {idx === 0 && (
                        <span className="absolute right-3 top-2.5 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                          Top match
                        </span>
                      )}
                      <p className={`truncate pr-20 text-sm font-medium ${idx === 0 ? "text-emerald-100" : "text-zinc-300"}`}>
                        {p.label}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800/80"
                          role="progressbar"
                          aria-valuenow={Math.round(p.confidence * 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${p.label} confidence`}
                        >
                          <div
                            className={`h-full rounded-full transition-all ${
                              idx === 0
                                ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                : "bg-zinc-600"
                            }`}
                            style={{ width: `${p.confidence * 100}%` }}
                          />
                        </div>
                        <span className={`min-w-[2.5rem] text-right text-xs font-bold tabular-nums ${idx === 0 ? "text-emerald-300" : "text-zinc-500"}`}>
                          {(p.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Divider ── */}
            {predictions && predictions.length > 0 && (
              <div className="h-px bg-zinc-800/70" />
            )}

            {/* ── Section: Write-up Settings ── */}
            {predictions && predictions.length > 0 && (
              <section aria-label="Write-up settings">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Step 3 — Generate
                </p>

                {/* Focus mode selector */}
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="focus-select"
                      className="mb-1.5 block text-xs font-semibold text-zinc-400"
                    >
                      Report focus
                    </label>
                    <div className="relative">
                      {/* Left status icon derived from current option */}
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400/80 pointer-events-none">
                        {(() => {
                          const Icon = FOCUS_OPTIONS.find((o) => o.value === infoFocus)?.icon || Compass;
                          return <Icon className="h-4 w-4" />;
                        })()}
                      </span>
                      <select
                        id="focus-select"
                        value={infoFocus}
                        onChange={(e) => {
                          setInfoFocus(e.target.value as PlantInfoFocus);
                          clearInfo();
                          setFocusChanged(true);
                        }}
                        className="w-full appearance-none rounded-xl border border-zinc-700/70 bg-zinc-900/60 pl-10 pr-10 py-3 text-sm font-semibold text-zinc-100 outline-none transition focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
                      >
                        {FOCUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value} className="bg-zinc-950 text-zinc-200">
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {/* Down arrow icon */}
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 leading-relaxed pl-1">
                      {infoFocus === "custom"
                        ? "Type your own question — the AI answers it directly."
                        : FOCUS_OPTIONS.find((o) => o.value === infoFocus)?.hint ?? ""}
                    </p>
                  </div>

                  {/* Custom question textarea */}
                  {infoFocus === "custom" && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="custom-plant-question"
                        className="block text-xs font-semibold text-zinc-400"
                      >
                        Your question
                      </label>
                      <textarea
                        id="custom-plant-question"
                        value={customQuestion}
                        onChange={(e) => {
                          setCustomQuestion(e.target.value.slice(0, CUSTOM_QUESTION_MAX));
                          clearInfo();
                          setFocusChanged(true);
                        }}
                        rows={3}
                        placeholder="e.g. Is this plant toxic to dogs? How do I propagate it?"
                        className="w-full resize-y rounded-xl border border-zinc-700/70 bg-zinc-900/60 px-3.5 py-3 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 transition focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
                      />
                      <div className="flex items-center justify-between px-1">
                        <p className="text-xs text-zinc-600 font-mono">
                          {customQuestionTrimmed.length}/{CUSTOM_QUESTION_MAX}
                        </p>
                        {customQuestionTrimmed.length > 0 &&
                          customQuestionTrimmed.length < CUSTOM_QUESTION_MIN && (
                            <p className="text-xs font-semibold text-amber-500">
                              Min {CUSTOM_QUESTION_MIN} chars
                            </p>
                          )}
                      </div>
                    </div>
                  )}

                  {/* Web search toggle */}
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-3.5 py-3 transition hover:bg-zinc-900/50">
                    <input
                      type="checkbox"
                      checked={includeWebSearch}
                      onChange={(e) => setIncludeWebSearch(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-emerald-400 shrink-0"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-emerald-500" />
                        Include web search
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">Grounds facts with current web sources</p>
                    </div>
                  </label>

                  {/* Focus changed notice */}
                  {focusChanged && !hasWriteUp && (
                    <p className="flex items-center gap-2 rounded-xl border border-emerald-700/30 bg-emerald-950/20 px-3.5 py-2.5 text-xs font-medium text-emerald-300">
                      <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
                      Style updated — click Generate to apply
                    </p>
                  )}

                  {/* Generate button */}
                  <button
                    type="button"
                    disabled={!topPrediction || infoLoading || !customQuestionValid}
                    onClick={fetchPlantInfo}
                    className="w-full rounded-xl border border-emerald-600/50 bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition enabled:hover:from-emerald-500 enabled:hover:to-emerald-400 enabled:hover:shadow-emerald-500/40 disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    {infoLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Generating…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Generate Write-up
                      </span>
                    )}
                  </button>

                  {/* Info error */}
                  {infoError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-900/60 bg-red-950/40 px-3.5 py-3 text-xs text-red-200 flex items-start gap-2"
                    >
                      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{infoError}</span>
                    </p>
                  )}
                </div>
              </section>
            )}

          </div>

          {/* Professional Group Project / Team footer */}
          <div className="mt-auto border-t border-zinc-900 bg-zinc-950/80 px-5 py-4">
            <div className="flex items-start gap-2.5">
              <Users className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  DEVELOPMENT TEAM
                </p>
                <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-xs font-semibold text-zinc-300">
                  <span>Achinta</span>
                  <span className="text-zinc-800">•</span>
                  <span>Tuhin</span>
                  <span className="text-zinc-800">•</span>
                  <span>Nirmalya</span>
                  <span className="text-zinc-800">•</span>
                  <span>Ganesh</span>
                  <span className="text-zinc-800">•</span>
                  <span>Chinmoy</span>
                </div>
                <p className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                  Plant AI Leaf Identifier Project
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ════════════════════════════════════════
            RIGHT PANEL — results & write-up
        ════════════════════════════════════════ */}
        <div className="flex-1 overflow-y-auto">

          {/* Empty state — no image yet */}
          {!file && !predictions && (
            <div className="flex h-full flex-col items-center justify-center gap-6 px-8 py-16 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-800/60 bg-zinc-900/40">
                <span className="text-4xl">🌿</span>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
                  Identify a plant from a leaf
                </h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                  Upload or photograph a leaf, classify it with the local model, then generate a detailed AI write-up in your chosen style.
                </p>
              </div>
              <div className="grid max-w-lg grid-cols-3 gap-3 w-full mt-2">
                {[
                  { icon: "📷", label: "Upload a leaf photo", sub: "JPEG · PNG · WebP" },
                  { icon: "🔍", label: "Classify species", sub: "Local ML model" },
                  { icon: "✨", label: "Generate write-up", sub: "AI-powered report" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 text-center">
                    <div className="text-2xl mb-2">{s.icon}</div>
                    <p className="text-xs font-semibold text-zinc-300">{s.label}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image loaded but not classified yet */}
          {file && !predictions && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-16 text-center">
              <div className="overflow-hidden rounded-2xl border border-zinc-700/60 bg-black/30 shadow-2xl max-w-sm w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview ?? ""} alt="Leaf preview" className="max-h-80 w-full object-contain" />
              </div>
              <p className="text-sm text-zinc-400">
                Image ready — click <span className="font-semibold text-white">Classify Leaf</span> in the sidebar
              </p>
            </div>
          )}

          {/* Classifying spinner */}
          {loading && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-4">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                <p className="text-sm text-zinc-400">Classifying leaf…</p>
              </div>
            </div>
          )}

          {/* Results area */}
          {predictions && predictions.length > 0 && (
            <div className="p-6 lg:p-8 space-y-6">

              {/* Results header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">
                    Classification complete
                  </p>
                  <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-zinc-100">
                    {predictions[0]?.label}
                  </h1>
                  <p className="mt-1 text-sm text-zinc-500">
                    Top confidence: <span className="font-semibold text-emerald-300">{(predictions[0]!.confidence * 100).toFixed(1)}%</span>
                    {predictions.length > 1 && (
                      <span className="ml-2 text-zinc-600">· {predictions.length - 1} alternative{predictions.length > 2 ? "s" : ""}</span>
                    )}
                  </p>
                </div>
                {hasWriteUp && (
                  <span className="shrink-0 rounded-full border border-emerald-700/40 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-300">
                    {infoFocusLabel ?? selectedFocusLabel}
                  </span>
                )}
              </div>

              {/* Skeleton while generating */}
              {infoLoading && (
                <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/60 p-6 animate-pulse space-y-5">
                  <div className="space-y-2">
                    <div className="h-2.5 w-20 rounded-full bg-zinc-800" />
                    <div className="h-6 w-72 rounded-full bg-zinc-800" />
                    <div className="h-3 w-96 rounded-full bg-zinc-800" />
                  </div>
                  <div className="space-y-2 pt-2">
                    <div className="h-3 w-full rounded-full bg-zinc-800" />
                    <div className="h-3 w-5/6 rounded-full bg-zinc-800" />
                    <div className="h-3 w-4/6 rounded-full bg-zinc-800" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-2 rounded-xl border border-zinc-800/40 p-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-2.5 rounded-full bg-zinc-800" style={{ width: `${70 + i * 8}%` }} />
                      ))}
                    </div>
                    <div className="space-y-2 rounded-xl border border-zinc-800/40 p-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-2.5 rounded-full bg-zinc-800" style={{ width: `${65 + i * 9}%` }} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600 text-center">Generating {selectedFocusLabel}…</p>
                </div>
              )}

              {/* Write-up result */}
              {!infoLoading && hasWriteUp && (
                <div ref={writeUpRef} key={writeUpKey} className="space-y-4">
                  {infoSections ? (
                    <PlantAnswerDisplay
                      focus={infoFocus}
                      focusLabel={infoFocusLabel}
                      customQuestion={infoCustomQuestion}
                      sections={infoSections}
                      degraded={infoDegraded}
                      warning={infoWarning}
                      highlights={infoHighlights}
                      model={infoModel}
                      answerMode={infoAnswerMode ?? undefined}
                    />
                  ) : (
                    <div className="rounded-2xl border border-zinc-700/60 bg-zinc-950/80 p-6 shadow-lg">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                        {infoText}
                      </div>
                    </div>
                  )}

                  {/* Web sources */}
                  {safeSources.length > 0 && (
                    <section
                      aria-label="Web sources"
                      className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4"
                    >
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        Web Sources
                        {infoWebSearch?.provider && (
                          <span className="ml-1.5 font-normal normal-case text-zinc-600">
                            via {infoWebSearch.provider}
                          </span>
                        )}
                      </h3>
                      <ul className="space-y-1.5">
                        {safeSources.map((r, i) => (
                          <li key={`${r.safeUrl}-${i}`}>
                            <a
                              href={r.safeUrl ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
                            >
                              {r.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}

              {/* Image & Top prediction header side-by-side when no write-up yet */}
              {!infoLoading && !hasWriteUp && !infoError && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-zinc-900/10 border border-zinc-800/40 rounded-2xl p-6 lg:p-8">
                  {/* Leaf Image */}
                  {preview && (
                    <div className="overflow-hidden rounded-2xl border border-zinc-700/60 bg-black/30 shadow-2xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="Leaf preview" className="max-h-[380px] w-full object-contain mx-auto" />
                    </div>
                  )}

                  {/* Top Prediction Details (Name and Accuracy) */}
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                        Top Predicted Species
                      </p>
                      <h2 className="mt-1 text-3xl font-bold tracking-tight text-zinc-100 leading-tight">
                        {predictions[0]?.label}
                      </h2>
                    </div>
                    
                    <div className="rounded-xl border border-emerald-800/30 bg-emerald-950/20 p-4 max-w-xs">
                      <p className="text-xs text-zinc-400">Confidence Accuracy</p>
                      <p className="text-3xl font-extrabold text-emerald-400 mt-1 tabular-nums">
                        {(predictions[0]!.confidence * 100).toFixed(1)}%
                      </p>
                    </div>

                    <p className="text-xs leading-relaxed text-zinc-500">
                      You can choose a report focus style in the left sidebar and click <span className="font-semibold text-zinc-300">Generate Write-up</span> to query detailed plant attributes, care guides, or answers to custom questions.
                    </p>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </main>
  );
}
