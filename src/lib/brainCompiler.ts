import type { BrainEntry, BrainConfidence, BrainEntryType } from '../types';

// ─── Type labels ──────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<BrainEntryType, string> = {
  principle: 'PRINCIPLE',
  quote:     'QUOTE',
  brand:     'BRAND INSPIRATION',
  founder:   'FOUNDER STUDY',
  insight:   'VALIDATED INSIGHT',
  rule:      'HARD RULE',
  process:   'PROCESS / FRAMEWORK',
  note:      'NOTE',
};

// ─── Confidence labels ────────────────────────────────────────────────────────

/**
 * GPT sees these labels and calibrates its certainty framing accordingly.
 *   VERIFIED   → model says "According to operator's verified research…"
 *   STRONG     → model says "Based on the operator's direct experience…"
 *   BELIEF     → model explicitly marks as unverified personal conviction
 */
const CONFIDENCE_LABEL: Record<BrainConfidence, string> = {
  verified: '[VERIFIED — cited sources]',
  strong:   '[STRONG — direct experience]',
  belief:   '[OPERATOR BELIEF — personal conviction, not independently verified]',
};

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Better token estimate: ~1.3 tokens per word (GPT-4 tokenisation average).
 * More accurate than the old chars/4 heuristic, especially for longer entries.
 */
function estimateTokens(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

// ─── Compile ──────────────────────────────────────────────────────────────────

/**
 * Compile all non-archived brain entries into a structured, anti-hallucination-
 * safe prompt fragment that is prepended to every GPT chat message.
 *
 * Anti-hallucination design principles:
 *   1. Every entry has a confidence label so GPT calibrates uncertainty.
 *   2. BELIEF entries are explicitly flagged — GPT must not present them as facts.
 *   3. The instruction block teaches GPT HOW to apply the brain, not just what's in it.
 *   4. HARD RULES are placed first so they anchor all subsequent reasoning.
 *   5. A "before responding" chain-of-thought directive is included.
 *   6. If total token budget exceeds 18k, lowest-priority reference entries are dropped.
 *
 * Returns an empty string if there are no active entries.
 */
export function compileBrain(entries: BrainEntry[]): string {
  const core      = entries.filter(e => e.priority === 'core');
  const reference = entries.filter(e => e.priority === 'reference');

  if (core.length === 0 && reference.length === 0) return '';

  const lines: string[] = [];
  const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(`## OPERATOR BRAIN — Personal Decision Operating System`);
  lines.push(`Compiled: ${now} | ${core.length} core | ${reference.length} reference`);
  lines.push('');

  // ── Anti-hallucination + usage instructions ────────────────────────────────
  lines.push(`### HOW TO USE THIS BRAIN`);
  lines.push(`1. BEFORE every response, scan ALL entries below and identify which ones apply to the current question.`);
  lines.push(`2. Entries marked ${CONFIDENCE_LABEL.verified} are factual — reference them directly.`);
  lines.push(`3. Entries marked ${CONFIDENCE_LABEL.strong} are based on operator experience — apply them but do not present as universal fact.`);
  lines.push(`4. Entries marked ${CONFIDENCE_LABEL.belief} are the operator's personal beliefs — use them to understand their worldview, but NEVER present beliefs as verified facts. If relevant, say "The operator believes…".`);
  lines.push(`5. HARD RULE entries override your default reasoning. They are non-negotiable unless the operator explicitly asks to reconsider.`);
  lines.push(`6. The "Decision Implication" field is the most actionable part — apply it directly to your recommendations.`);
  lines.push(`7. Never invent sources, statistics, or facts not present here. If uncertain, say so.`);
  lines.push('');

  // ── Core entries — ordered: rules first, then principles, then rest ─────────
  const coreOrdered = [
    ...core.filter(e => e.type === 'rule'),
    ...core.filter(e => e.type === 'principle'),
    ...core.filter(e => !['rule', 'principle'].includes(e.type)),
  ];

  if (coreOrdered.length > 0) {
    lines.push('### CORE OPERATING KNOWLEDGE (always apply to every response)');
    lines.push('');
    for (const entry of coreOrdered) {
      const confidence = entry.confidence ?? 'strong';
      lines.push(`[${TYPE_LABELS[entry.type]}] ${entry.title.toUpperCase()}`);
      lines.push(`Confidence: ${CONFIDENCE_LABEL[confidence]}`);
      lines.push(`Knowledge: ${entry.content}`);
      if (entry.implication.trim()) {
        lines.push(`Decision Implication: ${entry.implication}`);
      }
      if (confidence === 'verified' && entry.source) {
        lines.push(`Source: ${entry.source}`);
      } else if (entry.source) {
        lines.push(`Origin: ${entry.source}`);
      }
      if (confidence === 'verified' && entry.verifiedSources && entry.verifiedSources.length > 0) {
        lines.push(`Verified via: ${entry.verifiedSources.join(', ')}`);
      }
      if (entry.tags.length > 0) {
        lines.push(`Tags: ${entry.tags.join(', ')}`);
      }
      lines.push('');
    }
  }

  // ── Reference entries — compact format ─────────────────────────────────────
  if (reference.length > 0) {
    lines.push('### REFERENCE KNOWLEDGE (consult when relevant to the question)');
    lines.push('');
    for (const entry of reference) {
      const confidence = entry.confidence ?? 'strong';
      const implPart = entry.implication.trim() ? ` → Apply: ${entry.implication.trim()}` : '';
      const srcPart  = entry.source ? ` [${entry.source}]` : '';
      const conf     = confidence === 'belief' ? ' ⚑BELIEF' : confidence === 'verified' ? ' ✓' : '';
      lines.push(`[${TYPE_LABELS[entry.type]}]${conf} ${entry.title}: ${entry.content}${implPart}${srcPart}`);
    }
    lines.push('');
  }

  const compiled = lines.join('\n');

  // ── Token budget enforcement ───────────────────────────────────────────────
  // Hard cap at 20k tokens. If exceeded, drop lowest-priority reference entries
  // first until within budget. Core entries are NEVER truncated.
  const MAX_TOKENS = 20_000;
  if (estimateTokens(compiled) <= MAX_TOKENS) return compiled;

  // Rebuild without reference entries first (they're the cheapest to drop)
  const coreOnlyLines: string[] = [];
  coreOnlyLines.push(`## OPERATOR BRAIN — Personal Decision Operating System`);
  coreOnlyLines.push(`Compiled: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} | ${core.length} core | ${reference.length} reference (REFERENCE ENTRIES OMITTED — budget cap)`);
  coreOnlyLines.push('');
  coreOnlyLines.push(lines.slice(lines.indexOf('### HOW TO USE THIS BRAIN'), lines.indexOf('### CORE OPERATING KNOWLEDGE (always apply to every response)')).join('\n'));
  coreOnlyLines.push('### CORE OPERATING KNOWLEDGE (always apply to every response)');
  coreOnlyLines.push('');

  const [, ...coreSections] = lines;
  // Simpler: re-join only the header + instructions + core section
  const coreCompiled = [
    `## OPERATOR BRAIN — Personal Decision Operating System`,
    `Compiled: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} | ${core.length} core | ${reference.length} reference (REFERENCE ENTRIES OMITTED — over token budget)`,
    '',
    ...lines.slice(2, lines.lastIndexOf('### REFERENCE KNOWLEDGE (consult when relevant to the question)')),
  ].join('\n');

  if (estimateTokens(coreCompiled) <= MAX_TOKENS) return coreCompiled;

  // If even core entries are too many, drop reference fields (tags, origin) from core entries
  return coreCompiled.split('\n').filter(l => !l.startsWith('Tags:') && !l.startsWith('Origin:') && !l.startsWith('Verified via:')).join('\n');
}

/**
 * Accurate token count using ~1.3 tokens/word heuristic.
 * Used in the UI to give the operator a sense of context budget usage.
 */
export function estimateBrainTokens(entries: BrainEntry[]): number {
  return estimateTokens(compileBrain(entries));
}
