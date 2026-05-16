/**
 * Directive Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Brain entries tagged with `directive:<scope>` are "Directives" — rules that
 * automatically shape the AI's behaviour across specific features.
 *
 * Scopes:
 *   directive:discovery      → injected into discoverDtcCategories prompts
 *   directive:deep-research  → injected into agenticDeepResearchCategory prompts
 *   directive:all            → injected into ALL AI calls above
 *
 * How to add a directive:
 *   1. Open Brain → Add Entry → type "rule" or "principle"
 *   2. In the Tags field add: directive:discovery (or directive:deep-research or directive:all)
 *   3. Set priority to "core" so it is always included
 *   4. Save — the directive is live immediately for all subsequent AI calls
 *
 * How to edit a directive:
 *   Open Brain → find the entry → edit content/implication → Save
 *   No code changes needed.
 *
 * Architecture:
 *   BrainEntry (stored in Brain OS)
 *     ↓ tagged with `directive:<scope>`
 *   getActiveDirectives(entries, scope) — filters to relevant entries
 *     ↓
 *   compileDirectivePrompt(entries, scope) — renders into a concise prompt block
 *     ↓
 *   discoverDtcCategories / agenticDeepResearchCategory receive the compiled text
 *   and prepend it to their search and extraction prompts.
 */

import type { BrainEntry } from '../types';

// ─── Scope types ──────────────────────────────────────────────────────────────

export type DirectiveScope = 'discovery' | 'deep-research' | 'memo' | 'signal' | 'radar' | 'intel' | 'nlquery' | 'all';

const SCOPE_TAGS: Record<DirectiveScope, string> = {
  discovery:       'directive:discovery',
  'deep-research': 'directive:deep-research',
  memo:            'directive:memo',
  signal:          'directive:signal',
  radar:           'directive:radar',
  intel:           'directive:intel',
  nlquery:         'directive:nlquery',
  all:             'directive:all',
};

// ─── Filter ───────────────────────────────────────────────────────────────────

/**
 * Returns all non-archived brain entries that apply to the given scope.
 * Entries tagged `directive:all` always apply regardless of scope.
 */
export function getActiveDirectives(
  entries: BrainEntry[],
  scope: DirectiveScope,
): BrainEntry[] {
  const scopeTag = SCOPE_TAGS[scope];
  const allTag   = SCOPE_TAGS['all'];
  return entries.filter(
    e =>
      e.priority !== 'archived' &&
      (e.tags.includes(scopeTag) || e.tags.includes(allTag)),
  );
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

/**
 * Compiles directive entries into a concise, injection-ready prompt block.
 *
 * Format:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ ## OPERATOR DIRECTIVES — MUST FOLLOW EXACTLY                    │
 * │ [RULE] <title>: <content>                                       │
 * │ → Apply: <implication>                                          │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Returns empty string when no directives apply (no runtime cost).
 */
export function compileDirectivePrompt(
  entries: BrainEntry[],
  scope: DirectiveScope,
): string {
  const directives = getActiveDirectives(entries, scope);
  if (directives.length === 0) return '';

  const TYPE_LABELS: Record<string, string> = {
    principle: 'PRINCIPLE',
    rule:      'RULE',
    process:   'PROCESS',
    insight:   'INSIGHT',
    note:      'NOTE',
    brand:     'BRAND REF',
    founder:   'FOUNDER REF',
    quote:     'QUOTE',
  };

  const lines: string[] = [
    '## OPERATOR DIRECTIVES — APPLY THESE RULES EXACTLY',
    `(${directives.length} directive${directives.length !== 1 ? 's' : ''} active for this operation)`,
    '',
  ];

  for (const d of directives) {
    const label = TYPE_LABELS[d.type] ?? 'DIRECTIVE';
    lines.push(`[${label}] ${d.title.toUpperCase()}`);
    lines.push(d.content);
    if (d.implication.trim()) {
      lines.push(`→ Apply: ${d.implication.trim()}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// ─── Convenience: check if any directives exist for a scope ───────────────────

export function hasDirectives(
  entries: BrainEntry[],
  scope: DirectiveScope,
): boolean {
  return getActiveDirectives(entries, scope).length > 0;
}
