/**
 * Old khata notes for many people at once. Port of SpendSense lib/domain/khata/bulk_import.dart.
 *
 *   dadaji Pending= 1 34250 + 227000 - 24000 suresh ...
 *   Maa - 68000 + 17000 (maa) - 20000 (rakesh mama) ...
 *
 *   pending
 *   dada ji - 100000 - 11300 = 88700 (+34250 variable)
 *
 * Each person becomes one block of lines (read by parseKhataText); the optional "pending" section
 * gives the totals the user worked out, used to check the lines.
 *
 * Choices: 'lines' (every line), 'linesAndFix' (every line + one correction so the balance equals
 * the user's own total), 'totalOnly' (one line: the stated total, else the lines' total), 'skip'.
 */
import { parseKhataText, signedMinor, totalMinor } from './text-import.js';

export const bulkChoices = ['lines', 'linesAndFix', 'totalOnly', 'skip'];

const summaryHeader =
  /^\s*(pending|pendings|total|totals|balance|balances|summary|final|net)\s*[:\-=]?\s*$/i;
const head =
  /^\s*([A-Za-z][A-Za-z .]{0,40}?)\s*(\([^()]{0,40}\))?\s*(?:\b(?:pending|balance|total|khata|hisab)\b)?\s*(?:[:=\-–—−]|(?=\s*[+\d]))/i;

/** Lowercase letters only, so "Dada ji", "dadaji" and "DADAJI" are the same person. */
export const nameKey = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z]/g, '');

export const linesMinor = (person) => totalMinor(person.lines);
export const matches = (person) =>
  person.statedMinor === null || person.statedMinor === linesMinor(person);
/** Difference to add after the lines so the balance equals statedMinor (notes' sign). */
export const fixMinor = (person) =>
  (person.statedMinor ?? linesMinor(person)) - linesMinor(person);
/** Final balance in the notes' sign for the person's choice. */
export function finalMinor(person) {
  if (person.choice === 'skip') return 0;
  if (person.choice === 'lines') return linesMinor(person);
  return person.statedMinor ?? linesMinor(person);
}
/**
 * Positive = they owe me. By default "+" in the notes means I owe them ("Dadaji pending = ..." is
 * Dadaji's money kept with me); plusTheyOwe flips it.
 */
export const owedToMe = (person, notesSigned) =>
  person.plusTheyOwe ? notesSigned : -notesSigned;

function cleanName(raw) {
  const words = raw
    .replace(/\b(pending|balance|total|khata|hisab)\b/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.join('').length < 2 || words.length > 4)
    return null;
  return words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function headOf(line) {
  const match = head.exec(line);
  if (!match) return null;
  const name = cleanName(match[1]);
  return name ? { name, match, end: match.index + match[0].length } : null;
}

/** "100000 - 11300 = 88700 (+34250 variable)" → 88700; "0" → 0; "+ 0" → 0. */
function statedTotal(rest, now) {
  const s = rest.replace(/\([^()]*\)|\{[^{}]*\}/g, ' ');
  const eq = s.lastIndexOf('=');
  const lines = parseKhataText(eq >= 0 ? s.slice(eq + 1) : s, { now });
  if (eq >= 0) return lines.length ? signedMinor(lines[0]) : 0;
  return totalMinor(lines);
}

const person = (name, tag, body, now, statedMinor = null) => ({
  name,
  tag,
  body,
  lines: body ? parseKhataText(body, { now }) : [],
  statedMinor,
  choice: 'lines',
  plusTheyOwe: false,
});

export function parseBulkKhata(text, { now } = {}) {
  // Lines with the paragraph they belong to (blank lines separate paragraphs).
  const rows = [];
  let paragraph = 0;
  for (const raw of String(text).replaceAll('\r', '').split('\n')) {
    const line = raw.replace(/[−–—]/g, '-').trim();
    if (!line) {
      paragraph++;
      continue;
    }
    rows.push([line, paragraph]);
  }
  // Pre-scan the "pending" section for the real people's names.
  const summaryAt = rows.findIndex(([line]) => summaryHeader.test(line));
  const summaryKeys = new Set();
  if (summaryAt >= 0) {
    for (const [line] of rows.slice(summaryAt + 1)) {
      const found = headOf(line);
      if (found) summaryKeys.add(nameKey(found.name));
    }
  }
  const notes = summaryAt >= 0 ? rows.slice(0, summaryAt) : rows;
  // When people are separated by blank lines, a line in the middle of a paragraph is a wrapped
  // continuation ("chachiji - 5000 bori ..."), not a new person.
  const usesParagraphs = new Set(notes.map(([, p]) => p)).size > 1;

  const people = [];
  let current = null;
  let body = '';
  const flush = () => {
    if (current)
      people.push(person(current.name, current.tag, body.trim(), now));
    current = null;
    body = '';
  };
  notes.forEach(([line, p], index) => {
    const paragraphStart = index === 0 || notes[index - 1][1] !== p;
    const found = headOf(line);
    const startsPerson =
      found &&
      (!current ||
        paragraphStart ||
        !usesParagraphs ||
        summaryKeys.has(nameKey(found.name)));
    if (startsPerson) {
      flush();
      const tag = found.match[2]?.replace(/[()]/g, '').trim();
      current = { name: found.name, tag: tag || null };
      body += line.slice(found.end);
    } else if (current) {
      // Wrapped line: keep it in the same sentence. A line that starts with a number after a
      // finished amount is a new entry (like a new line in the notes).
      const previous = body.trimEnd();
      const joinsOperator =
        /[+\-=([{]$/.test(previous) || /^[+\-=)\]}]/.test(line);
      const separator = !joinsOperator && /^\d/.test(line) ? ' + ' : ' ';
      body += `${separator}${line}`;
    }
  });
  flush();

  // Join the "pending" totals to the people (and add people only listed there).
  if (summaryAt >= 0) {
    for (const [line] of rows.slice(summaryAt + 1)) {
      const found = headOf(line);
      if (!found) continue;
      const total = statedTotal(line.slice(found.end), now);
      const existing = people.find(
        (entry) => nameKey(entry.name) === nameKey(found.name),
      );
      if (existing) existing.statedMinor = total;
      else people.push(person(found.name, null, '', now, total));
    }
  }
  for (const entry of people)
    entry.choice = !entry.lines.length
      ? 'totalOnly'
      : matches(entry)
        ? 'lines'
        : 'linesAndFix';
  return people;
}

/**
 * The opening entries to save for one person (port of KhataRepo.importBulk):
 * [{direction:'gave'|'got', amountMinor, date, note}] — every entry is an opening balance.
 * Undated lines take the date of the line before them, else `today`.
 */
export function openingEntries(entry, today) {
  const out = [];
  if (entry.choice === 'skip') return out;
  const put = (notesSigned, date, note) => {
    const owed = owedToMe(entry, notesSigned);
    if (owed === 0) return;
    out.push({
      direction: owed > 0 ? 'gave' : 'got',
      amountMinor: Math.abs(owed),
      date,
      note,
    });
  };
  if (entry.choice === 'totalOnly') {
    put(entry.statedMinor ?? linesMinor(entry), today, 'Old khata balance');
    return out;
  }
  let last = null;
  for (const line of entry.lines) {
    last = line.date ?? last;
    put(
      signedMinor(line),
      last ?? today,
      line.note ? `Old khata · ${line.note}` : 'Old khata',
    );
  }
  if (entry.choice === 'linesAndFix' && fixMinor(entry) !== 0)
    put(fixMinor(entry), today, 'Old khata · correction to match my total');
  return out;
}
