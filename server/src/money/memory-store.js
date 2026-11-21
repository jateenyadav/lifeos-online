/**
 * In-memory Money store with the same contract as the Mongo store (store-mongo.js). Used by the
 * tests and for trying the API without a database. Filters use the Mongo subset:
 * equality (an array field matches when it contains the value), $in, $nin, $ne, $gte, $lte.
 */

const uniqueKeys = {
  txns: (row) =>
    typeof row.sourceKey === 'string' ? `sk:${row.sourceKey}` : null,
  contacts: (row) => `k:${row.key}`,
  budgets: (row) => `b:${row.month}:${row.category}`,
  merchants: (row) => `m:${row.key}`,
};

function test(value, condition) {
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    return Object.entries(condition).every(([operator, operand]) => {
      if (operator === '$in') return operand.some((item) => test(value, item));
      if (operator === '$nin')
        return !operand.some((item) => test(value, item));
      if (operator === '$ne') return !test(value, operand);
      if (operator === '$gte') return value != null && value >= operand;
      if (operator === '$lte') return value != null && value <= operand;
      throw new Error(`Unsupported operator ${operator}`);
    });
  }
  if (Array.isArray(value)) return value.includes(condition);
  return (value ?? null) === (condition ?? null);
}

export const matchesFilter = (row, filter) =>
  Object.entries(filter).every(([field, condition]) =>
    test(row[field], condition),
  );

export function createMemoryMoneyStore() {
  const tables = new Map();
  const migrated = new Map();
  let counter = 0;
  const table = (collection) => {
    if (!tables.has(collection)) tables.set(collection, new Map());
    return tables.get(collection);
  };
  const out = (row, exclude = []) => {
    if (!row) return null;
    const copy = structuredClone(row);
    delete copy.userId;
    for (const field of exclude) delete copy[field];
    return copy;
  };
  const owned = (collection, userId, filter = {}) =>
    [...table(collection).values()].filter(
      (row) => row.userId === String(userId) && matchesFilter(row, filter),
    );
  const checkUnique = (collection, row) => {
    const keyOf = uniqueKeys[collection];
    const key = keyOf?.(row);
    if (!key) return;
    const clash = owned(collection, row.userId).some(
      (other) => other.id !== row.id && keyOf(other) === key,
    );
    if (clash) throw Object.assign(new Error('Duplicate key'), { code: 11000 });
  };
  const clean = (values) =>
    Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    );

  return {
    /** Every row, for tests that inspect raw state. */
    _rows: (collection) =>
      [...table(collection).values()].map((row) => structuredClone(row)),
    async list(collection, userId, filter = {}, { exclude } = {}) {
      return owned(collection, userId, filter).map((row) => out(row, exclude));
    },
    async find(collection, userId, id) {
      const row = table(collection).get(String(id));
      return row && row.userId === String(userId) ? out(row) : null;
    },
    async findOne(collection, userId, filter) {
      return out(owned(collection, userId, filter)[0] ?? null);
    },
    async count(collection, userId, filter = {}) {
      return owned(collection, userId, filter).length;
    },
    async create(collection, userId, values) {
      const now = new Date().toISOString();
      const id = (++counter).toString(16).padStart(24, '0');
      const row = {
        ...structuredClone(clean(values)),
        id,
        userId: String(userId),
        createdAt: now,
        updatedAt: now,
      };
      checkUnique(collection, row);
      table(collection).set(id, row);
      return out(row);
    },
    async update(collection, userId, id, patch) {
      const row = table(collection).get(String(id));
      if (!row || row.userId !== String(userId)) return null;
      const next = {
        ...row,
        ...structuredClone(clean(patch)),
        updatedAt: new Date().toISOString(),
      };
      checkUnique(collection, next);
      table(collection).set(row.id, next);
      return out(next);
    },
    async updateMany(collection, userId, filter, patch) {
      const rows = owned(collection, userId, filter);
      for (const row of rows)
        await this.update(collection, userId, row.id, patch);
      return rows.length;
    },
    async remove(collection, userId, id) {
      const row = table(collection).get(String(id));
      if (!row || row.userId !== String(userId)) return false;
      return table(collection).delete(row.id);
    },
    async removeMany(collection, userId, filter) {
      const rows = owned(collection, userId, filter);
      for (const row of rows) table(collection).delete(row.id);
      return rows.length;
    },
    async migratedAt(userId) {
      return migrated.get(String(userId)) ?? null;
    },
    async markMigrated(userId) {
      migrated.set(String(userId), new Date().toISOString());
    },
  };
}
