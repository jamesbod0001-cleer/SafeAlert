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
  routes: {},
  otps: {},       // temp OTP storage
  sessions: {},   // active JWT sessions
};

// Seed with realistic Nigeria data
function seedData() {
  const now = new Date().toISOString();

  store.zones = {
    'zone-001': {
      id: 'zone-001', lat: 10.5221, lng: 7.4378,
      label: 'Kaduna–Abuja Highway', state: 'Kaduna', lga: 'Igabi',
      type: 'kidnapping', severity: 'critical',
      reports: 18, votes_danger: 15, votes_cleared: 0,
      verified: true, active: true,
      created_at: now, updated_at: now,
      expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      reporter_hash: 'anon_demo001',
    },
    'zone-002': {
      id: 'zone-002', lat: 7.7973, lng: 6.7408,
      label: 'Okene Junction', state: 'Kogi', lga: 'Okene',
      type: 'armed_robbery', severity: 'high',
      reports: 9, votes_danger: 7, votes_cleared: 1,
      verified: true, active: true,
      created_at: now, updated_at: now,
      expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      reporter_hash: 'anon_demo002',
    },
    'zone-003': {
      id: 'zone-003', lat: 11.8464, lng: 13.1603,
      label: 'Maiduguri Road', state: 'Borno', lga: 'Maiduguri',
      type: 'terror', severity: 'critical',
      reports: 22, votes_danger: 20, votes_cleared: 0,
      verified: true, active: true,
      created_at: now, updated_at: now,
      expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      reporter_hash: 'anon_demo003',
    },
    'zone-004': {
      id: 'zone-004', lat: 11.7048, lng: 11.9596,
      label: 'Potiskum–Damaturu Road', state: 'Yobe', lga: 'Potiskum',
      type: 'banditry', severity: 'critical',
      reports: 14, votes_danger: 11, votes_cleared: 0,
      verified: true, active: true,
      created_at: now, updated_at: now,
      expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      reporter_hash: 'anon_demo004',
    },
    'zone-005': {
      id: 'zone-005', lat: 7.8034, lng: 6.7406,
      label: 'Lokoja Bridge Area', state: 'Kogi', lga: 'Lokoja',
      type: 'roadblock', severity: 'medium',
      reports: 5, votes_danger: 3, votes_cleared: 2,
      verified: false, active: true,
      created_at: now, updated_at: now,
      expires_at: new Date(Date.now() + 24*3600*1000).toISOString(),
      reporter_hash: 'anon_demo005',
    },
  };

  store.groups = {
    'grp-001': { id: 'grp-001', name: 'Kaduna Drivers Union', type: 'transport_union', state: 'Kaduna', member_count: 2840, alert_radius_km: 50 },
    'grp-002': { id: 'grp-002', name: 'Abuja Market Women Assoc.', type: 'market', state: 'FCT', member_count: 1205, alert_radius_km: 20 },
    'grp-003': { id: 'grp-003', name: 'Northern Safety Network', type: 'ngo', state: 'All', member_count: 8920, alert_radius_km: 500 },
  };

  store.routes = {
    'route-001': { id: 'route-001', from: 'Lagos', to: 'Abuja', via: 'Ore–Okene–Lokoja', safety_score: 87, travelers_last_2h: 234, last_updated: now },
    'route-002': { id: 'route-002', from: 'Abuja', to: 'Kaduna', via: 'A2 Highway', safety_score: 31, travelers_last_2h: 89, last_updated: now },
    'route-003': { id: 'route-003', from: 'Kano', to: 'Maiduguri', via: 'A3 Highway', safety_score: 18, travelers_last_2h: 12, last_updated: now },
    'route-004': { id: 'route-004', from: 'Benin', to: 'Ore', via: 'E28 Route', safety_score: 74, travelers_last_2h: 156, last_updated: now },
  };
}

seedData();

// ── Firestore-like interface ──────────────────────────────────────────────────

class MemoryDb {
  collection(name) {
    return new CollectionRef(name);
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
