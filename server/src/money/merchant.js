/**
 * Merchant normalisation and conservative fuzzy matching (port of SpendSense
 * lib/domain/merchant/merchant_matcher.dart).
 *
 * Never silently merge two different merchants: "SHARMA STORE" and "VERMA STORE" share a
 * suffix but are different shops, so the first significant token must match (a 1-letter typo
 * is allowed on long tokens).
 */

const noise = new Set([
  'PVT',
  'PRIVATE',
  'LTD',
  'LIMITED',
  'LLP',
  'INC',
  'CO',
  'COMPANY',
  'THE',
  'INDIA',
  'IN',
  'ONLINE',
  'PAYMENTS',
  'PAYMENT',
  'TECHNOLOGIES',
  'TECHNOLOGY',
  'SERVICES',
  'SERVICE',
  'SOLUTIONS',
  'ENTERPRISES',
  'ENTERPRISE',
  'RETAIL',
  'MS',
  'M/S',
  'UPI',
  'VPA',
  'POS',
  'ECOM',
  'WWW',
  'COM',
]);

const synonyms = {
  STORES: 'STORE',
  SHOP: 'STORE',
  SHOPPE: 'STORE',
  MEDICALS: 'MEDICAL',
  PHARMACY: 'MEDICAL',
  CHEMIST: 'MEDICAL',
  CHEMISTS: 'MEDICAL',
  RESTAURANTS: 'RESTAURANT',
  HOTELS: 'HOTEL',
  TRADERS: 'TRADER',
};

/** Canonical key used for exact lookups ("Sharma Stores Pvt Ltd" → "SHARMA STORE"). */
export function normalizeMerchant(raw) {
  let s = String(raw ?? '').toUpperCase();
  const at = s.indexOf('@');
  if (at > 0 && !s.slice(0, at).includes(' ')) s = s.slice(0, at);
  s = s.replace(/[._\-/*#&+,()[\]:]+/g, ' ');
  s = s.replace(/\b\d{4,}\b/g, ' ');
  s = s.replace(/[^A-Z0-9 ]/g, ' ');
  return s
    .split(/\s+/)
    .filter((token) => token && !noise.has(token))
    .map((token) => synonyms[token] ?? token)
    .join(' ')
    .trim();
}

/** Friendly name: "SHARMA STORE" → "Sharma Store", "rahul.k@okaxis" → "Rahul K". */
export function displayName(raw) {
  let s = String(raw ?? '').trim();
  const at = s.indexOf('@');
  if (at > 0 && !s.slice(0, at).includes(' '))
    s = s.slice(0, at).replace(/[._-]+/g, ' ');
  return s
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) =>
      word.length <= 3 &&
      word === word.toUpperCase() &&
      !/^[A-Z][a-z]/.test(word)
        ? word
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ');
}

export function levenshtein(s, t) {
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let previous = Array.from({ length: t.length + 1 }, (_, index) => index);
  let current = new Array(t.length + 1).fill(0);
  for (let i = 1; i <= s.length; i++) {
    current[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[t.length];
}

export function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (!len1 || !len2) return 0;
  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const m1 = new Array(len1).fill(false);
  const m2 = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro =
    (matches / len1 +
      matches / len2 +
      (matches - transpositions / 2) / matches) /
    3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] !== s2[i]) break;
    prefix++;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

const tokenEq = (x, y) =>
  x === y || (Math.min(x.length, y.length) >= 5 && levenshtein(x, y) <= 1);

function tokenSetRatio(a, b) {
  const sa = [...new Set(a)];
  const sb = [...new Set(b)];
  const used = new Set();
  let inter = 0;
  for (const x of sa) {
    for (let j = 0; j < sb.length; j++) {
      if (!used.has(j) && tokenEq(x, sb[j])) {
        used.add(j);
        inter++;
        break;
      }
    }
  }
  const union = sa.length + sb.length - inter;
  return union === 0 ? 0 : inter / union;
}

/** Conservative similarity 0..100 between two normalised keys. */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const ta = a.split(' ');
  const tb = b.split(' ');
  let score = Math.round(
    (jaroWinkler(a, b) * 0.5 + tokenSetRatio(ta, tb) * 0.5) * 100,
  );
  const firstMatches = tokenEq(ta[0], tb[0]);
  if (!firstMatches) score = Math.min(score, 60);
  if (firstMatches && ta.length !== tb.length) {
    const shorter = ta.length < tb.length ? ta : tb;
    const longer = ta.length < tb.length ? tb : ta;
    if (shorter.every((s) => longer.some((l) => tokenEq(s, l))))
      score = Math.max(score, 75);
    score = Math.min(score, 84);
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Best known merchant for a raw name / UPI id. `known` items: {key, aliases?, upiId?, ...}.
 * Returns {candidate, confidence, reason, autoApply} or null.
 */
export function matchMerchant(rawName, upiId, known) {
  const key = rawName ? normalizeMerchant(rawName) : '';
  const upi = upiId?.toLowerCase();
  let best = null;
  for (const candidate of known) {
    const aliases = candidate.aliases ?? [];
    let match = null;
    if (upi && candidate.upiId && candidate.upiId.toLowerCase() === upi) {
      match = { candidate, confidence: 98, reason: 'upi id' };
    } else if (key && (candidate.key === key || aliases.includes(key))) {
      match = { candidate, confidence: 100, reason: 'exact alias' };
    } else if (key) {
      const scores = [candidate.key, ...aliases].map((k) => similarity(key, k));
      const top = Math.max(0, ...scores);
      if (top >= 70) match = { candidate, confidence: top, reason: 'fuzzy' };
    }
    if (match && (!best || match.confidence > best.confidence)) best = match;
  }
  return best ? { ...best, autoApply: best.confidence >= 85 } : null;
}
