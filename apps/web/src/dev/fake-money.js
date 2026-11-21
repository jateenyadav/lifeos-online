/**
 * An in-memory fake of the Money API (docs/MONEY.md §4).
 * Used by the tests (through a fake fetch) and by the dev mock server (MOCK_API=1 npm run dev -w apps/web).
 * It follows the contract closely enough to drive the UI; the real rules live in server/.
 */

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addDays = (key, days) => {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dayKey(date);
};
const daysBetween = (a, b) =>
  Math.round(
    (new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000,
  );
const monthOf = (key) => key.slice(0, 7);
const shift = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function createFakeMoney({
  today = dayKey(new Date()),
  seed = true,
} = {}) {
  let counter = 0;
  const id = (prefix) =>
    `${prefix}${(++counter).toString(16).padStart(6, '0')}`;
  const state = {
    accounts: [],
    txns: [],
    contacts: [],
    entries: [],
    adjustments: [],
    photos: [],
    budgets: [],
    merchants: [],
  };

  const own = (t) =>
    clamp(
      t.amountMinor - (t.peerShareMinor || 0) - (t.reimburseMinor || 0),
      0,
      t.amountMinor,
    );
  const live = () => state.txns.filter((t) => !t.deleted);
  const counts = (t) => !t.deleted && t.status === 'cleared' && !t.isTransfer;
  const view = (t) => ({ ...t, ownMinor: own(t) });
  const contactName = (cid) =>
    state.contacts.find((c) => c.id === cid)?.name ?? null;

  function addTxn(values) {
    const txn = {
      id: id('t'),
      date: today,
      time: null,
      amountMinor: 0,
      direction: 'debit',
      title: '',
      category: 'Other',
      purpose: '',
      channel: 'UPI',
      accountId: null,
      note: '',
      status: 'cleared',
      needsReview: false,
      source: 'manual',
      sources: [],
      sourceKey: null,
      utr: null,
      sourceApp: '',
      bank: '',
      last4: '',
      counterparty: '',
      isPerson: false,
      peerTag: null,
      peerShareMinor: 0,
      splitPeople: null,
      contactId: null,
      isTransfer: false,
      transferId: null,
      refundOfId: null,
      possibleDuplicateOf: null,
      reimburseTag: null,
      reimburseMinor: 0,
      reimbursedById: null,
      deleted: false,
      ...values,
    };
    txn.sources = txn.sources.length ? txn.sources : [txn.source];
    state.txns.push(txn);
    return txn;
  }
  function findContact(name) {
    const key = name.trim().toLowerCase();
    let contact = state.contacts.find((c) => c.name.toLowerCase() === key);
    if (!contact) {
      contact = {
        id: id('c'),
        name: name.trim(),
        phone: '',
        note: '',
        archived: false,
      };
      state.contacts.push(contact);
    }
    return contact;
  }
  function addEntry(values) {
    const entry = {
      id: id('e'),
      contactId: null,
      direction: 'gave',
      amountMinor: 0,
      date: today,
      note: '',
      dueDate: null,
      isOpening: false,
      linkedTxnId: null,
      paidForMe: false,
      ...values,
    };
    state.entries.push(entry);
    return entry;
  }

  // ---------- derived numbers ----------
  function spendOf(list) {
    let spent = 0;
    for (const t of list) {
      if (!counts(t)) continue;
      if (t.direction === 'debit') spent += own(t);
      else if (t.refundOfId) spent -= own(t);
    }
    return Math.max(0, spent);
  }
  const incomeOf = (list) =>
    list
      .filter((t) => counts(t) && t.direction === 'credit' && !t.refundOfId)
      .reduce((s, t) => s + own(t), 0);
  const inMonth = (month) => live().filter((t) => t.date.startsWith(month));

  function balanceOf(account) {
    return live()
      .filter((t) => t.accountId === account.id && t.status === 'cleared')
      .reduce(
        (sum, t) =>
          sum + (t.direction === 'credit' ? t.amountMinor : -t.amountMinor),
        account.openingMinor,
      );
  }
  function accountView(account) {
    const balanceMinor = balanceOf(account);
    let card = null;
    if (account.type === 'credit_card') {
      const outstanding = Math.max(0, -balanceMinor);
      const daysToDue = account.dueDate
        ? daysBetween(today, account.dueDate)
        : null;
      const paid =
        account.billPaidAt &&
        account.dueDate &&
        account.billPaidAt >= addDays(account.dueDate, -40);
      const start = account.statementDay
        ? (() => {
            const [y, m] = today.split('-').map(Number);
            const d = Number(today.slice(8));
            const date = new Date(
              y,
              m - 1 - (d > account.statementDay ? 0 : 1),
              account.statementDay + 1,
            );
            return dayKey(date);
          })()
        : `${monthOf(today)}-01`;
      card = {
        outstanding,
        available: account.creditLimitMinor - outstanding,
        usagePct: account.creditLimitMinor
          ? Math.round((outstanding / account.creditLimitMinor) * 100)
          : 0,
        cycleSpendMinor: live()
          .filter(
            (t) =>
              t.accountId === account.id &&
              t.direction === 'debit' &&
              t.date >= start &&
              counts(t),
          )
          .reduce((s, t) => s + t.amountMinor, 0),
        daysToDue,
        overdue: Boolean(
          daysToDue !== null && daysToDue < 0 && account.billMinor > 0 && !paid,
        ),
      };
    }
    return {
      ...account,
      balanceMinor,
      card,
      bankSaidMinor: account.bankBalanceMinor,
    };
  }

  function contactBalance(cid) {
    const entries = state.entries.filter((e) => e.contactId === cid);
    const givenMinor = entries
      .filter((e) => e.direction === 'gave')
      .reduce((s, e) => s + e.amountMinor, 0);
    const receivedMinor = entries
      .filter((e) => e.direction === 'got')
      .reduce((s, e) => s + e.amountMinor, 0);
    const actualMinor = givenMinor - receivedMinor;
    const adjust = state.adjustments
      .filter((a) => a.contactId === cid && a.active)
      .reduce((s, a) => s + a.deltaMinor, 0);
    return {
      actualMinor,
      adjustedMinor: actualMinor + adjust,
      givenMinor,
      receivedMinor,
    };
  }

  function subscriptions() {
    const groups = new Map();
    for (const t of live()) {
      if (t.direction !== 'debit' || t.isPerson || t.isTransfer) continue;
      const key = t.title.toLowerCase().replace(/[^a-z]/g, '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const result = [];
    for (const list of groups.values()) {
      if (list.length < 3) continue;
      list.sort((a, b) => a.date.localeCompare(b.date));
      const amounts = list.map((t) => t.amountMinor);
      const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      if (amounts.some((a) => Math.abs(a - avg) > avg * 0.1)) continue;
      const gaps = list
        .slice(1)
        .map((t, i) => daysBetween(list[i].date, t.date));
      const gap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const period =
        gap < 10
          ? 'weekly'
          : gap < 45
            ? 'monthly'
            : gap < 120
              ? 'quarterly'
              : 'yearly';
      if (gap > 400) continue;
      const amountMinor = list.at(-1).amountMinor;
      const perYear = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }[
        period
      ];
      result.push({
        title: list.at(-1).title,
        amountMinor,
        period,
        nextDate: addDays(list.at(-1).date, Math.round(gap)),
        monthlyMinor: Math.round((amountMinor * perYear) / 12),
        yearlyMinor: amountMinor * perYear,
        count: list.length,
      });
    }
    return result.sort((a, b) => b.monthlyMinor - a.monthlyMinor);
  }

  function overview(month) {
    const list = inMonth(month);
    const spentMinor = spendOf(list);
    const incomeMinor = incomeOf(list);
    const budgetRow = state.budgets.find(
      (b) => b.month === month && b.category === '*',
    );
    const byCategory = new Map();
    for (const t of list)
      if (counts(t) && t.direction === 'debit' && own(t) > 0)
        byCategory.set(t.category, (byCategory.get(t.category) || 0) + own(t));
    const [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const daily = Array.from({ length: days }, (_, i) => {
      const date = `${month}-${pad(i + 1)}`;
      return {
        date,
        minor: spendOf(
          list.filter((t) => t.date === date && t.direction === 'debit'),
        ),
      };
    });
    const trend = Array.from({ length: 12 }, (_, i) => {
      const key = shift(month, i - 11);
      const rows = inMonth(key);
      return {
        month: key,
        spentMinor: spendOf(rows),
        incomeMinor: incomeOf(rows),
      };
    });
    const merchants = new Map();
    for (const t of list)
      if (counts(t) && t.direction === 'debit' && !t.isPerson) {
        const row = merchants.get(t.title) || {
          title: t.title,
          minor: 0,
          count: 0,
        };
        row.minor += own(t);
        row.count += 1;
        merchants.set(t.title, row);
      }
    const accounts = state.accounts.filter((a) => !a.archived).map(accountView);
    const netWorthMinor = accounts
      .filter((a) => !(a.type === 'credit_card' && a.ownerName))
      .reduce((s, a) => s + a.balanceMinor, 0);
    let owedToMeMinor = 0;
    let iOweMinor = 0;
    for (const c of state.contacts) {
      const { adjustedMinor } = contactBalance(c.id);
      if (adjustedMinor > 0) owedToMeMinor += adjustedMinor;
      else iOweMinor -= adjustedMinor;
    }
    const waiting = live().filter(
      (t) => t.reimburseTag === 'claim' && !t.reimbursedById,
    );
    const comingUp = [
      ...accounts
        .filter(
          (a) =>
            a.type === 'credit_card' &&
            a.billMinor > 0 &&
            a.dueDate &&
            !a.ownerName &&
            !a.billPaidAt,
        )
        .map((a) => ({
          kind: 'card_bill',
          title: `${a.name} bill`,
          date: a.dueDate,
          amountMinor: a.billMinor,
        })),
      ...subscriptions()
        .filter((s) => s.nextDate >= today && s.nextDate <= addDays(today, 30))
        .map((s) => ({
          kind: 'subscription',
          title: s.title,
          date: s.nextDate,
          amountMinor: s.amountMinor,
        })),
      ...state.entries
        .filter((e) => e.dueDate && e.dueDate >= addDays(today, -30))
        .map((e) => ({
          kind: 'khata_due',
          title: `${contactName(e.contactId)} · ${e.note || 'khata'}`,
          date: e.dueDate,
          amountMinor: e.amountMinor,
        })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return {
      month,
      spentMinor,
      incomeMinor,
      netMinor: incomeMinor - spentMinor,
      budget: budgetRow
        ? { limitMinor: budgetRow.limitMinor, usedMinor: spentMinor }
        : null,
      byCategory: [...byCategory]
        .map(([category, minor]) => ({ category, minor }))
        .sort((a, b) => b.minor - a.minor),
      daily,
      trend,
      topMerchants: [...merchants.values()]
        .sort((a, b) => b.minor - a.minor)
        .slice(0, 5),
      netWorthMinor,
      khata: { owedToMeMinor, iOweMinor },
      reviewCount: live().filter((t) => t.needsReview).length,
      leftCount: live().filter((t) => t.peerTag === 'left').length,
      reimburse: {
        waitingMinor: waiting.reduce((s, t) => s + t.reimburseMinor, 0),
        waitingCount: waiting.length,
      },
      comingUp,
    };
  }

  // ---------- peer + reimbursement rules ----------
  function setPeer(
    txn,
    { peerTag, contactName: name, contactId, splitPeople },
  ) {
    state.entries = state.entries.filter(
      (e) => e.linkedTxnId !== txn.id || e.paidForMe,
    );
    txn.peerShareMinor = 0;
    txn.peerTag = peerTag ?? null;
    txn.splitPeople = null;
    if (!peerTag || peerTag === 'personal' || peerTag === 'left') return;
    const contact = contactId
      ? state.contacts.find((c) => c.id === contactId)
      : findContact(name || txn.counterparty || txn.title);
    if (!contact)
      throw Object.assign(new Error('Choose a person.'), { status: 400 });
    txn.contactId = contact.id;
    const amount = txn.amountMinor;
    let direction = 'gave';
    let entryAmount = amount;
    let share = amount;
    if (peerTag === 'split') {
      const people = clamp(Number(splitPeople) || 2, 2, 6);
      txn.splitPeople = people;
      entryAmount = amount - Math.floor(amount / people);
      share = entryAmount;
    } else if (peerTag === 'borrowed' || peerTag === 'got_back')
      direction = 'got';
    else if (peerTag === 'owe_owner') {
      direction = txn.direction === 'debit' ? 'got' : 'gave';
      share = 0;
    }
    txn.peerShareMinor = share;
    addEntry({
      contactId: contact.id,
      direction,
      amountMinor: entryAmount,
      date: txn.date,
      note: txn.title,
      linkedTxnId: txn.id,
    });
  }

  function allocate(credit, claimIds, save) {
    const claims = claimIds
      .map((cid) => state.txns.find((t) => t.id === cid && !t.deleted))
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let remaining = credit.amountMinor;
    let wanted = 0;
    for (const claim of claims) {
      const want =
        claim.reimburseMinor || claim.amountMinor - claim.peerShareMinor;
      const covered = Math.min(want, remaining);
      wanted += want;
      remaining -= covered;
      if (save) {
        claim.reimburseMinor = covered;
        claim.reimbursedById = credit.id;
      }
    }
    const matchedMinor = credit.amountMinor - remaining;
    if (save) {
      credit.reimburseTag = 'received';
      credit.reimburseMinor = matchedMinor;
    }
    return {
      matchedMinor,
      extraMinor: remaining,
      shortMinor: wanted - matchedMinor,
    };
  }

  // ---------- old notes parser (simplified port) ----------
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
  function amountIn(text) {
    const match = text.match(
      /([+-−]?)\s*(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*(k|lac|lakh|l)?\b/i,
    );
    if (!match) return null;
    let rupees = Number(match[2].replace(/,/g, ''));
    const unit = (match[3] || '').toLowerCase();
    if (unit === 'k') rupees *= 1000;
    if (unit === 'lac' || unit === 'lakh' || unit === 'l') rupees *= 100000;
    const negative =
      match[1] === '-' ||
      match[1] === '−' ||
      /\b(got|received|returned|paid me|gave me)\b/i.test(text);
    return {
      minor: Math.round(rupees * 100) * (negative ? -1 : 1),
      raw: match[0],
    };
  }
  function dateIn(text) {
    const match = text.match(
      /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
    );
    if (!match) return null;
    const year = Number(today.slice(0, 4));
    return `${year}-${pad(months[match[2].toLowerCase()])}-${pad(Number(match[1]))}`;
  }
  function parseLines(text) {
    const lines = [];
    for (const line of text.split(/\n/)) {
      const clean = line.trim();
      if (!clean || /^total\b/i.test(clean)) continue;
      const amount = amountIn(clean);
      if (!amount) continue;
      lines.push({
        signedMinor: amount.minor,
        note:
          clean
            .replace(amount.raw, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/^[\s:-]+|[\s:-]+$/g, '') || 'Old entry',
        date: dateIn(clean),
      });
    }
    return lines;
  }
  function parseBulk(text) {
    const people = [];
    let current = null;
    for (const raw of text.split(/\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const head = line.match(
        /^([A-Za-z][A-Za-z .']{0,40}?)\s*(?:\(([^)]*)\))?\s*[:\-–]\s*(.*)$/,
      );
      if (head && !/^total$/i.test(head[1].trim())) {
        current = {
          name: head[1].trim(),
          tag: head[2] || '',
          lines: [],
          statedMinor: null,
        };
        people.push(current);
        const rest = head[3].trim();
        const amount = rest && amountIn(rest);
        if (amount && !rest.replace(amount.raw, '').trim())
          current.statedMinor = amount.minor;
        else if (rest) current.lines.push(...parseLines(rest));
        continue;
      }
      if (!current) continue;
      if (/^total\b/i.test(line)) {
        current.statedMinor = amountIn(line)?.minor ?? null;
        continue;
      }
      current.lines.push(...parseLines(line));
    }
    return people.map((p) => {
      const linesMinor = p.lines.reduce((s, l) => s + l.signedMinor, 0);
      const choice = !p.lines.length
        ? 'totalOnly'
        : p.statedMinor != null && p.statedMinor !== linesMinor
          ? 'linesAndFix'
          : 'lines';
      return { ...p, linesMinor, statedMinor: p.statedMinor, choice };
    });
  }

  // ---------- routing ----------
  const ok = (body, status = 200) => ({ status, body });
  const fail = (status, error) => ({ status, body: { error } });
  const txnOr404 = (tid) => state.txns.find((t) => t.id === tid && !t.deleted);

  function handle(method, url, body = {}) {
    const parsed = new URL(url, 'http://local');
    const path = parsed.pathname
      .replace(/^\/api\/money/, '')
      .replace(/\/$/, '');
    const q = Object.fromEntries(parsed.searchParams);
    const parts = path.split('/').filter(Boolean);
    try {
      return route(method, parts, q, body || {});
    } catch (error) {
      return fail(error.status || 400, error.message);
    }
  }

  function route(method, parts, q, body) {
    const [head, second, third, fourth] = parts;
    if (head === 'overview' && method === 'GET')
      return ok(overview(q.month || monthOf(today)));

    if (head === 'txns' && !second) {
      if (method === 'POST') {
        if (!(body.amountMinor > 0))
          return fail(400, 'Enter an amount above zero.');
        const txn = addTxn({ ...body, source: 'manual' });
        return ok({ txn: view(txn) }, 201);
      }
      let list = live();
      if (q.from) list = list.filter((t) => t.date >= q.from);
      if (q.to) list = list.filter((t) => t.date <= q.to);
      if (q.q) {
        const needle = q.q.toLowerCase();
        list = list.filter((t) =>
          `${t.title} ${t.note} ${t.counterparty} ${t.purpose}`
            .toLowerCase()
            .includes(needle),
        );
      }
      if (q.category) list = list.filter((t) => t.category === q.category);
      if (q.accountId) list = list.filter((t) => t.accountId === q.accountId);
      if (q.direction) list = list.filter((t) => t.direction === q.direction);
      if (q.source) list = list.filter((t) => t.source === q.source);
      if (q.status) list = list.filter((t) => t.status === q.status);
      if (q.review === '1') list = list.filter((t) => t.needsReview);
      if (q.left === '1') list = list.filter((t) => t.peerTag === 'left');
      list.sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (b.time || '').localeCompare(a.time || '') ||
          b.id.localeCompare(a.id),
      );
      const start = Number(q.cursor || 0);
      const limit = Number(q.limit || 50);
      const page = list.slice(start, start + limit);
      return ok({
        items: page.map(view),
        nextCursor: start + limit < list.length ? String(start + limit) : null,
      });
    }
    if (head === 'txns' && second === 'ingest') return ok({ items: [] });
    if (head === 'txns' && second) {
      const txn = txnOr404(second);
      if (!txn) return fail(404, 'That payment was not found.');
      if (!third) {
        if (method === 'PATCH') {
          const allowed = [
            'title',
            'category',
            'purpose',
            'note',
            'date',
            'amountMinor',
            'accountId',
            'status',
            'needsReview',
            'direction',
            'channel',
            'time',
          ];
          for (const key of allowed) if (key in body) txn[key] = body[key];
          return ok({ txn: view(txn) });
        }
        if (method === 'DELETE') {
          txn.deleted = true;
          state.entries = state.entries.filter((e) => e.linkedTxnId !== txn.id);
          state.photos = state.photos.filter(
            (p) => !(p.ownerType === 'txn' && p.ownerId === txn.id),
          );
          return { status: 204, body: null };
        }
        if (method === 'GET') return ok({ txn: view(txn) });
      }
      if (third === 'peer') {
        setPeer(txn, body);
        return ok({ txn: view(txn) });
      }
      if (third === 'refund-of') {
        txn.refundOfId = body.originalId ?? null;
        if (txn.refundOfId) txn.category = 'Refund';
        return ok({ txn: view(txn) });
      }
      if (third === 'transfer') {
        if (method === 'DELETE') {
          const other = state.txns.find(
            (t) =>
              t.transferId &&
              t.transferId === txn.transferId &&
              t.id !== txn.id,
          );
          for (const t of [txn, other].filter(Boolean)) {
            t.isTransfer = false;
            t.transferId = null;
          }
          return ok({ txn: view(txn) });
        }
        if (body.untracked) {
          txn.isTransfer = true;
          txn.transferId = null;
          return ok({ txn: view(txn) });
        }
        const other = txnOr404(body.otherId);
        if (!other) return fail(404, 'The other payment was not found.');
        const transferId = id('x');
        for (const t of [txn, other]) {
          t.isTransfer = true;
          t.transferId = transferId;
        }
        return ok({ txn: view(txn) });
      }
      if (third === 'reimburse' && fourth === 'claim') {
        if (method === 'DELETE') {
          txn.reimburseTag = null;
          txn.reimburseMinor = 0;
          txn.reimbursedById = null;
          return ok({ txn: view(txn) });
        }
        const max = txn.amountMinor - txn.peerShareMinor;
        const amount = body.amountMinor ?? max;
        if (amount <= 0 || amount > max)
          return fail(
            400,
            'The claim can be at most your own part of this payment.',
          );
        txn.reimburseTag = 'claim';
        txn.reimburseMinor = amount;
        return ok({ txn: view(txn) });
      }
      if (third === 'reimburse' && fourth === 'preview')
        return ok(allocate(txn, body.claimIds || [], false));
      if (third === 'reimburse' && fourth === 'received') {
        if (method === 'DELETE') {
          for (const claim of state.txns.filter(
            (t) => t.reimbursedById === txn.id,
          )) {
            claim.reimbursedById = null;
            claim.reimburseMinor = claim.amountMinor - claim.peerShareMinor;
          }
          txn.reimburseTag = null;
          txn.reimburseMinor = 0;
          return ok({ txn: view(txn) });
        }
        return ok(allocate(txn, body.claimIds || [], true));
      }
    }
    if (head === 'transfers' && second === 'suggestions') {
      const list = live().filter(
        (t) => !t.isTransfer && t.accountId && t.status === 'cleared',
      );
      const pairs = [];
      for (const a of list)
        for (const b of list)
          if (
            a.direction === 'debit' &&
            b.direction === 'credit' &&
            a.amountMinor === b.amountMinor &&
            a.accountId !== b.accountId &&
            Math.abs(daysBetween(a.date, b.date)) <= 3
          )
            pairs.push({ a: view(a), b: view(b) });
      return ok({ items: pairs });
    }
    if (head === 'reimbursements') {
      const claims = live().filter((t) => t.reimburseTag === 'claim');
      const items = claims
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((t) => {
          const credit = t.reimbursedById
            ? state.txns.find((x) => x.id === t.reimbursedById)
            : null;
          return {
            txn: view(t),
            payBackTo:
              t.peerTag === 'owe_owner' ? contactName(t.contactId) : null,
            paidBy: credit
              ? { id: credit.id, title: credit.title, date: credit.date }
              : null,
            waiting: !t.reimbursedById,
          };
        });
      return ok({
        waitingMinor: items
          .filter((i) => i.waiting)
          .reduce((s, i) => s + i.txn.reimburseMinor, 0),
        items,
      });
    }

    if (head === 'accounts') {
      if (!second && method === 'GET')
        return ok({
          items: state.accounts.filter((a) => !a.archived).map(accountView),
        });
      if (!second && method === 'POST') {
        const account = {
          id: id('a'),
          name: 'Account',
          type: 'savings',
          bank: '',
          last4: '',
          openingMinor: 0,
          ownerName: null,
          followBank: true,
          bankBalanceMinor: null,
          bankBalanceAt: null,
          creditLimitMinor: 0,
          billMinor: 0,
          minDueMinor: 0,
          dueDate: null,
          statementDay: null,
          billPaidAt: null,
          needsConfirm: false,
          archived: false,
          ...body,
        };
        state.accounts.push(account);
        return ok({ account: accountView(account) }, 201);
      }
      const account = state.accounts.find((a) => a.id === second);
      if (!account) return fail(404, 'That account was not found.');
      if (!third && method === 'PATCH') {
        Object.assign(account, body);
        return ok({ account: accountView(account) });
      }
      if (!third && method === 'DELETE') {
        state.accounts = state.accounts.filter((a) => a !== account);
        state.txns.forEach((t) => {
          if (t.accountId === account.id) t.accountId = null;
        });
        return { status: 204, body: null };
      }
      if (third === 'match-bank') {
        account.openingMinor +=
          (account.bankBalanceMinor ?? balanceOf(account)) - balanceOf(account);
        return ok({ account: accountView(account) });
      }
      if (third === 'bill-paid') {
        account.billPaidAt = today;
        return ok({ account: accountView(account) });
      }
    }

    if (head === 'khata' && !second) {
      const contacts = state.contacts
        .filter((c) => !c.archived)
        .map((c) => {
          const entries = state.entries.filter((e) => e.contactId === c.id);
          const lastDate =
            entries
              .map((e) => e.date)
              .sort()
              .at(-1) ?? null;
          return {
            contact: c,
            balance: contactBalance(c.id),
            lastDate,
            overdue: entries.some((e) => e.dueDate && e.dueDate < today),
          };
        })
        .sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
      const totals = contacts.reduce(
        (sum, row) => {
          if (row.balance.adjustedMinor > 0)
            sum.owedToMeMinor += row.balance.adjustedMinor;
          else sum.iOweMinor -= row.balance.adjustedMinor;
          return sum;
        },
        { owedToMeMinor: 0, iOweMinor: 0 },
      );
      return ok({
        ...totals,
        contacts,
        left: live()
          .filter((t) => t.peerTag === 'left')
          .map(view),
      });
    }
    if (head === 'khata' && second === 'contacts') {
      if (!third && method === 'POST') {
        if (!body.name?.trim()) return fail(400, 'Enter a name.');
        const contact = findContact(body.name);
        Object.assign(contact, {
          phone: body.phone ?? contact.phone,
          note: body.note ?? contact.note,
        });
        return ok({ contact }, 201);
      }
      const contact = state.contacts.find((c) => c.id === third);
      if (!contact) return fail(404, 'That person was not found.');
      if (!fourth && method === 'GET') {
        const entries = state.entries.filter((e) => e.contactId === contact.id);
        const chrono = [
          ...entries
            .filter((e) => e.isOpening)
            .sort(
              (a, b) =>
                a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
            ),
          ...entries
            .filter((e) => !e.isOpening)
            .sort(
              (a, b) =>
                a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
            ),
        ];
        let running = 0;
        const withRunning = chrono.map((e) => {
          running += e.direction === 'gave' ? e.amountMinor : -e.amountMinor;
          return { ...e, runningMinor: running };
        });
        const display = [
          ...withRunning.filter((e) => !e.isOpening).reverse(),
          ...withRunning.filter((e) => e.isOpening).reverse(),
        ];
        return ok({
          contact,
          balance: contactBalance(contact.id),
          entries: display,
          adjustments: state.adjustments.filter(
            (a) => a.contactId === contact.id,
          ),
          photos: state.photos
            .filter(
              (p) =>
                p.ownerType === 'khata_contact' && p.ownerId === contact.id,
            )
            .map((p) => ({ id: p.id, caption: p.caption })),
        });
      }
      if (!fourth && method === 'PATCH') {
        Object.assign(contact, body);
        return ok({ contact });
      }
      if (!fourth && method === 'DELETE') {
        state.contacts = state.contacts.filter((c) => c !== contact);
        state.entries = state.entries.filter((e) => e.contactId !== contact.id);
        state.adjustments = state.adjustments.filter(
          (a) => a.contactId !== contact.id,
        );
        state.photos = state.photos.filter((p) => p.ownerId !== contact.id);
        return { status: 204, body: null };
      }
      if (fourth === 'entries') {
        if (!(body.amountMinor > 0))
          return fail(400, 'Enter an amount above zero.');
        const entry = addEntry({
          contactId: contact.id,
          direction: body.direction,
          amountMinor: body.amountMinor,
          date: body.date || today,
          note: body.note || '',
          dueDate: body.dueDate || null,
          paidForMe: Boolean(body.paidForMe && body.direction === 'got'),
        });
        if (entry.paidForMe) {
          const txn = addTxn({
            date: entry.date,
            amountMinor: entry.amountMinor,
            direction: 'debit',
            title: entry.note || `Paid by ${contact.name}`,
            category: body.category || 'Other',
            source: 'khata',
            peerTag: 'owe_owner',
            contactId: contact.id,
            counterparty: contact.name,
            isPerson: true,
            channel: 'Other',
          });
          entry.linkedTxnId = txn.id;
        }
        return ok({ entry }, 201);
      }
      if (fourth === 'adjustments') {
        const { actualMinor } = contactBalance(contact.id);
        const amount = Math.abs(body.amountMinor || 0);
        const deltaMinor = body.reduce
          ? -Math.sign(actualMinor || 1) * amount
          : amount;
        const adjustment = {
          id: id('j'),
          contactId: contact.id,
          type: body.type,
          deltaMinor,
          note: body.note || '',
          active: true,
        };
        state.adjustments.push(adjustment);
        return ok({ adjustment }, 201);
      }
      if (fourth === 'swap') {
        state.entries.forEach((e) => {
          if (e.contactId === contact.id)
            e.direction = e.direction === 'gave' ? 'got' : 'gave';
        });
        return ok({ contact });
      }
    }
    if (head === 'khata' && second === 'entries') {
      const entry = state.entries.find((e) => e.id === third);
      if (!entry) return fail(404, 'That entry was not found.');
      const txn = entry.linkedTxnId ? txnOr404(entry.linkedTxnId) : null;
      if (method === 'PATCH') {
        Object.assign(entry, body);
        if (txn && entry.paidForMe)
          Object.assign(txn, {
            amountMinor: entry.amountMinor,
            date: entry.date,
            title: entry.note || txn.title,
          });
        return ok({ entry });
      }
      if (method === 'DELETE') {
        state.entries = state.entries.filter((e) => e !== entry);
        if (txn && entry.paidForMe) txn.deleted = true;
        else if (txn) {
          txn.peerTag = null;
          txn.peerShareMinor = 0;
        }
        return { status: 204, body: null };
      }
    }
    if (head === 'khata' && second === 'adjustments') {
      const adjustment = state.adjustments.find((a) => a.id === third);
      if (!adjustment) return fail(404, 'That adjustment was not found.');
      if (method === 'PATCH') {
        adjustment.active = Boolean(body.active);
        return ok({ adjustment });
      }
      state.adjustments = state.adjustments.filter((a) => a !== adjustment);
      return { status: 204, body: null };
    }
    if (head === 'khata' && second === 'import' && third === 'parse') {
      if (body.mode === 'bulk')
        return ok({ people: parseBulk(body.text || '') });
      const lines = parseLines(body.text || '');
      return ok({
        lines,
        totalMinor: lines.reduce((s, l) => s + l.signedMinor, 0),
      });
    }
    if (head === 'khata' && second === 'import' && third === 'save') {
      const saved = [];
      for (const person of body.people || []) {
        if (person.choice === 'skip' || !person.name?.trim()) continue;
        const contact = findContact(person.name);
        const sign = person.plusTheyOwe === false ? -1 : 1;
        const put = (signed, note, date) => {
          const value = signed * sign;
          if (!value) return;
          addEntry({
            contactId: contact.id,
            direction: value > 0 ? 'gave' : 'got',
            amountMinor: Math.abs(value),
            date: date || today,
            note,
            isOpening: true,
          });
        };
        const lines = person.lines || [];
        const linesMinor = lines.reduce((s, l) => s + l.signedMinor, 0);
        if (person.choice === 'totalOnly')
          put(person.statedMinor ?? linesMinor, 'Opening balance');
        else {
          lines.forEach((l) => put(l.signedMinor, l.note, l.date));
          if (person.choice === 'linesAndFix' && person.statedMinor != null)
            put(
              person.statedMinor - linesMinor,
              'Fix to match the noted total',
            );
        }
        for (const photoId of body.photoIds || []) {
          const photo = state.photos.find((p) => p.id === photoId);
          if (photo && !photo.ownerId)
            state.photos.push({ ...photo, id: id('p'), ownerId: contact.id });
        }
        saved.push(contact.id);
      }
      state.photos = state.photos.filter(
        (p) =>
          !(
            p.ownerType === 'khata_contact' &&
            !p.ownerId &&
            (body.photoIds || []).includes(p.id)
          ),
      );
      return ok({ saved: saved.length, contactIds: saved });
    }

    if (head === 'photos') {
      if (!second && method === 'POST') {
        if (!body.data) return fail(400, 'Choose a picture.');
        const photo = {
          id: id('p'),
          ownerType: body.ownerType,
          ownerId: body.ownerId ?? null,
          mime: body.mime,
          data: body.data,
          caption: body.caption || '',
        };
        state.photos.push(photo);
        return ok({ id: photo.id }, 201);
      }
      const photo = state.photos.find((p) => p.id === second);
      if (!photo) return fail(404, 'That picture was not found.');
      if (method === 'DELETE') {
        state.photos = state.photos.filter((p) => p !== photo);
        return { status: 204, body: null };
      }
      return { status: 200, bytes: { mime: photo.mime, base64: photo.data } };
    }

    if (head === 'subscriptions') return ok({ items: subscriptions() });
    if (head === 'budgets') {
      if (method === 'GET')
        return ok({
          items: state.budgets.filter((b) => !q.month || b.month === q.month),
        });
      if (method === 'PUT') {
        let row = state.budgets.find(
          (b) => b.month === body.month && b.category === body.category,
        );
        if (!row) {
          row = {
            id: id('b'),
            month: body.month,
            category: body.category,
            limitMinor: 0,
          };
          state.budgets.push(row);
        }
        row.limitMinor = body.limitMinor;
        return ok({ budget: row });
      }
      if (method === 'DELETE') {
        state.budgets = state.budgets.filter((b) => b.id !== second);
        return { status: 204, body: null };
      }
    }
    if (head === 'merchants') {
      const seen = new Map();
      for (const t of live())
        if (!t.isPerson)
          seen.set(t.title.toLowerCase(), {
            key: t.title.toLowerCase(),
            title: t.title,
            category: t.category,
            isPerson: false,
          });
      return ok({ items: [...seen.values()] });
    }
    if (head === 'export.csv') {
      const rows = live().filter(
        (t) => (!q.from || t.date >= q.from) && (!q.to || t.date <= q.to),
      );
      const text = [
        'Date,Title,Category,Direction,Amount',
        ...rows.map(
          (t) =>
            `${t.date},"${t.title}",${t.category},${t.direction},${(t.amountMinor / 100).toFixed(2)}`,
        ),
      ].join('\n');
      return { status: 200, text, contentType: 'text/csv' };
    }
    return fail(404, `No fake route for ${method} /money/${parts.join('/')}`);
  }

  if (seed) seedDemo();

  function seedDemo() {
    let rand = 7;
    const random = () => {
      rand = (rand * 16807) % 2147483647;
      return rand / 2147483647;
    };
    const bank = {
      id: id('a'),
      name: 'HDFC Savings',
      type: 'savings',
      bank: 'HDFC',
      last4: '4821',
      openingMinor: 4200000,
      ownerName: null,
      followBank: false,
      bankBalanceMinor: null,
      bankBalanceAt: null,
      creditLimitMinor: 0,
      billMinor: 0,
      minDueMinor: 0,
      dueDate: null,
      statementDay: null,
      billPaidAt: null,
      needsConfirm: false,
      archived: false,
    };
    const card = {
      ...bank,
      id: id('a'),
      name: 'ICICI Amazon Pay',
      type: 'credit_card',
      bank: 'ICICI',
      last4: '9007',
      openingMinor: 0,
      followBank: true,
      creditLimitMinor: 20000000,
      billMinor: 4231500,
      minDueMinor: 211600,
      dueDate: addDays(today, 6),
      statementDay: 18,
    };
    const addon = {
      ...card,
      id: id('a'),
      name: 'Rohan’s add-on card',
      bank: 'SBI',
      last4: '1188',
      ownerName: 'Rohan',
      creditLimitMinor: 5000000,
      billMinor: 0,
      minDueMinor: 0,
      dueDate: null,
    };
    const wallet = {
      ...bank,
      id: id('a'),
      name: 'Cash wallet',
      type: 'cash',
      bank: '',
      last4: '',
      openingMinor: 350000,
      followBank: true,
    };
    const found = {
      ...bank,
      id: id('a'),
      name: 'Axis ••3390',
      bank: 'Axis',
      last4: '3390',
      openingMinor: 0,
      needsConfirm: true,
      followBank: true,
    };
    state.accounts.push(bank, card, addon, wallet, found);
    state.accounts[0].bankBalanceMinor = null;

    const food = [
      'Swiggy',
      'Zomato',
      'Chai Point',
      'Third Wave Coffee',
      'Udupi Grand',
    ];
    const shops = ['Amazon', 'Myntra', 'Decathlon', 'IKEA'];
    for (let back = 11; back >= 0; back -= 1) {
      const month = shift(monthOf(today), -back);
      const limitDay = back === 0 ? Number(today.slice(8)) : 28;
      const at = (day) => `${month}-${pad(Math.min(day, limitDay))}`;
      addTxn({
        date: at(1),
        amountMinor: 9500000,
        direction: 'credit',
        title: 'Acme Labs salary',
        category: 'Salary',
        accountId: bank.id,
        channel: 'NetBanking',
        source: 'sms',
      });
      addTxn({
        date: at(3),
        amountMinor: 2200000,
        title: 'House rent',
        category: 'Rent',
        accountId: bank.id,
        channel: 'UPI',
        purpose: 'Rent',
      });
      addTxn({
        date: at(5),
        amountMinor: 64900,
        title: 'Netflix',
        category: 'Entertainment',
        accountId: card.id,
        channel: 'Card',
        source: 'sms',
      });
      addTxn({
        date: at(9),
        amountMinor: 11900,
        title: 'Spotify',
        category: 'Entertainment',
        accountId: card.id,
        channel: 'Card',
        source: 'notification',
      });
      addTxn({
        date: at(12),
        amountMinor: 149900,
        title: 'Cult.fit',
        category: 'Health',
        accountId: card.id,
        channel: 'Card',
      });
      const busy = 14 + Math.floor(random() * 10);
      for (let i = 0; i < busy; i += 1) {
        const day = 1 + Math.floor(random() * 28);
        if (day > limitDay) continue;
        const pick = random();
        if (pick < 0.45)
          addTxn({
            date: at(day),
            amountMinor: Math.round((150 + random() * 650) * 100),
            title: food[Math.floor(random() * food.length)],
            category: 'Food',
            accountId: random() < 0.6 ? card.id : bank.id,
            channel: 'UPI',
            source: random() < 0.7 ? 'sms' : 'notification',
          });
        else if (pick < 0.65)
          addTxn({
            date: at(day),
            amountMinor: Math.round((600 + random() * 2400) * 100),
            title: random() < 0.5 ? 'BigBasket' : 'Zepto',
            category: 'Groceries',
            accountId: bank.id,
            channel: 'UPI',
            source: 'sms',
          });
        else if (pick < 0.78)
          addTxn({
            date: at(day),
            amountMinor: Math.round((1500 + random() * 1500) * 100),
            title: 'HP Petrol',
            category: 'Fuel',
            accountId: card.id,
            channel: 'Card',
            source: 'sms',
            purpose: 'Fuel',
          });
        else if (pick < 0.9)
          addTxn({
            date: at(day),
            amountMinor: Math.round((800 + random() * 4500) * 100),
            title: shops[Math.floor(random() * shops.length)],
            category: 'Shopping',
            accountId: card.id,
            channel: 'Card',
            source: 'sms',
          });
        else
          addTxn({
            date: at(day),
            amountMinor: Math.round((1200 + random() * 2000) * 100),
            title: 'BESCOM electricity',
            category: 'Bills',
            accountId: bank.id,
            channel: 'NetBanking',
          });
      }
    }
    const month = monthOf(today);
    state.budgets.push(
      { id: id('b'), month, category: '*', limitMinor: 6000000 },
      { id: id('b'), month, category: 'Food', limitMinor: 900000 },
    );

    // People and khata
    const lunch = addTxn({
      date: addDays(today, -3),
      amountMinor: 250000,
      title: 'Rahul Verma',
      counterparty: 'Rahul Verma',
      isPerson: true,
      category: 'Other',
      accountId: bank.id,
      source: 'sms',
    });
    setPeer(lunch, { peerTag: 'lent', contactName: 'Rahul Verma' });
    const rahul = findContact('Rahul Verma');
    addEntry({
      contactId: rahul.id,
      direction: 'got',
      amountMinor: 100000,
      date: addDays(today, -1),
      note: 'Sent back part',
    });
    addEntry({
      contactId: rahul.id,
      direction: 'gave',
      amountMinor: 120000,
      date: addDays(today, -400),
      note: 'Goa trip share',
      isOpening: true,
    });
    addEntry({
      contactId: rahul.id,
      direction: 'gave',
      amountMinor: 80000,
      date: addDays(today, -380),
      note: 'Concert tickets',
      isOpening: true,
    });
    const priya = findContact('Priya Nair');
    addEntry({
      contactId: priya.id,
      direction: 'got',
      amountMinor: 150000,
      date: addDays(today, -6),
      note: 'Paid my cab to airport',
      paidForMe: false,
      dueDate: addDays(today, 9),
    });
    const dinner = addTxn({
      date: addDays(today, -2),
      amountMinor: 360000,
      title: 'Barbeque Nation',
      category: 'Food',
      accountId: card.id,
      channel: 'Card',
      source: 'sms',
    });
    setPeer(dinner, {
      peerTag: 'split',
      contactName: 'Ananya',
      splitPeople: 3,
    });
    addTxn({
      date: addDays(today, -1),
      amountMinor: 49900,
      title: 'Karan Mehta',
      counterparty: 'Karan Mehta',
      isPerson: true,
      peerTag: 'left',
      accountId: bank.id,
      source: 'notification',
    });
    const rohan = addTxn({
      date: addDays(today, -4),
      amountMinor: 189900,
      title: 'Croma',
      category: 'Shopping',
      accountId: addon.id,
      channel: 'Card',
      source: 'sms',
    });
    setPeer(rohan, { peerTag: 'owe_owner', contactName: 'Rohan' });

    // Reimbursement claim (work flight) and review items
    const flight = addTxn({
      date: addDays(today, -8),
      amountMinor: 742000,
      title: 'IndiGo',
      category: 'Travel',
      purpose: 'Flight',
      accountId: card.id,
      channel: 'Card',
      source: 'sms',
    });
    flight.reimburseTag = 'claim';
    flight.reimburseMinor = 742000;
    addTxn({
      date: addDays(today, -1),
      amountMinor: 120000,
      title: 'UPI payment',
      counterparty: 'unknown@okaxis',
      accountId: found.id,
      needsReview: true,
      source: 'sms',
    });
    addTxn({
      date: today,
      amountMinor: 34500,
      title: 'PhonePe merchant',
      accountId: bank.id,
      needsReview: true,
      source: 'notification',
    });
    addTxn({
      date: addDays(today, -2),
      amountMinor: 1000000,
      title: 'To ICICI card',
      accountId: bank.id,
      channel: 'NetBanking',
      source: 'sms',
    });
    addTxn({
      date: addDays(today, -2),
      amountMinor: 1000000,
      direction: 'credit',
      title: 'Payment received, thank you',
      accountId: card.id,
      channel: 'NetBanking',
      source: 'sms',
    });
    state.accounts[0].bankBalanceMinor = balanceOf(state.accounts[0]) + 125000;
  }

  return { state, handle, today };
}
