/**
 * Hand-written khata notes ("- 24000 suresh - 5000 bori (3 sep) + 50k neha 5 oct") → separate
 * lines the user can check and save. Port of SpendSense lib/domain/khata/text_import.dart.
 *
 * A line is {sign: 1|-1, amountMinor, note, date: 'YYYY-MM-DD'|null}.
 */
import { dayMs, toDay, today as todayOf } from './dates.js';

const months = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const datePattern =
  /\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*(20\d\d))?/i;
const datePatternAll = new RegExp(datePattern.source, 'gi');

/** "50k", "1lac", "1.5 lakh", "1,34,250", "1 34250" (Indian spacing). */
const amountPattern =
  /(?<![\w.])(\d{1,2}\s\d{2,3}\s?\d{3}|\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)(?:\s*(k|lac|lakh|lakhs|l)(?![a-z]))?(?!\d)/i;

export const signedMinor = (line) => line.sign * line.amountMinor;
export const totalMinor = (lines) =>
  lines.reduce((sum, line) => sum + signedMinor(line), 0);

const todayMs = (now) =>
  dayMs(typeof now === 'string' ? now : todayOf(now ?? new Date()));

/**
 * Splits `text` into lines. Each "+" / "-" (outside brackets) starts a new line; text without a
 * number is kept as a note on the line before it.
 */
export function parseKhataText(text, { now } = {}) {
  const today = todayMs(now);
  const s = String(text).replace(/[−–—]/g, '-').replaceAll('\n', ' + ');
  // Someone forgot to close a bracket: split on every +/- instead.
  const terms = split(s, true) ?? split(s, false);
  // "Maa - 68000 + ...": a leading name is a heading, not a minus.
  if (
    terms.length > 1 &&
    lineOf(terms[0][0], terms[0][1], today) === null &&
    terms[1][0] < 0
  )
    terms[1] = [1, terms[1][1]];
  const out = [];
  for (const [sign, term] of terms) {
    const line = lineOf(sign, term, today);
    if (line) out.push(line);
    else if (out.length) {
      const extra = clean(term);
      if (extra) {
        const last = out.pop();
        out.push({
          ...last,
          note: last.note ? `${last.note} · ${extra}` : extra,
        });
      }
    }
  }
  return out;
}

/** Terms with their signs, or null when `brackets` and they do not balance. */
function split(s, brackets) {
  const terms = [];
  let depth = 0;
  let sign = 1;
  let buffer = '';
  const flush = (nextSign) => {
    const term = buffer.trim();
    if (term) terms.push([sign, term]);
    buffer = '';
    sign = nextSign;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (brackets) {
      if (c === '(' || c === '{' || c === '[') depth++;
      if (c === ')' || c === '}' || c === ']') depth--;
      if (depth < 0) return null;
    }
    if (depth === 0 && (c === '+' || c === '=' || c === '-')) {
      // A hyphen inside a word ("e-mail") is not a minus.
      const previous = i > 0 ? s[i - 1] : ' ';
      const next = i + 1 < s.length ? s[i + 1] : ' ';
      const inWord =
        c === '-' && /[A-Za-z]/.test(previous) && /[A-Za-z]/.test(next);
      if (!inWord) {
        flush(c === '-' ? -1 : 1);
        continue;
      }
    }
    buffer += c;
  }
  if (depth !== 0) return null;
  flush(1);
  return terms;
}

function lineOf(sign, term, today) {
  // "(47826+40000)": a bracket of pure sums counts as one amount.
  const sum = /^\(\s*([\d\s+.,k]+)\)$/i.exec(term.trim());
  if (sum) {
    let total = 0;
    for (const part of sum[1].split('+')) total += toMinor(part.trim()) ?? 0;
    if (total > 0) return { sign, amountMinor: total, note: '', date: null };
  }
  // Dates first, so "3 sep" is not read as ₹3.
  const dateMatch = datePattern.exec(term);
  let date = null;
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = months[dateMatch[2].toLowerCase().slice(0, 3)];
    let year = dateMatch[3]
      ? Number(dateMatch[3])
      : new Date(today).getUTCFullYear();
    let ms = Date.UTC(year, month - 1, Math.min(Math.max(day, 1), 31));
    if (!dateMatch[3] && ms > today) {
      year -= 1;
      ms = Date.UTC(year, month - 1, day);
    }
    date = toDay(ms);
  }
  const noDates = term.replace(datePatternAll, ' ');
  // The amount is the first number outside brackets.
  const outside = noDates.replace(/\([^()]*\)|\{[^{}]*\}/g, ' ');
  const match = amountPattern.exec(outside) ?? amountPattern.exec(noDates);
  if (!match) return null;
  const amountMinor = toMinor(match[0]);
  if (!amountMinor) return null;
  return {
    sign,
    amountMinor,
    note: clean(noDates.replace(match[0], ' ')),
    date,
  };
}

/** "50k" → 5000000 paise. Null when it is not a number. */
export function toMinor(raw) {
  const match = /^([\d\s,.]+?)\s*(k|lac|lakh|lakhs|l)?$/i.exec(
    String(raw).trim(),
  );
  if (!match) return null;
  const digits = match[1].replace(/[\s,]/g, '');
  if (!digits || !/^\d*\.?\d+$|^\d+\.$/.test(digits)) return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === 'k' ? 1000 : unit ? 100000 : 1;
  return Math.round(value * multiplier * 100);
}

const clean = (s) =>
  s
    .replace(/[(){}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .trim();
