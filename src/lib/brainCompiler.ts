import type { BrainEntry, BrainEntryType } from '../types';

/**
 * Human-readable labels for each entry type.
 * Used as section headers in the compiled brain context.
 */
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

/**
 * Compile all non-archived brain entries into a dense, structured string
 * ready to be appended to the ChatGPT system prompt.
 *
 * Layout:
 *   ## OPERATOR BRAIN — Personal Operating System
 *   Compiled: [date] | [N] core entries | [M] reference entries
 *
 *   ### CORE (always apply)
 *   [TYPE] TITLE
 *   Content: ...
 *   Apply: ...
 *   Source: ...
 *   Tags: ...
 *
 *   ### REFERENCE
 *   [TYPE] TITLE — Content. Apply: ... (compact one-liner)
 *
 * Returns an empty string if there are no entries to inject.
 */
export function compileBrain(entries: BrainEntry[]): string {
  const core      = entries.filter(e => e.priority === 'core');
  const reference = entries.filter(e => e.priority === 'reference');

  if (core.length === 0 && reference.length === 0) return '';

  const lines: string[] = [];
  const now = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });

  lines.push(`## OPERATOR BRAIN — Personal Operating System`);
  lines.push(`Compiled: ${now} | ${core.length} core | ${reference.length} reference`);
  lines.push('');
  lines.push('INSTRUCTIONS FOR GPT: The operator has embedded their personal knowledge, principles, and decision OS below.');
  lines.push('Read ALL of it carefully before every response. Never ignore or skip entries. Apply them directly to your answers.');
  lines.push('');

  if (core.length > 0) {
    lines.push('### CORE OPERATING PRINCIPLES (always active)');
    lines.push('');
    for (const entry of core) {
      lines.push(`[${TYPE_LABELS[entry.type]}] ${entry.title.toUpperCase()}`);
      lines.push(`Content: ${entry.content}`);
      if (entry.implication.trim()) {
        lines.push(`Apply to decisions: ${entry.implication}`);
      }
      if (entry.source) {
        lines.push(`Source: ${entry.source}`);
      }
      if (entry.tags.length > 0) {
        lines.push(`Tags: ${entry.tags.join(', ')}`);
      }
      lines.push('');
    }
  }

  if (reference.length > 0) {
    lines.push('### REFERENCE KNOWLEDGE (consult when relevant)');
    lines.push('');
    for (const entry of reference) {
      // Compact format — fits more in context
      const implPart = entry.implication.trim() ? ` → Apply: ${entry.implication.trim()}` : '';
      const srcPart  = entry.source ? ` [${entry.source}]` : '';
      lines.push(`[${TYPE_LABELS[entry.type]}] ${entry.title}: ${entry.content}${implPart}${srcPart}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Rough token count estimate (4 chars ≈ 1 token).
 * Used in the UI to give the operator a sense of context budget usage.
 */
export function estimateBrainTokens(entries: BrainEntry[]): number {
  return Math.ceil(compileBrain(entries).length / 4);
}
