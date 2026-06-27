"use client";

/**
 * MarkdownRenderer — Streams Markdown content with typewriter animation.
 *
 * Features:
 * - Real-time markdown rendering via react-markdown + remark-gfm
 * - Blinking cursor at end while streaming
 * - Smooth dark-theme styling matching the app's design
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// ─── Markdown component overrides (styled for the dark theme) ─────────────────

const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1
      className="text-xl font-bold tracking-tight text-zinc-100 mt-6 mb-3 first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="text-lg font-semibold tracking-tight text-zinc-100 mt-5 mb-2.5 first:mt-0 pb-1.5 border-b border-zinc-800/60"
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-base font-semibold text-zinc-200 mt-4 mb-2"
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="text-sm leading-7 text-zinc-300 mb-3 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-2.5 ml-1 space-y-1.5" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-2.5 ml-1 space-y-1.5 list-decimal list-inside" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm leading-relaxed text-zinc-300 flex items-start gap-2" {...props}>
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" aria-hidden="true" />
      <span className="flex-1">{children}</span>
    </li>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-zinc-100" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic text-zinc-400" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-emerald-600/50 bg-emerald-950/15 rounded-r-lg pl-4 pr-3 py-3 my-3 text-xs leading-relaxed text-zinc-400 italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="bg-zinc-800/80 text-emerald-300 rounded px-1.5 py-0.5 text-xs font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="block bg-zinc-900/80 border border-zinc-800/60 rounded-lg p-3 my-2 text-xs leading-relaxed font-mono text-zinc-300 overflow-x-auto"
        {...props}
      >
        {children}
      </code>
    );
  },
  hr: (props) => <hr className="border-zinc-800/60 my-5" {...props} />,
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),
  table: ({ children, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-zinc-800/60">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-zinc-900/80 text-zinc-400" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2 text-zinc-300 border-t border-zinc-800/40" {...props}>
      {children}
    </td>
  ),
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  return (
    <div className="markdown-renderer relative">
      <style>{`
        .markdown-renderer .streaming-cursor::after {
          content: '▊';
          display: inline;
          animation: blink 0.8s step-end infinite;
          color: #34d399;
          font-weight: 300;
          margin-left: 2px;
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {isStreaming ? content + " ▍" : content}
      </ReactMarkdown>

      {isStreaming && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Generating report…</span>
        </div>
      )}
    </div>
  );
}
