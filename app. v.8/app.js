/* ============================================================================
   YOUSSEF SALES CRM — V8 Enterprise Edition
   app.js · Single-file application layer

   Contents
   ────────
   0.  Boot diagnostics & strict mode
   1.  Constants & default configuration
   2.  Sanitize v2 (encode-on-render, decode-on-migrate)
   3.  Schema Validator (import safety)
   4.  Small utilities (dates, ids, money, initials)
   5.  IndexedDB primitives
   6.  LocalStorage fallback layer
   7.  DB — unified persistence adapter + multi-tab sync
   8.  STATE — single source of truth
   9.  UI: Toast, Modal, Confirm
   10. Router & module registry
   11. Global event delegation
   12. Header KPI + SLA badge sync
   13. Lead CRUD + audit + comments
   14. Modules:
         · Action Center (SLA Command Center)
         · Sales Pipeline
         · Property Inventory
         · CIL Radar
         · Financial Engine
         · AI Voice Simulator
         · Analytics
         · Settings
   15. WhatsApp composer
   16. Import / Export
   17. Migration (Sanitize v1 → v2)
   18. Demo seed
   19. Boot
   ============================================================================ */

'use strict';

/* ============================================================================
   1 · CONSTANTS
   ============================================================================ */

const DB_NAME    = 'YoussefCRM_v8';
const DB_VERSION = 1;

const STORES = Object.freeze({
  LEADS    : 'leads',
  COMMENTS : 'comments',
  AUDIT    : 'audit_log',
  SETTINGS : 'settings',
  INVENTORY: 'inventory',
});

const STAGES = Object.freeze([
  'New Lead', 'Contacted', 'Meeting Scheduled',
  'Proposal Sent', 'Negotiation', 'Won', 'Lost',
]);

const STAGE_CLASS = Object.freeze({
  'New Lead'         : 'stage-new',
  'Contacted'        : 'stage-contacted',
  'Meeting Scheduled': 'stage-meeting',
  'Proposal Sent'    : 'stage-proposal',
  'Negotiation'      : 'stage-negotiation',
  'Won'              : 'stage-won',
  'Lost'             : 'stage-lost',
});

const STAGE_EMOJI = Object.freeze({
  'New Lead'         : '🌱',
  'Contacted'        : '📞',
  'Meeting Scheduled': '📅',
  'Proposal Sent'    : '📄',
  'Negotiation'      : '🤝',
  'Won'              : '🏆',
  'Lost'             : '❌',
});

const STAGE_COLOR = Object.freeze({
  'New Lead'         : '#06b6d4',
  'Contacted'        : '#4f8ef7',
  'Meeting Scheduled': '#a855f7',
  'Proposal Sent'    : '#f59e0b',
  'Negotiation'      : '#f97316',
  'Won'              : '#22c55e',
  'Lost'             : '#ef4444',
});

const PRIORITY_COLOR = Object.freeze({
  low    : '#5a6178',
  medium : '#4f8ef7',
  high   : '#f59e0b',
  urgent : '#ef4444',
});

const PRIORITY_LABEL = Object.freeze({
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
});

const CHANNELS = Object.freeze([
  'Meta Ads', 'WhatsApp', 'Referral', 'Cold Call',
  'Direct', 'Website', 'Email', 'Other',
]);

const DEFAULT_WA_TEMPLATES = Object.freeze({
  'New Lead':
    'Hello {name}! 👋 Thank you for your interest. I\'m {agent} from Youssef Real Estate. I\'d love to tell you more about our available properties. When would be a good time to chat?',
  'Contacted':
    'Hi {name}, following up on our conversation. I have some great properties that match your requirements. Shall we schedule a viewing this week?',
  'Meeting Scheduled':
    'Hi {name}! 📅 Just confirming our meeting. Looking forward to presenting you with the best options for your dream property. See you soon!',
  'Proposal Sent':
    'Hello {name}! 📄 I\'ve sent over the proposal for {project}. Please take a look and let me know if you have any questions. I\'m here to help!',
  'Negotiation':
    'Hi {name}, thank you for your counter-offer. I\'ve spoken with our team and I\'m confident we can find the best deal for you. Let\'s finalize this!',
  'Won':
    '🎉 Congratulations {name}! We\'re thrilled to welcome you to the {project} family. Our team will contact you with next steps. Welcome home!',
  'Lost':
    'Hi {name}, I understand your decision. If you ever reconsider or need real estate assistance in the future, please don\'t hesitate to reach out. All the best!',
});

const DEFAULT_SETTINGS = Object.freeze({
  currentUser   : 'Youssef',
  role          : 'Sales Director',
  agents        : ['Youssef', 'Ahmed', 'Sarah', 'Mohamed'],
  projects      : ['Palm Hills', 'Madinaty', 'New Capital Tower', 'Hyde Park', 'Mountain View'],
  waTemplates   : { ...DEFAULT_WA_TEMPLATES },
  storageEngine : 'indexeddb',
  _sanitizeV    : 2,
});

const VIEW_META = Object.freeze({
  'action-center'      : { title: 'Action Center',        subtitle: 'Real-time SLA monitoring' },
  'sales-pipeline'     : { title: 'Sales Pipeline',       subtitle: 'Kanban view of active deals' },
  'property-inventory' : { title: 'Property Inventory',   subtitle: 'Available units & availability' },
  'cil-radar'          : { title: 'CIL Radar',            subtitle: 'Client intent & lead-scoring radar' },
  'financial-engine'   : { title: 'Financial Engine',     subtitle: 'Commissions, forecasts & revenue' },
  'ai-voice-simulator' : { title: 'AI Voice Simulator',   subtitle: 'Practice calls against synthetic buyers' },
  'analytics'          : { title: 'Analytics',            subtitle: 'Performance insights across the pipeline' },
  'settings'           : { title: 'Settings',             subtitle: 'Preferences, agents & data management' },
});

const SLA_TICK_MS = 1000;

/* ============================================================================
   2 · SANITIZE v2  —  encode-on-render, decode-on-migrate
   ============================================================================ */

const Sanitize = (() => {
  const MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };
  const REGEX = /[&<>"'`=/]/g;

  function encode(value) {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : String(value);
    return str.replace(REGEX, (c) => MAP[c]);
  }

  function stripTags(value) {
    if (value === null || value === undefined) return '';
    const str = typeof value === 'string' ? value : String(value);
    return str.replace(/<[^>]*>/g, '');
  }

  // Legacy alias kept for compatibility with older call-sites.
  function text(value) {
    return encode(stripTags(value));
  }

  // Safe "decode" via inert DOMParser. Only used during migrations.
  function decode(value) {
    if (typeof value !== 'string' || value.length === 0) return value || '';
    try {
      const doc = new DOMParser().parseFromString(value, 'text/html');
      return doc.documentElement.textContent || '';
    } catch (_) {
      return value;
    }
  }

  function number(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function url(value) {
    try {
      const u = new URL(value);
      if (['https:', 'http:', 'tel:', 'mailto:', 'whatsapp:'].includes(u.protocol)) {
        return u.href;
      }
    } catch (_) { /* noop */ }
    return '#';
  }

  return { encode, stripTags, text, decode, number, url };
})();

// Short aliases used throughout the app
const esc  = (v) => Sanitize.encode(v);
const escU = (v) => encodeURIComponent(String(v ?? ''));

/* ============================================================================
   3 · SCHEMA VALIDATOR
   ============================================================================ */

const SchemaValidator = (() => {
  const LEAD_REQUIRED = ['id', 'name', 'stage', 'createdAt'];
  const STAGE_SET = new Set(STAGES);
  const MAX_LEADS = 50000;

  function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  function validateLead(lead, idx) {
    if (!isPlainObject(lead)) return `Lead[${idx}] must be an object`;
    for (const field of LEAD_REQUIRED) {
      if (!(field in lead)) return `Lead[${idx}] missing field "${field}"`;
    }
    if (typeof lead.id !== 'string' || !lead.id.trim()) return `Lead[${idx}] id must be a non-empty string`;
    if (typeof lead.name !== 'string' || !lead.name.trim()) return `Lead[${idx}] name must be a non-empty string`;
    if (!STAGE_SET.has(lead.stage)) return `Lead[${idx}] has invalid stage "${lead.stage}"`;
    if (Number.isNaN(Date.parse(lead.createdAt))) return `Lead[${idx}] has invalid createdAt`;
    return null;
  }

  function validateCommentsMap(map) {
    if (!isPlainObject(map)) return 'comments must be a plain object';
    for (const [leadId, arr] of Object.entries(map)) {
      if (!Array.isArray(arr)) return `comments["${leadId}"] must be an array`;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (!isPlainObject(c)) return `comments["${leadId}"][${i}] must be an object`;
        if (!c.id || !c.author || !c.timestamp) {
          return `comments["${leadId}"][${i}] missing id/author/timestamp`;
        }
      }
    }
    return null;
  }

  function validateAuditMap(map) {
    if (!isPlainObject(map)) return 'auditLogs must be a plain object';
    for (const [leadId, arr] of Object.entries(map)) {
      if (!Array.isArray(arr)) return `auditLogs["${leadId}"] must be an array`;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!isPlainObject(e)) return `auditLogs["${leadId}"][${i}] must be an object`;
        if (!e.id || !e.action || !e.timestamp) {
          return `auditLogs["${leadId}"][${i}] missing id/action/timestamp`;
        }
      }
    }
    return null;
  }

  function validateSettings(settings) {
    if (!isPlainObject(settings)) return 'settings must be an object';
    if (!Array.isArray(settings.agents)) return 'settings.agents must be an array';
    if (!Array.isArray(settings.projects)) return 'settings.projects must be an array';
    return null;
  }

  function validate(payload) {
    const errors = [];
    if (!isPlainObject(payload)) {
      return { valid: false, errors: ['Root must be a JSON object'] };
    }
    if (!payload.version) errors.push('Missing "version" at root');
    if (!payload.exportedAt) errors.push('Missing "exportedAt" at root');

    if (!Array.isArray(payload.leads)) {
      errors.push('"leads" must be an array');
    } else if (payload.leads.length > MAX_LEADS) {
      errors.push(`"leads" exceeds limit (${payload.leads.length} > ${MAX_LEADS})`);
    } else {
      const seen = new Set();
      payload.leads.forEach((lead, idx) => {
        const err = validateLead(lead, idx);
        if (err) errors.push(err);
        if (lead && typeof lead.id === 'string') {
          if (seen.has(lead.id)) errors.push(`Duplicate lead id "${lead.id}"`);
          seen.add(lead.id);
        }
      });
    }

    if (payload.comments !== undefined) {
      const err = validateCommentsMap(payload.comments);
      if (err) errors.push(err);
    }

    if (payload.auditLogs !== undefined) {
      const err = validateAuditMap(payload.auditLogs);
      if (err) errors.push(err);
    }

    if (payload.settings !== undefined) {
      const err = validateSettings(payload.settings);
      if (err) errors.push(err);
    }

    return { valid: errors.length === 0, errors };
  }

  return { validate };
})();

/* ============================================================================
   4 · UTILITIES
   ============================================================================ */

function generateId() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `crm_${t}_${r}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch (_) { return '—'; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch (_) { return '—'; }
}

function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hrs   < 24) return `${hrs}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return formatDate(iso);
}

function formatMoney(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function initialsOf(name) {
  if (!name) return '?';
  return String(name).trim().split(/\s+/).slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase()).join('') || '?';
}

function dueMsOf(lead) {
  if (!lead || !lead.followUpDate) return null;
  const time = lead.followUpTime || '09:00';
  const ms = new Date(`${lead.followUpDate}T${time}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function slaStatusOf(lead) {
  const due = dueMsOf(lead);
  if (due === null) return 'no-followup';
  const diff = due - Date.now();
  const slaMs = (Number(lead.slaHours) || 24) * 3600000;
  if (diff < 0) return 'overdue';
  if (diff <= slaMs) return 'due-soon';
  return 'on-track';
}

function countdownOf(lead) {
  const due = dueMsOf(lead);
  if (due === null) return null;
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  return {
    diffMs : diff,
    overdue: diff < 0,
    days   : Math.floor(abs / 86400000),
    hours  : Math.floor((abs % 86400000) / 3600000),
    mins   : Math.floor((abs % 3600000) / 60000),
    secs   : Math.floor((abs % 60000) / 1000),
  };
}

function slaBandOf(lead) {
  const due = dueMsOf(lead);
  if (due === null) return 'none';
  const diff = due - Date.now();
  if (diff < 0)                    return 'breached';
  if (diff <= 60 * 60 * 1000)      return 'critical';
  if (diff <= 4 * 60 * 60 * 1000)  return 'warning';
  return 'ontrack';
}

function calcLeadScore(lead) {
  if (!lead) return 0;
  const stageScore = {
    'New Lead': 10, 'Contacted': 25, 'Meeting Scheduled': 45,
    'Proposal Sent': 60, 'Negotiation': 80, 'Won': 100, 'Lost': 0,
  }[lead.stage] || 0;
  let s = stageScore;
  if (Number(lead.budget) > 0) s += 10;
  if (lead.phone)              s += 5;
  if (lead.email)              s += 5;
  if (lead.project)            s += 5;
  const comments = (STATE.comments[lead.id] || []).length;
  s += Math.min(comments * 2, 10);
  const sla = slaStatusOf(lead);
  if (sla === 'on-track') s += 5;
  if (sla === 'overdue')  s -= 10;
  return Math.max(0, Math.min(100, s));
}

function debounce(fn, wait) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function safeRun(label, fn) {
  try { return fn(); }
  catch (err) {
    console.error(`[CRM] ${label} failed:`, err);
    return null;
  }
}

/* ============================================================================
   5 · INDEXEDDB PRIMITIVES
   ============================================================================ */

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.LEADS)) {
        const s = db.createObjectStore(STORES.LEADS, { keyPath: 'id' });
        s.createIndex('stage',     'stage',     { unique: false });
        s.createIndex('agent',     'agent',     { unique: false });
        s.createIndex('channel',   'channel',   { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.COMMENTS)) {
        const s = db.createObjectStore(STORES.COMMENTS, { keyPath: 'id' });
        s.createIndex('leadId',    'leadId',    { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.AUDIT)) {
        const s = db.createObjectStore(STORES.AUDIT, { keyPath: 'id' });
        s.createIndex('leadId',    'leadId',    { unique: false });
        s.createIndex('agent',     'agent',     { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.INVENTORY)) {
        const s = db.createObjectStore(STORES.INVENTORY, { keyPath: 'id' });
        s.createIndex('project', 'project', { unique: false });
        s.createIndex('status',  'status',  { unique: false });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
    req.onblocked = ()  => reject(new Error('IndexedDB blocked by another tab'));
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(store, record) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbClear(store) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbGetByIndex(store, index, value) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readonly');
    const req = tx.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

/* ============================================================================
   6 · LOCALSTORAGE FALLBACK
   ============================================================================ */

const LSFallback = (() => {
  const PREFIX = 'ycrm8_';
  const keyOf = (name) => `${PREFIX}${name}`;

  function save(name, data) {
    try {
      localStorage.setItem(keyOf(name), JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('[CRM] LocalStorage write failed:', err);
      return false;
    }
  }

  function load(name, fallback = null) {
    try {
      const raw = localStorage.getItem(keyOf(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function remove(name) {
    try { localStorage.removeItem(keyOf(name)); } catch (_) { /* noop */ }
  }

  function clear() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* noop */ }
  }

  return { save, load, remove, clear };
})();

/* ============================================================================
   7 · DB ADAPTER (persistence + multi-tab sync)
   ============================================================================ */

const SELF_TAB_ID = generateId();
const SYNC_KEY = 'ycrm8_sync';

const DB = {
  async saveLead(lead) {
    if (STATE.useIDB) {
      await idbPut(STORES.LEADS, lead);
    } else {
      LSFallback.save('leads', STATE.leads);
    }
    DB._broadcast('lead_changed', lead.id);
  },

  async deleteLead(leadId) {
    if (STATE.useIDB) {
      await idbDelete(STORES.LEADS, leadId);
      const comments = await idbGetByIndex(STORES.COMMENTS, 'leadId', leadId);
      const audit    = await idbGetByIndex(STORES.AUDIT, 'leadId', leadId);
      for (const c of comments) await idbDelete(STORES.COMMENTS, c.id);
      for (const a of audit)    await idbDelete(STORES.AUDIT, a.id);
    } else {
      LSFallback.save('leads',    STATE.leads);
      LSFallback.save('comments', STATE.comments);
      LSFallback.save('audit',    STATE.auditLogs);
    }
    DB._broadcast('lead_deleted', leadId);
  },

  async saveComment(comment) {
    if (STATE.useIDB) {
      await idbPut(STORES.COMMENTS, comment);
    } else {
      LSFallback.save('comments', STATE.comments);
    }
    DB._broadcast('comment_added', comment.leadId);
  },

  async saveAudit(entry) {
    if (STATE.useIDB) {
      await idbPut(STORES.AUDIT, entry);
    } else {
      LSFallback.save('audit', STATE.auditLogs);
    }
  },

  async saveSettings() {
    if (STATE.useIDB) {
      await idbPut(STORES.SETTINGS, { key: 'main', ...STATE.settings });
    } else {
      LSFallback.save('settings', STATE.settings);
    }
    DB._broadcast('settings_changed', null);
  },

  async loadAll() {
    if (STATE.useIDB) {
      const [leads, comments, audit, settingsArr, inventory] = await Promise.all([
        idbGetAll(STORES.LEADS),
        idbGetAll(STORES.COMMENTS),
        idbGetAll(STORES.AUDIT),
        idbGetAll(STORES.SETTINGS),
        idbGetAll(STORES.INVENTORY),
      ]);

      STATE.leads = (leads || []).sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      STATE.comments = {};
      for (const c of comments || []) {
        if (!STATE.comments[c.leadId]) STATE.comments[c.leadId] = [];
        STATE.comments[c.leadId].push(c);
      }
      for (const arr of Object.values(STATE.comments)) {
        arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      STATE.auditLogs = {};
      for (const e of audit || []) {
        if (!STATE.auditLogs[e.leadId]) STATE.auditLogs[e.leadId] = [];
        STATE.auditLogs[e.leadId].push(e);
      }
      for (const arr of Object.values(STATE.auditLogs)) {
        arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      const settingsRow = (settingsArr || []).find((s) => s.key === 'main');
      if (settingsRow) {
        const { key, ...rest } = settingsRow;
        STATE.settings = { ...DEFAULT_SETTINGS, ...rest };
      }

      STATE.inventory = inventory || [];
    } else {
      STATE.leads     = LSFallback.load('leads', []);
      STATE.comments  = LSFallback.load('comments', {});
      STATE.auditLogs = LSFallback.load('audit', {});
      const saved = LSFallback.load('settings', null);
      if (saved) STATE.settings = { ...DEFAULT_SETTINGS, ...saved };
      STATE.inventory = LSFallback.load('inventory', []);
    }
  },

  async clearAll() {
    if (STATE.useIDB) {
      await Promise.all([
        idbClear(STORES.LEADS),
        idbClear(STORES.COMMENTS),
        idbClear(STORES.AUDIT),
        idbClear(STORES.INVENTORY),
      ]);
    } else {
      LSFallback.clear();
    }
    STATE.leads     = [];
    STATE.comments  = {};
    STATE.auditLogs = {};
    STATE.inventory = [];
    DB._broadcast('data_cleared', null);
  },

  async bulkImport(payload) {
    if (STATE.useIDB) {
      await Promise.all([
        idbClear(STORES.LEADS),
        idbClear(STORES.COMMENTS),
        idbClear(STORES.AUDIT),
      ]);

      const leadTx = STATE.db.transaction(STORES.LEADS, 'readwrite');
      const leadStore = leadTx.objectStore(STORES.LEADS);
      for (const lead of payload.leads || []) leadStore.put(lead);
      await new Promise((res, rej) => {
        leadTx.oncomplete = res;
        leadTx.onerror = () => rej(leadTx.error);
      });

      if (payload.comments) {
        const cTx = STATE.db.transaction(STORES.COMMENTS, 'readwrite');
        const cStore = cTx.objectStore(STORES.COMMENTS);
        for (const arr of Object.values(payload.comments)) {
          for (const c of arr) cStore.put(c);
        }
        await new Promise((res, rej) => {
          cTx.oncomplete = res;
          cTx.onerror = () => rej(cTx.error);
        });
      }

      if (payload.auditLogs) {
        const aTx = STATE.db.transaction(STORES.AUDIT, 'readwrite');
        const aStore = aTx.objectStore(STORES.AUDIT);
        for (const arr of Object.values(payload.auditLogs)) {
          for (const e of arr) aStore.put(e);
        }
        await new Promise((res, rej) => {
          aTx.oncomplete = res;
          aTx.onerror = () => rej(aTx.error);
        });
      }

      if (payload.settings) {
        await idbPut(STORES.SETTINGS, { key: 'main', ...payload.settings });
      }
    } else {
      LSFallback.save('leads',    payload.leads || []);
      LSFallback.save('comments', payload.comments || {});
      LSFallback.save('audit',    payload.auditLogs || {});
      if (payload.settings) LSFallback.save('settings', payload.settings);
    }

    await DB.loadAll();
    DB._broadcast('bulk_import', null);
  },

  _broadcast(event, payload) {
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify({
        event, payload, tabId: SELF_TAB_ID, ts: Date.now(),
      }));
    } catch (_) { /* noop */ }
  },
};

/* ============================================================================
   8 · STATE
   ============================================================================ */

const STATE = {
  db           : null,
  useIDB       : false,
  leads        : [],
  comments     : {},
  auditLogs    : {},
  inventory    : [],
  settings     : { ...DEFAULT_SETTINGS },
  activeView   : 'action-center',
  activeLeadId : null,
  slaTickTimer : null,
  acTickTimer  : null,
  syncTimer    : null,
  importBuffer : null,
  booted       : false,
};

/* ============================================================================
   9 · UI PRIMITIVES  —  Toast, Modal, Confirm
   ============================================================================ */

const Toast = (() => {
  const ICONS = {
    success: 'fa-circle-check',
    error  : 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info   : 'fa-circle-info',
  };

  function host() {
    return document.getElementById('toast-host');
  }

  function show(message, type = 'info', duration = 4000) {
    const container = host();
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');

    const icon = document.createElement('i');
    icon.className = `fa-solid ${ICONS[type] || ICONS.info}`;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = String(message || '');

    el.appendChild(icon);
    el.appendChild(text);
    container.appendChild(el);

    setTimeout(() => {
      el.style.transition = 'opacity .3s ease, transform .3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(16px)';
      setTimeout(() => el.remove(), 320);
    }, duration);
  }

  return { show };
})();

const showToast = Toast.show;

const Modal = (() => {
  const STACK = [];

  function open(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('is-open');
    if (!STACK.includes(id)) STACK.push(id);
    document.body.style.overflow = 'hidden';
  }

  function close(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-open');
    const i = STACK.indexOf(id);
    if (i > -1) STACK.splice(i, 1);
    if (STACK.length === 0) document.body.style.overflow = '';
  }

  function closeTop() {
    const id = STACK[STACK.length - 1];
    if (id) close(id);
  }

  function isOpen(id) {
    const el = document.getElementById(id);
    return el ? el.classList.contains('is-open') : false;
  }

  return { open, close, closeTop, isOpen };
})();

const Confirm = (() => {
  let resolver = null;
  let currentOptions = null;

  function dialog() { return document.getElementById('modal-confirm'); }
  function iconEl() { return document.getElementById('confirm-icon'); }
  function titleEl() { return document.getElementById('modal-confirm-title'); }
  function msgEl() { return document.getElementById('confirm-message'); }
  function okEl() { return document.getElementById('confirm-ok'); }
  function cancelEl() { return document.getElementById('confirm-cancel'); }

  function ask(options = {}) {
    currentOptions = {
      icon: '⚠️',
      title: 'Are you sure?',
      message: 'This action cannot be undone.',
      okText: 'Confirm',
      cancelText: 'Cancel',
      danger: true,
      ...options,
    };

    iconEl().textContent = currentOptions.icon;
    titleEl().textContent = currentOptions.title;
    msgEl().textContent = currentOptions.message;
    okEl().textContent = currentOptions.okText;
    cancelEl().textContent = currentOptions.cancelText;

    okEl().className = currentOptions.danger
      ? 'h-9 px-5 rounded-lg text-[13px] font-semibold text-white bg-danger border border-danger/50 hover:brightness-110 transition-all'
      : 'h-9 px-5 rounded-lg text-[13px] font-semibold text-white border border-accent/40 transition-all hover:brightness-110 active:scale-[.98]';

    if (!currentOptions.danger) {
      okEl().style.background = 'linear-gradient(135deg,#6d8cff,#5b7cff)';
    } else {
      okEl().style.background = '';
    }

    Modal.open('modal-confirm');

    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function resolveWith(value) {
    if (resolver) {
      const fn = resolver;
      resolver = null;
      Modal.close('modal-confirm');
      fn(value);
    }
    currentOptions = null;
  }

  function bind() {
    okEl().addEventListener('click', () => resolveWith(true));
    cancelEl().addEventListener('click', () => resolveWith(false));
    dialog().addEventListener('click', (e) => {
      if (e.target === dialog()) resolveWith(false);
    });
  }

  return { ask, bind };
})();

/* ============================================================================
   10 · ROUTER  &  MODULE REGISTRY
   ============================================================================ */

const ROUTES = {
  'action-center'      : () => Modules.ActionCenter.render(),
  'sales-pipeline'     : () => Modules.Pipeline.render(),
  'property-inventory' : () => Modules.Inventory.render(),
  'cil-radar'          : () => Modules.CILRadar.render(),
  'financial-engine'   : () => Modules.FinancialEngine.render(),
  'ai-voice-simulator' : () => Modules.VoiceSimulator.render(),
  'analytics'          : () => Modules.Analytics.render(),
  'settings'           : () => Modules.Settings.render(),
};

const Router = {
  current: null,

  navigate(view, options = {}) {
    if (!ROUTES[view]) view = 'action-center';

    const content = document.getElementById('main-content-view');
    if (!content) return;

    // Tear down current module (if it exposes teardown)
    if (this.current && Modules[this.current]?.teardown) {
      safeRun(`teardown ${this.current}`, () => Modules[this.current].teardown());
    }

    // Clear + reset scroll
    content.setAttribute('aria-busy', 'true');
    content.innerHTML = '';
    content.scrollTop = 0;

    // Update nav state
    document.querySelectorAll('[data-view]').forEach((el) => {
      const matches = el.dataset.view === view;
      el.classList.toggle('is-active', matches);
      if (matches) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    // Update header title
    const meta = VIEW_META[view] || { title: 'CRM', subtitle: '' };
    const titleEl = document.getElementById('view-title');
    const subEl = document.getElementById('view-subtitle');
    if (titleEl) titleEl.textContent = meta.title;
    if (subEl)   subEl.textContent = meta.subtitle;

    // Mount the new module
    try {
      ROUTES[view](options);
    } catch (err) {
      console.error(`[CRM] Route "${view}" failed:`, err);
      content.innerHTML = `
        <div class="view-container">
          <div class="surface-card p-8 text-center">
            <div class="text-3xl mb-3">💥</div>
            <h3 class="text-txt-primary text-[15px] font-semibold mb-1">Something went wrong</h3>
            <p class="text-txt-secondary text-[13px]">${esc(err.message)}</p>
          </div>
        </div>`;
    }

    STATE.activeView = view;
    this.current = view;
    content.setAttribute('aria-busy', 'false');

    // Persist last view
    try { localStorage.setItem('ycrm8_last_view', view); } catch (_) {}
  },

  refresh() {
    if (this.current) this.navigate(this.current);
  },
};

/* ============================================================================
   11 · GLOBAL EVENT DELEGATION
   ============================================================================ */

function installGlobalDelegation() {

  // ——— CLICKS ————————————————————————————————————————————————
  document.addEventListener('click', (e) => {

    // 1. Nav: [data-view]
    const navEl = e.target.closest('[data-view]');
    if (navEl && !navEl.closest('[data-modal-body]')) {
      e.preventDefault();
      Router.navigate(navEl.dataset.view);
      return;
    }

    // 2. Modal close: [data-modal-close]
    const closeEl = e.target.closest('[data-modal-close]');
    if (closeEl) {
      e.preventDefault();
      Modal.close(closeEl.dataset.modalClose);
      return;
    }

    // 3. Overlay click closes its modal
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('is-open')) {
      Modal.close(e.target.id);
      return;
    }

    // 4. Module actions: [data-action]
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const handled = dispatchAction(actionEl, e);
      if (handled) e.preventDefault();
      return;
    }
  });

  // ——— KEYBOARD ———————————————————————————————————————————————
  document.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''));

    // ESC → close top modal
    if (e.key === 'Escape') {
      Modal.closeTop();
      return;
    }

    const cmd = e.metaKey || e.ctrlKey;

    // ⌘K → focus search
    if (cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const search = document.getElementById('global-search');
      if (search) search.focus();
      return;
    }

    // ⌘N → new lead
    if (cmd && e.key.toLowerCase() === 'n' && !inField) {
      e.preventDefault();
      openLeadForm();
      return;
    }

    // ⌘1 / ⌘2 → jump to specific views
    if (cmd && e.key === '1') { e.preventDefault(); Router.navigate('sales-pipeline'); return; }
    if (cmd && e.key === '2') { e.preventDefault(); Router.navigate('cil-radar');      return; }
    if (cmd && e.key === ',') { e.preventDefault(); Router.navigate('settings');       return; }
  });

  // ——— MULTI-TAB SYNC ————————————————————————————————————————
  window.addEventListener('storage', async (e) => {
    if (e.key !== SYNC_KEY) return;
    try {
      const msg = JSON.parse(e.newValue);
      if (!msg || msg.tabId === SELF_TAB_ID) return;

      setSyncStatus('syncing');
      await DB.loadAll();

      // Re-render current view (only if booted)
      if (STATE.booted) Router.refresh();
      updateHeaderKPIs();

      setTimeout(() => setSyncStatus('live'), 900);
    } catch (_) { /* noop */ }
  });

  // ——— GLOBAL SEARCH ——————————————————————————————————————————
  const search = document.getElementById('global-search');
  if (search) {
    const handler = debounce(() => {
      // Search only takes effect inside Leads/SLA views; pass via module bus.
      Modules.ActionCenter.setFilter?.({ search: search.value.trim() });
      Modules.Pipeline.setFilter?.({ search: search.value.trim() });
    }, 220);
    search.addEventListener('input', handler);
  }
}

function dispatchAction(el, event) {
  const action = el.dataset.action;
  const handlers = {
    // Lead actions
    'open-lead'         : () => openLeadForm(el.dataset.leadId),
    'open-action-center': () => openActionCenterModal(el.dataset.leadId),
    'delete-lead'       : () => deleteLead(el.dataset.leadId),
    'wa-open'           : () => openWhatsAppComposer(el.dataset.leadId),
    'change-stage'      : () => changeLeadStage(el.dataset.leadId, el.dataset.stage),
    'toggle-ac-tab'     : () => Modules.ActionCenter.switchModalTab(el.dataset.tab),

    // Module: SLA Command Center
    'sla-filter'        : () => Modules.ActionCenter.setFilter({ band: el.dataset.band || 'all' }),
    'sla-refresh'       : () => Modules.ActionCenter.refresh(),
    'sla-add-note'      : () => Modules.ActionCenter.promptQuickNote(el.dataset.leadId),
    'sla-snooze'        : () => Modules.ActionCenter.promptSnooze(el.dataset.leadId),

    // Modal: Action Center comments / audit
    'ac-add-comment'    : () => addCommentFromModal(),
    'ac-save-followup'  : () => saveFollowUpFromModal(),
    'ac-delete'         : () => { if (STATE.activeLeadId) deleteLead(STATE.activeLeadId); },

    // Modals
    'modal-open'        : () => Modal.open(el.dataset.modalId),
    'import-confirm'    : () => confirmImport(),
    'wa-send'           : () => sendWhatsApp(),

    // Settings
    'settings-export'   : () => exportData(),
    'settings-import'   : () => openImportModal(),
    'settings-clear'    : () => clearAllData(),
    'settings-save-user': () => saveCurrentUser(),
    'settings-add-agent': () => addAgent(),
    'settings-add-project': () => addProject(),
    'settings-save-wa'  : () => saveWATemplates(),
    'settings-remove-agent': () => removeAgent(el.dataset.agent),
    'settings-remove-project': () => removeProject(el.dataset.project),

    // Import dropzone
    'import-zone'       : () => {
      const input = document.getElementById('import-file-input');
      if (input) input.click();
    },
    'import-file'       : () => { /* handled by change listener */ },
  };

  const fn = handlers[action];
  if (!fn) return false;
  safeRun(`action "${action}"`, fn);
  return true;
}

/* ============================================================================
   12 · HEADER KPI + SLA BADGE
   ============================================================================ */

function updateHeaderKPIs() {
  const leads = STATE.leads || [];

  const active = leads.filter((l) => l.stage !== 'Won' && l.stage !== 'Lost');
  const pipelineValue = active.reduce((s, l) => s + (Number(l.budget) || 0), 0);

  const overdue = leads.filter((l) => slaStatusOf(l) === 'overdue').length;

  const won = leads.filter((l) => l.stage === 'Won').length;
  const closed = leads.filter((l) => l.stage === 'Won' || l.stage === 'Lost').length;
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;

  setText('hdr-kpi-pipeline', formatMoney(pipelineValue));
  setText('hdr-kpi-overdue',  String(overdue));
  setText('hdr-kpi-winrate',  `${winRate}%`);

  // SLA nav badge
  const badge = document.querySelector('[data-badge="sla-critical"]');
  if (badge) {
    const critical = leads.filter((l) => {
      const band = slaBandOf(l);
      return band === 'critical' || band === 'breached';
    }).length;
    badge.textContent = String(critical);
    badge.style.display = critical > 0 ? '' : 'none';
  }

  // Notification dot
  const dot = document.getElementById('notification-dot');
  if (dot) {
    dot.classList.toggle('is-hidden', overdue === 0);
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot || !label) return;

  dot.classList.remove('animate-ringPulse');
  if (status === 'syncing') {
    dot.style.background = '#ffb648';
    label.textContent = 'Syncing…';
    dot.classList.add('animate-pulseSoft');
  } else if (status === 'error') {
    dot.style.background = '#ff5d5d';
    label.textContent = 'Error';
  } else {
    dot.style.background = '#4ade80';
    label.textContent = 'Live';
    dot.classList.add('animate-ringPulse');
  }
}

/* ============================================================================
   13 · LEAD CRUD + AUDIT + COMMENTS
   ============================================================================ */

function findLead(id) {
  return STATE.leads.find((l) => l.id === id) || null;
}

function createAuditEntry(leadId, action, meta = {}) {
  const entry = {
    id       : generateId(),
    leadId,
    action   : String(action || 'action'),           // stored RAW
    agent    : STATE.settings.currentUser || 'System',
    timestamp: new Date().toISOString(),
    meta,
  };
  if (!STATE.auditLogs[leadId]) STATE.auditLogs[leadId] = [];
  STATE.auditLogs[leadId].unshift(entry);
  DB.saveAudit(entry);
  return entry;
}

const AUDIT_ICONS = {
  lead_created   : '🌱',
  lead_edited    : '✏️',
  lead_deleted   : '🗑',
  stage_change   : '🔄',
  comment_added  : '💬',
  followup_set   : '📅',
  whatsapp_sent  : '📱',
  note_added     : '📝',
  snooze         : '💤',
  default        : '📋',
};

function auditIcon(action) {
  return AUDIT_ICONS[action] || AUDIT_ICONS.default;
}

function buildAuditLine(entry) {
  const who = `<strong>${esc(entry.agent || 'System')}</strong>`;
  const meta = entry.meta || {};
  switch (entry.action) {
    case 'lead_created':
      return `${who} created this lead as <strong>${esc(meta.stage || 'New Lead')}</strong>`;
    case 'stage_change':
      return `${who} moved stage from <strong>${esc(meta.from || '—')}</strong> → <strong>${esc(meta.to || '—')}</strong>`;
    case 'comment_added':
      return `${who} added a note`;
    case 'note_added':
      return `${who} added a quick note`;
    case 'followup_set':
      return `${who} scheduled follow-up for <strong>${esc(meta.datetime || '—')}</strong>`;
    case 'whatsapp_sent':
      return `${who} sent a WhatsApp message`;
    case 'lead_edited':
      return `${who} updated the lead details`;
    case 'snooze':
      return `${who} snoozed the follow-up`;
    case 'lead_deleted':
      return `${who} deleted the lead`;
    default:
      return `${who} performed ${esc(entry.action)}`;
  }
}

async function saveLeadFromForm() {
  const id        = document.getElementById('lf-id')?.value || '';
  const rawName   = (document.getElementById('lf-name')?.value || '').trim();

  if (!rawName) {
    showToast('Lead name is required', 'warning');
    return;
  }

  const now = new Date().toISOString();
  const followUpDate = document.getElementById('lf-followup-date')?.value || '';
  const followUpTime = document.getElementById('lf-followup-time')?.value || '';

  const existing = id ? findLead(id) : null;

  const lead = {
    id: existing ? existing.id : generateId(),
    name         : rawName,                                     // RAW
    phone        : (document.getElementById('lf-phone')?.value || '').trim(),
    email        : (document.getElementById('lf-email')?.value || '').trim(),
    stage        : document.getElementById('lf-stage')?.value || 'New Lead',
    agent        : document.getElementById('lf-agent')?.value || '',
    channel      : document.getElementById('lf-channel')?.value || 'Direct',
    project      : document.getElementById('lf-project')?.value || '',
    budget       : Sanitize.number(document.getElementById('lf-budget')?.value, 0),
    location     : (document.getElementById('lf-location')?.value || '').trim(),
    priority     : document.getElementById('lf-priority')?.value || 'medium',
    requirements : (document.getElementById('lf-requirements')?.value || '').trim(),
    followUpDate,
    followUpTime,
    followUpNote : (document.getElementById('lf-followup-note')?.value || '').trim(),
    slaHours     : Sanitize.number(document.getElementById('lf-sla-hours')?.value, 24),
    createdAt    : existing ? existing.createdAt : now,
    updatedAt    : now,
  };

  if (existing) {
    const idx = STATE.leads.findIndex((l) => l.id === existing.id);
    if (idx > -1) STATE.leads[idx] = lead;
    await DB.saveLead(lead);

    if (existing.stage !== lead.stage) {
      createAuditEntry(lead.id, 'stage_change', { from: existing.stage, to: lead.stage });
    }
    createAuditEntry(lead.id, 'lead_edited', { name: lead.name });

    showToast(`Lead "${lead.name}" updated`, 'success');
  } else {
    STATE.leads.unshift(lead);
    await DB.saveLead(lead);
    createAuditEntry(lead.id, 'lead_created', { name: lead.name, stage: lead.stage });

    const initialNote = (document.getElementById('lf-note')?.value || '').trim();
    if (initialNote) {
      const comment = {
        id: generateId(),
        leadId: lead.id,
        text: initialNote,                                       // RAW
        author: STATE.settings.currentUser || 'System',
        timestamp: now,
      };
      if (!STATE.comments[lead.id]) STATE.comments[lead.id] = [];
      STATE.comments[lead.id].unshift(comment);
      await DB.saveComment(comment);
      createAuditEntry(lead.id, 'comment_added', {});
    }

    showToast(`Lead "${lead.name}" added`, 'success');
  }

  Modal.close('modal-lead-form');
  Router.refresh();
  updateHeaderKPIs();
}

function openLeadForm(leadId = '') {
  const body = document.querySelector('[data-modal-body="lead-form"]');
  if (!body) return;

  const lead = leadId ? findLead(leadId) : null;
  const titleEl = document.getElementById('modal-lead-form-title');
  if (titleEl) titleEl.textContent = lead ? `Edit — ${lead.name}` : 'New Lead';

  const agents   = STATE.settings.agents || [];
  const projects = STATE.settings.projects || [];

  const defaultDate = lead?.followUpDate || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  body.innerHTML = `
    <form id="lead-form" class="grid grid-cols-1 md:grid-cols-2 gap-4" autocomplete="off">
      <input type="hidden" id="lf-id" value="${esc(lead?.id || '')}" />

      <div class="md:col-span-2">
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">
          Full Name <span class="text-danger">*</span>
        </label>
        <input id="lf-name" type="text" required
               value="${esc(lead?.name || '')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
               placeholder="e.g. Ahmed Hassan" />
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Phone</label>
        <input id="lf-phone" type="text" value="${esc(lead?.phone || '')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none"
               placeholder="+20 1xx xxx xxxx" />
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Email</label>
        <input id="lf-email" type="email" value="${esc(lead?.email || '')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none"
               placeholder="email@example.com" />
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Stage</label>
        <select id="lf-stage"
                class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none">
          ${STAGES.map((s) => `<option value="${esc(s)}" ${lead?.stage === s ? 'selected' : ''}>${STAGE_EMOJI[s]} ${esc(s)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Assigned Agent</label>
        <select id="lf-agent"
                class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none">
          <option value="">— Unassigned —</option>
          ${agents.map((a) => `<option value="${esc(a)}" ${lead?.agent === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Channel</label>
        <select id="lf-channel"
                class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none">
          ${CHANNELS.map((c) => `<option value="${esc(c)}" ${lead?.channel === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Project</label>
        <select id="lf-project"
                class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none">
          <option value="">— Select —</option>
          ${projects.map((p) => `<option value="${esc(p)}" ${lead?.project === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
        </select>
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Budget (USD)</label>
        <input id="lf-budget" type="number" min="0" step="1000"
               value="${esc(lead?.budget || '')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none"
               placeholder="250000" />
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Location</label>
        <input id="lf-location" type="text" value="${esc(lead?.location || '')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none"
               placeholder="e.g. New Cairo" />
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Priority</label>
        <select id="lf-priority"
                class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none">
          ${Object.entries(PRIORITY_LABEL).map(([v, l]) =>
            `<option value="${v}" ${lead?.priority === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">SLA Hours</label>
        <input id="lf-sla-hours" type="number" min="1" max="168"
               value="${esc(lead?.slaHours || 24)}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none" />
      </div>

      <div class="md:col-span-2">
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Requirements</label>
        <textarea id="lf-requirements" rows="3"
                  class="w-full px-3 py-2 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none resize-y"
                  placeholder="Bedrooms, size, floor, view…">${esc(lead?.requirements || '')}</textarea>
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Follow-Up Date</label>
        <input id="lf-followup-date" type="date" value="${esc(defaultDate)}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none" />
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Follow-Up Time</label>
        <input id="lf-followup-time" type="time" value="${esc(lead?.followUpTime || '10:00')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none" />
      </div>

      <div class="md:col-span-2">
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Follow-Up Note</label>
        <input id="lf-followup-note" type="text" value="${esc(lead?.followUpNote || '')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none"
               placeholder="What to discuss…" />
      </div>

      ${!lead ? `
      <div class="md:col-span-2">
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Initial Note</label>
        <textarea id="lf-note" rows="2"
                  class="w-full px-3 py-2 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none resize-y"
                  placeholder="Optional first note…"></textarea>
      </div>` : ''}
    </form>
  `;

  const saveBtn = document.getElementById('btn-modal-lead-save');
  if (saveBtn) {
    saveBtn.onclick = () => saveLeadFromForm();
  }

  Modal.open('modal-lead-form');

  // Focus the name field
  setTimeout(() => document.getElementById('lf-name')?.focus(), 60);
}

async function deleteLead(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;

  const ok = await Confirm.ask({
    icon: '🗑',
    title: 'Delete Lead',
    message: `Permanently delete "${lead.name}" and all related data?`,
    okText: 'Delete',
    danger: true,
  });
  if (!ok) return;

  STATE.leads = STATE.leads.filter((l) => l.id !== leadId);
  delete STATE.comments[leadId];
  delete STATE.auditLogs[leadId];

  await DB.deleteLead(leadId);

  if (STATE.activeLeadId === leadId) {
    STATE.activeLeadId = null;
    Modal.close('modal-action-center');
  }

  Router.refresh();
  updateHeaderKPIs();
  showToast(`Lead "${lead.name}" deleted`, 'warning');
}

async function changeLeadStage(leadId, newStage) {
  const lead = findLead(leadId);
  if (!lead || !STAGES.includes(newStage) || lead.stage === newStage) return;

  const from = lead.stage;
  lead.stage = newStage;
  lead.updatedAt = new Date().toISOString();
  await DB.saveLead(lead);

  createAuditEntry(leadId, 'stage_change', { from, to: newStage });

  Router.refresh();
  updateHeaderKPIs();
  showToast(`Stage → ${newStage}`, 'success');
}

async function addComment(leadId, rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    showToast('Write a note first', 'warning');
    return;
  }

  const comment = {
    id: generateId(),
    leadId,
    text,                                                        // RAW
    author: STATE.settings.currentUser || 'Unknown',             // RAW
    timestamp: new Date().toISOString(),
  };

  if (!STATE.comments[leadId]) STATE.comments[leadId] = [];
  STATE.comments[leadId].unshift(comment);
  await DB.saveComment(comment);
  createAuditEntry(leadId, 'comment_added', {});

  renderModalComments(leadId);
  renderModalAudit(leadId);
  showToast('Note added', 'success');
}

async function addCommentFromModal() {
  const input = document.getElementById('ac-comment-input');
  if (!input || !STATE.activeLeadId) return;
  await addComment(STATE.activeLeadId, input.value);
  input.value = '';
}

async function saveFollowUpFromModal() {
  const lead = findLead(STATE.activeLeadId);
  if (!lead) return;

  const date = document.getElementById('ac-followup-date-input')?.value || '';
  const time = document.getElementById('ac-followup-time-input')?.value || '';
  if (!date) {
    showToast('Pick a follow-up date', 'warning');
    return;
  }

  lead.followUpDate = date;
  lead.followUpTime = time || '09:00';
  lead.updatedAt = new Date().toISOString();
  await DB.saveLead(lead);

  createAuditEntry(lead.id, 'followup_set', {
    datetime: formatDateTime(`${date}T${time || '09:00'}`),
  });

  openActionCenterModal(lead.id);
  updateHeaderKPIs();
  showToast(`Follow-up set for ${formatDate(date)}`, 'success');
}

/* ============================================================================
   14 · MODULES
   ============================================================================ */

const Modules = {};

/* ----------------------------------------------------------------------------
   14.1 · ACTION CENTER (SLA Command Center)
   ---------------------------------------------------------------------------- */

Modules.ActionCenter = (() => {
  const BANDS = [
    { id: 'breached', label: 'Breached', icon: 'fa-fire',                tone: 'danger'   },
    { id: 'critical', label: 'Critical', icon: 'fa-triangle-exclamation',tone: 'critical' },
    { id: 'warning',  label: 'Warning',  icon: 'fa-hourglass-half',      tone: 'warn'     },
    { id: 'ontrack',  label: 'On Track', icon: 'fa-circle-check',        tone: 'ok'       },
    { id: 'all',      label: 'All',      icon: 'fa-list',                tone: 'muted'    },
  ];

  let filter = { band: 'all', search: '' };
  let tickTimer = null;
  let lastSnapshot = [];

  function snapshot() {
    return STATE.leads
      .filter((l) => l.stage !== 'Won' && l.stage !== 'Lost')
      .map((l) => ({
        lead: l,
        band: slaBandOf(l),
        cd  : countdownOf(l),
        score: calcLeadScore(l),
      }))
      .filter((r) => r.band !== 'none');
  }

  function applyFilter(rows) {
    const q = (filter.search || '').toLowerCase();
    return rows.filter((r) => {
      if (filter.band !== 'all') {
        if (filter.band === 'breached' && r.band !== 'breached') return false;
        if (filter.band === 'critical' && r.band !== 'critical' && r.band !== 'breached') return false;
        if (filter.band === 'warning'  && r.band !== 'warning') return false;
        if (filter.band === 'ontrack'  && r.band !== 'ontrack') return false;
      }
      if (q) {
        const l = r.lead;
        const hay = `${l.name || ''} ${l.phone || ''} ${l.email || ''} ${l.project || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function sortRows(rows) {
    return rows.slice().sort((a, b) => {
      const order = { breached: 0, critical: 1, warning: 2, ontrack: 3 };
      const oa = order[a.band] ?? 4;
      const ob = order[b.band] ?? 4;
      if (oa !== ob) return oa - ob;
      const da = a.cd?.diffMs ?? Infinity;
      const db = b.cd?.diffMs ?? Infinity;
      return da - db;
    });
  }

  function statsOf(rows) {
    const s = { breached: 0, critical: 0, warning: 0, ontrack: 0, all: rows.length };
    for (const r of rows) {
      if (s[r.band] !== undefined) s[r.band]++;
    }
    return s;
  }

  function formatCd(cd) {
    if (!cd) return '—';
    const d = cd.days > 0 ? `${cd.days}d ` : '';
    const core = `${pad2(cd.hours)}:${pad2(cd.mins)}:${pad2(cd.secs)}`;
    return cd.overdue ? `▲ ${d}${core}` : `${d}${core}`;
  }

  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const rows = snapshot();
    lastSnapshot = rows;
    const stats = statsOf(rows);

    content.innerHTML = `
      <div class="view-container space-y-5">

        <!-- HEAD -->
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full bg-ok animate-ringPulse" aria-hidden="true"></span>
            <div class="min-w-0">
              <h2 class="text-txt-primary text-[16px] font-semibold leading-tight">SLA Command Center</h2>
              <p class="text-txt-muted text-[12px]">Real-time monitoring of critical deadlines</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" data-action="sla-refresh"
                    class="h-8 px-3 rounded-lg text-[12px] font-medium text-txt-secondary bg-white/[0.04] border border-line hover:bg-white/[0.08] hover:text-txt-primary transition-colors">
              <i class="fa-solid fa-rotate-right mr-1.5 text-[10px]" aria-hidden="true"></i>Refresh
            </button>
          </div>
        </div>

        <!-- STATS -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3" data-sla-stats>
          ${BANDS.slice(0, 4).map((b) => statCard(b, stats[b.id] || 0)).join('')}
          <div class="surface-card p-4">
            <div class="flex items-center gap-2 text-txt-muted text-[10px] font-bold tracking-wider uppercase mb-2">
              <i class="fa-solid fa-layer-group text-[10px]" aria-hidden="true"></i>
              <span>Total Active</span>
            </div>
            <div class="text-txt-primary text-[26px] font-bold leading-none tabular-nums">${stats.all}</div>
          </div>
        </div>

        <!-- FILTERS -->
        <div class="flex items-center gap-2 flex-wrap">
          ${BANDS.map((b) => `
            <button type="button" data-action="sla-filter" data-band="${b.id}"
                    class="h-8 px-3 rounded-full text-[12px] font-semibold border transition-all
                      ${filter.band === b.id
                        ? 'bg-accent text-white border-accent shadow-glow'
                        : 'bg-white/[0.03] text-txt-secondary border-line hover:bg-white/[0.06] hover:text-txt-primary'}">
              <i class="fa-solid ${b.icon} mr-1.5 text-[10px]" aria-hidden="true"></i>
              ${b.label}
              <span class="ml-1 text-[10px] opacity-70">${b.id === 'all' ? stats.all : (stats[b.id] || 0)}</span>
            </button>`).join('')}
        </div>

        <!-- LIST -->
        <div data-sla-list class="space-y-2">
          ${rows.length === 0
            ? emptyState()
            : sortRows(applyFilter(rows)).map(card).join('')}
        </div>
      </div>
    `;

    startTick();
  }

  function statCard(band, value) {
    const tone = {
      danger  : { color: '#ff5d5d', bg: 'rgba(255,93,93,0.08)',   border: 'rgba(255,93,93,0.22)'  },
      critical: { color: '#ff7a45', bg: 'rgba(255,122,69,0.08)',  border: 'rgba(255,122,69,0.22)' },
      warn    : { color: '#ffb648', bg: 'rgba(255,182,72,0.08)',  border: 'rgba(255,182,72,0.22)' },
      ok      : { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.22)' },
    }[band.tone] || { color: '#8a91a6', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' };

    return `
      <button type="button" data-action="sla-filter" data-band="${band.id}"
              class="surface-card p-4 text-left transition-all hover:border-line-strong active:scale-[.995]"
              style="border-color:${tone.border}; background: linear-gradient(180deg, ${tone.bg}, transparent 80%);">
        <div class="flex items-center gap-2 text-txt-muted text-[10px] font-bold tracking-wider uppercase mb-2">
          <i class="fa-solid ${band.icon} text-[10px]" style="color:${tone.color};" aria-hidden="true"></i>
          <span>${band.label}</span>
        </div>
        <div class="text-[26px] font-bold leading-none tabular-nums" style="color:${tone.color};">
          ${value}
        </div>
      </button>`;
  }

  function emptyState() {
    return `
      <div class="surface-card py-12 text-center">
        <div class="text-4xl mb-3 opacity-60" aria-hidden="true">✅</div>
        <h3 class="text-txt-primary text-[14px] font-semibold mb-1">All clear</h3>
        <p class="text-txt-secondary text-[12px]">No leads matching this filter.</p>
      </div>`;
  }

  function bandPalette(band) {
    return {
      breached: { color: '#ff5d5d', bg: 'rgba(255,93,93,0.05)',    border: 'rgba(255,93,93,0.28)',    label: 'BREACHED'  },
      critical: { color: '#ff7a45', bg: 'rgba(255,122,69,0.05)',   border: 'rgba(255,122,69,0.28)',   label: 'CRITICAL'  },
      warning : { color: '#ffb648', bg: 'rgba(255,182,72,0.05)',   border: 'rgba(255,182,72,0.28)',   label: 'WARNING'   },
      ontrack : { color: '#4ade80', bg: 'rgba(74,222,128,0.04)',   border: 'rgba(74,222,128,0.22)',   label: 'ON TRACK'  },
    }[band] || { color: '#8a91a6', bg: 'transparent', border: 'rgba(255,255,255,0.06)', label: '—' };
  }

  function card(row) {
    const { lead, band, cd, score } = row;
    const p = bandPalette(band);
    const initials = initialsOf(lead.name);
    const stage = lead.stage || 'New Lead';
    const stageColor = STAGE_COLOR[stage] || '#4f8ef7';
    const priority = lead.priority || 'medium';
    const prColor = PRIORITY_COLOR[priority] || PRIORITY_COLOR.medium;
    const prLabel = PRIORITY_LABEL[priority] || 'Medium';
    const slaHours = Number(lead.slaHours) || 24;
    const slaWindowMs = slaHours * 3600000;
    const progress = cd
      ? Math.min(100, Math.max(0, (1 - Math.max(cd.diffMs, -slaWindowMs) / slaWindowMs) * 100))
      : 0;

    const scoreTone = score >= 75 ? '#ff7a45' : score >= 40 ? '#ffb648' : '#8a91a6';

    return `
      <article class="surface-card p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,220px)_auto] gap-4 items-center transition-all hover:border-line-strong"
               style="border-left:3px solid ${p.color}; background: linear-gradient(90deg, ${p.bg}, transparent 40%);">

        <!-- Identity -->
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center text-white text-[12px] font-bold shrink-0"
               style="background: linear-gradient(135deg, ${p.color}, ${p.color}cc);">
            ${esc(initials)}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-txt-primary text-[13px] font-semibold truncate">${esc(lead.name)}</span>
              <span class="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style="color:${prColor}; background:${prColor}18;">${esc(prLabel.toUpperCase())}</span>
              <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style="color:${scoreTone}; background:${scoreTone}18;" title="Lead score">${score}</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap text-[11px] text-txt-secondary mt-1">
              <span class="inline-flex items-center gap-1">
                <i class="fa-solid fa-circle" style="color:${stageColor}; font-size:7px;" aria-hidden="true"></i>
                ${STAGE_EMOJI[stage] || ''} ${esc(stage)}
              </span>
              ${lead.project ? `<span class="text-txt-muted">·</span><span>${esc(lead.project)}</span>` : ''}
              ${lead.agent   ? `<span class="text-txt-muted">·</span><span>${esc(lead.agent)}</span>`   : ''}
              ${lead.budget  ? `<span class="text-txt-muted">·</span><span>${formatMoney(lead.budget)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Timer -->
        <div class="min-w-0">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[9px] font-bold tracking-widest uppercase" style="color:${p.color};">${p.label}</span>
            <span class="text-[10px] text-txt-muted font-mono">SLA ${slaHours}h</span>
          </div>
          <div class="font-mono text-[15px] font-bold tabular-nums" style="color:${p.color};">
            ${formatCd(cd)}
          </div>
          <div class="mt-2 h-1 rounded-full bg-white/[0.05] overflow-hidden">
            <div class="h-full rounded-full transition-all"
                 style="width:${progress}%; background:${p.color};"></div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1.5 justify-end">
          <button type="button" data-action="sla-add-note" data-lead-id="${esc(lead.id)}"
                  class="h-8 w-8 rounded-lg text-txt-secondary bg-white/[0.04] border border-line hover:bg-white/[0.08] hover:text-txt-primary transition-colors"
                  title="Quick note">
            <i class="fa-solid fa-note-sticky text-[11px]" aria-hidden="true"></i>
          </button>
          <button type="button" data-action="wa-open" data-lead-id="${esc(lead.id)}"
                  class="h-8 w-8 rounded-lg transition-colors"
                  style="color:#25d366; background: rgba(37,211,102,0.1); border:1px solid rgba(37,211,102,0.22);"
                  title="WhatsApp">
            <i class="fa-brands fa-whatsapp text-[12px]" aria-hidden="true"></i>
          </button>
          <button type="button" data-action="open-action-center" data-lead-id="${esc(lead.id)}"
                  class="h-8 px-3 rounded-lg text-[12px] font-semibold text-white border border-accent/40 transition-all hover:brightness-110 active:scale-[.98]"
                  style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
            Open
          </button>
        </div>
      </article>`;
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (STATE.activeView !== 'action-center') return;

      const fresh = snapshot();
      // If band composition changed → re-render for accuracy
      const prevKey = lastSnapshot.map((r) => `${r.lead.id}:${r.band}`).join('|');
      const nextKey = fresh.map((r) => `${r.lead.id}:${r.band}`).join('|');

      lastSnapshot = fresh;
      if (prevKey !== nextKey) {
        // Band transitions require re-render
        Router.refresh();
      } else {
        // Just update countdown text + progress bar in place
        updateTimersInPlace(fresh);
      }
    }, SLA_TICK_MS);
  }

  function updateTimersInPlace(rows) {
    // We rebuild the list container only if we're on the AC view
    const list = document.querySelector('[data-sla-list]');
    if (!list) return;
    const sorted = sortRows(applyFilter(rows));
    // Cheap approach: only replace the timer text of matching cards.
    for (const row of sorted) {
      const el = list.querySelector(`[data-lead-timer="${CSS.escape(row.lead.id)}"]`);
      if (el) {
        const p = bandPalette(row.band);
        el.textContent = formatCd(row.cd);
        el.style.color = p.color;
      }
    }
  }

  function setFilter(patch) {
    filter = { ...filter, ...patch };
    // Only re-render if we're currently on the AC view
    if (STATE.activeView === 'action-center') render();
  }

  function refresh() {
    render();
  }

  async function promptQuickNote(leadId) {
    const lead = findLead(leadId);
    if (!lead) return;

    const text = window.prompt(`Quick note for "${lead.name}":`, '');
    if (text === null) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    await addComment(leadId, trimmed);
    createAuditEntry(leadId, 'note_added', {});
  }

  async function promptSnooze(leadId) {
    const lead = findLead(leadId);
    if (!lead) return;

    const choice = window.prompt('Snooze how long? (hours)', '24');
    if (choice === null) return;
    const hours = Number(choice);
    if (!Number.isFinite(hours) || hours <= 0) return;

    const base = lead.followUpDate
      ? new Date(`${lead.followUpDate}T${lead.followUpTime || '09:00'}`)
      : new Date();
    base.setHours(base.getHours() + hours);

    lead.followUpDate = base.toISOString().slice(0, 10);
    lead.followUpTime = base.toTimeString().slice(0, 5);
    lead.updatedAt = new Date().toISOString();

    await DB.saveLead(lead);
    createAuditEntry(leadId, 'snooze', { hours });
    Router.refresh();
    updateHeaderKPIs();
    showToast(`Snoozed ${hours}h`, 'info');
  }

  function teardown() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function switchModalTab(tab) {
    // Handled by modal handler below
    document.querySelectorAll('[data-ac-tab]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.acTab === tab);
    });
    document.querySelectorAll('[data-ac-panel]').forEach((p) => {
      p.classList.toggle('is-hidden', p.dataset.acPanel !== tab);
    });
  }

  return { render, refresh, setFilter, teardown, promptQuickNote, promptSnooze, switchModalTab };
})();

/* ----------------------------------------------------------------------------
   14.2 · SALES PIPELINE (Kanban)
   ---------------------------------------------------------------------------- */

Modules.Pipeline = (() => {
  let search = '';

  function setFilter(patch) {
    search = patch.search ?? search;
    if (STATE.activeView === 'sales-pipeline') render();
  }

  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const q = search.toLowerCase();
    const leads = STATE.leads.filter((l) => {
      if (!q) return true;
      return `${l.name || ''} ${l.phone || ''} ${l.project || ''}`.toLowerCase().includes(q);
    });

    const columns = STAGES.map((stage) => {
      const list = leads.filter((l) => l.stage === stage);
      const color = STAGE_COLOR[stage];
      return `
        <div class="shrink-0 w-[260px] flex flex-col gap-2">
          <div class="surface-card px-3 py-2.5 flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-2 h-2 rounded-full" style="background:${color};" aria-hidden="true"></span>
              <span class="text-txt-primary text-[12px] font-semibold truncate">${STAGE_EMOJI[stage]} ${esc(stage)}</span>
            </div>
            <span class="text-txt-muted text-[11px] font-mono font-bold">${list.length}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            ${list.length === 0
              ? `<div class="text-center text-txt-dim text-[11px] py-4">—</div>`
              : list.map(kcard).join('')}
          </div>
        </div>`;
    }).join('');

    content.innerHTML = `
      <div class="view-container space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 class="text-txt-primary text-[16px] font-semibold">Pipeline View</h2>
            <p class="text-txt-muted text-[12px] mt-0.5">Drag-free Kanban — click to open Action Center</p>
          </div>
          <button type="button" data-action="open-lead"
                  class="h-9 px-4 rounded-lg text-[12px] font-semibold text-white border border-accent/40 transition-all hover:brightness-110 active:scale-[.98]"
                  style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
            <i class="fa-solid fa-plus mr-1.5 text-[10px]" aria-hidden="true"></i>New Lead
          </button>
        </div>
        <div class="overflow-x-auto pb-3">
          <div class="flex gap-3 min-w-max">${columns}</div>
        </div>
      </div>`;
  }

  function kcard(lead) {
    const band = slaBandOf(lead);
    const cd = countdownOf(lead);
    const p = {
      breached: '#ff5d5d', critical: '#ff7a45',
      warning : '#ffb648', ontrack : '#4ade80',
    }[band] || '#8a91a6';

    return `
      <button type="button" data-action="open-action-center" data-lead-id="${esc(lead.id)}"
              class="surface-card p-3 text-left hover:border-line-strong transition-all">
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <span class="text-txt-primary text-[12px] font-semibold truncate">${esc(lead.name)}</span>
          ${cd ? `<span class="text-[10px] font-mono font-bold shrink-0" style="color:${p};">${cd.overdue ? '▲' : ''}${pad2(cd.hours)}:${pad2(cd.mins)}</span>` : ''}
        </div>
        <div class="flex items-center gap-2 text-[10px] text-txt-muted flex-wrap">
          ${lead.project ? `<span>🏗 ${esc(lead.project)}</span>` : ''}
          ${lead.budget  ? `<span>💰 ${formatMoney(lead.budget)}</span>` : ''}
          ${lead.agent   ? `<span>👤 ${esc(lead.agent)}</span>` : ''}
        </div>
      </button>`;
  }

  return { render, setFilter };
})();

/* ----------------------------------------------------------------------------
   14.3 · PROPERTY INVENTORY
   ---------------------------------------------------------------------------- */

Modules.Inventory = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const rows = STATE.inventory || [];

    content.innerHTML = `
      <div class="view-container space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 class="text-txt-primary text-[16px] font-semibold">Property Inventory</h2>
            <p class="text-txt-muted text-[12px] mt-0.5">Track available units across projects</p>
          </div>
          <span class="text-txt-muted text-[11px] font-mono">${rows.length} units</span>
        </div>

        ${rows.length === 0 ? emptyState() : gridOf(rows)}
      </div>`;
  }

  function emptyState() {
    return `
      <div class="surface-card py-16 text-center">
        <div class="text-5xl mb-4 opacity-50" aria-hidden="true">🏗</div>
        <h3 class="text-txt-primary text-[15px] font-semibold mb-1.5">No units yet</h3>
        <p class="text-txt-secondary text-[13px] max-w-md mx-auto">
          Property inventory management arrives in the next module release.
        </p>
      </div>`;
  }

  function gridOf(rows) {
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${rows.map((r) => `
          <div class="surface-card p-4">
            <div class="text-txt-primary text-[13px] font-semibold">${esc(r.name || 'Unit')}</div>
            <div class="text-txt-muted text-[11px] mt-1">${esc(r.project || '—')} · ${esc(r.status || '—')}</div>
          </div>`).join('')}
      </div>`;
  }

  return { render };
})();

/* ----------------------------------------------------------------------------
   14.4 · CIL RADAR  (Client Intent & Lead-scoring radar)
   ---------------------------------------------------------------------------- */

Modules.CILRadar = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const scored = STATE.leads
      .filter((l) => l.stage !== 'Won' && l.stage !== 'Lost')
      .map((l) => ({ lead: l, score: calcLeadScore(l) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    content.innerHTML = `
      <div class="view-container space-y-4">
        <div>
          <h2 class="text-txt-primary text-[16px] font-semibold">CIL Radar</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Client Intent & Lead scoring — top candidates</p>
        </div>

        ${scored.length === 0 ? `
          <div class="surface-card py-16 text-center">
            <div class="text-5xl mb-4 opacity-50" aria-hidden="true">📡</div>
            <h3 class="text-txt-primary text-[15px] font-semibold mb-1.5">Radar is clear</h3>
            <p class="text-txt-secondary text-[13px]">No active leads in scope yet.</p>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            ${scored.map(({ lead, score }) => radarCard(lead, score)).join('')}
          </div>
        `}
      </div>`;
  }

  function radarCard(lead, score) {
    const tone = score >= 75 ? { c: '#ff7a45', l: 'HOT' }
               : score >= 40 ? { c: '#ffb648', l: 'WARM' }
               : { c: '#8a91a6', l: 'COLD' };
    return `
      <button type="button" data-action="open-action-center" data-lead-id="${esc(lead.id)}"
              class="surface-card p-4 text-left hover:border-line-strong transition-all">
        <div class="flex items-center justify-between mb-2">
          <span class="text-txt-primary text-[13px] font-semibold truncate">${esc(lead.name)}</span>
          <span class="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style="color:${tone.c}; background:${tone.c}18;">${tone.l}</span>
        </div>
        <div class="text-[11px] text-txt-muted mb-2">
          ${esc(lead.stage)} ${lead.project ? '· ' + esc(lead.project) : ''}
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div class="h-full rounded-full" style="width:${score}%; background:${tone.c};"></div>
          </div>
          <span class="text-[12px] font-bold tabular-nums" style="color:${tone.c};">${score}</span>
        </div>
      </button>`;
  }

  return { render };
})();

/* ----------------------------------------------------------------------------
   14.5 · FINANCIAL ENGINE
   ---------------------------------------------------------------------------- */

Modules.FinancialEngine = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const leads = STATE.leads;
    const won = leads.filter((l) => l.stage === 'Won');
    const active = leads.filter((l) => l.stage !== 'Won' && l.stage !== 'Lost');

    const totalWon = won.reduce((s, l) => s + (Number(l.budget) || 0), 0);
    const pipeline = active.reduce((s, l) => s + (Number(l.budget) || 0), 0);
    const commissionRate = 0.025; // 2.5%
    const commission = totalWon * commissionRate;
    const weightedForecast = active.reduce((s, l) => {
      const w = { 'New Lead': 0.10, 'Contacted': 0.20, 'Meeting Scheduled': 0.35, 'Proposal Sent': 0.55, 'Negotiation': 0.75 }[l.stage] || 0.15;
      return s + (Number(l.budget) || 0) * w;
    }, 0);

    content.innerHTML = `
      <div class="view-container space-y-5">
        <div>
          <h2 class="text-txt-primary text-[16px] font-semibold">Financial Engine</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Commissions, forecasts & revenue tracking</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          ${finCard('Closed Revenue', formatMoney(totalWon), 'fa-trophy', '#4ade80')}
          ${finCard('Active Pipeline', formatMoney(pipeline), 'fa-chart-simple', '#6d8cff')}
          ${finCard('Est. Commissions', formatMoney(commission), 'fa-hand-holding-dollar', '#8f6dff')}
          ${finCard('Weighted Forecast', formatMoney(weightedForecast), 'fa-bullseye', '#ffb648')}
        </div>

        <div class="surface-card p-5">
          <h3 class="text-txt-primary text-[13px] font-semibold mb-3">Deals Won (${won.length})</h3>
          ${won.length === 0
            ? `<p class="text-txt-muted text-[12px]">No closed deals yet.</p>`
            : `<div class="divide-y divide-line">
                ${won.slice(0, 10).map((l) => `
                  <div class="flex items-center justify-between py-2">
                    <div class="min-w-0">
                      <div class="text-txt-primary text-[13px] font-medium truncate">${esc(l.name)}</div>
                      <div class="text-txt-muted text-[11px]">${esc(l.project || '—')} · ${esc(l.agent || 'Unassigned')}</div>
                    </div>
                    <div class="text-ok font-mono font-bold text-[13px]">${formatMoney(l.budget)}</div>
                  </div>`).join('')}
              </div>`}
        </div>
      </div>`;
  }

  function finCard(label, value, icon, color) {
    return `
      <div class="surface-card p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-txt-muted text-[10px] font-bold tracking-wider uppercase">${esc(label)}</span>
          <i class="fa-solid ${icon} text-[12px]" style="color:${color};" aria-hidden="true"></i>
        </div>
        <div class="text-[22px] font-bold tabular-nums" style="color:${color};">${esc(value)}</div>
      </div>`;
  }

  return { render };
})();

/* ----------------------------------------------------------------------------
   14.6 · AI VOICE SIMULATOR
   ---------------------------------------------------------------------------- */

Modules.VoiceSimulator = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    content.innerHTML = `
      <div class="view-container space-y-5">
        <div>
          <h2 class="text-txt-primary text-[16px] font-semibold">AI Voice Simulator</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Practice objection handling against synthetic buyers</p>
        </div>

        <div class="surface-card p-8 text-center">
          <div class="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
               style="background: linear-gradient(135deg,#6d8cff33,#8f6dff33);">
            <i class="fa-solid fa-microphone-lines text-[24px] text-accent" aria-hidden="true"></i>
          </div>
          <h3 class="text-txt-primary text-[15px] font-semibold mb-2">Beta Module</h3>
          <p class="text-txt-secondary text-[13px] max-w-md mx-auto leading-relaxed">
            The Voice Simulator module is scheduled for the next release.
            It will let you rehearse calls against AI personas trained on real objections.
          </p>
          <button type="button" disabled
                  class="mt-5 h-10 px-5 rounded-lg text-[13px] font-semibold text-txt-muted bg-white/[0.04] border border-line cursor-not-allowed">
            <i class="fa-solid fa-clock mr-2 text-[11px]" aria-hidden="true"></i>Coming Soon
          </button>
        </div>
      </div>`;
  }

  return { render };
})();

/* ----------------------------------------------------------------------------
   14.7 · ANALYTICS
   ---------------------------------------------------------------------------- */

Modules.Analytics = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const stageData = STAGES.map((s) => ({
      stage: s,
      count: STATE.leads.filter((l) => l.stage === s).length,
    }));

    const channelMap = {};
    STATE.leads.forEach((l) => {
      const c = l.channel || 'Unknown';
      channelMap[c] = (channelMap[c] || 0) + 1;
    });

    const max = Math.max(...stageData.map((d) => d.count), 1);

    content.innerHTML = `
      <div class="view-container space-y-5">
        <div>
          <h2 class="text-txt-primary text-[16px] font-semibold">Analytics</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Performance insights across the pipeline</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="surface-card p-5">
            <h3 class="text-txt-primary text-[13px] font-semibold mb-4">Leads by Stage</h3>
            <div class="space-y-3">
              ${stageData.map((d) => `
                <div class="flex items-center gap-3">
                  <span class="text-[11px] text-txt-secondary w-[110px] shrink-0 truncate">${esc(d.stage)}</span>
                  <div class="flex-1 h-5 rounded bg-white/[0.04] overflow-hidden">
                    <div class="h-full rounded flex items-center px-2 text-white text-[10px] font-bold"
                         style="width:${(d.count / max) * 100}%; min-width:${d.count > 0 ? '24px' : '0'}; background:${STAGE_COLOR[d.stage]};">
                      ${d.count > 0 ? d.count : ''}
                    </div>
                  </div>
                  <span class="text-[11px] font-mono font-bold text-txt-primary w-6 text-right">${d.count}</span>
                </div>`).join('')}
            </div>
          </div>

          <div class="surface-card p-5">
            <h3 class="text-txt-primary text-[13px] font-semibold mb-4">Leads by Channel</h3>
            <div class="space-y-3">
              ${Object.entries(channelMap).sort((a, b) => b[1] - a[1]).map(([ch, n]) => `
                <div class="flex items-center gap-3">
                  <span class="text-[11px] text-txt-secondary w-[110px] shrink-0 truncate">${esc(ch)}</span>
                  <div class="flex-1 h-5 rounded bg-white/[0.04] overflow-hidden">
                    <div class="h-full rounded bg-accent flex items-center px-2 text-white text-[10px] font-bold"
                         style="width:${(n / Math.max(...Object.values(channelMap), 1)) * 100}%;">
                      ${n}
                    </div>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  }

  return { render };
})();

/* ----------------------------------------------------------------------------
   14.8 · SETTINGS
   ---------------------------------------------------------------------------- */

Modules.Settings = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    content.innerHTML = `
      <div class="view-container space-y-4 max-w-3xl">

        <!-- User -->
        <section class="surface-card p-5">
          <h3 class="text-txt-primary text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-solid fa-user text-accent text-[12px]" aria-hidden="true"></i>
            Current User
          </h3>
          <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Your Name</label>
          <div class="flex gap-2">
            <input type="text" id="setting-username" value="${esc(STATE.settings.currentUser || '')}"
                   class="flex-1 h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none" />
            <button type="button" data-action="settings-save-user"
                    class="h-10 px-4 rounded-lg text-[12px] font-semibold text-white border border-accent/40 transition-all hover:brightness-110"
                    style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
              Save
            </button>
          </div>
        </section>

        <!-- Agents -->
        <section class="surface-card p-5">
          <h3 class="text-txt-primary text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-solid fa-users text-accent text-[12px]" aria-hidden="true"></i>
            Agents
          </h3>
          <div class="flex flex-col gap-2 mb-4">
            ${(STATE.settings.agents || []).map((a) => `
              <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-line">
                <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                     style="background: linear-gradient(135deg,#6d8cff,#8f6dff);">
                  ${esc((a[0] || '?').toUpperCase())}
                </div>
                <span class="flex-1 text-txt-primary text-[13px]">${esc(a)}</span>
                <button type="button" data-action="settings-remove-agent" data-agent="${esc(a)}"
                        class="icon-btn" title="Remove">
                  <i class="fa-solid fa-xmark text-[11px]" aria-hidden="true"></i>
                </button>
              </div>`).join('')}
          </div>
          <div class="flex gap-2">
            <input type="text" id="new-agent-input" placeholder="Add agent name…"
                   class="flex-1 h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none" />
            <button type="button" data-action="settings-add-agent"
                    class="h-10 px-4 rounded-lg text-[12px] font-semibold text-white border border-accent/40 transition-all hover:brightness-110"
                    style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
              Add
            </button>
          </div>
        </section>

        <!-- Projects -->
        <section class="surface-card p-5">
          <h3 class="text-txt-primary text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-solid fa-building text-accent text-[12px]" aria-hidden="true"></i>
            Projects
          </h3>
          <div class="flex flex-wrap gap-2 mb-4">
            ${(STATE.settings.projects || []).map((p) => `
              <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-line text-txt-primary text-[12px]">
                ${esc(p)}
                <button type="button" data-action="settings-remove-project" data-project="${esc(p)}"
                        class="text-txt-muted hover:text-danger transition-colors" title="Remove">
                  <i class="fa-solid fa-xmark text-[10px]" aria-hidden="true"></i>
                </button>
              </span>`).join('')}
          </div>
          <div class="flex gap-2">
            <input type="text" id="new-project-input" placeholder="Add project name…"
                   class="flex-1 h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none" />
            <button type="button" data-action="settings-add-project"
                    class="h-10 px-4 rounded-lg text-[12px] font-semibold text-white border border-accent/40 transition-all hover:brightness-110"
                    style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
              Add
            </button>
          </div>
        </section>

        <!-- Data -->
        <section class="surface-card p-5">
          <h3 class="text-txt-primary text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-solid fa-database text-accent text-[12px]" aria-hidden="true"></i>
            Data Management
          </h3>
          <div class="divide-y divide-line">
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt-primary text-[13px] font-medium">Export Data</div>
                <div class="text-txt-muted text-[11px]">Download JSON backup</div>
              </div>
              <button type="button" data-action="settings-export"
                      class="h-9 px-4 rounded-lg text-[12px] font-medium text-txt-secondary bg-white/[0.04] border border-line hover:bg-white/[0.08] hover:text-txt-primary transition-colors">
                <i class="fa-solid fa-download mr-1.5 text-[10px]" aria-hidden="true"></i>Export
              </button>
            </div>
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt-primary text-[13px] font-medium">Import Data</div>
                <div class="text-txt-muted text-[11px]">Restore from backup</div>
              </div>
              <button type="button" data-action="settings-import"
                      class="h-9 px-4 rounded-lg text-[12px] font-medium text-txt-secondary bg-white/[0.04] border border-line hover:bg-white/[0.08] hover:text-txt-primary transition-colors">
                <i class="fa-solid fa-upload mr-1.5 text-[10px]" aria-hidden="true"></i>Import
              </button>
            </div>
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt-primary text-[13px] font-medium">Storage Engine</div>
                <div class="text-txt-muted text-[11px]">${STATE.useIDB ? 'IndexedDB — high capacity' : 'LocalStorage — ~5MB limit'}</div>
              </div>
              <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${STATE.useIDB ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}">
                ${STATE.useIDB ? 'IndexedDB' : 'LocalStorage'}
              </span>
            </div>
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt-primary text-[13px] font-medium">Clear All Data</div>
                <div class="text-txt-muted text-[11px]">Permanently delete everything</div>
              </div>
              <button type="button" data-action="settings-clear"
                      class="h-9 px-4 rounded-lg text-[12px] font-semibold text-danger bg-danger-soft border border-danger/25 hover:bg-danger/20 transition-colors">
                <i class="fa-solid fa-trash mr-1.5 text-[10px]" aria-hidden="true"></i>Clear
              </button>
            </div>
          </div>
        </section>

        <!-- WhatsApp Templates -->
        <section class="surface-card p-5">
          <h3 class="text-txt-primary text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-brands fa-whatsapp text-[#25d366] text-[14px]" aria-hidden="true"></i>
            WhatsApp Templates
          </h3>
          <div class="flex flex-col gap-3">
            ${STAGES.map((s) => `
              <div>
                <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">${STAGE_EMOJI[s]} ${esc(s)}</label>
                <textarea id="wa-tpl-${s.replace(/\s+/g, '_')}" rows="2"
                          class="w-full px-3 py-2 rounded-lg bg-input border border-line text-txt-primary text-[12px] focus:border-line-focus focus:outline-none resize-y">${esc(STATE.settings.waTemplates[s] || '')}</textarea>
              </div>`).join('')}
          </div>
          <button type="button" data-action="settings-save-wa"
                  class="mt-4 h-10 px-4 rounded-lg text-[12px] font-semibold text-white border border-accent/40 transition-all hover:brightness-110"
                  style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
            <i class="fa-solid fa-floppy-disk mr-1.5 text-[10px]" aria-hidden="true"></i>Save Templates
          </button>
        </section>

      </div>`;
  }

  return { render };
})();

/* ============================================================================
   15 · ACTION CENTER MODAL (per-lead)
   ============================================================================ */

function openActionCenterModal(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;

  STATE.activeLeadId = leadId;

  const body = document.querySelector('[data-modal-body="action-center"]');
  const titleEl = document.getElementById('modal-action-center-title');
  if (!body) return;

  if (titleEl) titleEl.textContent = lead.name;

  const initials = initialsOf(lead.name);
  const stage = lead.stage || 'New Lead';
  const stageColor = STAGE_COLOR[stage];
  const band = slaBandOf(lead);

  body.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] h-full overflow-hidden">

      <!-- MAIN -->
      <div class="overflow-y-auto p-5 space-y-4">

        <!-- Header -->
        <div class="flex items-start gap-3 pb-4 border-b border-line">
          <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[16px] font-bold shrink-0"
               style="background: linear-gradient(135deg,#6d8cff,#8f6dff);">
            ${esc(initials)}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-txt-primary text-[16px] font-semibold truncate">${esc(lead.name)}</div>
            <div class="flex items-center gap-2 flex-wrap text-[12px] text-txt-secondary mt-1">
              ${lead.phone   ? `<span><i class="fa-solid fa-phone text-[10px] mr-1" aria-hidden="true"></i>${esc(lead.phone)}</span>` : ''}
              ${lead.email   ? `<span><i class="fa-solid fa-envelope text-[10px] mr-1" aria-hidden="true"></i>${esc(lead.email)}</span>` : ''}
              ${lead.agent   ? `<span><i class="fa-solid fa-user text-[10px] mr-1" aria-hidden="true"></i>${esc(lead.agent)}</span>` : ''}
            </div>
          </div>
          <span class="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                style="color:${stageColor}; background:${stageColor}18; border:1px solid ${stageColor}44;">
            ${STAGE_EMOJI[stage] || ''} ${esc(stage)}
          </span>
        </div>

        <!-- SLA Strip -->
        <div class="surface-card p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-txt-muted text-[10px] font-bold tracking-wider uppercase">SLA Status</span>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded"
                  style="color:${bandColor(band)}; background:${bandColor(band)}18;">
              ${bandLabel(band)}
            </span>
          </div>
          <div class="grid grid-cols-3 gap-3 mb-3">
            ${timeBlock('Days', 'ac-days-val')}
            ${timeBlock('Hours', 'ac-hours-val')}
            ${timeBlock('Mins', 'ac-mins-val')}
          </div>
          <div class="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div id="ac-sla-progress" class="h-full rounded-full transition-all"
                 style="width:0%; background:${bandColor(band)};"></div>
          </div>
          <div class="flex gap-2 mt-3">
            <input type="date" id="ac-followup-date-input" value="${esc(lead.followUpDate || '')}"
                   class="flex-1 h-9 px-2 rounded-lg bg-input border border-line text-txt-primary text-[12px] focus:border-line-focus focus:outline-none" />
            <input type="time" id="ac-followup-time-input" value="${esc(lead.followUpTime || '')}"
                   class="flex-1 h-9 px-2 rounded-lg bg-input border border-line text-txt-primary text-[12px] focus:border-line-focus focus:outline-none" />
            <button type="button" data-action="ac-save-followup"
                    class="h-9 px-3 rounded-lg text-[12px] font-semibold text-white border border-accent/40"
                    style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
              Set
            </button>
          </div>
        </div>

        <!-- Meta grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-2" id="ac-meta-grid">
          ${metaTile('Channel', lead.channel || '—')}
          ${metaTile('Project', lead.project || '—')}
          ${metaTile('Budget', lead.budget ? formatMoney(lead.budget) : '—')}
          ${metaTile('Location', lead.location || '—')}
          ${metaTile('Priority', PRIORITY_LABEL[lead.priority || 'medium'] || '—')}
          ${metaTile('SLA Hours', `${lead.slaHours || 24}h`)}
          ${lead.requirements ? metaTileFull('Requirements', lead.requirements) : ''}
          ${lead.followUpNote ? metaTileFull('Follow-up Note', lead.followUpNote) : ''}
        </div>

        <!-- Tabs -->
        <div class="flex items-center gap-1 border-b border-line">
          <button type="button" data-action="toggle-ac-tab" data-tab="comments"
                  data-ac-tab="comments"
                  class="h-9 px-4 text-[12px] font-semibold text-accent border-b-2 border-accent -mb-px">
            Notes <span class="text-txt-muted ml-1">(${(STATE.comments[lead.id] || []).length})</span>
          </button>
          <button type="button" data-action="toggle-ac-tab" data-tab="audit"
                  data-ac-tab="audit"
                  class="h-9 px-4 text-[12px] font-semibold text-txt-muted border-b-2 border-transparent -mb-px hover:text-txt-primary">
            Audit <span class="text-txt-muted ml-1">(${(STATE.auditLogs[lead.id] || []).length})</span>
          </button>
        </div>

        <!-- Comments Panel -->
        <div data-ac-panel="comments" class="space-y-3">
          <div class="surface-card p-3">
            <textarea id="ac-comment-input" rows="2" placeholder="Add a note…"
                      class="w-full px-3 py-2 rounded-lg bg-input border border-line text-txt-primary text-[12px] focus:border-line-focus focus:outline-none resize-y"></textarea>
            <div class="flex items-center justify-between mt-2">
              <span class="text-txt-muted text-[11px]">
                <i class="fa-solid fa-user text-[10px] mr-1" aria-hidden="true"></i>
                ${esc(STATE.settings.currentUser || 'You')}
              </span>
              <button type="button" data-action="ac-add-comment"
                      class="h-8 px-3 rounded-lg text-[12px] font-semibold text-white border border-accent/40"
                      style="background: linear-gradient(135deg,#6d8cff,#5b7cff);">
                Add Note
              </button>
            </div>
          </div>
          <div id="ac-comments-list" class="space-y-2"></div>
        </div>

        <!-- Audit Panel -->
        <div data-ac-panel="audit" class="is-hidden space-y-2">
          <div id="ac-audit-list" class="space-y-1"></div>
        </div>
      </div>

      <!-- SIDEBAR -->
      <aside class="overflow-y-auto p-4 border-t lg:border-t-0 lg:border-l border-line bg-black/20 space-y-3">

        <div class="surface-card">
          <div class="px-3 py-2 border-b border-line text-txt-muted text-[10px] font-bold tracking-wider uppercase">
            Change Stage
          </div>
          <div class="p-2 flex flex-col gap-1">
            ${STAGES.map((s) => `
              <button type="button" data-action="change-stage" data-lead-id="${esc(lead.id)}" data-stage="${esc(s)}"
                      class="h-8 px-3 rounded-lg text-[11px] font-medium text-left transition-colors ${s === lead.stage ? 'bg-accent text-white' : 'text-txt-secondary hover:bg-white/[0.04] hover:text-txt-primary'}"
                      ${s === lead.stage ? 'disabled' : ''}>
                ${STAGE_EMOJI[s]} ${esc(s)} ${s === lead.stage ? '✓' : ''}
              </button>`).join('')}
          </div>
        </div>

        <div class="surface-card">
          <div class="px-3 py-2 border-b border-line text-txt-muted text-[10px] font-bold tracking-wider uppercase">
            Lead Score
          </div>
          <div class="p-3">
            ${renderScoreBlock(lead)}
          </div>
        </div>

        <div class="surface-card">
          <div class="px-3 py-2 border-b border-line text-txt-muted text-[10px] font-bold tracking-wider uppercase">
            Quick Actions
          </div>
          <div class="p-3 grid grid-cols-2 gap-2">
            <button type="button" data-action="open-lead" data-lead-id="${esc(lead.id)}"
                    class="h-9 rounded-lg text-[11px] font-medium text-txt-secondary bg-white/[0.03] border border-line hover:bg-white/[0.06] hover:text-txt-primary transition-colors">
              <i class="fa-solid fa-pen mr-1 text-[10px]" aria-hidden="true"></i>Edit
            </button>
            <button type="button" data-action="wa-open" data-lead-id="${esc(lead.id)}"
                    class="h-9 rounded-lg text-[11px] font-medium transition-colors"
                    style="color:#25d366; background:rgba(37,211,102,0.08); border:1px solid rgba(37,211,102,0.22);">
              <i class="fa-brands fa-whatsapp mr-1" aria-hidden="true"></i>WhatsApp
            </button>
          </div>
        </div>

      </aside>
    </div>`;

  renderModalComments(lead.id);
  renderModalAudit(lead.id);
  startACModalTick(lead.id);

  Modal.open('modal-action-center');
}

function bandLabel(band) {
  return { breached: 'BREACHED', critical: 'CRITICAL', warning: 'WARNING', ontrack: 'ON TRACK' }[band] || '—';
}
function bandColor(band) {
  return { breached: '#ff5d5d', critical: '#ff7a45', warning: '#ffb648', ontrack: '#4ade80' }[band] || '#8a91a6';
}

function timeBlock(label, id) {
  return `
    <div class="text-center">
      <div id="${id}" class="text-[22px] font-bold font-mono tabular-nums leading-none">—</div>
      <div class="text-txt-muted text-[10px] font-bold tracking-wider uppercase mt-1">${label}</div>
    </div>`;
}

function metaTile(label, value) {
  return `
    <div class="surface-card p-3">
      <div class="text-txt-muted text-[10px] font-bold tracking-wider uppercase mb-1">${esc(label)}</div>
      <div class="text-txt-primary text-[12px] font-medium truncate">${esc(value)}</div>
    </div>`;
}

function metaTileFull(label, value) {
  return `
    <div class="surface-card p-3 col-span-2 md:col-span-3">
      <div class="text-txt-muted text-[10px] font-bold tracking-wider uppercase mb-1">${esc(label)}</div>
      <div class="text-txt-primary text-[12px] leading-relaxed whitespace-pre-wrap break-words">${esc(value)}</div>
    </div>`;
}

function renderScoreBlock(lead) {
  const score = calcLeadScore(lead);
  const tone = score >= 75 ? { c: '#ff7a45', l: 'Hot Lead 🔥' }
             : score >= 40 ? { c: '#ffb648', l: 'Warm Lead 🌡️' }
             : { c: '#8a91a6', l: 'Cold Lead ❄️' };
  return `
    <div class="flex items-center justify-between mb-2">
      <span class="text-[22px] font-bold" style="color:${tone.c};">${score}</span>
      <span class="text-[11px] font-semibold" style="color:${tone.c};">${tone.l}</span>
    </div>
    <div class="h-2 rounded-full bg-white/[0.06] overflow-hidden">
      <div class="h-full rounded-full transition-all" style="width:${score}%; background:${tone.c};"></div>
    </div>`;
}

function renderModalComments(leadId) {
  const el = document.getElementById('ac-comments-list');
  if (!el) return;
  const list = STATE.comments[leadId] || [];

  if (list.length === 0) {
    el.innerHTML = `
      <div class="text-center py-8">
        <div class="text-2xl opacity-50 mb-2" aria-hidden="true">💬</div>
        <p class="text-txt-muted text-[12px]">No notes yet.</p>
      </div>`;
    return;
  }

  el.innerHTML = list.map((c) => `
    <div class="surface-card p-3">
      <div class="flex items-center gap-2 mb-1.5">
        <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
             style="background: linear-gradient(135deg,#6d8cff,#8f6dff);">
          ${esc((c.author || '?').charAt(0).toUpperCase())}
        </div>
        <span class="text-accent text-[12px] font-semibold">${esc(c.author || 'Unknown')}</span>
        <span class="text-txt-muted text-[10px] ml-auto">${formatRelative(c.timestamp)}</span>
      </div>
      <div class="text-txt-primary text-[12px] leading-relaxed whitespace-pre-wrap break-words">${esc(c.text || '')}</div>
    </div>`).join('');
}

function renderModalAudit(leadId) {
  const el = document.getElementById('ac-audit-list');
  if (!el) return;
  const list = STATE.auditLogs[leadId] || [];

  if (list.length === 0) {
    el.innerHTML = `<p class="text-txt-muted text-[12px] text-center py-8">No audit entries yet.</p>`;
    return;
  }

  el.innerHTML = list.map((e) => `
    <div class="flex gap-3 py-2">
      <div class="w-7 h-7 rounded-full bg-white/[0.04] border border-line flex items-center justify-center text-[11px] shrink-0">
        ${auditIcon(e.action)}
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-txt-secondary text-[12px] leading-relaxed">${buildAuditLine(e)}</div>
        <div class="text-txt-muted text-[10px] mt-0.5">${formatRelative(e.timestamp)} · ${formatDateTime(e.timestamp)}</div>
      </div>
    </div>`).join('');
}

function startACModalTick(leadId) {
  if (STATE.acTickTimer) clearInterval(STATE.acTickTimer);
  STATE.acTickTimer = setInterval(() => {
    const lead = findLead(leadId);
    if (!lead || !Modal.isOpen('modal-action-center')) {
      clearInterval(STATE.acTickTimer);
      STATE.acTickTimer = null;
      return;
    }

    const cd = countdownOf(lead);
    const band = slaBandOf(lead);
    const color = bandColor(band);

    const dEl = document.getElementById('ac-days-val');
    const hEl = document.getElementById('ac-hours-val');
    const mEl = document.getElementById('ac-mins-val');
    const pEl = document.getElementById('ac-sla-progress');

    if (cd) {
      if (dEl) { dEl.textContent = pad2(cd.days);  dEl.style.color = color; }
      if (hEl) { hEl.textContent = pad2(cd.hours); hEl.style.color = color; }
      if (mEl) { mEl.textContent = pad2(cd.mins);  mEl.style.color = color; }

      if (pEl) {
        const slaMs = (Number(lead.slaHours) || 24) * 3600000;
        const startMs = dueMsOf(lead) - slaMs;
        const elapsed = Date.now() - startMs;
        const pct = Math.min(100, Math.max(0, (elapsed / slaMs) * 100));
        pEl.style.width = pct + '%';
        pEl.style.background = color;
      }
    } else {
      if (dEl) dEl.textContent = '—';
      if (hEl) hEl.textContent = '—';
      if (mEl) mEl.textContent = '—';
      if (pEl) pEl.style.width = '0%';
    }
  }, 1000);
}

/* ============================================================================
   16 · WHATSAPP COMPOSER
   ============================================================================ */

function fillWATemplate(tpl, lead) {
  if (!tpl) return '';
  return String(tpl)
    .replace(/\{name\}/gi,    lead.name || '')
    .replace(/\{agent\}/gi,   lead.agent || STATE.settings.currentUser || '')
    .replace(/\{project\}/gi, lead.project || '')
    .replace(/\{phone\}/gi,   lead.phone || '')
    .replace(/\{stage\}/gi,   lead.stage || '');
}

function openWhatsAppComposer(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;

  const body = document.querySelector('[data-modal-body="whatsapp"]');
  if (!body) return;

  const cleanPhone = (lead.phone || '').replace(/\D/g, '');
  const defaultTpl = STATE.settings.waTemplates[lead.stage] || '';
  const defaultMsg = fillWATemplate(defaultTpl, lead);

  body.innerHTML = `
    <div class="space-y-4">
      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Phone Number</label>
        <input type="text" id="wa-phone" value="${esc(cleanPhone ? '+' + cleanPhone : '')}"
               class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none" />
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Template</label>
        <select id="wa-template-select"
                class="w-full h-10 px-3 rounded-lg bg-input border border-line text-txt-primary text-[13px] focus:border-line-focus focus:outline-none">
          <option value="">— Select —</option>
          ${STAGES.map((s) => `
            <option value="${esc(s)}" ${s === lead.stage ? 'selected' : ''}>
              ${STAGE_EMOJI[s]} ${esc(s)}
            </option>`).join('')}
        </select>
      </div>

      <div>
        <label class="block text-txt-secondary text-[12px] font-medium mb-1.5">Message</label>
        <textarea id="wa-message" rows="6"
                  class="w-full px-3 py-2 rounded-lg bg-input border border-line text-txt-primary text-[12px] focus:border-line-focus focus:outline-none resize-y leading-relaxed">${esc(defaultMsg)}</textarea>
      </div>
    </div>`;

  // Template switcher
  const sel = document.getElementById('wa-template-select');
  if (sel) {
    sel.onchange = () => {
      const tpl = STATE.settings.waTemplates[sel.value] || '';
      const msg = fillWATemplate(tpl, lead);
      const ta = document.getElementById('wa-message');
      if (ta) ta.value = msg;
    };
  }

  const sendBtn = document.getElementById('btn-modal-wa-send');
  if (sendBtn) sendBtn.dataset.leadId = leadId;

  Modal.open('modal-whatsapp');
}

function sendWhatsApp() {
  const sendBtn = document.getElementById('btn-modal-wa-send');
  const leadId = sendBtn?.dataset.leadId;
  const phone = (document.getElementById('wa-phone')?.value || '').replace(/\D/g, '');
  const msg = (document.getElementById('wa-message')?.value || '').trim();

  if (!phone) { showToast('Enter a phone number', 'warning'); return; }
  if (!msg)   { showToast('Write a message', 'warning'); return; }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');

  if (leadId) {
    createAuditEntry(leadId, 'whatsapp_sent', {});
    if (STATE.activeLeadId === leadId) renderModalAudit(leadId);
  }

  Modal.close('modal-whatsapp');
  showToast('Opening WhatsApp…', 'success');
}

/* ============================================================================
   17 · IMPORT / EXPORT
   ============================================================================ */

function exportData() {
  const payload = {
    version   : '8.0',
    exportedAt: new Date().toISOString(),
    leads     : STATE.leads,
    comments  : STATE.comments,
    auditLogs : STATE.auditLogs,
    settings  : STATE.settings,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `youssef-crm-v8-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast('Data exported', 'success');
}

function openImportModal() {
  const body = document.querySelector('[data-modal-body="import"]');
  if (!body) return;

  STATE.importBuffer = null;

  body.innerHTML = `
    <div id="import-drop-zone" data-action="import-zone"
         class="border-2 border-dashed border-line rounded-xl py-12 text-center cursor-pointer transition-all hover:border-accent hover:bg-accent/[0.03]">
      <div class="text-4xl mb-3 opacity-60" aria-hidden="true">📂</div>
      <p class="text-txt-primary text-[13px] font-semibold">Drop your JSON backup here</p>
      <p class="text-txt-muted text-[11px] mt-1">or click to browse</p>
      <input type="file" id="import-file-input" accept=".json,application/json" class="hidden" />
    </div>
    <div id="import-validation" class="mt-4"></div>`;

  const input = document.getElementById('import-file-input');
  if (input) {
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
    };
  }

  const dropZone = document.getElementById('import-drop-zone');
  if (dropZone) {
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-accent'); };
    dropZone.ondragleave = () => dropZone.classList.remove('border-accent');
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-accent');
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImportFile(file);
    };
  }

  const confirmBtn = document.getElementById('btn-modal-import-confirm');
  if (confirmBtn) confirmBtn.disabled = true;

  Modal.open('modal-import');
}

function handleImportFile(file) {
  if (!file.name.endsWith('.json')) {
    showToast('Please select a .json file', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => validateImport(e.target.result, file.name);
  reader.onerror = () => showToast('Failed to read file', 'error');
  reader.readAsText(file);
}

function validateImport(jsonString, filename) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    renderImportResult(false, [`Invalid JSON: ${err.message}`]);
    return;
  }

  const { valid, errors } = SchemaValidator.validate(parsed);
  const validationEl = document.getElementById('import-validation');
  const confirmBtn = document.getElementById('btn-modal-import-confirm');

  if (!valid) {
    renderImportResult(false, errors);
    STATE.importBuffer = null;
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }

  STATE.importBuffer = parsed;

  const leadCount = parsed.leads.length;
  const commentCount = Object.values(parsed.comments || {}).flat().length;
  const auditCount = Object.values(parsed.auditLogs || {}).flat().length;

  if (validationEl) {
    validationEl.innerHTML = `
      <div class="surface-card p-4 border-ok/30 bg-ok/[0.04]">
        <div class="flex items-center gap-2 mb-2">
          <i class="fa-solid fa-circle-check text-ok text-[14px]" aria-hidden="true"></i>
          <span class="text-ok text-[13px] font-semibold">Validation passed</span>
        </div>
        <div class="text-txt-secondary text-[12px] leading-relaxed">
          Ready to import from <strong class="text-txt-primary">${esc(filename)}</strong>:
          <ul class="mt-2 ml-4 list-disc space-y-0.5">
            <li>${leadCount} leads</li>
            <li>${commentCount} comments</li>
            <li>${auditCount} audit entries</li>
          </ul>
        </div>
      </div>`;
  }

  if (confirmBtn) confirmBtn.disabled = false;
}

function renderImportResult(valid, errors) {
  const el = document.getElementById('import-validation');
  if (!el) return;

  if (valid) {
    el.innerHTML = `<div class="surface-card p-4 border-ok/30"><span class="text-ok text-[12px]">Valid</span></div>`;
    return;
  }

  el.innerHTML = `
    <div class="surface-card p-4 border-danger/30 bg-danger/[0.04]">
      <div class="flex items-center gap-2 mb-2">
        <i class="fa-solid fa-circle-exclamation text-danger text-[14px]" aria-hidden="true"></i>
        <span class="text-danger text-[13px] font-semibold">Validation failed (${errors.length})</span>
      </div>
      <ul class="text-[11px] text-danger/80 space-y-1 max-h-40 overflow-y-auto pl-4 list-disc">
        ${errors.slice(0, 15).map((e) => `<li>${esc(e)}</li>`).join('')}
      </ul>
    </div>`;
}

async function confirmImport() {
  if (!STATE.importBuffer) return;

  const confirmBtn = document.getElementById('btn-modal-import-confirm');
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    await DB.bulkImport(STATE.importBuffer);
    STATE.importBuffer = null;
    Modal.close('modal-import');
    Router.refresh();
    updateHeaderKPIs();
    showToast('Data imported successfully', 'success');
  } catch (err) {
    console.error('[CRM] Import failed:', err);
    showToast(`Import failed: ${err.message}`, 'error');
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

/* ============================================================================
   18 · SETTINGS ACTIONS
   ============================================================================ */

async function saveCurrentUser() {
  const input = document.getElementById('setting-username');
  if (!input) return;
  const val = input.value.trim();                                  // RAW
  if (!val) { showToast('Enter a name', 'warning'); return; }

  STATE.settings.currentUser = val;
  await DB.saveSettings();

  document.querySelectorAll('[data-current-user]').forEach((el) => {
    el.textContent = val;
  });

  showToast(`Saved as "${val}"`, 'success');
}

async function addAgent() {
  const input = document.getElementById('new-agent-input');
  if (!input) return;
  const val = input.value.trim();                                  // RAW
  if (!val) { showToast('Enter an agent name', 'warning'); return; }
  if (STATE.settings.agents.includes(val)) { showToast('Agent already exists', 'warning'); return; }

  STATE.settings.agents.push(val);
  await DB.saveSettings();
  input.value = '';
  Modules.Settings.render();
  showToast(`Agent "${val}" added`, 'success');
}

async function removeAgent(name) {
  const ok = await Confirm.ask({
    icon: '👤',
    title: 'Remove Agent',
    message: `Remove "${name}" from the list?`,
    okText: 'Remove',
    danger: true,
  });
  if (!ok) return;

  STATE.settings.agents = STATE.settings.agents.filter((a) => a !== name);
  await DB.saveSettings();
  Modules.Settings.render();
  showToast(`Agent "${name}" removed`, 'warning');
}

async function addProject() {
  const input = document.getElementById('new-project-input');
  if (!input) return;
  const val = input.value.trim();                                  // RAW
  if (!val) { showToast('Enter a project name', 'warning'); return; }
  if (STATE.settings.projects.includes(val)) { showToast('Project already exists', 'warning'); return; }

  STATE.settings.projects.push(val);
  await DB.saveSettings();
  input.value = '';
  Modules.Settings.render();
  showToast(`Project "${val}" added`, 'success');
}

async function removeProject(name) {
  const ok = await Confirm.ask({
    icon: '🏗',
    title: 'Remove Project',
    message: `Remove "${name}" from the list?`,
    okText: 'Remove',
    danger: true,
  });
  if (!ok) return;

  STATE.settings.projects = STATE.settings.projects.filter((p) => p !== name);
  await DB.saveSettings();
  Modules.Settings.render();
  showToast(`Project "${name}" removed`, 'warning');
}

async function saveWATemplates() {
  for (const stage of STAGES) {
    const el = document.getElementById(`wa-tpl-${stage.replace(/\s+/g, '_')}`);
    if (el) STATE.settings.waTemplates[stage] = el.value;          // RAW
  }
  await DB.saveSettings();
  showToast('Templates saved', 'success');
}

async function clearAllData() {
  const ok = await Confirm.ask({
    icon: '🗑',
    title: 'Clear All Data',
    message: 'This will permanently delete all leads, comments, and audit logs.',
    okText: 'Clear Everything',
    danger: true,
  });
  if (!ok) return;

  await DB.clearAll();
  Router.refresh();
  updateHeaderKPIs();
  showToast('All data cleared', 'warning');
}

/* ============================================================================
   19 · MIGRATION — Sanitize v1 → v2
   ============================================================================ */

async function migrateSanitizeV2() {
  const TARGET = 2;
  if (Number(STATE.settings._sanitizeV || 1) >= TARGET) return;

  console.log('[CRM] Running sanitize migration v1 → v2');
  let touched = 0;

  const LEAD_FIELDS = [
    'name', 'phone', 'email', 'agent', 'channel',
    'project', 'location', 'requirements', 'followUpNote',
  ];

  for (const lead of STATE.leads) {
    let changed = false;
    for (const f of LEAD_FIELDS) {
      if (typeof lead[f] === 'string' && lead[f]) {
        const d = Sanitize.decode(lead[f]);
        if (d !== lead[f]) { lead[f] = d; changed = true; }
      }
    }
    if (changed) {
      touched++;
      if (STATE.useIDB) await idbPut(STORES.LEADS, lead);
    }
  }
  if (!STATE.useIDB && touched) LSFallback.save('leads', STATE.leads);

  for (const arr of Object.values(STATE.comments)) {
    for (const c of arr) {
      let changed = false;
      if (typeof c.text === 'string') {
        const d = Sanitize.decode(c.text);
        if (d !== c.text) { c.text = d; changed = true; }
      }
      if (typeof c.author === 'string') {
        const d = Sanitize.decode(c.author);
        if (d !== c.author) { c.author = d; changed = true; }
      }
      if (changed) {
        touched++;
        if (STATE.useIDB) await idbPut(STORES.COMMENTS, c);
      }
    }
  }
  if (!STATE.useIDB) LSFallback.save('comments', STATE.comments);

  for (const arr of Object.values(STATE.auditLogs)) {
    for (const e of arr) {
      let changed = false;
      for (const k of ['action', 'agent']) {
        if (typeof e[k] === 'string' && e[k]) {
          const d = Sanitize.decode(e[k]);
          if (d !== e[k]) { e[k] = d; changed = true; }
        }
      }
      if (e.meta && typeof e.meta === 'object') {
        for (const k of ['text', 'preview', 'from', 'to', 'stage', 'name', 'datetime']) {
          if (typeof e.meta[k] === 'string') {
            const d = Sanitize.decode(e.meta[k]);
            if (d !== e.meta[k]) { e.meta[k] = d; changed = true; }
          }
        }
      }
      if (changed) {
        touched++;
        if (STATE.useIDB) await idbPut(STORES.AUDIT, e);
      }
    }
  }
  if (!STATE.useIDB) LSFallback.save('audit', STATE.auditLogs);

  if (typeof STATE.settings.currentUser === 'string') {
    STATE.settings.currentUser = Sanitize.decode(STATE.settings.currentUser);
  }
  STATE.settings.agents = (STATE.settings.agents || []).map((a) => Sanitize.decode(a));
  STATE.settings.projects = (STATE.settings.projects || []).map((p) => Sanitize.decode(p));
  if (STATE.settings.waTemplates && typeof STATE.settings.waTemplates === 'object') {
    for (const [k, v] of Object.entries(STATE.settings.waTemplates)) {
      if (typeof v === 'string') STATE.settings.waTemplates[k] = Sanitize.decode(v);
    }
  }

  STATE.settings._sanitizeV = TARGET;
  await DB.saveSettings();

  if (touched > 0) {
    console.log(`[CRM] Migrated ${touched} records`);
    showToast(`Migrated ${touched} records`, 'info');
  }
}

/* ============================================================================
   20 · DEMO SEED
   ============================================================================ */

async function seedDemoData() {
  const now = new Date();
  const offsetDays = (d) => {
    const x = new Date(now);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };

  const demo = [
    {
      name: 'Ahmed Hassan', phone: '+201012345678', email: 'ahmed.hassan@gmail.com',
      stage: 'Negotiation', agent: 'Youssef', channel: 'Meta Ads',
      project: 'Palm Hills', budget: 450000, location: 'Sheikh Zayed',
      priority: 'urgent',
      requirements: '3 bedrooms, ground floor, garden, near school',
      followUpDate: offsetDays(-1), followUpTime: '14:00',
      followUpNote: 'Discuss final pricing',
    },
    {
      name: 'Sara Mohamed', phone: '+201198765432', email: 'sara.m@outlook.com',
      stage: 'Meeting Scheduled', agent: 'Ahmed', channel: 'Referral',
      project: 'Madinaty', budget: 280000, location: 'New Cairo',
      priority: 'high',
      requirements: '2 bedrooms, high floor, pool view',
      followUpDate: offsetDays(0), followUpTime: '16:30',
      followUpNote: 'Site visit scheduled',
    },
    {
      name: 'Khalid Ibrahim', phone: '+201567890123', email: 'khalid.i@company.com',
      stage: 'Proposal Sent', agent: 'Sarah', channel: 'Cold Call',
      project: 'New Capital Tower', budget: 750000, location: 'New Administrative Capital',
      priority: 'high',
      requirements: 'Office space, min 200 sqm, corner unit',
      followUpDate: offsetDays(1), followUpTime: '11:00',
      followUpNote: 'Follow up on proposal review',
    },
    {
      name: 'Nour Ali', phone: '+201234567890', email: 'nour.ali@mail.com',
      stage: 'Contacted', agent: 'Mohamed', channel: 'WhatsApp',
      project: 'Hyde Park', budget: 320000, location: 'New Cairo',
      priority: 'medium',
      requirements: 'Family home, 4 bedrooms, private garden',
      followUpDate: offsetDays(7), followUpTime: '10:00',
      followUpNote: 'Send brochure and pricing',
    },
    {
      name: 'Layla Mansour', phone: '+201111222333', email: '',
      stage: 'New Lead', agent: 'Youssef', channel: 'Website',
      project: 'Mountain View', budget: 180000, location: '6th of October',
      priority: 'low',
      requirements: '1 bedroom studio, investment purpose',
      followUpDate: '', followUpTime: '',
    },
    {
      name: 'Omar Farouk', phone: '+201444555666', email: 'omar.f@biz.net',
      stage: 'Won', agent: 'Youssef', channel: 'Direct',
      project: 'Palm Hills', budget: 620000, location: 'Sheikh Zayed',
      priority: 'medium',
      requirements: 'Villa, 5 bedrooms, private pool',
      followUpDate: '', followUpTime: '',
    },
    {
      name: 'Dina Youssef', phone: '+201777888999', email: 'dina.y@gmail.com',
      stage: 'Lost', agent: 'Ahmed', channel: 'Meta Ads',
      project: 'Madinaty', budget: 200000, location: 'New Cairo',
      priority: 'low',
      requirements: 'Small apartment, near metro',
      followUpDate: '', followUpTime: '',
    },
  ];

  for (let i = 0; i < demo.length; i++) {
    const d = demo[i];
    const lead = {
      id: generateId(),
      ...d,
      slaHours: 24,
      createdAt: new Date(now.getTime() - 86400000 * (i + 1)).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    STATE.leads.push(lead);
    await DB.saveLead(lead);
    createAuditEntry(lead.id, 'lead_created', { name: lead.name, stage: lead.stage });
  }
}

/* ============================================================================
   21 · BOOT
   ============================================================================ */

async function boot() {
  // 1) Open persistence
  try {
    STATE.db = await openDatabase();
    STATE.useIDB = true;
  } catch (err) {
    console.warn('[CRM] IndexedDB unavailable, using LocalStorage:', err.message);
    STATE.useIDB = false;
  }

  // 2) Load all data
  try {
    await DB.loadAll();
  } catch (err) {
    console.error('[CRM] Load failed:', err);
    showToast('Warning: could not load saved data', 'error');
  }

  // 3) Migration
  await migrateSanitizeV2();

  // 4) Seed demo on empty DB
  if (STATE.leads.length === 0) {
    await seedDemoData();
  }

  // 5) Bind confirm handlers
  Confirm.bind();

  // 6) Global delegation
  installGlobalDelegation();

  // 7) Header user label
  document.querySelectorAll('[data-current-user]').forEach((el) => {
    el.textContent = STATE.settings.currentUser || 'User';
  });

  // 8) Initial KPI paint
  updateHeaderKPIs();

  // 9) Restore last view or default
  let startView = 'action-center';
  try {
    const saved = localStorage.getItem('ycrm8_last_view');
    if (saved && VIEW_META[saved]) startView = saved;
  } catch (_) { /* noop */ }

  Router.navigate(startView);

  // 10) Start global SLA tick for header badge
  if (STATE.slaTickTimer) clearInterval(STATE.slaTickTimer);
  STATE.slaTickTimer = setInterval(() => {
    updateHeaderKPIs();
  }, 5000);

  // 11) Reveal app
  const loading = document.getElementById('app-loading');
  const shell = document.getElementById('app-shell');
  if (loading) loading.style.display = 'none';
  if (shell) shell.classList.remove('is-hidden');

  STATE.booted = true;
  console.log('[CRM] Youssef Sales CRM v8 Enterprise booted ✓');
}

// Kick off
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}