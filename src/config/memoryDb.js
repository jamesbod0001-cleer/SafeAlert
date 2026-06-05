// src/config/memoryDb.js
// In-memory store that mirrors Firestore document structure exactly
// Used when Firebase is not configured (local dev, tests)
// Swap getDb() calls transparently — same API surface

const { randomUUID: uuidv4 } = require('crypto');

const store = {
  zones: {},
  reports: {},
  users: {},
  locations: {},
  groups: {},
  estates: {},
  routes: {},
  otps: {},
  sessions: {},
  app_settings: {},
  ussd_reports: {},
  otps: {},
  panic_events: {},
  notify_jobs: {},
  check_ins: {},
  resources: {},
  journey_sessions: {},
  zone_flags: {},
};

// ── Firestore-like interface ──────────────────────────────────────────────────

class MemoryDb {
  collection(name) {
    return new CollectionRef(name);
  }

  batch() {
    return new WriteBatch();
  }
}

class WriteBatch {
  constructor() {
    this.ops = [];
  }

  delete(ref) {
    this.ops.push({ type: 'delete', ref });
    return this;
  }

  async commit() {
    for (const op of this.ops) {
      if (op.type === 'delete') await op.ref.delete();
    }
    return { writeCount: this.ops.length };
  }
}

class CollectionRef {
  constructor(name) {
    this.name = name;
    if (!store[name]) store[name] = {};
  }

  doc(id) {
    return new DocumentRef(this.name, id || uuidv4());
  }

  async add(data) {
    const id = uuidv4();
    const doc = { ...data, id };
    store[this.name][id] = doc;
    return { id };
  }

  where(field, op, value) {
    return new QueryRef(this.name, [{ field, op, value }]);
  }

  limit(n) {
    return new QueryRef(this.name, []).limit(n);
  }

  orderBy(field, dir = 'asc') {
    return new QueryRef(this.name, [], field, dir);
  }

  async get() {
    const docs = Object.values(store[this.name]);
    return {
      docs: docs.map(d => ({ id: d.id, data: () => d, exists: true })),
      empty: docs.length === 0,
      size: docs.length,
    };
  }
}

class DocumentRef {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    const data = store[this.collection][this.id];
    return {
      id: this.id,
      exists: !!data,
      data: () => data,
    };
  }

  async set(data) {
    store[this.collection][this.id] = { ...data, id: this.id };
    return this;
  }

  async update(data) {
    if (store[this.collection][this.id]) {
      store[this.collection][this.id] = {
        ...store[this.collection][this.id],
        ...data,
        updated_at: new Date().toISOString(),
      };
    }
    return this;
  }

  async delete() {
    delete store[this.collection][this.id];
    return this;
  }

  collection(name) {
    const key = `${this.collection}_${this.id}_${name}`;
    return new CollectionRef(key);
  }
}

class QueryRef {
  constructor(collection, filters = [], orderField = null, orderDir = 'asc') {
    this.collection = collection;
    this.filters = filters;
    this.orderField = orderField;
    this.orderDir = orderDir;
    this._limit = null;
  }

  where(field, op, value) {
    return new QueryRef(this.collection, [...this.filters, { field, op, value }], this.orderField, this.orderDir);
  }

  orderBy(field, dir = 'asc') {
    return new QueryRef(this.collection, this.filters, field, dir);
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  async get() {
    let docs = Object.values(store[this.collection] || {});

    // Apply filters
    for (const { field, op, value } of this.filters) {
      docs = docs.filter(d => {
        const v = d[field];
        if (op === '==') return v === value;
        if (op === '!=') return v !== value;
        if (op === '>') return v > value;
        if (op === '>=') return v >= value;
        if (op === '<') return v < value;
        if (op === '<=') return v <= value;
        if (op === 'in') return Array.isArray(value) && value.includes(v);
        if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
        return true;
      });
    }

    // Order
    if (this.orderField) {
      docs.sort((a, b) => {
        const av = a[this.orderField], bv = b[this.orderField];
        return this.orderDir === 'desc' ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
      });
    }

    // Limit
    if (this._limit) docs = docs.slice(0, this._limit);

    return {
      docs: docs.map(d => ({ id: d.id, data: () => d, exists: true })),
      empty: docs.length === 0,
      size: docs.length,
    };
  }
}

// FieldValue equivalents
const FieldValue = {
  increment: (n) => ({ __increment: n }),
  serverTimestamp: () => new Date().toISOString(),
  arrayUnion: (...items) => ({ __arrayUnion: items }),
};

// Apply FieldValue operations when updating
const originalUpdate = DocumentRef.prototype.update;
DocumentRef.prototype.update = async function(data) {
  const current = store[this.collection][this.id] || {};
  const processed = {};
  for (const [key, val] of Object.entries(data)) {
    if (val && val.__increment !== undefined) {
      processed[key] = (current[key] || 0) + val.__increment;
    } else if (val && val.__arrayUnion) {
      processed[key] = [...new Set([...(current[key] || []), ...val.__arrayUnion])];
    } else {
      processed[key] = val;
    }
  }
  store[this.collection][this.id] = {
    ...current,
    ...processed,
    updated_at: new Date().toISOString(),
  };
  return this;
};

const memDb = new MemoryDb();
memDb.FieldValue = FieldValue;
memDb._store = store; // expose for tests

module.exports = { memDb, store };
