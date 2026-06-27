"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlantAnswerDisplay } from "@/app/display_section";
import { MarkdownRenderer } from "@/app/markdown-renderer";
import type { PlantInfoFocus, PlantInfoSections, PlantInfoWebSearch } from "@/types/plant-info";
import {
  Camera,
  Upload,
  Sparkles,
  Search,
  Globe,
  AlertTriangle,
  Users,
  Sprout,
  Compass,
  BookOpen,
  Leaf,
  Zap,
  TreePine,
  type LucideIcon,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Prediction = { label: string; confidence: number };

// ─── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

const FOCUS_OPTIONS: { value: PlantInfoFocus; label: string; icon: LucideIcon; hint: string; color: string }[] = [
  {
    value: "balanced",
    label: "Balanced overview",
    icon: Compass,
    hint: "Pros, cons, uses, and safety in one report",
    color: "emerald",
  },
  {
    value: "gardening",
    label: "Grow & care guide",
    icon: Sprout,
    hint: "Cultivation — light, soil, water, pests",
    color: "green",
  },
  {
    value: "ecology",
    label: "Ecological role",
    icon: TreePine,
    hint: "Habitat, wildlife, invasiveness, conservation",
    color: "teal",
  },
  {
    value: "cultural",
    label: "Cultural history",
    icon: BookOpen,
    hint: "Heritage context and non-medical uses",
    color: "violet",
  },
  {
    value: "concise",
    label: "Short summary",
    icon: Zap,
    hint: "Essential key points only",
    color: "amber",
  },
  {
    value: "custom",
    label: "Ask my own question…",
    icon: Sparkles,
    hint: "Write any question — AI answers your exact wording",
    color: "sky",
  },
];

const CUSTOM_QUESTION_MIN = 10;
const CUSTOM_QUESTION_MAX = 500;

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

/** Parse a label that may contain "LocalName || ScientificName" delimiter */
function parsePlantLabel(label: string): { localName: string; scientificName: string | null } {
  if (label.includes(" || ")) {
    const [local, scientific] = label.split(" || ", 2);
    return { localName: local.trim(), scientificName: scientific?.trim() || null };
  }
  // Legacy format: "Scientific Name (Common Name)" → extract common name as local
  const match = label.match(/^(.+?)\s*\((.+?)\)$/);
  if (match) {
    return { localName: match[2].trim(), scientificName: match[1].trim() };
  }
  return { localName: label, scientificName: null };
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

// ─── Step indicator ────────────────────────────────────────────────────────────

function StepBadge({ num, active, done }: { num: number; active: boolean; done: boolean }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums transition-all duration-300 ${done
          ? "bg-emerald-500 text-white"
          : active
            ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50"
            : "bg-zinc-800 text-zinc-600"
        }`}
    >
      {done ? "✓" : num}
    </span>
  );
}

// ─── Confidence ring ───────────────────────────────────────────────────────────

function ConfidenceRing({ pct }: { pct: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 80 ? "#34d399" : pct >= 55 ? "#fbbf24" : "#f87171";
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" className="shrink-0">
      <circle cx={32} cy={32} r={r} fill="none" stroke="#27272a" strokeWidth={5} />
      <circle
        cx={32}
        cy={32}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)" }}
      />
      <text x={32} y={36} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const writeUpRef = useRef<HTMLDivElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[] | null>(null);

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
  const [writeUpKey, setWriteUpKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const streamingBufferRef = useRef("");
  const streamFinishedRef = useRef(false);
  const typewriterIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const hasWriteUp = !!(infoSections || infoText || streamingText);

  // Step states
  const step1Done = !!file;
  const step2Done = !!predictions;
  const step3Done = hasWriteUp;

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
    setStreamingText(null);
    setIsStreaming(false);
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    streamingBufferRef.current = "";
    streamFinishedRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => () => resetPreview(), [resetPreview]);

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

  const classify = async () => {
    if (!file) { setError("Choose or capture a leaf photo first."); return; }
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
      if (!res.ok) { setError(typeof data.detail === "string" ? data.detail : res.statusText); return; }
      if (!isPredictionArray((data as { predictions?: unknown }).predictions)) { setError("Unexpected response from server."); return; }
      setPredictions(data.predictions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const fetchPlantInfo = async () => {
    const top = predictions?.[0];
    if (!top?.label) return;
    setInfoLoading(true);
    setInfoError(null);
    clearInfo();
    const note = predictions?.slice(0, 3).map((p) => `${p.label} (${(p.confidence * 100).toFixed(1)}%)`).join("; ");
    
    setStreamingText("");
    setIsStreaming(true);
    streamingBufferRef.current = "";
    streamFinishedRef.current = false;

    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
    }

    typewriterIntervalRef.current = setInterval(() => {
      if (streamingBufferRef.current.length > 0) {
        // Output 4 characters every 15ms for smooth typewriter effect
        const charsToType = Math.min(4, streamingBufferRef.current.length);
        const nextChunk = streamingBufferRef.current.slice(0, charsToType);
        streamingBufferRef.current = streamingBufferRef.current.slice(charsToType);
        setStreamingText((prev) => (prev || "") + nextChunk);
      } else if (streamFinishedRef.current) {
        setIsStreaming(false);
        if (typewriterIntervalRef.current) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }
      }
    }, 15);
    
    try {
      const res = await fetch("/api/plant-info-stream", {
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

      if (!res.ok) {
        const errText = await res.text().catch(() => "Streaming request failed");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body available for streaming");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            try {
              const data = JSON.parse(dataStr);
              if (data.type === "meta") {
                if (data.webSearch) setInfoWebSearch(data.webSearch);
                if (data.model) setInfoModel(data.model);
                if (data.focusLabel) setInfoFocusLabel(data.focusLabel);
                setInfoLoading(false);
              } else if (data.type === "chunk") {
                setInfoLoading(false);
                streamingBufferRef.current += data.content;
              } else if (data.type === "error") {
                setInfoError(data.message);
                setIsStreaming(false);
                setInfoLoading(false);
                streamFinishedRef.current = true;
                return;
              } else if (data.type === "done") {
                streamFinishedRef.current = true;
              }
            } catch (err) {
              console.error("Error parsing SSE line:", err);
            }
          }
        }
      }
      
      streamFinishedRef.current = true;
      setWriteUpKey((k) => k + 1);
      setTimeout(() => { writeUpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
      
    } catch (e) {
      console.warn("Streaming failed, falling back to static generation:", e);
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
        if (!res.ok) { setInfoError(typeof data.detail === "string" ? data.detail : res.statusText); return; }
        const ws = (data as { webSearch?: unknown }).webSearch;
        setInfoWebSearch(isPlantInfoWebSearch(ws) ? ws : null);
        setInfoDegraded(data.degraded === true);
        const highlights = (data as { highlights?: unknown }).highlights;
        setInfoHighlights(Array.isArray(highlights) && highlights.every((x) => typeof x === "string") ? highlights : []);
        setInfoModel(typeof data.model === "string" ? data.model : null);
        const rawMode = (data as { answerMode?: unknown }).answerMode;
        setInfoAnswerMode(rawMode === "short" || rawMode === "full" ? rawMode : null);
        const returnedFocus = typeof (data as { focus?: unknown }).focus === "string" ? ((data as { focus: string }).focus as PlantInfoFocus) : infoFocus;
        if (returnedFocus !== infoFocus) setInfoFocus(returnedFocus);
        const cq = typeof (data as { customQuestion?: unknown }).customQuestion === "string" ? (data as { customQuestion: string }).customQuestion.trim() : "";
        setInfoCustomQuestion(returnedFocus === "custom" && cq ? cq : null);
        setInfoFocusLabel(typeof data.focusLabel === "string" ? data.focusLabel : (FOCUS_OPTIONS.find((o) => o.value === returnedFocus)?.label ?? null));
        const warnings: string[] = [];
        if (typeof data.warning === "string" && data.warning.trim()) warnings.push(data.warning);
        setInfoWarning(warnings.length > 0 ? warnings.join(" ") : null);
        setFocusChanged(false);
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
        setWriteUpKey((k) => k + 1);
        setTimeout(() => { writeUpRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
      } catch (fallbackError) {
        setInfoError(fallbackError instanceof Error ? fallbackError.message : "Request failed.");
      }
    } finally {
      setInfoLoading(false);
    }
  };

  // ── Drag & drop ──

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0] ?? null;
      onFile(f);
    },
    [onFile],
  );

  return (
    <main className="min-h-screen bg-[#060a07] text-zinc-100 flex flex-col font-sans overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=DM+Mono:wght@400;500&display=swap');
        * { font-family: 'DM Sans', sans-serif; }
        code, .mono { font-family: 'DM Mono', monospace; }
        .scan-line { background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(52,211,153,0.015) 2px, rgba(52,211,153,0.015) 4px); }
        .glow-green { box-shadow: 0 0 0 1px rgba(52,211,153,0.15), 0 0 20px rgba(52,211,153,0.06); }
        .glow-green-strong { box-shadow: 0 0 0 1px rgba(52,211,153,0.3), 0 0 32px rgba(52,211,153,0.12), inset 0 1px 0 rgba(255,255,255,0.04); }
        .sidebar-section { border-bottom: 1px solid rgba(39,39,42,0.8); }
        .prediction-bar { transition: width 0.8s cubic-bezier(.4,0,.2,1); }
        .fade-in { animation: fadeIn 0.35s ease both; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .drop-zone-active { border-color: rgba(52,211,153,0.5) !important; background: rgba(52,211,153,0.04) !important; }
        .focus-option:hover { background: rgba(52,211,153,0.04); }
        .focus-option.active { background: rgba(52,211,153,0.07); border-color: rgba(52,211,153,0.3); }
      `}</style>

      <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />

      {/* ── Nav ── */}
      <nav className="shrink-0 z-20 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-xl px-3 sm:px-6 py-0 flex items-stretch h-14">
        <div className="flex items-center gap-3 mr-auto">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <Leaf className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.5} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">PlantAI</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-500/70 hidden sm:block">Leaf Identifier</span>
          </div>
        </div>

        {/* Step progress */}
        <div className="hidden md:flex items-center gap-1 px-6 border-x border-zinc-900">
          {[
            { n: 1, label: "Upload", done: step1Done, active: !step1Done },
            { n: 2, label: "Classify", done: step2Done, active: step1Done && !step2Done },
            { n: 3, label: "Generate", done: step3Done, active: step2Done && !step3Done },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-1.5">
              {i > 0 && <span className="w-5 h-px bg-zinc-800 mx-0.5" />}
              <StepBadge num={s.n} active={s.active} done={s.done} />
              <span className={`text-xs font-medium transition-colors ${s.done ? "text-emerald-400" : s.active ? "text-zinc-300" : "text-zinc-600"}`}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:block">Live</span>
          </div>
          {predictions && (
            <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-xs font-medium text-emerald-300 mono">
              {parsePlantLabel(predictions[0]?.label ?? "").localName}
            </span>
          )}
        </div>
      </nav>

      {/* ── Layout ── */}
      <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden">

        {/* ═══════════════════════════════
            SIDEBAR
        ═══════════════════════════════ */}
        <aside className="w-full lg:w-[340px] xl:w-[380px] lg:shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-900 bg-zinc-950 lg:overflow-y-auto">

          {/* ── Step 1: Upload ── */}
          <div className="sidebar-section p-5">
            <div className="flex items-center gap-2 mb-4">
              <StepBadge num={1} active={!step1Done} done={step1Done} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Upload leaf photo</span>
            </div>

            {/* Drop zone */}
            <div
              className={`relative rounded-xl border-2 border-dashed transition-all duration-200 ${dragOver ? "drop-zone-active border-emerald-500/50 bg-emerald-950/10" : preview ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800 bg-zinc-900/20 hover:border-zinc-700"
                }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{ minHeight: preview ? "auto" : "120px" }}
            >
              {preview ? (
                <div className="relative overflow-hidden rounded-[10px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Leaf preview" className="w-full object-cover max-h-48" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <button
                    type="button"
                    onClick={() => onFile(null)}
                    className="absolute top-2 right-2 h-6 w-6 rounded-md bg-black/60 text-zinc-300 hover:text-white hover:bg-black/80 flex items-center justify-center text-xs font-bold transition"
                  >×</button>
                  <div className="absolute bottom-2 left-3">
                    <span className="text-xs font-medium text-white/80 mono">{file?.name}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 gap-3 text-center">
                  <div className="h-10 w-10 rounded-xl bg-zinc-800/80 flex items-center justify-center">
                    <Upload className="h-4.5 w-4.5 text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-400">Drop image here or</p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">JPEG · PNG · WebP</p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload buttons */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2.5 text-xs font-semibold text-emerald-300 transition hover:border-emerald-600/60 hover:bg-emerald-950/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
              >
                <Camera className="h-3.5 w-3.5" /> Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-3 py-2.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
              >
                <Upload className="h-3.5 w-3.5" /> Browse
              </button>
            </div>

            {/* Classify CTA */}
            <button
              type="button"
              disabled={!file || loading}
              onClick={classify}
              className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-35 glow-green-strong enabled:hover:brightness-110"
              style={{
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                color: "#fff",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Classifying…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Search className="h-3.5 w-3.5" /> Classify Leaf
                </span>
              )}
            </button>

            {error && (
              <div role="alert" className="mt-2.5 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-xs text-red-300 flex items-start gap-2 fade-in">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* ── Step 2: Results ── */}
          {predictions && predictions.length > 0 && (
            <div className="sidebar-section p-5 fade-in">
              <div className="flex items-center gap-2 mb-4">
                <StepBadge num={2} active={false} done={true} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Classification results</span>
              </div>

              <div className="space-y-2">
                {predictions.map((p, idx) => (
                  <div
                    key={`${p.label}-${p.confidence}`}
                    className={`relative rounded-xl border transition-all duration-200 ${idx === 0 ? "border-emerald-800/50 bg-zinc-900/80 glow-green" : "border-zinc-800/50 bg-zinc-900/30"
                      }`}
                  >
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      {idx === 0 && (
                        <ConfidenceRing pct={Math.round(p.confidence * 100)} />
                      )}
                      <div className="flex-1 min-w-0">
                        {idx === 0 && (
                          <span className="inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                            Best match
                          </span>
                        )}
                        <p className={`truncate text-sm font-semibold leading-tight ${idx === 0 ? "text-zinc-100" : "text-zinc-400"}`}>
                          {parsePlantLabel(p.label).localName}
                        </p>
                        {parsePlantLabel(p.label).scientificName && (
                          <p className={`truncate text-xs italic leading-tight mt-0.5 ${idx === 0 ? "text-zinc-400" : "text-zinc-500"}`}>
                            {parsePlantLabel(p.label).scientificName}
                          </p>
                        )}
                        {idx > 0 && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-zinc-600 prediction-bar"
                                style={{ width: `${p.confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-zinc-500 mono tabular-nums min-w-[2.5rem] text-right">
                              {(p.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Generate ── */}
          {predictions && predictions.length > 0 && (
            <div className="p-5 flex-1 fade-in">
              <div className="flex items-center gap-2 mb-4">
                <StepBadge num={3} active={!step3Done} done={step3Done} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Generate report</span>
              </div>

              {/* Focus mode selector */}
              <div className="space-y-1.5 mb-4">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 block mb-2">Report focus</label>
                {FOCUS_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = infoFocus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setInfoFocus(opt.value);
                        clearInfo();
                        setFocusChanged(true);
                      }}
                      className={`focus-option w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 ${isActive
                          ? "active border-emerald-800/50 bg-emerald-950/20"
                          : "border-transparent hover:border-zinc-800/60"
                        }`}
                    >
                      <div className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${isActive ? "bg-emerald-500/15" : "bg-zinc-800/60"}`}>
                        <Icon className={`h-3.5 w-3.5 ${isActive ? "text-emerald-400" : "text-zinc-500"}`} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold leading-tight ${isActive ? "text-emerald-200" : "text-zinc-400"}`}>{opt.label}</p>
                        {isActive && <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{opt.hint}</p>}
                      </div>
                      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Custom question */}
              {infoFocus === "custom" && (
                <div className="mb-4 space-y-1.5 fade-in">
                  <label htmlFor="custom-question" className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 block">
                    Your question
                  </label>
                  <textarea
                    id="custom-question"
                    value={customQuestion}
                    onChange={(e) => {
                      setCustomQuestion(e.target.value.slice(0, CUSTOM_QUESTION_MAX));
                      clearInfo();
                      setFocusChanged(true);
                    }}
                    rows={3}
                    placeholder="e.g. Is this plant toxic to dogs? How do I propagate it?"
                    className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-xs leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 transition focus:border-emerald-700/60 focus:ring-1 focus:ring-emerald-600/30"
                  />
                  <div className="flex justify-between px-0.5">
                    <span className="text-[10px] text-zinc-700 mono">{customQuestionTrimmed.length}/{CUSTOM_QUESTION_MAX}</span>
                    {customQuestionTrimmed.length > 0 && customQuestionTrimmed.length < CUSTOM_QUESTION_MIN && (
                      <span className="text-[10px] font-semibold text-amber-500">Min {CUSTOM_QUESTION_MIN} chars</span>
                    )}
                  </div>
                </div>
              )}

              {/* Web search toggle */}
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/20 px-3 py-2.5 mb-4 transition hover:bg-zinc-900/40 hover:border-zinc-700/60">
                <input
                  type="checkbox"
                  checked={includeWebSearch}
                  onChange={(e) => setIncludeWebSearch(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-emerald-400 shrink-0"
                />
                <div className="flex items-center gap-2 flex-1">
                  <Globe className="h-3.5 w-3.5 text-emerald-500/70 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-zinc-300">Include web search</p>
                    <p className="text-[10px] text-zinc-600">Ground facts with current sources</p>
                  </div>
                </div>
              </label>

              {focusChanged && !hasWriteUp && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/15 px-3 py-2 mb-3 fade-in">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <p className="text-[11px] font-medium text-emerald-400">Focus updated — click Generate to apply</p>
                </div>
              )}

              {/* Generate button */}
              <button
                type="button"
                disabled={!topPrediction || infoLoading || !customQuestionValid}
                onClick={fetchPlantInfo}
                className="w-full rounded-lg border border-emerald-700/50 px-5 py-3 text-sm font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:brightness-110"
                style={{ background: infoLoading ? "rgba(16,185,129,0.2)" : "linear-gradient(135deg, #065f46 0%, #059669 50%, #10b981 100%)" }}
              >
                {infoLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300/40 border-t-emerald-300" />
                    <span className="text-emerald-300">Generating…</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" /> Generate Write-up
                  </span>
                )}
              </button>

              {infoError && (
                <div role="alert" className="mt-3 rounded-lg border border-red-900/50 bg-red-950/25 px-3.5 py-3 text-xs text-red-300 flex items-start gap-2 fade-in">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span>{infoError}</span>
                </div>
              )}
            </div>
          )}

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
                <p className="text-[9px] text-zinc-700 mt-1">Plant AI Leaf Identifier Project</p>
              </div>
            </div>
          </div>
        </aside>

        {/* ═══════════════════════════════
            MAIN PANEL
        ═══════════════════════════════ */}
        <div className="flex-1 min-h-0 lg:overflow-y-auto scan-line bg-[#060a07]">

          {/* Empty state */}
          {!file && !predictions && (
            <div className="flex h-full flex-col items-center justify-center gap-6 sm:gap-8 px-4 sm:px-8 py-12 sm:py-20 text-center">
              <div className="relative">
                <div className="h-24 w-24 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto">
                  <Leaf className="h-10 w-10 text-emerald-500/60" strokeWidth={1.5} />
                </div>
                <div className="absolute -inset-4 rounded-full bg-emerald-500/5 blur-xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 mb-3">
                  Identify a plant from its leaf
                </h1>
                <p className="text-xs sm:text-sm leading-relaxed text-zinc-500 max-w-md mx-auto">
                  Upload or photograph a leaf, run the local classifier, then generate a structured AI report in your chosen style.
                </p>
              </div>
              <div className="grid max-w-md grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                {[
                  { icon: "📷", step: "01", label: "Upload photo", sub: "JPEG · PNG · WebP" },
                  { icon: "🔬", step: "02", label: "Classify", sub: "Local ML model" },
                  { icon: "✨", step: "03", label: "Generate report", sub: "AI-powered" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 text-center relative overflow-hidden">
                    <div className="text-xl mb-2">{s.icon}</div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-1">{s.step}</p>
                    <p className="text-xs font-semibold text-zinc-300">{s.label}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image ready, not classified */}
          {file && !predictions && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-4 sm:px-8 py-10 sm:py-16">
              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black/40 shadow-2xl max-w-sm w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview ?? ""} alt="Leaf preview" className="max-h-80 w-full object-contain" />
              </div>
              <p className="text-sm text-zinc-500">
                Image ready — click <span className="text-white font-semibold">Classify Leaf</span> in the sidebar
              </p>
            </div>
          )}

          {/* Classifying */}
          {loading && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-4">
                <div className="relative mx-auto h-14 w-14">
                  <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
                  <div className="absolute inset-2 rounded-full border border-emerald-500/20 animate-ping" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-300">Classifying leaf…</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Running local ML model</p>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {predictions && predictions.length > 0 && (
            <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">

              {/* Results header */}
              <div className="fade-in">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-500/80 mb-1.5">
                      Classification complete
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 leading-tight">
                      {parsePlantLabel(predictions[0]?.label ?? "").localName}
                    </h1>
                    {parsePlantLabel(predictions[0]?.label ?? "").scientificName && (
                      <p className="text-base italic text-zinc-400 mt-1">
                        {parsePlantLabel(predictions[0]?.label ?? "").scientificName}
                      </p>
                    )}
                    <p className="mt-1.5 text-sm text-zinc-500">
                      Confidence{" "}
                      <span className="font-bold text-emerald-400 mono">
                        {(predictions[0]!.confidence * 100).toFixed(1)}%
                      </span>
                      {predictions.length > 1 && (
                        <span className="ml-2 text-zinc-600">
                          · {predictions.length - 1} alternative{predictions.length > 2 ? "s" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  {hasWriteUp && (
                    <span className="shrink-0 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 mono">
                      {infoFocusLabel ?? selectedFocusLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Loading skeleton */}
              {infoLoading && !streamingText && (
                <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-6 animate-pulse space-y-5 fade-in">
                  <div className="space-y-2">
                    <div className="h-2 w-16 rounded-full bg-zinc-800" />
                    <div className="h-5 w-64 rounded-full bg-zinc-800" />
                    <div className="h-3 w-80 rounded-full bg-zinc-800" />
                  </div>
                  <div className="space-y-2 pt-1">
                    {[1, 0.9, 0.75, 0.85, 0.6].map((w, i) => (
                      <div key={i} className="h-2.5 rounded-full bg-zinc-800/80" style={{ width: `${w * 100}%` }} />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {[0, 1].map((i) => (
                      <div key={i} className="space-y-2 rounded-xl border border-zinc-800/40 p-4">
                        {[1, 2, 3].map((j) => (
                          <div key={j} className="h-2.5 rounded-full bg-zinc-800" style={{ width: `${70 + j * 8}%` }} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-600 text-center">Generating {selectedFocusLabel}…</p>
                </div>
              )}

              {/* Preview + top prediction — shown only when no write-up exists yet */}
              {!infoLoading && !infoError && !hasWriteUp && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center border border-zinc-800/50 rounded-2xl p-4 sm:p-6 bg-zinc-950/40 fade-in">
                  {preview && (
                    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black/40 shadow-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="Leaf preview" className="max-h-[360px] w-full object-contain mx-auto" />
                    </div>
                  )}
                  <div className="space-y-5">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-500/70 mb-2">Top predicted species</p>
                      <h2 className="text-2xl font-bold tracking-tight text-zinc-100 leading-tight">{parsePlantLabel(predictions[0]?.label ?? "").localName}</h2>
                      {parsePlantLabel(predictions[0]?.label ?? "").scientificName && (
                        <p className="text-base italic text-zinc-400 mt-1">
                          {parsePlantLabel(predictions[0]?.label ?? "").scientificName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <ConfidenceRing pct={Math.round(predictions[0]!.confidence * 100)} />
                      <div>
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Confidence</p>
                        <p className="text-2xl font-bold text-emerald-400 mono tabular-nums">
                          {(predictions[0]!.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    {!hasWriteUp && (
                      <p className="text-xs leading-relaxed text-zinc-600">
                        Select a report focus in the sidebar and click{" "}
                        <span className="text-zinc-400 font-semibold">Generate Write-up</span>{" "}
                        to get a detailed AI analysis.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Write-up */}
              {!infoLoading && hasWriteUp && (
                <div ref={writeUpRef} key={writeUpKey} className="space-y-4 fade-in">
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
                  ) : streamingText ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-sm">
                      <MarkdownRenderer content={streamingText} isStreaming={isStreaming} />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{infoText}</div>
                    </div>
                  )}

                  {safeSources.length > 0 && (
                    <section aria-label="Web sources" className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4">
                      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
                        Web Sources
                        {infoWebSearch?.provider && (
                          <span className="ml-1.5 font-normal normal-case text-zinc-700">via {infoWebSearch.provider}</span>
                        )}
                      </h3>
                      <ul className="space-y-1.5">
                        {safeSources.map((r, i) => (
                          <li key={`${r.safeUrl}-${i}`}>
                            <a href={r.safeUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-500 hover:text-emerald-400 hover:underline">
                              {r.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}