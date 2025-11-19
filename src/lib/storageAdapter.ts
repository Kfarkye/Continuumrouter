import type { ChatMessage } from '../types';

export const LIVE_WINDOW_MESSAGES = 30;          // keep this many recent messages in the UI/state
export const SUMMARY_MAX_CHARS = 1800;           // ~250–350 tokens for a compact rolling summary
export const PINNED_MAX_ITEMS = 20;

const SENTENCE_MAX = 220;

function clip(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function firstSentences(s: string, max = SENTENCE_MAX) {
  // Cheap sentence-ish clip that respects line breaks and stops early at code fences
  const fence = s.indexOf('```');
  const stopAt = fence >= 0 ? fence : s.length;
  const head = s.slice(0, stopAt);
  const idx = head.search(/[.!?]\s|\n/);
  if (idx < 0) return clip(head, max);
  return clip(head.slice(0, Math.max(idx + 1, Math.min(head.length, max))), max);
}

/**
 * Build a rolling summary from older messages (everything except the live tail window).
 * Intended to preserve decisions, tasks, and entities compactly.
 */
export function createRollingSummary(all: ChatMessage[], maxChars = SUMMARY_MAX_CHARS): string {
  if (!all.length) return '';
  const older = all.slice(0, Math.max(0, all.length - LIVE_WINDOW_MESSAGES));
  if (older.length === 0) return '';

  const lines: string[] = [];
  for (const m of older) {
    const tag = m.role === 'user' ? 'U' : m.role === 'assistant' ? 'A' : 'S';
    const snippet = firstSentences(String(m.content ?? ''), SENTENCE_MAX);
    if (!snippet) continue;
    lines.push(`- ${tag}: ${snippet}`);
    if (lines.join('\n').length > maxChars) break;
  }

  const body = lines.join('\n');
  return body
    ? [
        'Summary:',
        body,
        '',
        'Keep in mind: Prefer the live window for exact wording; this summary preserves decisions, tasks, and entities.',
      ].join('\n')
    : '';
}

export function buildContextHeader(summary: string, pinned: string[]): string {
  const pinnedClean = pinned.filter(Boolean).slice(0, PINNED_MAX_ITEMS);
  const blocks: string[] = [];
  if (pinnedClean.length) {
    blocks.push(['Pinned facts:', ...pinnedClean.map((p) => `- ${p}`)].join('\n'));
  }
  if (summary) blocks.push(summary);
  return blocks.length ? blocks.join('\n\n') + '\n\n' : '';
}

export function loadPinned(sessionId: string | null): string[] {
  if (!sessionId) return [];
  try {
    const raw = localStorage.getItem(`pins:${sessionId}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function savePinned(sessionId: string | null, pins: string[]) {
  if (!sessionId) return;
  try {
    localStorage.setItem(`pins:${sessionId}`, JSON.stringify(pins.slice(0, PINNED_MAX_ITEMS)));
  } catch {
    // ignore storage errors
  }
}