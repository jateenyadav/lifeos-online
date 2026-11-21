/**
 * Money sent to / received from people (as opposed to shops): what each answer means.
 * Port of SpendSense lib/domain/peer/peer.dart.
 */

export const peerTags = [
  'lent',
  'split',
  'repaid',
  'borrowed',
  'got_back',
  'owe_owner',
  'personal',
  'left',
];
const outgoing = new Set(['lent', 'split', 'repaid']);
const incoming = new Set(['borrowed', 'got_back']);

/** True when the answer makes sense for a payment in this direction. */
export function peerFits(tag, direction) {
  if (outgoing.has(tag)) return direction === 'debit';
  if (incoming.has(tag)) return direction === 'credit';
  return true;
}

/**
 * What `tag` means for a payment of `amountMinor`:
 * {khataDirection: 'gave'|'got'|null, khataMinor, peerShareMinor}.
 * For 'split', `people` is everyone sharing the bill including me (2–6).
 * `credit` matters only for 'owe_owner' (a refund on their card means I owe them less).
 */
export function peerOutcome(
  tag,
  amountMinor,
  { people = 2, credit = false } = {},
) {
  switch (tag) {
    case 'lent':
    case 'repaid':
      return {
        khataDirection: 'gave',
        khataMinor: amountMinor,
        peerShareMinor: amountMinor,
      };
    case 'split': {
      const n = people < 2 ? 2 : people;
      const others = amountMinor - Math.floor(amountMinor / n);
      return {
        khataDirection: 'gave',
        khataMinor: others,
        peerShareMinor: others,
      };
    }
    case 'borrowed':
    case 'got_back':
      return {
        khataDirection: 'got',
        khataMinor: amountMinor,
        peerShareMinor: amountMinor,
      };
    case 'owe_owner':
      // Still my own spending (share 0); the khata records the debt.
      return {
        khataDirection: credit ? 'gave' : 'got',
        khataMinor: amountMinor,
        peerShareMinor: 0,
      };
    default:
      return { khataDirection: null, khataMinor: 0, peerShareMinor: 0 };
  }
}

/** Khata note written for an answer. */
export function peerNote(tag, { people = 2, credit = false } = {}) {
  return {
    lent: 'Lent (auto from payment)',
    split: `Split bill: their share of ${people === 2 ? 'half' : `1/${people} each`}`,
    repaid: 'Paid back',
    borrowed: 'Borrowed',
    got_back: 'Got back',
    owe_owner: credit ? 'Refund on their card' : 'Paid with their card',
  }[tag];
}

const business =
  /\b(store|stores|shop|mart|kitchen|restaurant|cafe|caf[eé]|hotel|foods?|bakery|sweets|dhaba|medical|medicals|pharma|pharmacy|chemist|hospital|clinic|pvt|private|ltd|limited|llp|inc|enterprises?|traders?|trading|services?|solutions?|technologies|tech|retail|industries|agency|agencies|company|co\b|corp|motors|petrol|fuel|filling|station|electricals?|electronics|mobiles?|garments?|fashion|textiles?|salon|parlour|gym|fitness|travels?|tours|cabs?|taxi|school|college|academy|institute|classes|tuition|society|apartments?|rent|bank|finance|insurance|recharge|bill|bills|payments?|pay|wallet|merchant|zomato|swiggy|amazon|flipkart|blinkit|zepto|uber|ola|rapido|irctc|jio|airtel|vodafone|vi|bsnl|paytm|phonepe|google|cred|myntra|ajio|nykaa|bigbasket|dmart|reliance|tata|bescom|electricity|gas|water|broadband|dth|netflix|spotify|hotstar|prime|youtube|apple|microsoft)\b/i;
const phoneUpi = /^[6-9]\d{9}(-\d)?@/i;
const merchantUpi =
  /(^(paytm|bharatpe|q\d|mab|gpay-|pay|merchant|razorpay|cf\.|rzp|billdesk|payu|ccavenue|juspay|bqr)|@(paytm|pty|ptybl|ptys|ptyes|ptaxis|bharatpe|mairtel|axisbank|hdfcbank|icici)$)/i;

/** True when name/upiId looks like a private person rather than a shop. */
export function looksLikePerson(name, { upiId, knownContact = false } = {}) {
  if (knownContact) return true;
  const upi = upiId?.trim() ?? '';
  if (upi && merchantUpi.test(upi)) return false;
  const n = (name ?? '').trim();
  if (!n || n.includes('@')) return Boolean(upi) && phoneUpi.test(upi);
  if (business.test(n)) return false;
  if (/\d/.test(n)) return false;
  const words = n.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  if (!words.every((word) => /^[A-Za-z.']{1,15}$/.test(word))) return false;
  if (phoneUpi.test(upi)) return true;
  return words.length >= 2 || words[0].length >= 3;
}

/** Payee label → contact name ("MR RAHUL KUMAR" → "Rahul Kumar"). */
export function contactName(raw) {
  let s = String(raw).trim().replace(/\s+/g, ' ');
  s = s.replace(/^(mr|mrs|ms|miss|shri|smt|dr)\.?\s+/i, '');
  if (s === s.toUpperCase() || s === s.toLowerCase())
    s = s
      .split(' ')
      .map((word) =>
        word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word,
      )
      .join(' ');
  return s.slice(0, 80);
}
