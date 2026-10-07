/* ============================================================================
   OCTANE CRM — V8 Enterprise Edition
   app.js — Full application layer
   ---------------------------------------------------------------------------
   Sections
   1. Constants & defaults
   2. Sanitize v2 (encode-on-render, decode-on-migrate)
   3. Schema validator
   4. Utilities
   5. IndexedDB primitives
   6. LocalStorage fallback
   7. DB adapter + multi-tab sync
   8. STATE
   9. Theme controller
   10. Toast
   11. Modal
   12. Drawer
   13. Confirm
   14. Router
   15. dispatchAction + delegation
   16. Header updates (KPIs / user menu / notifications)
   17. Lead CRUD + audit + comments
   18. Users & RBAC
   19. Modules (ActionCenter, Pipeline, Inventory, CILRadar, Financial, Voice, Analytics, Users, Settings)
   20. Lead Interaction Drawer controller
   21. WhatsApp composer
   22. Import / Export
   23. Canvas chart helpers (HiDPI + roundRect + theme-aware)
   24. Migration
   25. Demo seed
   26. Boot
   ============================================================================ */

'use strict';

/* ============================================================================
   1 · CONSTANTS
   ============================================================================ */

const DB_NAME    = 'OctaneCRM_v8';
const DB_VERSION = 1;

const STORES = Object.freeze({
  LEADS    : 'leads',
  COMMENTS : 'comments',
  AUDIT    : 'audit_log',
  SETTINGS : 'settings',
  INVENTORY: 'inventory',
  USERS    : 'users',
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
  low: '#5a6178', medium: '#4f8ef7', high: '#f59e0b', urgent: '#ef4444',
});
const PRIORITY_LABEL = Object.freeze({
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
});

const CHANNELS = Object.freeze([
  'Meta Ads', 'WhatsApp', 'Referral', 'Cold Call',
  'Direct', 'Website', 'Email', 'Other',
]);

const ROLES = Object.freeze(['admin', 'team_leader', 'sales_rep']);
const ROLE_LABEL = Object.freeze({
  admin: 'Admin', team_leader: 'Team Leader', sales_rep: 'Sales Rep',
});
const USER_STATUSES = Object.freeze(['active', 'invited', 'suspended']);
const USER_STATUS_LABEL = Object.freeze({
  active: 'Active', invited: 'Invited', suspended: 'Suspended',
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze({
    viewAllLeads   : true,
    editLeads      : true,
    deleteLeads    : true,
    assignLeads    : true,
    sendWhatsApp   : true,
    manageUsers    : true,
    exportData     : true,
    clearData      : true,
    viewFinancials : true,
    manageSettings : true,
  }),
  team_leader: Object.freeze({
    viewAllLeads   : true,
    editLeads      : true,
    deleteLeads    : true,
    assignLeads    : true,
    sendWhatsApp   : true,
    manageUsers    : false,
    exportData     : true,
    clearData      : false,
    viewFinancials : true,
    manageSettings : false,
  }),
  sales_rep: Object.freeze({
    viewAllLeads   : false,
    editLeads      : true,
    deleteLeads    : false,
    assignLeads    : false,
    sendWhatsApp   : true,
    manageUsers    : false,
    exportData     : false,
    clearData      : false,
    viewFinancials : false,
    manageSettings : false,
  }),
});

const DISPOSITIONS = Object.freeze({
  answered    : { label: 'Answered',    icon: 'fa-phone-volume',       tone: 'ok',    stage: 'Contacted' },
  no_answer   : { label: 'No Answer',   icon: 'fa-phone-slash',        tone: 'warn',  stage: 'Contacted' },
  busy        : { label: 'Busy',        icon: 'fa-circle-xmark',       tone: 'warn',  stage: 'Contacted' },
  voicemail   : { label: 'Voicemail',   icon: 'fa-voicemail',          tone: 'warn',  stage: 'Contacted' },
  call_back   : { label: 'Call Back',   icon: 'fa-rotate-left',        tone: 'info',  stage: null        },
  wrong_number: { label: 'Wrong Number',icon: 'fa-triangle-exclamation',tone: 'danger',stage: null        },
  whatsapp    : { label: 'WhatsApp Sent',icon: 'fa-whatsapp',          tone: 'ok',    stage: 'Contacted' },
  meeting     : { label: 'Meeting Set', icon: 'fa-calendar-plus',      tone: 'info',  stage: 'Meeting Scheduled' },
});

const DEFAULT_WA_TEMPLATES = Object.freeze({
  'New Lead':
    "Hello {name}! 👋 Thank you for your interest. I'm {agent} from Octane Real Estate. I'd love to tell you more about our available properties. When would be a good time to chat?",
  'Contacted':
    "Hi {name}, following up on our conversation. I have some great properties that match your requirements. Shall we schedule a viewing this week?",
  'Meeting Scheduled':
    "Hi {name}! 📅 Just confirming our meeting. Looking forward to presenting you with the best options for your dream property. See you soon!",
  'Proposal Sent':
    "Hello {name}! 📄 I've sent over the proposal for {project}. Please take a look and let me know if you have any questions. I'm here to help!",
  'Negotiation':
    "Hi {name}, thank you for your counter-offer. I've spoken with our team and I'm confident we can find the best deal for you. Let's finalize this!",
  'Won':
    "🎉 Congratulations {name}! We're thrilled to welcome you to the {project} family. Our team will contact you with next steps. Welcome home!",
  'Lost':
    "Hi {name}, I understand your decision. If you ever reconsider or need real estate assistance in the future, please don't hesitate to reach out. All the best!",
});

const DEFAULT_SETTINGS = Object.freeze({
  agents        : ['Youssef Hassan', 'Sara Ahmed', 'Mohamed Ali', 'Layla Ibrahim'],
  projects      : ['Palm Hills', 'Madinaty', 'New Capital Tower', 'Hyde Park', 'Mountain View'],
  waTemplates   : { ...DEFAULT_WA_TEMPLATES },
  storageEngine : 'indexeddb',
  theme         : 'dark',
  _sanitizeV    : 2,
});

const DEFAULT_USERS = Object.freeze([
  {
    id: 'usr_admin', name: 'Youssef Hassan', email: 'youssef@octane.crm',
    role: 'admin', status: 'active', avatarUrl: '',
    phone: '+201000000001', password: '',
  },
  {
    id: 'usr_tl_sara', name: 'Sara Ahmed', email: 'sara@octane.crm',
    role: 'team_leader', status: 'active', avatarUrl: '',
    phone: '+201000000002', password: '',
  },
  {
    id: 'usr_rep_mohamed', name: 'Mohamed Ali', email: 'mohamed@octane.crm',
    role: 'sales_rep', status: 'active', avatarUrl: '',
    phone: '+201000000003', password: '',
  },
  {
    id: 'usr_rep_layla', name: 'Layla Ibrahim', email: 'layla@octane.crm',
    role: 'sales_rep', status: 'active', avatarUrl: '',
    phone: '+201000000004', password: '',
  },
]);

const VIEW_META = Object.freeze({
  'action-center'     : { title: 'Action Center',       subtitle: 'Real-time SLA monitoring' },
  'sales-pipeline'    : { title: 'Sales Pipeline',      subtitle: 'Kanban view of active deals' },
  'property-inventory': { title: 'Property Inventory',  subtitle: 'Available units & availability' },
  'cil-radar'         : { title: 'CIL Radar',           subtitle: 'Client intent & lead-scoring radar' },
  'financial-engine'  : { title: 'Financial Engine',    subtitle: 'Commissions, forecasts & revenue' },
  'ai-voice-simulator': { title: 'AI Voice Simulator',  subtitle: 'Practice calls against synthetic buyers' },
  'analytics'         : { title: 'Analytics',           subtitle: 'Performance insights across the pipeline' },
  'users'             : { title: 'User Management',     subtitle: 'Teams, roles & permissions' },
  'settings'          : { title: 'Settings',            subtitle: 'Preferences, agents & data management' },
});

const SLA_TICK_MS = 1000;
const AUTO_RESCHEDULE_HOURS = 4;

/* ============================================================================
   2 · SANITIZE
   ============================================================================ */

const Sanitize = (() => {
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;' };
  const REGEX = /[&<>"'`=/]/g;

  function encode(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(REGEX, (c) => MAP[c]);
  }
  function stripTags(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/<[^>]*>/g, '');
  }
  function text(value) { return encode(stripTags(value)); }
  function decode(value) {
    if (typeof value !== 'string' || value.length === 0) return value || '';
    try {
      const doc = new DOMParser().parseFromString(value, 'text/html');
      return doc.documentElement.textContent || '';
    } catch (_) { return value; }
  }
  function number(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function url(value) {
    try {
      const u = new URL(value);
      if (['https:', 'http:', 'tel:', 'mailto:', 'whatsapp:'].includes(u.protocol)) return u.href;
    } catch (_) { /* noop */ }
    return '#';
  }
  return { encode, stripTags, text, decode, number, url };
})();

const esc  = (v) => Sanitize.encode(v);
const escU = (v) => encodeURIComponent(String(v ?? ''));

/* ============================================================================
   3 · SCHEMA VALIDATOR
   ============================================================================ */

const SchemaValidator = (() => {
  const LEAD_REQUIRED = ['id', 'name', 'stage', 'createdAt'];
  const STAGE_SET = new Set(STAGES);
  const MAX_LEADS = 50000;

  function isObj(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }

  function lead(lead, idx) {
    if (!isObj(lead)) return `Lead[${idx}] must be an object`;
    for (const f of LEAD_REQUIRED) if (!(f in lead)) return `Lead[${idx}] missing "${f}"`;
    if (typeof lead.id !== 'string' || !lead.id.trim()) return `Lead[${idx}] id invalid`;
    if (typeof lead.name !== 'string' || !lead.name.trim()) return `Lead[${idx}] name invalid`;
    if (!STAGE_SET.has(lead.stage)) return `Lead[${idx}] invalid stage "${lead.stage}"`;
    if (Number.isNaN(Date.parse(lead.createdAt))) return `Lead[${idx}] createdAt invalid`;
    return null;
  }
  function commentsMap(map) {
    if (!isObj(map)) return 'comments must be an object';
    for (const [k, arr] of Object.entries(map)) {
      if (!Array.isArray(arr)) return `comments["${k}"] must be array`;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (!isObj(c) || !c.id || !c.author || !c.timestamp) return `comments["${k}"][${i}] invalid`;
      }
    }
    return null;
  }
  function auditMap(map) {
    if (!isObj(map)) return 'auditLogs must be an object';
    for (const [k, arr] of Object.entries(map)) {
      if (!Array.isArray(arr)) return `auditLogs["${k}"] must be array`;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!isObj(e) || !e.id || !e.action || !e.timestamp) return `auditLogs["${k}"][${i}] invalid`;
      }
    }
    return null;
  }
  function users(arr) {
    if (!Array.isArray(arr)) return 'users must be an array';
    for (let i = 0; i < arr.length; i++) {
      const u = arr[i];
      if (!isObj(u) || !u.id || !u.name || !u.email) return `users[${i}] invalid`;
      if (!ROLES.includes(u.role)) return `users[${i}] invalid role "${u.role}"`;
    }
    return null;
  }
  function validate(payload) {
    const errors = [];
    if (!isObj(payload)) return { valid: false, errors: ['Root must be an object'] };
    if (!payload.version) errors.push('Missing "version" at root');
    if (!payload.exportedAt) errors.push('Missing "exportedAt" at root');

    if (!Array.isArray(payload.leads)) {
      errors.push('"leads" must be an array');
    } else if (payload.leads.length > MAX_LEADS) {
      errors.push(`"leads" too large (${payload.leads.length} > ${MAX_LEADS})`);
    } else {
      const seen = new Set();
      payload.leads.forEach((l, i) => {
        const e = lead(l, i);
        if (e) errors.push(e);
        if (l && typeof l.id === 'string') {
          if (seen.has(l.id)) errors.push(`Duplicate lead id "${l.id}"`);
          seen.add(l.id);
        }
      });
    }
    if (payload.comments !== undefined) { const e = commentsMap(payload.comments); if (e) errors.push(e); }
    if (payload.auditLogs !== undefined) { const e = auditMap(payload.auditLogs); if (e) errors.push(e); }
    if (payload.users !== undefined) { const e = users(payload.users); if (e) errors.push(e); }
    return { valid: errors.length === 0, errors };
  }
  return { validate };
})();

/* ============================================================================
   4 · UTILITIES
   ============================================================================ */

function generateId(prefix = 'crm') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}_${r}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }
function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
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
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}
function formatDateTimeLocal(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / 86400000);
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Tomorrow at ${timeStr}`;
  if (diffDays === -1) return `Yesterday at ${timeStr}`;
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days at ${timeStr}`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago at ${timeStr}`;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${timeStr}`;
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
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('') || '?';
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
  catch (err) { console.error(`[Octane] ${label} failed:`, err); return null; }
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
function slaBandOf(lead) {
  const due = dueMsOf(lead);
  if (due === null) return 'none';
  const diff = due - Date.now();
  if (diff < 0) return 'breached';
  if (diff <= 60 * 60 * 1000) return 'critical';
  if (diff <= 4 * 60 * 60 * 1000) return 'warning';
  return 'ontrack';
}
function countdownOf(lead) {
  const due = dueMsOf(lead);
  if (due === null) return null;
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  return {
    diffMs: diff, overdue: diff < 0,
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    mins: Math.floor((abs % 3600000) / 60000),
    secs: Math.floor((abs % 60000) / 1000),
  };
}
function calcLeadScore(lead) {
  if (!lead) return 0;
  const stageScore = { 'New Lead': 10, 'Contacted': 25, 'Meeting Scheduled': 45, 'Proposal Sent': 60, 'Negotiation': 80, 'Won': 100, 'Lost': 0 }[lead.stage] || 0;
  let s = stageScore;
  if (Number(lead.budget) > 0) s += 10;
  if (lead.phone) s += 5;
  if (lead.email) s += 5;
  if (lead.project) s += 5;
  const cc = (STATE.comments[lead.id] || []).length;
  s += Math.min(cc * 2, 10);
  const sla = slaStatusOf(lead);
  if (sla === 'on-track') s += 5;
  if (sla === 'overdue') s -= 10;
  return Math.max(0, Math.min(100, s));
}
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ============================================================================
   5 · INDEXEDDB PRIMITIVES
   ============================================================================ */

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB unsupported')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.LEADS)) {
        const s = db.createObjectStore(STORES.LEADS, { keyPath: 'id' });
        s.createIndex('stage', 'stage', { unique: false });
        s.createIndex('agent', 'agent', { unique: false });
        s.createIndex('channel', 'channel', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.COMMENTS)) {
        const s = db.createObjectStore(STORES.COMMENTS, { keyPath: 'id' });
        s.createIndex('leadId', 'leadId', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.AUDIT)) {
        const s = db.createObjectStore(STORES.AUDIT, { keyPath: 'id' });
        s.createIndex('leadId', 'leadId', { unique: false });
        s.createIndex('agent', 'agent', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.INVENTORY)) {
        const s = db.createObjectStore(STORES.INVENTORY, { keyPath: 'id' });
        s.createIndex('project', 'project', { unique: false });
        s.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        const s = db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        s.createIndex('role', 'role', { unique: false });
        s.createIndex('status', 'status', { unique: false });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}
function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(store, record) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbClear(store) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbGetByIndex(store, index, value) {
  return new Promise((resolve, reject) => {
    const tx = STATE.db.transaction(store, 'readonly');
    const req = tx.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ============================================================================
   6 · LOCALSTORAGE FALLBACK
   ============================================================================ */

const LSFallback = (() => {
  const PREFIX = 'octane8_';
  const k = (n) => `${PREFIX}${n}`;
  function save(name, data) {
    try { localStorage.setItem(k(name), JSON.stringify(data)); return true; }
    catch (e) { console.error('[Octane] LS save failed:', e); return false; }
  }
  function load(name, fallback = null) {
    try {
      const raw = localStorage.getItem(k(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }
  function remove(name) { try { localStorage.removeItem(k(name)); } catch (_) { /* noop */ } }
  function clear() {
    try {
      Object.keys(localStorage).filter((x) => x.startsWith(PREFIX)).forEach((x) => localStorage.removeItem(x));
    } catch (_) { /* noop */ }
  }
  return { save, load, remove, clear };
})();

/* ============================================================================
   7 · DB ADAPTER + MULTI-TAB SYNC
   ============================================================================ */

const SELF_TAB_ID = generateId('tab');
const SYNC_KEY = 'octane8_sync';

const DB = {
  async saveLead(lead) {
    if (STATE.useIDB) await idbPut(STORES.LEADS, lead);
    else LSFallback.save('leads', STATE.leads);
    DB._broadcast('lead_changed', lead.id);
  },
  async deleteLead(leadId) {
    if (STATE.useIDB) {
      await idbDelete(STORES.LEADS, leadId);
      const c = await idbGetByIndex(STORES.COMMENTS, 'leadId', leadId);
      const a = await idbGetByIndex(STORES.AUDIT, 'leadId', leadId);
      for (const x of c) await idbDelete(STORES.COMMENTS, x.id);
      for (const x of a) await idbDelete(STORES.AUDIT, x.id);
    } else {
      LSFallback.save('leads', STATE.leads);
      LSFallback.save('comments', STATE.comments);
      LSFallback.save('audit', STATE.auditLogs);
    }
    DB._broadcast('lead_deleted', leadId);
  },
  async saveComment(comment) {
    if (STATE.useIDB) await idbPut(STORES.COMMENTS, comment);
    else LSFallback.save('comments', STATE.comments);
    DB._broadcast('comment_added', comment.leadId);
  },
  async saveAudit(entry) {
    if (STATE.useIDB) await idbPut(STORES.AUDIT, entry);
    else LSFallback.save('audit', STATE.auditLogs);
  },
  async saveSettings() {
    if (STATE.useIDB) await idbPut(STORES.SETTINGS, { key: 'main', ...STATE.settings });
    else LSFallback.save('settings', STATE.settings);
    DB._broadcast('settings_changed', null);
  },
  async saveUser(user) {
    if (STATE.useIDB) await idbPut(STORES.USERS, user);
    else LSFallback.save('users', STATE.users);
    DB._broadcast('user_changed', user.id);
  },
  async deleteUser(userId) {
    if (STATE.useIDB) await idbDelete(STORES.USERS, userId);
    else LSFallback.save('users', STATE.users);
    DB._broadcast('user_deleted', userId);
  },
  async loadAll() {
    if (STATE.useIDB) {
      const [leads, comments, audit, settingsArr, inventory, users] = await Promise.all([
        idbGetAll(STORES.LEADS),
        idbGetAll(STORES.COMMENTS),
        idbGetAll(STORES.AUDIT),
        idbGetAll(STORES.SETTINGS),
        idbGetAll(STORES.INVENTORY),
        idbGetAll(STORES.USERS),
      ]);

      STATE.leads = (leads || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      STATE.inventory = inventory || [];

      STATE.comments = {};
      for (const c of comments || []) {
        if (!STATE.comments[c.leadId]) STATE.comments[c.leadId] = [];
        STATE.comments[c.leadId].push(c);
      }
      for (const arr of Object.values(STATE.comments)) arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      STATE.auditLogs = {};
      for (const e of audit || []) {
        if (!STATE.auditLogs[e.leadId]) STATE.auditLogs[e.leadId] = [];
        STATE.auditLogs[e.leadId].push(e);
      }
      for (const arr of Object.values(STATE.auditLogs)) arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const sRow = (settingsArr || []).find((s) => s.key === 'main');
      if (sRow) {
        const { key, ...rest } = sRow;
        STATE.settings = { ...DEFAULT_SETTINGS, ...rest };
      }

      STATE.users = (users && users.length) ? users : [...DEFAULT_USERS];
    } else {
      STATE.leads = LSFallback.load('leads', []);
      STATE.comments = LSFallback.load('comments', {});
      STATE.auditLogs = LSFallback.load('audit', {});
      STATE.inventory = LSFallback.load('inventory', []);
      const s = LSFallback.load('settings', null);
      if (s) STATE.settings = { ...DEFAULT_SETTINGS, ...s };
      const u = LSFallback.load('users', null);
      STATE.users = (u && u.length) ? u : [...DEFAULT_USERS];
    }

    const storedId = LSFallback.load('currentUserId', null);
    if (storedId && STATE.users.some((u) => u.id === storedId)) {
      STATE.currentUserId = storedId;
    } else {
      STATE.currentUserId = STATE.users[0]?.id || DEFAULT_USERS[0].id;
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
      LSFallback.remove('leads');
      LSFallback.remove('comments');
      LSFallback.remove('audit');
      LSFallback.remove('inventory');
    }
    STATE.leads = [];
    STATE.comments = {};
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

      const ltx = STATE.db.transaction(STORES.LEADS, 'readwrite');
      const ls = ltx.objectStore(STORES.LEADS);
      for (const l of payload.leads || []) ls.put(l);
      await new Promise((r, j) => { ltx.oncomplete = r; ltx.onerror = () => j(ltx.error); });

      if (payload.comments) {
        const ctx = STATE.db.transaction(STORES.COMMENTS, 'readwrite');
        const cs = ctx.objectStore(STORES.COMMENTS);
        for (const arr of Object.values(payload.comments)) for (const c of arr) cs.put(c);
        await new Promise((r, j) => { ctx.oncomplete = r; ctx.onerror = () => j(ctx.error); });
      }
      if (payload.auditLogs) {
        const atx = STATE.db.transaction(STORES.AUDIT, 'readwrite');
        const as = atx.objectStore(STORES.AUDIT);
        for (const arr of Object.values(payload.auditLogs)) for (const e of arr) as.put(e);
        await new Promise((r, j) => { atx.oncomplete = r; atx.onerror = () => j(atx.error); });
      }
      if (payload.users && payload.users.length) {
        const utx = STATE.db.transaction(STORES.USERS, 'readwrite');
        const us = utx.objectStore(STORES.USERS);
        await new Promise((r) => { us.clear().onsuccess = r; });
        for (const u of payload.users) us.put(u);
        await new Promise((r, j) => { utx.oncomplete = r; utx.onerror = () => j(utx.error); });
      }
      if (payload.settings) await idbPut(STORES.SETTINGS, { key: 'main', ...payload.settings });
    } else {
      LSFallback.save('leads', payload.leads || []);
      LSFallback.save('comments', payload.comments || {});
      LSFallback.save('audit', payload.auditLogs || {});
      if (payload.users) LSFallback.save('users', payload.users);
      if (payload.settings) LSFallback.save('settings', payload.settings);
    }
    await DB.loadAll();
    DB._broadcast('bulk_import', null);
  },
  _broadcast(event, payload) {
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify({ event, payload, tabId: SELF_TAB_ID, ts: Date.now() }));
    } catch (_) { /* noop */ }
  },
};

/* ============================================================================
   8 · STATE
   ============================================================================ */

const STATE = {
  db            : null,
  useIDB        : false,
  leads         : [],
  comments      : {},
  auditLogs     : {},
  inventory     : [],
  users         : [],
  settings      : { ...DEFAULT_SETTINGS },
  currentUserId : DEFAULT_USERS[0].id,
  activeView    : 'action-center',
  activeLeadId  : null,
  slaTickTimer  : null,
  acTickTimer   : null,
  drawerLeadId  : null,
  importBuffer  : null,
  booted        : false,
  charts        : [],
};

function getCurrentUser() {
  return STATE.users.find((u) => u.id === STATE.currentUserId)
    || STATE.users[0]
    || { id: 'sys', name: 'System', role: 'admin', email: '', status: 'active' };
}
function currentPermissions() {
  const u = getCurrentUser();
  return ROLE_PERMISSIONS[u.role] || ROLE_PERMISSIONS.sales_rep;
}
function can(permission) {
  return Boolean(currentPermissions()[permission]);
}

/* ============================================================================
   9 · THEME CONTROLLER
   ============================================================================ */

const Theme = (() => {
  const KEY = 'octane8_theme';
  const ICONS = { dark: 'fa-moon', light: 'fa-sun' };

  function apply(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = `fa-solid ${ICONS[t]}`;
    try { localStorage.setItem(KEY, t); } catch (_) { /* noop */ }
  }

  function current() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    STATE.settings.theme = next;
    DB.saveSettings();
    // Re-render charts on view redraw
    Router.refresh();
  }

  function load() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) { /* noop */ }
    apply(saved || STATE.settings.theme || 'dark');
  }

  return { apply, current, toggle, load };
})();

/* ============================================================================
   10 · TOAST
   ============================================================================ */

const Toast = (() => {
  const ICONS = {
    success: 'fa-circle-check',
    error  : 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation',
    info   : 'fa-circle-info',
  };

  function host() { return document.getElementById('toast-host'); }

  function show(message, type = 'info', duration = 4000) {
    const container = host();
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast is-${type}`;
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

/* ============================================================================
   11 · MODAL
   ============================================================================ */

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
    if (STACK.length === 0 && !Drawer.isOpen('lead-interaction')) {
      document.body.style.overflow = '';
    }
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

/* ============================================================================
   12 · DRAWER
   ============================================================================ */

const Drawer = (() => {
  const MAP = {
    'lead-interaction': { panel: 'drawer-lead-interaction', backdrop: 'drawer-backdrop' },
  };

  function open(name) {
    const cfg = MAP[name];
    if (!cfg) return;
    document.getElementById(cfg.panel)?.classList.add('is-open');
    document.getElementById(cfg.backdrop)?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function close(name) {
    const cfg = MAP[name];
    if (!cfg) return;
    document.getElementById(cfg.panel)?.classList.remove('is-open');
    document.getElementById(cfg.backdrop)?.classList.remove('is-open');
    if (Modal.isOpen('modal-lead-form') === false
        && !document.querySelector('.modal-overlay.is-open')) {
      document.body.style.overflow = '';
    }
  }
  function isOpen(name) {
    const cfg = MAP[name];
    if (!cfg) return false;
    return document.getElementById(cfg.panel)?.classList.contains('is-open') || false;
  }
  return { open, close, isOpen };
})();

/* ============================================================================
   13 · CONFIRM
   ============================================================================ */

const Confirm = (() => {
  let resolver = null;

  function ask(options = {}) {
    const cfg = {
      icon: '⚠️',
      title: 'Are you sure?',
      message: 'This action cannot be undone.',
      okText: 'Confirm',
      cancelText: 'Cancel',
      danger: true,
      ...options,
    };

    setText('confirm-icon', cfg.icon);
    setText('modal-confirm-title', cfg.title);
    setText('confirm-message', cfg.message);
    setText('confirm-ok', cfg.okText);
    setText('confirm-cancel', cfg.cancelText);

    const okEl = document.getElementById('confirm-ok');
    if (okEl) {
      okEl.className = cfg.danger
        ? 'btn btn-danger'
        : 'btn btn-primary';
    }

    Modal.open('modal-confirm');

    return new Promise((resolve) => { resolver = resolve; });
  }

  function resolveWith(value) {
    if (resolver) {
      const fn = resolver;
      resolver = null;
      Modal.close('modal-confirm');
      fn(value);
    }
  }

  function bind() {
    document.getElementById('confirm-ok')?.addEventListener('click', () => resolveWith(true));
    document.getElementById('confirm-cancel')?.addEventListener('click', () => resolveWith(false));
    document.getElementById('modal-confirm')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-confirm') resolveWith(false);
    });
  }

  return { ask, bind };
})();

/* ============================================================================
   14 · ROUTER
   ============================================================================ */

const ROUTES = {
  'action-center'     : () => Modules.ActionCenter.render(),
  'sales-pipeline'    : () => Modules.Pipeline.render(),
  'property-inventory': () => Modules.Inventory.render(),
  'cil-radar'         : () => Modules.CILRadar.render(),
  'financial-engine'  : () => Modules.FinancialEngine.render(),
  'ai-voice-simulator': () => Modules.VoiceSimulator.render(),
  'analytics'         : () => Modules.Analytics.render(),
  'users'             : () => Modules.Users.render(),
  'settings'          : () => Modules.Settings.render(),
};

const Router = {
  current: null,

  navigate(view, options = {}) {
    if (!ROUTES[view]) view = 'action-center';

    const content = document.getElementById('main-content-view');
    if (!content) return;

    if (this.current && Modules[this.current]?.teardown) {
      safeRun(`teardown ${this.current}`, () => Modules[this.current].teardown());
    }

    content.setAttribute('aria-busy', 'true');
    content.innerHTML = '';
    content.scrollTop = 0;
    STATE.charts = [];

    document.querySelectorAll('[data-view]').forEach((el) => {
      const matches = el.dataset.view === view;
      el.classList.toggle('is-active', matches);
      if (matches) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });

    const meta = VIEW_META[view] || { title: 'CRM', subtitle: '' };
    setText('view-title', meta.title);
    setText('view-subtitle', meta.subtitle);

    try {
      ROUTES[view](options);
    } catch (err) {
      console.error(`[Octane] Route "${view}" failed:`, err);
      content.innerHTML = `
        <div class="view-container">
          <div class="surface-card p-8 text-center">
            <div class="text-3xl mb-3">💥</div>
            <h3 class="text-txt text-[15px] font-semibold mb-1">Something went wrong</h3>
            <p class="text-txt-secondary text-[13px]">${esc(err.message)}</p>
          </div>
        </div>`;
    }

    STATE.activeView = view;
    this.current = view;
    content.setAttribute('aria-busy', 'false');

    try { localStorage.setItem('octane8_last_view', view); } catch (_) { /* noop */ }
  },

  refresh() {
    if (this.current) this.navigate(this.current);
  },
};

/* ============================================================================
   15 · DISPATCH + GLOBAL DELEGATION
   ============================================================================ */

function dispatchAction(el, event) {
  const action = el.dataset.action;

  const handlers = {
    'toggle-mobile-sidebar': () => {
      const sb = document.getElementById('app-sidebar');
      if (sb) sb.classList.toggle('is-mobile-open');
    },
    'toggle-theme'         : () => Theme.toggle(),
    'toggle-notifications' : () => showToast('No new notifications', 'info'),
    'toggle-user-menu'     : () => toggleUserMenu(),
    'switch-user'          : () => switchCurrentUser(el.dataset.userId),
    'open-user-modal'      : () => openUserForm(el.dataset.userId || ''),
    'open-lead-form'       : () => openLeadForm(el.dataset.leadId || ''),
    'open-action-center'   : () => openLeadDrawer(el.dataset.leadId),
    'delete-lead'          : () => deleteLead(el.dataset.leadId),
    'change-stage'         : () => changeLeadStage(el.dataset.leadId, el.dataset.stage),
    'save-lead-form'       : () => saveLeadFromForm(),
    'send-whatsapp'        : () => sendWhatsApp(),
    'open-import-picker'   : () => openImportPicker(),
    'confirm-import'       : () => confirmImport(),
    'close-drawer'         : () => closeLeadDrawer(),

    'lead-disposition'     : () => applyDisposition(el.dataset.value),
    'lead-followup'        : () => applyQuickFollowup(el.dataset.value),
    'lead-followup-custom' : () => openCustomFollowupPrompt(),
    'drawer-add-note'      : () => submitDrawerNote(),
    'drawer-call'          : () => startCallAction(),
    'drawer-whatsapp'      : () => { const id = STATE.drawerLeadId; if (id) openWhatsAppModal(id); },
    'drawer-email'         : () => startEmailAction(),
    'drawer-edit'          : () => { const id = STATE.drawerLeadId; if (id) openLeadForm(id); },
    'drawer-view-full-audit': () => { const id = STATE.drawerLeadId; if (id) viewFullAuditPrompt(id); },

    'sla-filter'           : () => Modules.ActionCenter.setFilter({ band: el.dataset.band || 'all' }),
    'sla-refresh'          : () => Modules.ActionCenter.refresh(),

    'uf-upload-avatar'     : () => document.getElementById('uf-avatar-input')?.click(),
    'uf-clear-avatar'      : () => clearUserAvatar(),
    'uf-toggle-password'   : () => toggleUserPasswordVisibility(),
    'save-user-form'       : () => saveUserFromForm(),
    'delete-user'          : () => deleteUserFromForm(),

    'settings-export'      : () => exportData(),
    'settings-import'      : () => openImportModal(),
    'settings-clear'       : () => clearAllData(),
    'settings-save-user'   : () => showToast('Update your profile in User Management', 'info'),
    'settings-add-agent'   : () => addAgent(),
    'settings-add-project' : () => addProject(),
    'settings-save-wa'     : () => saveWATemplates(),
    'settings-remove-agent': () => removeAgent(el.dataset.agent),
    'settings-remove-project': () => removeProject(el.dataset.project),
  };

  const fn = handlers[action];
  if (!fn) return false;
  safeRun(`action "${action}"`, fn);
  return true;
}

function installGlobalDelegation() {
  // Clicks
  document.addEventListener('click', (e) => {
    // Close dropdowns on outside click
    const userMenu = document.getElementById('user-menu');
    const userBtn = e.target.closest('[data-action="toggle-user-menu"]');
    if (userMenu && userMenu.classList.contains('is-open') && !userBtn && !e.target.closest('#user-menu')) {
      userMenu.classList.remove('is-open');
      const trigger = document.querySelector('[data-action="toggle-user-menu"]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    // Nav
    const navEl = e.target.closest('[data-view]');
    if (navEl) {
      e.preventDefault();
      Router.navigate(navEl.dataset.view);
      return;
    }

    // Modal close
    const closeEl = e.target.closest('[data-modal-close]');
    if (closeEl) {
      e.preventDefault();
      Modal.close(closeEl.dataset.modalClose);
      return;
    }

    // Overlay click
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('is-open')) {
      Modal.close(e.target.id);
      return;
    }

    // Lead form tabs
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      e.preventDefault();
      switchFormTab(tabBtn.dataset.tab);
      return;
    }

    // Action
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      if (dispatchAction(actionEl, e)) e.preventDefault();
      return;
    }
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '');

    if (e.key === 'Escape') {
      // Close drawer first if open
      if (Drawer.isOpen('lead-interaction')) { closeLeadDrawer(); return; }
      Modal.closeTop();
      return;
    }

    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('global-search')?.focus();
      return;
    }
    if (cmd && e.key.toLowerCase() === 'n' && !inField) {
      e.preventDefault();
      openLeadForm();
      return;
    }
    if (cmd && e.key === '1') { e.preventDefault(); Router.navigate('sales-pipeline'); return; }
    if (cmd && e.key === '2') { e.preventDefault(); Router.navigate('cil-radar'); return; }
    if (cmd && e.key === ',') { e.preventDefault(); Router.navigate('settings'); return; }

    // ⌘↵ in drawer composer
    if (cmd && e.key === 'Enter' && e.target.id === 'drawer-note-input') {
      e.preventDefault();
      submitDrawerNote();
    }
  });

  // Multi-tab sync
  window.addEventListener('storage', async (e) => {
    if (e.key !== SYNC_KEY) return;
    try {
      const msg = JSON.parse(e.newValue);
      if (!msg || msg.tabId === SELF_TAB_ID) return;

      setSyncStatus('syncing');
      await DB.loadAll();
      refreshUserChrome();
      if (STATE.booted) Router.refresh();
      updateHeaderKPIs();

      // Refresh open drawer if the affected lead is shown
      if (STATE.drawerLeadId && Drawer.isOpen('lead-interaction')) {
        const lead = findLead(STATE.drawerLeadId);
        if (lead) renderDrawerLead(lead);
        else closeLeadDrawer();
      }

      setTimeout(() => setSyncStatus('live'), 900);
    } catch (_) { /* noop */ }
  });

  // Global search
  const search = document.getElementById('global-search');
  if (search) {
    search.addEventListener('input', debounce(() => {
      const q = search.value.trim();
      Modules.ActionCenter.setFilter?.({ search: q });
      Modules.Pipeline.setFilter?.({ search: q });
      if (STATE.activeView === 'action-center') Modules.ActionCenter.refresh();
      if (STATE.activeView === 'sales-pipeline') Modules.Pipeline.refresh();
    }, 220));
  }

  // User avatar upload
  const avatarInput = document.getElementById('uf-avatar-input');
  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showToast('Max 2MB', 'warning'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => { setUserAvatarPreview(ev.target.result); };
      reader.readAsDataURL(file);
    });
  }

  // Role change → update permissions preview
  const roleSel = document.getElementById('uf-role');
  if (roleSel) roleSel.addEventListener('change', updatePermissionsPreview);

  // Import file input
  const importInput = document.getElementById('import-file-input');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleImportFile(file);
    });
  }
}

function switchFormTab(tabId) {
  document.querySelectorAll('[data-tab]').forEach((b) => {
    const active = b.dataset.tab === tabId;
    b.classList.toggle('border-accent', active);
    b.classList.toggle('text-accent', active);
    b.classList.toggle('border-transparent', !active);
    b.classList.toggle('text-txt-secondary', !active);
  });
  document.querySelectorAll('[data-tab-panel]').forEach((p) => {
    p.classList.toggle('is-hidden', p.dataset.tabPanel !== tabId);
  });
}

/* ============================================================================
   16 · HEADER UPDATES
   ============================================================================ */

function updateHeaderKPIs() {
  const leads = STATE.leads || [];
  const active = leads.filter((l) => l.stage !== 'Won' && l.stage !== 'Lost');
  const pipelineValue = active.reduce((s, l) => s + (Number(l.budget) || 0), 0);
  const overdue = leads.filter((l) => slaStatusOf(l) === 'overdue').length;
  const won = leads.filter((l) => l.stage === 'Won').length;
  const closed = leads.filter((l) => l.stage === 'Won' || l.stage === 'Lost').length;
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
  const hot = leads.filter((l) => calcLeadScore(l) >= 70).length;

  setText('hdr-kpi-pipeline', formatMoney(pipelineValue));
  setText('hdr-kpi-overdue', String(overdue));
  setText('hdr-kpi-winrate', `${winRate}%`);
  setText('hdr-kpi-hot', String(hot));

  const badge = document.querySelector('[data-badge="sla-critical"]');
  if (badge) {
    const critical = leads.filter((l) => {
      const b = slaBandOf(l);
      return b === 'critical' || b === 'breached';
    }).length;
    badge.textContent = String(critical);
    badge.style.display = critical > 0 ? '' : 'none';
  }

  const dot = document.getElementById('notification-dot');
  if (dot) dot.classList.toggle('is-hidden', overdue === 0);
}

function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot || !label) return;
  dot.classList.remove('animate-ringPulse', 'animate-pulseSoft');
  if (status === 'syncing') {
    dot.style.background = 'var(--warn)';
    label.textContent = 'Syncing…';
    dot.classList.add('animate-pulseSoft');
  } else if (status === 'error') {
    dot.style.background = 'var(--danger)';
    label.textContent = 'Error';
  } else {
    dot.style.background = 'var(--ok)';
    label.textContent = 'Live';
    dot.classList.add('animate-ringPulse');
  }
}

function refreshUserChrome() {
  const user = getCurrentUser();
  const initials = initialsOf(user.name);

  document.querySelectorAll('[data-current-user-name]').forEach((el) => { el.textContent = user.name; });
  document.querySelectorAll('[data-current-user-role]').forEach((el) => { el.textContent = ROLE_LABEL[user.role] || user.role; });
  document.querySelectorAll('[data-current-user-avatar]').forEach((el) => {
    if (user.avatarUrl) {
      el.style.backgroundImage = `url(${user.avatarUrl})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = initials;
    }
  });

  const menuList = document.getElementById('user-menu-list');
  if (menuList) {
    menuList.innerHTML = STATE.users.map((u) => {
      const active = u.id === STATE.currentUserId;
      const initials2 = initialsOf(u.name);
      const avatarStyle = u.avatarUrl
        ? `background-image:url(${u.avatarUrl});background-size:cover;background-position:center;`
        : '';
      return `
        <button type="button"
                class="dropdown-item ${active ? 'text-accent' : ''}"
                data-action="switch-user"
                data-user-id="${esc(u.id)}"
                role="menuitem">
          <span class="avatar avatar-sm" style="${avatarStyle}">${u.avatarUrl ? '' : esc(initials2)}</span>
          <span class="flex-1 min-w-0">
            <span class="block truncate">${esc(u.name)}</span>
            <span class="block text-[10px] text-txt-muted truncate">${esc(ROLE_LABEL[u.role] || u.role)}</span>
          </span>
          ${active ? '<i class="fa-solid fa-check text-accent text-[11px]" aria-hidden="true"></i>' : ''}
        </button>`;
    }).join('');
  }
}

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  const trigger = document.querySelector('[data-action="toggle-user-menu"]');
  if (!menu) return;
  const open = menu.classList.toggle('is-open');
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function switchCurrentUser(userId) {
  const user = STATE.users.find((u) => u.id === userId);
  if (!user) return;

  STATE.currentUserId = user.id;
  LSFallback.save('currentUserId', user.id);
  refreshUserChrome();

  const menu = document.getElementById('user-menu');
  if (menu) menu.classList.remove('is-open');

  showToast(`Switched to ${user.name} (${ROLE_LABEL[user.role]})`, 'success');
}

/* ============================================================================
   17 · LEAD CRUD
   ============================================================================ */

function findLead(id) {
  return STATE.leads.find((l) => l.id === id) || null;
}

function createAuditEntry(leadId, action, meta = {}) {
  const u = getCurrentUser();
  const entry = {
    id: generateId('aud'),
    leadId,
    action: String(action || 'action'),
    agent: u.name,
    userId: u.id,
    timestamp: new Date().toISOString(),
    meta,
  };
  if (!STATE.auditLogs[leadId]) STATE.auditLogs[leadId] = [];
  STATE.auditLogs[leadId].unshift(entry);
  DB.saveAudit(entry);
  return entry;
}

const AUDIT_ICONS = {
  lead_created : '🌱',
  lead_edited  : '✏️',
  lead_deleted : '🗑',
  stage_change : '🔄',
  comment_added: '💬',
  followup_set : '📅',
  whatsapp_sent: '📱',
  note_added   : '📝',
  call_answered: '📞',
  call_missed  : '❌',
  call_busy    : '⏳',
  call_vm      : '📼',
  call_back    : '🔁',
  call_wrong   : '⚠️',
  meeting_set  : '📆',
  snooze       : '💤',
  user_created : '👤',
  user_updated : '✏️',
  user_deleted : '🗑',
  default      : '📋',
};
function auditIcon(action) { return AUDIT_ICONS[action] || AUDIT_ICONS.default; }

function buildAuditLine(entry) {
  const who = `<strong>${esc(entry.agent || 'System')}</strong>`;
  const meta = entry.meta || {};
  switch (entry.action) {
    case 'lead_created': return `${who} created this lead as <strong>${esc(meta.stage || 'New Lead')}</strong>`;
    case 'stage_change': return `${who} moved stage from <strong>${esc(meta.from || '—')}</strong> → <strong>${esc(meta.to || '—')}</strong>`;
    case 'comment_added': return `${who} added a note`;
    case 'note_added':   return `${who} added a quick note`;
    case 'followup_set': return `${who} scheduled follow-up for <strong>${esc(meta.datetime || '—')}</strong>`;
    case 'whatsapp_sent':return `${who} sent a WhatsApp message`;
    case 'lead_edited':  return `${who} updated the lead details`;
    case 'snooze':       return `${who} snoozed the follow-up by ${esc(meta.hours || '—')}h`;
    case 'lead_deleted': return `${who} deleted the lead`;
    case 'call_answered':return `${who} logged: <strong>Answered</strong>`;
    case 'call_missed':  return `${who} logged: <strong>No Answer</strong>${meta.attempt ? ` (attempt #${esc(meta.attempt)})` : ''}`;
    case 'call_busy':    return `${who} logged: <strong>Busy</strong>`;
    case 'call_vm':      return `${who} logged: <strong>Voicemail</strong>`;
    case 'call_back':    return `${who} logged: <strong>Call Back</strong>`;
    case 'call_wrong':   return `${who} logged: <strong>Wrong Number</strong>`;
    case 'meeting_set':  return `${who} scheduled a <strong>meeting</strong> for ${esc(meta.datetime || '—')}`;
    case 'user_created': return `${who} added a new team member: <strong>${esc(meta.name || '')}</strong>`;
    case 'user_updated': return `${who} updated team member: <strong>${esc(meta.name || '')}</strong>`;
    case 'user_deleted': return `${who} removed team member: <strong>${esc(meta.name || '')}</strong>`;
    default: return `${who} performed ${esc(entry.action)}`;
  }
}

function buildLeadFromForm() {
  const id = document.getElementById('lf-id')?.value || '';
  const name = (document.getElementById('lf-name')?.value || '').trim();
  if (!name) return { error: 'Lead name is required' };

  const existing = id ? findLead(id) : null;
  const now = new Date().toISOString();

  const lead = {
    id: existing ? existing.id : generateId('lead'),
    name,
    phone: (document.getElementById('lf-phone')?.value || '').trim(),
    email: (document.getElementById('lf-email')?.value || '').trim(),
    stage: document.getElementById('lf-stage')?.value || 'New Lead',
    agent: document.getElementById('lf-agent')?.value || '',
    channel: document.getElementById('lf-channel')?.value || 'Direct',
    project: document.getElementById('lf-project')?.value || '',
    budget: Sanitize.number(document.getElementById('lf-budget')?.value, 0),
    location: (document.getElementById('lf-location')?.value || '').trim(),
    priority: document.getElementById('lf-priority')?.value || 'medium',
    requirements: (document.getElementById('lf-requirements')?.value || '').trim(),
    followUpDate: document.getElementById('lf-followup-date')?.value || '',
    followUpTime: document.getElementById('lf-followup-time')?.value || '',
    followUpNote: (document.getElementById('lf-followup-note')?.value || '').trim(),
    slaHours: Sanitize.number(document.getElementById('lf-sla-hours')?.value, 24),
    attempts: existing ? (existing.attempts || 0) : 0,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  return { error: null, lead, existing };
}

async function saveLeadFromForm() {
  const { error, lead, existing } = buildLeadFromForm();
  if (error) { showToast(error, 'warning'); return; }

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
        id: generateId('cmt'),
        leadId: lead.id,
        text: initialNote,
        author: getCurrentUser().name,
        timestamp: new Date().toISOString(),
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
  const lead = leadId ? findLead(leadId) : null;

  if (!can('editLeads') && lead) { showToast('You cannot edit leads', 'warning'); return; }

  setText('modal-lead-form-title', lead ? `Edit — ${lead.name}` : 'New Lead');

  // Fill dropdowns
  const stageSel = document.getElementById('lf-stage');
  if (stageSel) {
    stageSel.innerHTML = STAGES.map((s) =>
      `<option value="${esc(s)}" ${lead?.stage === s ? 'selected' : ''}>${STAGE_EMOJI[s]} ${esc(s)}</option>`).join('');
  }
  const agentSel = document.getElementById('lf-agent');
  if (agentSel) {
    agentSel.innerHTML = `<option value="">— Unassigned —</option>` +
      STATE.users.map((u) => `<option value="${esc(u.name)}" ${lead?.agent === u.name ? 'selected' : ''}>${esc(u.name)} (${esc(ROLE_LABEL[u.role])})</option>`).join('');
  }
  const channelSel = document.getElementById('lf-channel');
  if (channelSel) {
    channelSel.innerHTML = CHANNELS.map((c) =>
      `<option value="${esc(c)}" ${lead?.channel === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }
  const projSel = document.getElementById('lf-project');
  if (projSel) {
    projSel.innerHTML = `<option value="">— Select —</option>` +
      STATE.settings.projects.map((p) => `<option value="${esc(p)}" ${lead?.project === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
  }

  // Populate values
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('lf-id', lead?.id || '');
  set('lf-name', lead?.name || '');
  set('lf-phone', lead?.phone || '');
  set('lf-email', lead?.email || '');
  set('lf-budget', lead?.budget || '');
  set('lf-location', lead?.location || '');
  set('lf-priority', lead?.priority || 'medium');
  set('lf-requirements', lead?.requirements || '');
  set('lf-note', '');
  set('lf-sla-hours', lead?.slaHours || 24);
  set('lf-followup-note', lead?.followUpNote || '');

  const defaultDate = lead?.followUpDate || (() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
  })();
  set('lf-followup-date', defaultDate);
  set('lf-followup-time', lead?.followUpTime || '10:00');

  switchFormTab('lead-form-basic');
  Modal.open('modal-lead-form');
  setTimeout(() => document.getElementById('lf-name')?.focus(), 60);
}

async function deleteLead(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  if (!can('deleteLeads')) { showToast('You cannot delete leads', 'warning'); return; }

  const ok = await Confirm.ask({
    icon: '🗑', title: 'Delete Lead',
    message: `Permanently delete "${lead.name}" and all related data?`,
    okText: 'Delete', danger: true,
  });
  if (!ok) return;

  STATE.leads = STATE.leads.filter((l) => l.id !== leadId);
  delete STATE.comments[leadId];
  delete STATE.auditLogs[leadId];
  await DB.deleteLead(leadId);

  if (STATE.drawerLeadId === leadId) closeLeadDrawer();

  Router.refresh();
  updateHeaderKPIs();
  showToast(`Lead "${lead.name}" deleted`, 'warning');
}

async function changeLeadStage(leadId, newStage) {
  const lead = findLead(leadId);
  if (!lead || !STAGES.includes(newStage) || lead.stage === newStage) return;
  if (!can('editLeads')) { showToast('No permission', 'warning'); return; }

  const from = lead.stage;
  lead.stage = newStage;
  lead.updatedAt = new Date().toISOString();
  await DB.saveLead(lead);

  createAuditEntry(leadId, 'stage_change', { from, to: newStage });

  Router.refresh();
  updateHeaderKPIs();
  if (STATE.drawerLeadId === leadId) renderDrawerLead(lead);
  showToast(`Stage → ${newStage}`, 'success');
}

async function addComment(leadId, rawText, opts = {}) {
  const text = String(rawText || '').trim();
  if (!text) return false;

  const u = getCurrentUser();
  const comment = {
    id: generateId('cmt'),
    leadId,
    text,
    author: u.name,
    userId: u.id,
    timestamp: new Date().toISOString(),
  };
  if (!STATE.comments[leadId]) STATE.comments[leadId] = [];
  STATE.comments[leadId].unshift(comment);
  await DB.saveComment(comment);

  if (!opts.silent) createAuditEntry(leadId, 'comment_added', {});
  return true;
}

/* ============================================================================
   18 · USERS & RBAC
   ============================================================================ */

let _pendingAvatarDataUrl = null;

function openUserForm(userId = '') {
  if (!can('manageUsers')) { showToast('Only admins can manage users', 'warning'); return; }

  const user = userId ? STATE.users.find((u) => u.id === userId) : null;
  setText('modal-user-form-title', user ? `Edit — ${user.name}` : 'Add Team Member');

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('uf-id', user?.id || '');
  set('uf-name', user?.name || '');
  set('uf-email', user?.email || '');
  set('uf-role', user?.role || 'sales_rep');
  set('uf-status', user?.status || 'active');
  set('uf-password', '');

  const delBtn = document.getElementById('uf-delete-btn');
  if (delBtn) delBtn.classList.toggle('hidden', !user);

  const errEl = document.getElementById('uf-errors');
  if (errEl) { errEl.classList.add('is-hidden'); errEl.textContent = ''; }

  _pendingAvatarDataUrl = user?.avatarUrl || null;
  setUserAvatarPreview(user?.avatarUrl || null);
  updatePermissionsPreview();

  Modal.open('modal-user-form');
  setTimeout(() => document.getElementById('uf-name')?.focus(), 60);
}

function setUserAvatarPreview(url) {
  const el = document.getElementById('uf-avatar-preview');
  if (!el) return;
  if (url) {
    el.style.backgroundImage = `url(${url})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    const name = document.getElementById('uf-name')?.value || '';
    el.textContent = initialsOf(name || '?');
  }
}

function clearUserAvatar() {
  _pendingAvatarDataUrl = null;
  setUserAvatarPreview(null);
}

function toggleUserPasswordVisibility() {
  const input = document.getElementById('uf-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function updatePermissionsPreview() {
  const role = document.getElementById('uf-role')?.value || 'sales_rep';
  const perms = ROLE_PERMISSIONS[role] || {};
  const el = document.getElementById('uf-permissions');
  if (!el) return;

  const items = [
    { label: 'View & manage all leads', on: perms.viewAllLeads },
    { label: 'Create / edit leads', on: perms.editLeads },
    { label: 'Delete leads', on: perms.deleteLeads },
    { label: 'Assign leads to reps', on: perms.assignLeads },
    { label: 'Send WhatsApp messages', on: perms.sendWhatsApp },
    { label: 'View financial reports', on: perms.viewFinancials },
    { label: 'Manage users & roles', on: perms.manageUsers },
    { label: 'Export data', on: perms.exportData },
    { label: 'Clear all data', on: perms.clearData },
  ];

  el.innerHTML = `<ul class="space-y-1">
    ${items.map((i) => `
      <li>
        <i class="fa-solid ${i.on ? 'fa-check text-ok' : 'fa-xmark text-danger'} mr-1.5" aria-hidden="true"></i>
        ${esc(i.label)}
      </li>`).join('')}
  </ul>`;
}

async function saveUserFromForm() {
  if (!can('manageUsers')) { showToast('No permission', 'warning'); return; }

  const id = document.getElementById('uf-id')?.value || '';
  const name = (document.getElementById('uf-name')?.value || '').trim();
  const email = (document.getElementById('uf-email')?.value || '').trim();
  const role = document.getElementById('uf-role')?.value || 'sales_rep';
  const status = document.getElementById('uf-status')?.value || 'active';
  const password = document.getElementById('uf-password')?.value || '';

  const errors = [];
  if (!name) errors.push('Name is required');
  if (!email) errors.push('Email is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email is invalid');
  if (!ROLES.includes(role)) errors.push('Role is invalid');
  if (!USER_STATUSES.includes(status)) errors.push('Status is invalid');
  if (!id && password.length < 8) errors.push('Temporary password must be at least 8 characters');

  // Prevent duplicate email
  const dup = STATE.users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== id);
  if (dup) errors.push('A user with this email already exists');

  const errEl = document.getElementById('uf-errors');
  if (errors.length) {
    if (errEl) {
      errEl.classList.remove('is-hidden');
      errEl.textContent = errors.join(' • ');
    }
    return;
  }
  if (errEl) { errEl.classList.add('is-hidden'); errEl.textContent = ''; }

  const existing = id ? STATE.users.find((u) => u.id === id) : null;
  const now = new Date().toISOString();

  const user = existing ? { ...existing } : {
    id: generateId('usr'),
    createdAt: now,
  };
  user.name = name;
  user.email = email;
  user.role = role;
  user.status = status;
  user.avatarUrl = _pendingAvatarDataUrl || '';
  if (!existing) user.password = password;
  user.updatedAt = now;

  if (existing) {
    const idx = STATE.users.findIndex((u) => u.id === existing.id);
    if (idx > -1) STATE.users[idx] = user;
    createAuditEntry(existing.id, 'user_updated', { name: user.name });
    showToast(`Updated "${user.name}"`, 'success');
  } else {
    STATE.users.push(user);
    createAuditEntry(user.id, 'user_created', { name: user.name });
    showToast(`Added "${user.name}"`, 'success');
  }

  await DB.saveUser(user);
  Modal.close('modal-user-form');
  refreshUserChrome();

  if (STATE.activeView === 'users') Modules.Users.render();
}

async function deleteUserFromForm() {
  const id = document.getElementById('uf-id')?.value || '';
  const user = STATE.users.find((u) => u.id === id);
  if (!user) return;

  if (STATE.users.length <= 1) { showToast('Cannot delete the last user', 'warning'); return; }
  if (user.id === STATE.currentUserId) { showToast('You cannot delete your own account', 'warning'); return; }

  const ok = await Confirm.ask({
    icon: '🗑', title: 'Delete User',
    message: `Remove "${user.name}" from the team?`,
    okText: 'Delete', danger: true,
  });
  if (!ok) return;

  STATE.users = STATE.users.filter((u) => u.id !== id);
  createAuditEntry(id, 'user_deleted', { name: user.name });
  await DB.deleteUser(id);

  if (STATE.currentUserId === id) {
    STATE.currentUserId = STATE.users[0].id;
    LSFallback.save('currentUserId', STATE.currentUserId);
  }

  Modal.close('modal-user-form');
  refreshUserChrome();
  if (STATE.activeView === 'users') Modules.Users.render();
  showToast(`Deleted "${user.name}"`, 'warning');
}

/* ============================================================================
   19 · MODULES
   ============================================================================ */

const Modules = {};

/* ----------------------------------------------------------------------------
   19.1 · ACTION CENTER
   ---------------------------------------------------------------------------- */

Modules.ActionCenter = (() => {
  const BANDS = [
    { id: 'breached', label: 'Breached', icon: 'fa-fire',                 tone: 'danger' },
    { id: 'critical', label: 'Critical', icon: 'fa-triangle-exclamation', tone: 'critical' },
    { id: 'warning',  label: 'Warning',  icon: 'fa-hourglass-half',       tone: 'warn' },
    { id: 'ontrack',  label: 'On Track', icon: 'fa-circle-check',         tone: 'ok' },
    { id: 'all',      label: 'All',      icon: 'fa-layer-group',          tone: 'muted' },
  ];

  let filter = { band: 'all', search: '' };
  let tickTimer = null;
  let lastKey = '';

  function snapshot() {
    return STATE.leads
      .filter((l) => l.stage !== 'Won' && l.stage !== 'Lost')
      .map((l) => ({ lead: l, band: slaBandOf(l), cd: countdownOf(l), score: calcLeadScore(l) }))
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
    const order = { breached: 0, critical: 1, warning: 2, ontrack: 3 };
    return rows.slice().sort((a, b) => {
      const oa = order[a.band] ?? 4, ob = order[b.band] ?? 4;
      if (oa !== ob) return oa - ob;
      return (a.cd?.diffMs ?? Infinity) - (b.cd?.diffMs ?? Infinity);
    });
  }
  function statsOf(rows) {
    const s = { breached: 0, critical: 0, warning: 0, ontrack: 0, all: rows.length };
    for (const r of rows) if (s[r.band] !== undefined) s[r.band]++;
    return s;
  }
  function fmtCd(cd) {
    if (!cd) return '—';
    const d = cd.days > 0 ? `${cd.days}d ` : '';
    const core = `${pad2(cd.hours)}:${pad2(cd.mins)}:${pad2(cd.secs)}`;
    return cd.overdue ? `▲ ${d}${core}` : `${d}${core}`;
  }
  function bandPalette(band) {
    return {
      breached: { c: '#ff5d5d', bg: 'rgba(255,93,93,0.05)',  b: 'rgba(255,93,93,0.28)',  label: 'BREACHED' },
      critical: { c: '#ff7a45', bg: 'rgba(255,122,69,0.05)', b: 'rgba(255,122,69,0.28)', label: 'CRITICAL' },
      warning : { c: '#ffb648', bg: 'rgba(255,182,72,0.05)', b: 'rgba(255,182,72,0.28)', label: 'WARNING' },
      ontrack : { c: '#4ade80', bg: 'rgba(74,222,128,0.04)', b: 'rgba(74,222,128,0.22)', label: 'ON TRACK' },
    }[band] || { c: '#8a91a6', bg: 'transparent', b: 'rgba(255,255,255,0.06)', label: '—' };
  }

  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const rows = snapshot();
    const stats = statsOf(rows);
    lastKey = rows.map((r) => `${r.lead.id}:${r.band}`).join('|');

    content.innerHTML = `
      <div class="view-container space-y-5">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-2.5 h-2.5 rounded-full bg-ok animate-ringPulse" aria-hidden="true"></span>
            <div class="min-w-0">
              <h2 class="text-txt text-[16px] font-semibold leading-tight">SLA Command Center</h2>
              <p class="text-txt-muted text-[12px]">Live monitoring of critical deadlines</p>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" data-action="sla-refresh">
            <i class="fa-solid fa-rotate-right text-[11px]" aria-hidden="true"></i>
            Refresh
          </button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          ${['breached', 'critical', 'warning', 'ontrack'].map((id) => {
            const b = BANDS.find((x) => x.id === id);
            const p = bandPalette(id);
            return `
              <button type="button" data-action="sla-filter" data-band="${id}"
                      class="surface-card p-4 text-left transition-all hover:border-line-strong"
                      style="border-color:${p.b}; background: linear-gradient(180deg, ${p.bg}, transparent 80%);">
                <div class="flex items-center gap-2 text-txt-muted text-[10px] font-bold tracking-wider uppercase mb-2">
                  <i class="fa-solid ${b.icon} text-[10px]" style="color:${p.c};" aria-hidden="true"></i>
                  <span>${esc(b.label)}</span>
                </div>
                <div class="text-[26px] font-bold leading-none tabular-nums" style="color:${p.c};">
                  ${stats[id] || 0}
                </div>
              </button>`;
          }).join('')}
          <div class="surface-card p-4">
            <div class="flex items-center gap-2 text-txt-muted text-[10px] font-bold tracking-wider uppercase mb-2">
              <i class="fa-solid fa-layer-group text-[10px]" aria-hidden="true"></i>
              <span>Total</span>
            </div>
            <div class="text-txt text-[26px] font-bold leading-none tabular-nums">${stats.all}</div>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          ${BANDS.map((b) => `
            <button type="button"
                    class="chip ${filter.band === b.id ? 'is-active' : ''}"
                    data-action="sla-filter" data-band="${b.id}">
              <i class="fa-solid ${b.icon} text-[10px]" aria-hidden="true"></i>
              ${esc(b.label)}
              <span class="ml-1 opacity-70">${b.id === 'all' ? stats.all : (stats[b.id] || 0)}</span>
            </button>`).join('')}
        </div>

        <div data-sla-list class="space-y-2">
          ${rows.length === 0 ? emptyState() : sortRows(applyFilter(rows)).map(card).join('')}
        </div>
      </div>`;

    startTick();
  }

  function emptyState() {
    return `
      <div class="surface-card py-12 text-center">
        <div class="text-4xl mb-3 opacity-60" aria-hidden="true">✅</div>
        <h3 class="text-txt text-[14px] font-semibold mb-1">All clear</h3>
        <p class="text-txt-secondary text-[12px]">No leads match this filter.</p>
      </div>`;
  }

  function card(row) {
    const { lead, band, cd, score } = row;
    const p = bandPalette(band);
    const initials = initialsOf(lead.name);
    const stage = lead.stage || 'New Lead';
    const stageColor = STAGE_COLOR[stage] || '#4f8ef7';
    const priority = lead.priority || 'medium';
    const prColor = PRIORITY_COLOR[priority];
    const prLabel = PRIORITY_LABEL[priority];
    const slaHours = Number(lead.slaHours) || 24;
    const slaMs = slaHours * 3600000;
    const progress = cd ? Math.min(100, Math.max(0, (1 - Math.max(cd.diffMs, -slaMs) / slaMs) * 100)) : 0;
    const scoreTone = score >= 75 ? '#ff7a45' : score >= 40 ? '#ffb648' : '#8a91a6';

    return `
      <article class="surface-card p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,220px)_auto] gap-4 items-center transition-all hover:border-line-strong"
               style="border-left:3px solid ${p.c}; background: linear-gradient(90deg, ${p.bg}, transparent 40%);">

        <div class="flex items-center gap-3 min-w-0">
          <div class="avatar avatar-md" style="background: linear-gradient(135deg, ${p.c}, ${p.c}cc);">
            ${esc(initials)}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-txt text-[13px] font-semibold truncate">${esc(lead.name)}</span>
              <span class="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style="color:${prColor}; background:${prColor}18;">
                ${esc((prLabel || 'Medium').toUpperCase())}
              </span>
              <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style="color:${scoreTone}; background:${scoreTone}18;">
                ${score}
              </span>
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

        <div class="min-w-0">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[9px] font-bold tracking-widest uppercase" style="color:${p.c};">${esc(p.label)}</span>
            <span class="text-[10px] text-txt-muted font-mono">SLA ${slaHours}h</span>
          </div>
          <div class="font-mono text-[15px] font-bold tabular-nums" data-timer-for="${esc(lead.id)}" style="color:${p.c};">
            ${fmtCd(cd)}
          </div>
          <div class="mt-2 h-1 rounded-full bg-hover overflow-hidden">
            <div class="h-full rounded-full transition-all" style="width:${progress}%; background:${p.c};"></div>
          </div>
        </div>

        <div class="flex items-center gap-1.5 justify-end">
          <button type="button" class="icon-btn icon-btn-sm" data-action="open-action-center" data-lead-id="${esc(lead.id)}" title="Open drawer">
            <i class="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-btn icon-btn-sm" data-action="open-lead-form" data-lead-id="${esc(lead.id)}" title="Edit">
            <i class="fa-solid fa-pen text-[11px]" aria-hidden="true"></i>
          </button>
          <button type="button" class="btn btn-primary btn-sm" data-action="open-action-center" data-lead-id="${esc(lead.id)}">
            Open
          </button>
        </div>
      </article>`;
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (STATE.activeView !== 'action-center') return;
      const rows = snapshot();
      const key = rows.map((r) => `${r.lead.id}:${r.band}`).join('|');
      if (key !== lastKey) { render(); return; }
      // In-place timer updates
      for (const r of rows) {
        const el = document.querySelector(`[data-timer-for="${CSS.escape(r.lead.id)}"]`);
        if (el) el.textContent = fmtCd(r.cd);
      }
    }, SLA_TICK_MS);
  }

  function setFilter(patch) { filter = { ...filter, ...patch }; }
  function refresh() { render(); }
  function teardown() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  return { render, refresh, setFilter, teardown };
})();

/* ----------------------------------------------------------------------------
   19.2 · SALES PIPELINE
   ---------------------------------------------------------------------------- */

Modules.Pipeline = (() => {
  let search = '';
  function setFilter(p) { search = p.search ?? search; }
  function refresh() { render(); }

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
              <span class="text-txt text-[12px] font-semibold truncate">${STAGE_EMOJI[stage]} ${esc(stage)}</span>
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
            <h2 class="text-txt text-[16px] font-semibold">Pipeline View</h2>
            <p class="text-txt-muted text-[12px] mt-0.5">Kanban board — click a card to open the drawer</p>
          </div>
          <button type="button" class="btn btn-primary" data-action="open-lead-form">
            <i class="fa-solid fa-plus text-[11px]" aria-hidden="true"></i>
            New Lead
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
    const color = { breached: '#ff5d5d', critical: '#ff7a45', warning: '#ffb648', ontrack: '#4ade80' }[band] || '#8a91a6';
    return `
      <button type="button" data-action="open-action-center" data-lead-id="${esc(lead.id)}"
              class="surface-card p-3 text-left hover:border-line-strong transition-all">
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <span class="text-txt text-[12px] font-semibold truncate">${esc(lead.name)}</span>
          ${cd ? `<span class="text-[10px] font-mono font-bold shrink-0" style="color:${color};">${cd.overdue ? '▲' : ''}${pad2(cd.hours)}:${pad2(cd.mins)}</span>` : ''}
        </div>
        <div class="flex items-center gap-2 text-[10px] text-txt-muted flex-wrap">
          ${lead.project ? `<span>🏗 ${esc(lead.project)}</span>` : ''}
          ${lead.budget  ? `<span>💰 ${formatMoney(lead.budget)}</span>` : ''}
          ${lead.agent   ? `<span>👤 ${esc(lead.agent)}</span>` : ''}
        </div>
      </button>`;
  }

  return { render, setFilter, refresh };
})();

/* ----------------------------------------------------------------------------
   19.3 · PROPERTY INVENTORY
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
            <h2 class="text-txt text-[16px] font-semibold">Property Inventory</h2>
            <p class="text-txt-muted text-[12px] mt-0.5">Track available units across projects</p>
          </div>
          <span class="text-txt-muted text-[11px] font-mono">${rows.length} unit${rows.length === 1 ? '' : 's'}</span>
        </div>
        ${rows.length === 0 ? `
          <div class="surface-card py-16 text-center">
            <div class="text-5xl mb-4 opacity-50" aria-hidden="true">🏗</div>
            <h3 class="text-txt text-[15px] font-semibold mb-1.5">No units yet</h3>
            <p class="text-txt-secondary text-[13px] max-w-md mx-auto">Property inventory management arrives in the next module release.</p>
          </div>` : gridOf(rows)}
      </div>`;
  }
  function gridOf(rows) {
    return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      ${rows.map((r) => `
        <div class="surface-card p-4">
          <div class="text-txt text-[13px] font-semibold">${esc(r.name || 'Unit')}</div>
          <div class="text-txt-muted text-[11px] mt-1">${esc(r.project || '—')} · ${esc(r.status || '—')}</div>
        </div>`).join('')}
    </div>`;
  }
  return { render };
})();

/* ----------------------------------------------------------------------------
   19.4 · CIL RADAR
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
          <h2 class="text-txt text-[16px] font-semibold">CIL Radar</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Client Intent & Lead scoring — top 30 candidates</p>
        </div>
        ${scored.length === 0 ? `
          <div class="surface-card py-16 text-center">
            <div class="text-5xl mb-4 opacity-50" aria-hidden="true">📡</div>
            <h3 class="text-txt text-[15px] font-semibold mb-1.5">Radar is clear</h3>
            <p class="text-txt-secondary text-[13px]">No active leads in scope yet.</p>
          </div>` : `
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            ${scored.map(({ lead, score }) => radarCard(lead, score)).join('')}
          </div>`}
      </div>`;
  }
  function radarCard(lead, score) {
    const tone = score >= 75 ? { c: '#ff7a45', l: 'HOT' }
              : score >= 40  ? { c: '#ffb648', l: 'WARM' }
              : { c: '#8a91a6', l: 'COLD' };
    return `
      <button type="button" data-action="open-action-center" data-lead-id="${esc(lead.id)}"
              class="surface-card p-4 text-left hover:border-line-strong transition-all">
        <div class="flex items-center justify-between mb-2">
          <span class="text-txt text-[13px] font-semibold truncate">${esc(lead.name)}</span>
          <span class="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style="color:${tone.c}; background:${tone.c}18;">
            ${tone.l}
          </span>
        </div>
        <div class="text-[11px] text-txt-muted mb-2">
          ${esc(lead.stage)}${lead.project ? ' · ' + esc(lead.project) : ''}
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full bg-hover overflow-hidden">
            <div class="h-full rounded-full" style="width:${score}%; background:${tone.c};"></div>
          </div>
          <span class="text-[12px] font-bold tabular-nums" style="color:${tone.c};">${score}</span>
        </div>
      </button>`;
  }
  return { render };
})();

/* ----------------------------------------------------------------------------
   19.5 · FINANCIAL ENGINE
   ---------------------------------------------------------------------------- */

Modules.FinancialEngine = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    if (!can('viewFinancials')) {
      content.innerHTML = `
        <div class="view-container">
          <div class="surface-card py-16 text-center">
            <div class="text-5xl mb-4 opacity-50" aria-hidden="true">🔒</div>
            <h3 class="text-txt text-[15px] font-semibold mb-1.5">Access restricted</h3>
            <p class="text-txt-secondary text-[13px]">Your role does not grant access to financial reports.</p>
          </div>
        </div>`;
      return;
    }

    const leads = STATE.leads;
    const won = leads.filter((l) => l.stage === 'Won');
    const active = leads.filter((l) => l.stage !== 'Won' && l.stage !== 'Lost');
    const totalWon = won.reduce((s, l) => s + (Number(l.budget) || 0), 0);
    const pipeline = active.reduce((s, l) => s + (Number(l.budget) || 0), 0);
    const commissionRate = 0.025;
    const commission = totalWon * commissionRate;
    const weighted = active.reduce((s, l) => {
      const w = { 'New Lead': 0.10, 'Contacted': 0.20, 'Meeting Scheduled': 0.35, 'Proposal Sent': 0.55, 'Negotiation': 0.75 }[l.stage] || 0.15;
      return s + (Number(l.budget) || 0) * w;
    }, 0);

    content.innerHTML = `
      <div class="view-container space-y-5">
        <div>
          <h2 class="text-txt text-[16px] font-semibold">Financial Engine</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Commissions, forecasts & revenue tracking</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          ${finCard('Closed Revenue', formatMoney(totalWon), 'fa-trophy', 'var(--ok)')}
          ${finCard('Active Pipeline', formatMoney(pipeline), 'fa-chart-simple', 'var(--accent)')}
          ${finCard('Est. Commissions', formatMoney(commission), 'fa-hand-holding-dollar', 'var(--violet)')}
          ${finCard('Weighted Forecast', formatMoney(weighted), 'fa-bullseye', 'var(--warn)')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="surface-card p-5">
            <h3 class="text-txt text-[13px] font-semibold mb-4">Revenue by Project</h3>
            <canvas id="chart-fin-project" height="240" style="width:100%; display:block;"></canvas>
          </div>
          <div class="surface-card p-5">
            <h3 class="text-txt text-[13px] font-semibold mb-4">Commission Trend (Won)</h3>
            <canvas id="chart-fin-commission" height="240" style="width:100%; display:block;"></canvas>
          </div>
        </div>

        <div class="surface-card p-5">
          <h3 class="text-txt text-[13px] font-semibold mb-3">Recently Won Deals (${won.length})</h3>
          ${won.length === 0
            ? `<p class="text-txt-muted text-[12px]">No closed deals yet.</p>`
            : `<div class="divide-y divide-line">
                ${won.slice(0, 10).map((l) => `
                  <div class="flex items-center justify-between py-2">
                    <div class="min-w-0">
                      <div class="text-txt text-[13px] font-medium truncate">${esc(l.name)}</div>
                      <div class="text-txt-muted text-[11px]">${esc(l.project || '—')} · ${esc(l.agent || 'Unassigned')}</div>
                    </div>
                    <div class="text-ok font-mono font-bold text-[13px]">${formatMoney(l.budget)}</div>
                  </div>`).join('')}
              </div>`}
        </div>
      </div>`;

    requestAnimationFrame(() => {
      const projectRevenue = {};
      won.forEach((l) => {
        const k = l.project || 'Unassigned';
        projectRevenue[k] = (projectRevenue[k] || 0) + (Number(l.budget) || 0);
      });
      drawBarChart(document.getElementById('chart-fin-project'), Object.entries(projectRevenue)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value], i) => ({ label, value, color: pickPalette(i) })), { money: true });

      // Commission trend: last 6 months
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: d.toLocaleString('en-US', { month: 'short' }) });
      }
      const commissionByMonth = months.map((m) => {
        const total = won.filter((l) => (l.updatedAt || '').startsWith(m.key))
          .reduce((s, l) => s + (Number(l.budget) || 0), 0);
        return { label: m.label, value: total * commissionRate, color: 'var(--violet)' };
      });
      drawBarChart(document.getElementById('chart-fin-commission'), commissionByMonth, { money: true });
    });
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
   19.6 · AI VOICE SIMULATOR
   ---------------------------------------------------------------------------- */

Modules.VoiceSimulator = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    content.innerHTML = `
      <div class="view-container space-y-5">
        <div>
          <h2 class="text-txt text-[16px] font-semibold">AI Voice Simulator</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Practice objection handling against synthetic buyers</p>
        </div>
        <div class="surface-card p-8 text-center">
          <div class="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
               style="background: var(--accent-soft);">
            <i class="fa-solid fa-microphone-lines text-[24px] text-accent" aria-hidden="true"></i>
          </div>
          <h3 class="text-txt text-[15px] font-semibold mb-2">Beta Module</h3>
          <p class="text-txt-secondary text-[13px] max-w-md mx-auto leading-relaxed">
            The Voice Simulator module is scheduled for the next release. It will let you rehearse calls against AI personas trained on real objections.
          </p>
          <button type="button" disabled class="btn btn-secondary mt-5 cursor-not-allowed">
            <i class="fa-solid fa-clock text-[11px]" aria-hidden="true"></i>
            Coming Soon
          </button>
        </div>
      </div>`;
  }
  return { render };
})();

/* ----------------------------------------------------------------------------
   19.7 · ANALYTICS
   ---------------------------------------------------------------------------- */

Modules.Analytics = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    const stageData = STAGES.map((s) => ({
      label: s,
      value: STATE.leads.filter((l) => l.stage === s).length,
      color: STAGE_COLOR[s],
    }));
    const channelMap = {};
    STATE.leads.forEach((l) => {
      const c = l.channel || 'Unknown';
      channelMap[c] = (channelMap[c] || 0) + 1;
    });
    const channelData = Object.entries(channelMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: pickPalette(i) }));

    content.innerHTML = `
      <div class="view-container space-y-5">
        <div>
          <h2 class="text-txt text-[16px] font-semibold">Analytics</h2>
          <p class="text-txt-muted text-[12px] mt-0.5">Performance insights across the pipeline</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="surface-card p-5">
            <h3 class="text-txt text-[13px] font-semibold mb-4">Leads by Stage</h3>
            <canvas id="chart-stage" height="260" style="width:100%; display:block;"></canvas>
          </div>
          <div class="surface-card p-5">
            <h3 class="text-txt text-[13px] font-semibold mb-4">Leads by Channel</h3>
            <canvas id="chart-channel" height="260" style="width:100%; display:block;"></canvas>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="surface-card p-5">
            <h3 class="text-txt text-[13px] font-semibold mb-4">Priority Breakdown</h3>
            <canvas id="chart-priority" height="220" style="width:100%; display:block;"></canvas>
          </div>
          <div class="surface-card p-5">
            <h3 class="text-txt text-[13px] font-semibold mb-4">SLA Health</h3>
            <canvas id="chart-sla" height="220" style="width:100%; display:block;"></canvas>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => {
      drawBarChart(document.getElementById('chart-stage'), stageData);
      drawBarChart(document.getElementById('chart-channel'), channelData);

      const pri = { urgent: 0, high: 0, medium: 0, low: 0 };
      STATE.leads.forEach((l) => { pri[l.priority || 'medium']++; });
      drawBarChart(document.getElementById('chart-priority'), [
        { label: 'Urgent', value: pri.urgent, color: '#ff5d5d' },
        { label: 'High',   value: pri.high,   color: '#ffb648' },
        { label: 'Medium', value: pri.medium, color: '#6d8cff' },
        { label: 'Low',    value: pri.low,    color: '#5a6178' },
      ]);

      const sla = { breached: 0, critical: 0, warning: 0, ontrack: 0 };
      STATE.leads.forEach((l) => {
        const b = slaBandOf(l);
        if (sla[b] !== undefined) sla[b]++;
      });
      drawBarChart(document.getElementById('chart-sla'), [
        { label: 'Breached', value: sla.breached, color: '#ff5d5d' },
        { label: 'Critical', value: sla.critical, color: '#ff7a45' },
        { label: 'Warning',  value: sla.warning,  color: '#ffb648' },
        { label: 'On Track', value: sla.ontrack,  color: '#4ade80' },
      ]);
    });
  }
  return { render };
})();

/* ----------------------------------------------------------------------------
   19.8 · USERS MODULE
   ---------------------------------------------------------------------------- */

Modules.Users = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    if (!can('manageUsers')) {
      content.innerHTML = `
        <div class="view-container">
          <div class="surface-card py-16 text-center">
            <div class="text-5xl mb-4 opacity-50" aria-hidden="true">🔒</div>
            <h3 class="text-txt text-[15px] font-semibold mb-1.5">Admin only</h3>
            <p class="text-txt-secondary text-[13px]">Only Admins can access team management.</p>
          </div>
        </div>`;
      return;
    }

    const users = STATE.users.slice().sort((a, b) => {
      const roleOrder = { admin: 0, team_leader: 1, sales_rep: 2 };
      return (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
    });

    const counts = {
      total: users.length,
      admin: users.filter((u) => u.role === 'admin').length,
      team_leader: users.filter((u) => u.role === 'team_leader').length,
      sales_rep: users.filter((u) => u.role === 'sales_rep').length,
    };

    content.innerHTML = `
      <div class="view-container space-y-5">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 class="text-txt text-[16px] font-semibold">User Management</h2>
            <p class="text-txt-muted text-[12px] mt-0.5">Teams, roles & permissions</p>
          </div>
          <button type="button" class="btn btn-primary" data-action="open-user-modal">
            <i class="fa-solid fa-user-plus text-[11px]" aria-hidden="true"></i>
            Add User
          </button>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${roleCard('Total', counts.total, 'fa-users', 'var(--accent)')}
          ${roleCard('Admins', counts.admin, 'fa-crown', 'var(--danger)')}
          ${roleCard('Team Leaders', counts.team_leader, 'fa-user-tie', 'var(--warn)')}
          ${roleCard('Sales Reps', counts.sales_rep, 'fa-user', 'var(--ok)')}
        </div>

        <div class="surface-card overflow-hidden">
          <table class="w-full text-left">
            <thead class="border-b border-line bg-surface2">
              <tr>
                <th class="px-4 py-3 text-[11px] font-bold text-txt-muted uppercase tracking-wider">Member</th>
                <th class="px-4 py-3 text-[11px] font-bold text-txt-muted uppercase tracking-wider hidden md:table-cell">Email</th>
                <th class="px-4 py-3 text-[11px] font-bold text-txt-muted uppercase tracking-wider">Role</th>
                <th class="px-4 py-3 text-[11px] font-bold text-txt-muted uppercase tracking-wider hidden md:table-cell">Status</th>
                <th class="px-4 py-3 text-[11px] font-bold text-txt-muted uppercase tracking-wider hidden lg:table-cell">Assigned Leads</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              ${users.map((u) => {
                const assigned = STATE.leads.filter((l) => l.agent === u.name).length;
                const current = u.id === STATE.currentUserId;
                const initials = initialsOf(u.name);
                const avatar = u.avatarUrl
                  ? `<span class="avatar avatar-sm" style="background-image:url(${u.avatarUrl});background-size:cover;background-position:center;"></span>`
                  : `<span class="avatar avatar-sm">${esc(initials)}</span>`;
                return `
                  <tr class="border-b border-line hover:bg-hover transition-colors">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        ${avatar}
                        <div class="min-w-0">
                          <div class="text-txt text-[13px] font-medium truncate">${esc(u.name)}</div>
                          ${current ? '<div class="text-[10px] text-accent font-semibold">You</div>' : ''}
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-[12px] text-txt-secondary hidden md:table-cell">${esc(u.email)}</td>
                    <td class="px-4 py-3">
                      <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded ${roleBadgeClass(u.role)}">
                        ${esc(ROLE_LABEL[u.role] || u.role)}
                      </span>
                    </td>
                    <td class="px-4 py-3 hidden md:table-cell">
                      <span class="text-[11px] font-medium ${statusClass(u.status)}">${esc(USER_STATUS_LABEL[u.status] || u.status)}</span>
                    </td>
                    <td class="px-4 py-3 text-[12px] text-txt-secondary hidden lg:table-cell font-mono">${assigned}</td>
                    <td class="px-4 py-3 text-right">
                      <button type="button" class="icon-btn icon-btn-sm" data-action="open-user-modal" data-user-id="${esc(u.id)}" title="Edit">
                        <i class="fa-solid fa-pen text-[11px]" aria-hidden="true"></i>
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }
  function roleCard(label, value, icon, color) {
    return `
      <div class="surface-card p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-txt-muted text-[10px] font-bold tracking-wider uppercase">${esc(label)}</span>
          <i class="fa-solid ${icon} text-[12px]" style="color:${color};" aria-hidden="true"></i>
        </div>
        <div class="text-[22px] font-bold tabular-nums" style="color:${color};">${value}</div>
      </div>`;
  }
  function roleBadgeClass(role) {
    if (role === 'admin') return 'bg-danger-soft text-danger';
    if (role === 'team_leader') return 'bg-warn-soft text-warn';
    return 'bg-ok-soft text-ok';
  }
  function statusClass(status) {
    if (status === 'active') return 'text-ok';
    if (status === 'invited') return 'text-warn';
    return 'text-txt-muted';
  }
  return { render };
})();

/* ----------------------------------------------------------------------------
   19.9 · SETTINGS
   ---------------------------------------------------------------------------- */

Modules.Settings = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;

    content.innerHTML = `
      <div class="view-container space-y-4 max-w-3xl">

        <!-- Workspace -->
        <section class="surface-card p-5">
          <h3 class="text-txt text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-solid fa-users text-accent text-[12px]" aria-hidden="true"></i>
            Team Roster (Agents)
          </h3>
          <div class="flex flex-col gap-2 mb-4">
            ${(STATE.users).map((u) => `
              <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface2 border border-line">
                <span class="avatar avatar-sm">${esc(initialsOf(u.name))}</span>
                <span class="flex-1 text-txt text-[13px]">${esc(u.name)}</span>
                <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded" style="background: var(--accent-soft); color: var(--accent);">
                  ${esc(ROLE_LABEL[u.role])}
                </span>
              </div>`).join('')}
          </div>
          <p class="text-[11px] text-txt-muted">
            Manage the roster in <button type="button" class="text-accent hover:underline" data-view="users">User Management →</button>
          </p>
        </section>

        <!-- Projects -->
        <section class="surface-card p-5">
          <h3 class="text-txt text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-solid fa-building text-accent text-[12px]" aria-hidden="true"></i>
            Projects
          </h3>
          <div class="flex flex-wrap gap-2 mb-4">
            ${(STATE.settings.projects || []).map((p) => `
              <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface2 border border-line text-txt text-[12px]">
                ${esc(p)}
                <button type="button" class="text-txt-muted hover:text-danger transition-colors"
                        data-action="settings-remove-project" data-project="${esc(p)}" title="Remove">
                  <i class="fa-solid fa-xmark text-[10px]" aria-hidden="true"></i>
                </button>
              </span>`).join('')}
          </div>
          <div class="flex gap-2">
            <input type="text" id="new-project-input" class="field-input flex-1" placeholder="Add project name…" />
            <button type="button" class="btn btn-primary" data-action="settings-add-project">Add</button>
          </div>
        </section>

        <!-- Data -->
        <section class="surface-card p-5">
          <h3 class="text-txt text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-solid fa-database text-accent text-[12px]" aria-hidden="true"></i>
            Data Management
          </h3>
          <div class="divide-y divide-line">
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt text-[13px] font-medium">Export Data</div>
                <div class="text-txt-muted text-[11px]">Download a full JSON backup</div>
              </div>
              <button type="button" class="btn btn-secondary" data-action="settings-export">
                <i class="fa-solid fa-download text-[10px]" aria-hidden="true"></i>
                Export
              </button>
            </div>
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt text-[13px] font-medium">Import Data</div>
                <div class="text-txt-muted text-[11px]">Restore from a backup file</div>
              </div>
              <button type="button" class="btn btn-secondary" data-action="settings-import">
                <i class="fa-solid fa-upload text-[10px]" aria-hidden="true"></i>
                Import
              </button>
            </div>
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt text-[13px] font-medium">Storage Engine</div>
                <div class="text-txt-muted text-[11px]">${STATE.useIDB ? 'IndexedDB — high capacity' : 'LocalStorage — ~5MB limit'}</div>
              </div>
              <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${STATE.useIDB ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}">
                ${STATE.useIDB ? 'IndexedDB' : 'LocalStorage'}
              </span>
            </div>
            <div class="flex items-center justify-between py-3">
              <div>
                <div class="text-txt text-[13px] font-medium">Clear All Data</div>
                <div class="text-txt-muted text-[11px]">Permanently delete all leads & logs</div>
              </div>
              <button type="button" class="btn btn-danger" data-action="settings-clear">
                <i class="fa-solid fa-trash text-[10px]" aria-hidden="true"></i>
                Clear
              </button>
            </div>
          </div>
        </section>

        <!-- WhatsApp Templates -->
        <section class="surface-card p-5">
          <h3 class="text-txt text-[14px] font-semibold mb-4 flex items-center gap-2">
            <i class="fa-brands fa-whatsapp text-[#25d366] text-[14px]" aria-hidden="true"></i>
            WhatsApp Templates
          </h3>
          <div class="flex flex-col gap-3">
            ${STAGES.map((s) => `
              <div>
                <label class="field-label">${STAGE_EMOJI[s]} ${esc(s)}</label>
                <textarea id="wa-tpl-${s.replace(/\s+/g, '_')}" class="field-input" style="min-height:60px;">${esc(STATE.settings.waTemplates[s] || '')}</textarea>
              </div>`).join('')}
          </div>
          <button type="button" class="btn btn-primary mt-4" data-action="settings-save-wa">
            <i class="fa-solid fa-floppy-disk text-[10px]" aria-hidden="true"></i>
            Save Templates
          </button>
        </section>

      </div>`;
  }
  return { render };
})();

async function addProject() {
  const input = document.getElementById('new-project-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) { showToast('Enter a project name', 'warning'); return; }
  if (STATE.settings.projects.includes(val)) { showToast('Project already exists', 'warning'); return; }
  STATE.settings.projects.push(val);
  await DB.saveSettings();
  input.value = '';
  Modules.Settings.render();
  showToast(`Project "${val}" added`, 'success');
}
async function removeProject(name) {
  const ok = await Confirm.ask({ icon: '🏗', title: 'Remove Project', message: `Remove "${name}" from the list?`, okText: 'Remove', danger: true });
  if (!ok) return;
  STATE.settings.projects = STATE.settings.projects.filter((p) => p !== name);
  await DB.saveSettings();
  Modules.Settings.render();
  showToast(`Project "${name}" removed`, 'warning');
}
async function addAgent() {
  const input = document.getElementById('new-agent-input');
  if (!input) return;
  const val = input.value.trim();
  if (!val) { showToast('Enter a name', 'warning'); return; }
  const user = {
    id: generateId('usr'),
    name: val,
    email: `${val.toLowerCase().replace(/\s+/g, '.')}@octane.crm`,
    role: 'sales_rep',
    status: 'invited',
    avatarUrl: '',
    password: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  STATE.users.push(user);
  await DB.saveUser(user);
  input.value = '';
  refreshUserChrome();
  if (STATE.activeView === 'settings') Modules.Settings.render();
  showToast(`Added "${val}" to team`, 'success');
}
async function removeAgent(name) {
  const user = STATE.users.find((u) => u.name === name);
  if (!user) return;
  const ok = await Confirm.ask({ icon: '👤', title: 'Remove Member', message: `Remove "${name}" from the team?`, okText: 'Remove', danger: true });
  if (!ok) return;
  STATE.users = STATE.users.filter((u) => u.id !== user.id);
  await DB.deleteUser(user.id);
  refreshUserChrome();
  if (STATE.activeView === 'settings') Modules.Settings.render();
  showToast(`Removed "${name}"`, 'warning');
}
async function saveWATemplates() {
  for (const stage of STAGES) {
    const el = document.getElementById(`wa-tpl-${stage.replace(/\s+/g, '_')}`);
    if (el) STATE.settings.waTemplates[stage] = el.value;
  }
  await DB.saveSettings();
  showToast('Templates saved', 'success');
}
async function clearAllData() {
  if (!can('clearData')) { showToast('No permission', 'warning'); return; }
  const ok = await Confirm.ask({
    icon: '🗑', title: 'Clear All Data',
    message: 'This will permanently delete all leads, comments, and audit logs.',
    okText: 'Clear Everything', danger: true,
  });
  if (!ok) return;
  await DB.clearAll();
  Router.refresh();
  updateHeaderKPIs();
  showToast('All data cleared', 'warning');
}

/* ============================================================================
   20 · LEAD INTERACTION DRAWER
   ============================================================================ */

function openLeadDrawer(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;

  STATE.drawerLeadId = leadId;

  // Fill static fields
  const initials = initialsOf(lead.name);
  const avatar = document.querySelector('[data-drawer-lead="avatar"]');
  if (avatar) {
    if (lead.avatarUrl) {
      avatar.style.backgroundImage = `url(${lead.avatarUrl})`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
      avatar.textContent = '';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = initials;
    }
  }
  setDrawerText('name', lead.name);
  const contact = [
    lead.phone || '—',
    lead.email || '',
    lead.project ? `· ${lead.project}` : '',
  ].filter(Boolean).join('  ');
  setDrawerText('contact', contact);

  renderDrawerLead(lead);
  Drawer.open('lead-interaction');
  setTimeout(() => document.getElementById('drawer-note-input')?.focus(), 200);
}

function setDrawerText(field, value) {
  document.querySelectorAll(`[data-drawer-lead="${field}"]`).forEach((el) => {
    el.textContent = value ?? '—';
  });
}

function renderDrawerLead(lead) {
  // Stage label
  const stageEl = document.querySelector('[data-drawer-lead="stage-label"]');
  if (stageEl) {
    const stage = lead.stage || 'New Lead';
    stageEl.innerHTML = `<span style="color:${STAGE_COLOR[stage]};">
      ${STAGE_EMOJI[stage] || ''} ${esc(stage)}
    </span>`;
  }

  setDrawerText('project', lead.project || '—');
  setDrawerText('budget', lead.budget ? formatMoney(lead.budget) : '—');
  setDrawerText('channel', lead.channel || '—');
  setDrawerText('agent', lead.agent || 'Unassigned');

  // Follow-up summary
  const fuEl = document.querySelector('[data-drawer-lead="followup-summary"]');
  if (fuEl) {
    if (lead.followUpDate) {
      const iso = `${lead.followUpDate}T${lead.followUpTime || '09:00'}`;
      const band = slaBandOf(lead);
      const color = { breached: '#ff5d5d', critical: '#ff7a45', warning: '#ffb648', ontrack: '#4ade80' }[band] || 'var(--txt-secondary)';
      const cd = countdownOf(lead);
      const cdTxt = cd ? (cd.overdue ? `▲ ${cd.days}d ${pad2(cd.hours)}:${pad2(cd.mins)}:${pad2(cd.secs)}` : `${cd.days}d ${pad2(cd.hours)}:${pad2(cd.mins)}:${pad2(cd.secs)}`) : '';
      fuEl.innerHTML = `
        <i class="fa-regular fa-clock mr-1" aria-hidden="true"></i>
        <span style="color:${color};">${formatDateTimeLocal(iso)}</span>
        <span class="font-mono ml-2" style="color:${color};">${cdTxt}</span>`;
    } else {
      fuEl.textContent = 'No follow-up scheduled';
    }
  }

  // Last contact
  const audit = STATE.auditLogs[lead.id] || [];
  const lastContact = audit.find((e) => e.action && e.action.startsWith('call_')) || audit[0];
  const lcEl = document.querySelector('[data-drawer-lead="last-contact"]');
  if (lcEl) lcEl.textContent = lastContact ? `Last: ${formatRelative(lastContact.timestamp)}` : 'No contact logged';

  renderDrawerTimeline(lead.id);
}

function renderDrawerTimeline(leadId) {
  const el = document.getElementById('drawer-timeline');
  if (!el) return;

  const entries = STATE.auditLogs[leadId] || [];
  const comments = (STATE.comments[leadId] || []).map((c) => ({
    id: c.id, action: 'comment_added', agent: c.author, timestamp: c.timestamp, meta: { text: c.text }, isComment: true,
  }));

  const combined = [...entries, ...comments].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 25);

  if (combined.length === 0) {
    el.innerHTML = `
      <div class="text-center py-8">
        <div class="text-2xl opacity-50 mb-2" aria-hidden="true">📭</div>
        <p class="text-txt-muted text-[12px]">No activity yet. Log a call or add a note below.</p>
      </div>`;
    return;
  }

  el.innerHTML = combined.map((entry) => {
    const icon = entry.isComment ? '💬' : auditIcon(entry.action);
    const text = entry.isComment
      ? `<strong>${esc(entry.agent || 'Someone')}</strong> added a note: <em class="text-txt-secondary">"${esc((entry.meta?.text || '').slice(0, 120))}"</em>`
      : buildAuditLine(entry);
    return `
      <div class="timeline-item">
        <div class="timeline-dot">${icon}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[12px] text-txt-secondary leading-relaxed">${text}</div>
          <div class="text-[10px] text-txt-muted mt-1">${formatRelative(entry.timestamp)} · ${formatDateTime(entry.timestamp)}</div>
        </div>
      </div>`;
  }).join('');
}

function closeLeadDrawer() {
  Drawer.close('lead-interaction');
  STATE.drawerLeadId = null;
}

async function submitDrawerNote() {
  const input = document.getElementById('drawer-note-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) { showToast('Write a note first', 'warning'); return; }
  if (!STATE.drawerLeadId) return;

  await addComment(STATE.drawerLeadId, text);
  input.value = '';
  renderDrawerTimeline(STATE.drawerLeadId);
  renderDrawerLead(findLead(STATE.drawerLeadId));
  showToast('Note added', 'success');
}

async function applyDisposition(value) {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  const cfg = DISPOSITIONS[value];
  if (!cfg) return;

  const now = new Date();
  const nowIso = now.toISOString();

  // Build the audit metadata
  const meta = {};

  // Update lead attempts
  if (['no_answer', 'busy', 'voicemail'].includes(value)) {
    lead.attempts = (lead.attempts || 0) + 1;
    meta.attempt = lead.attempts;

    // Auto-reschedule 4 hours
    const next = new Date(now.getTime() + AUTO_RESCHEDULE_HOURS * 3600000);
    lead.followUpDate = next.toISOString().slice(0, 10);
    lead.followUpTime = next.toTimeString().slice(0, 5);
  } else if (value === 'answered' || value === 'call_back') {
    if (cfg.stage && lead.stage !== cfg.stage) {
      const from = lead.stage;
      lead.stage = cfg.stage;
      meta.stageFrom = from;
      meta.stageTo = cfg.stage;
    }
  } else if (value === 'wrong_number') {
    // Do nothing automatic — just log
  }

  // Auto stage transition for answered
  if (value === 'answered' && lead.stage === 'New Lead') {
    lead.stage = 'Contacted';
    meta.stageTo = 'Contacted';
  }

  lead.updatedAt = nowIso;
  await DB.saveLead(lead);

  const auditAction = {
    answered: 'call_answered',
    no_answer: 'call_missed',
    busy: 'call_busy',
    voicemail: 'call_vm',
    call_back: 'call_back',
    wrong_number: 'call_wrong',
  }[value];

  createAuditEntry(lead.id, auditAction, meta);

  if (value === 'no_answer' || value === 'busy' || value === 'voicemail') {
    createAuditEntry(lead.id, 'followup_set', {
      datetime: formatDateTime(`${lead.followUpDate}T${lead.followUpTime}`),
    });
  }

  renderDrawerLead(lead);
  Router.refresh();
  updateHeaderKPIs();

  const msg = {
    answered: 'Logged: Answered',
    no_answer: `No Answer — retry in ${AUTO_RESCHEDULE_HOURS}h (attempt #${lead.attempts})`,
    busy: `Busy — retry in ${AUTO_RESCHEDULE_HOURS}h`,
    voicemail: `Voicemail — retry in ${AUTO_RESCHEDULE_HOURS}h`,
    call_back: 'Logged: Call Back',
    wrong_number: 'Logged: Wrong Number',
  }[value];
  showToast(msg || 'Logged', 'success');
}

async function applyQuickFollowup(value) {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;

  const now = new Date();
  let target = new Date(now);

  switch (value) {
    case 'today': {
      target.setHours(18, 0, 0, 0);
      if (target.getTime() < now.getTime()) target.setTime(now.getTime() + 2 * 3600000);
      break;
    }
    case 'tomorrow': {
      target.setDate(target.getDate() + 1);
      target.setHours(10, 0, 0, 0);
      break;
    }
    case '3_days': {
      target.setDate(target.getDate() + 3);
      target.setHours(10, 0, 0, 0);
      break;
    }
    case '1_week': {
      target.setDate(target.getDate() + 7);
      target.setHours(10, 0, 0, 0);
      break;
    }
    case '2_weeks': {
      target.setDate(target.getDate() + 14);
      target.setHours(10, 0, 0, 0);
      break;
    }
    case '1_month': {
      target.setDate(target.getDate() + 30);
      target.setHours(10, 0, 0, 0);
      break;
    }
    default: return;
  }

  lead.followUpDate = target.toISOString().slice(0, 10);
  lead.followUpTime = target.toTimeString().slice(0, 5);
  lead.updatedAt = new Date().toISOString();
  await DB.saveLead(lead);

  createAuditEntry(lead.id, 'followup_set', { datetime: formatDateTimeLocal(target.toISOString()) });

  renderDrawerLead(lead);
  Router.refresh();
  updateHeaderKPIs();
  showToast(`Follow-up set: ${formatDateTimeLocal(target.toISOString())}`, 'success');
}

async function openCustomFollowupPrompt() {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;

  const defaultDate = (() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  })();
  const defaultTime = '10:00';

  const dateStr = window.prompt('Follow-up date (YYYY-MM-DD):', defaultDate);
  if (!dateStr) return;
  const timeStr = window.prompt('Follow-up time (HH:MM, 24h):', defaultTime);
  if (!timeStr) return;

  const iso = `${dateStr}T${timeStr}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) { showToast('Invalid date or time', 'warning'); return; }

  lead.followUpDate = dateStr;
  lead.followUpTime = timeStr;
  lead.updatedAt = new Date().toISOString();
  await DB.saveLead(lead);

  createAuditEntry(lead.id, 'followup_set', { datetime: formatDateTimeLocal(d.toISOString()) });

  renderDrawerLead(lead);
  Router.refresh();
  updateHeaderKPIs();
  showToast(`Follow-up set: ${formatDateTimeLocal(d.toISOString())}`, 'success');
}

function startCallAction() {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  if (lead.phone) {
    const clean = lead.phone.replace(/[^\d+]/g, '');
    window.location.href = `tel:${clean}`;
  } else {
    showToast('No phone number on file', 'warning');
  }
}

function startEmailAction() {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  if (lead.email) {
    window.location.href = `mailto:${lead.email}?subject=Regarding ${encodeURIComponent(lead.project || 'your inquiry')}`;
  } else {
    showToast('No email on file', 'warning');
  }
}

function viewFullAuditPrompt(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  // Open the drawer's full timeline (already shown). We surface a toast prompt.
  showToast('Full audit log is visible in the timeline', 'info');
}

/* ============================================================================
   21 · WHATSAPP
   ============================================================================ */

function fillWATemplate(tpl, lead) {
  if (!tpl) return '';
  return String(tpl)
    .replace(/\{name\}/gi, lead.name || '')
    .replace(/\{agent\}/gi, lead.agent || getCurrentUser().name || '')
    .replace(/\{project\}/gi, lead.project || '')
    .replace(/\{phone\}/gi, lead.phone || '')
    .replace(/\{stage\}/gi, lead.stage || '');
}

function openWhatsAppModal(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;

  const phoneEl = document.getElementById('wa-phone');
  const msgEl = document.getElementById('wa-message');
  const selEl = document.getElementById('wa-template-select');

  const cleanPhone = (lead.phone || '').replace(/\D/g, '');
  if (phoneEl) phoneEl.value = cleanPhone ? `+${cleanPhone}` : '';

  if (selEl) {
    selEl.innerHTML = '<option value="">— Select —</option>' +
      STAGES.map((s) => `<option value="${esc(s)}" ${s === lead.stage ? 'selected' : ''}>${STAGE_EMOJI[s]} ${esc(s)}</option>`).join('');
    selEl.onchange = () => {
      const tpl = STATE.settings.waTemplates[selEl.value] || '';
      if (msgEl) msgEl.value = fillWATemplate(tpl, lead);
    };
  }

  const tpl = STATE.settings.waTemplates[lead.stage] || '';
  if (msgEl) msgEl.value = fillWATemplate(tpl, lead);

  const sendBtn = document.querySelector('[data-action="send-whatsapp"]');
  if (sendBtn) sendBtn.dataset.leadId = leadId;

  Modal.open('modal-whatsapp');
}

function sendWhatsApp() {
  const btn = document.querySelector('[data-action="send-whatsapp"]');
  const leadId = btn?.dataset.leadId;
  const phone = (document.getElementById('wa-phone')?.value || '').replace(/\D/g, '');
  const msg = (document.getElementById('wa-message')?.value || '').trim();

  if (!phone) { showToast('Enter a phone number', 'warning'); return; }
  if (!msg) { showToast('Write a message', 'warning'); return; }
  if (!can('sendWhatsApp')) { showToast('No permission', 'warning'); return; }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');

  if (leadId) {
    createAuditEntry(leadId, 'whatsapp_sent', {});
    const lead = findLead(leadId);
    if (lead) {
      if (lead.stage === 'New Lead') {
        lead.stage = 'Contacted';
        lead.updatedAt = new Date().toISOString();
        DB.saveLead(lead);
        createAuditEntry(leadId, 'stage_change', { from: 'New Lead', to: 'Contacted' });
      }
    }
    if (STATE.drawerLeadId === leadId) renderDrawerLead(findLead(leadId));
  }

  Modal.close('modal-whatsapp');
  Router.refresh();
  updateHeaderKPIs();
  showToast('Opening WhatsApp…', 'success');
}

/* ============================================================================
   22 · IMPORT / EXPORT
   ============================================================================ */

function exportData() {
  if (!can('exportData')) { showToast('No permission', 'warning'); return; }

  const payload = {
    version: '8.0',
    exportedAt: new Date().toISOString(),
    leads: STATE.leads,
    comments: STATE.comments,
    auditLogs: STATE.auditLogs,
    users: STATE.users,
    settings: STATE.settings,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `octane-crm-v8-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Data exported', 'success');
}

function openImportModal() {
  if (!can('clearData') && !can('exportData')) { showToast('No permission', 'warning'); return; }
  STATE.importBuffer = null;
  const validation = document.getElementById('import-validation');
  if (validation) validation.innerHTML = '';
  const btn = document.getElementById('btn-modal-import-confirm');
  if (btn) btn.disabled = true;
  Modal.open('modal-import');
}

function openImportPicker() {
  document.getElementById('import-file-input')?.click();
}

function handleImportFile(file) {
  if (!file.name.endsWith('.json')) { showToast('Please select a .json file', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => validateImport(e.target.result, file.name);
  reader.onerror = () => showToast('Failed to read file', 'error');
  reader.readAsText(file);
}

function validateImport(jsonString, filename) {
  let parsed;
  try { parsed = JSON.parse(jsonString); }
  catch (err) { renderImportResult(false, [`Invalid JSON: ${err.message}`]); return; }

  const { valid, errors } = SchemaValidator.validate(parsed);
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
  const userCount = (parsed.users || []).length;

  const el = document.getElementById('import-validation');
  if (el) {
    el.innerHTML = `
      <div class="surface-card p-4" style="border-color: var(--ok); background: var(--ok-soft);">
        <div class="flex items-center gap-2 mb-2">
          <i class="fa-solid fa-circle-check text-ok text-[14px]" aria-hidden="true"></i>
          <span class="text-ok text-[13px] font-semibold">Validation passed</span>
        </div>
        <div class="text-txt-secondary text-[12px] leading-relaxed">
          Ready to import from <strong class="text-txt">${esc(filename)}</strong>:
          <ul class="mt-2 ml-4 list-disc space-y-0.5">
            <li>${leadCount} leads</li>
            <li>${commentCount} comments</li>
            <li>${auditCount} audit entries</li>
            ${userCount ? `<li>${userCount} users</li>` : ''}
          </ul>
        </div>
      </div>`;
  }
  if (confirmBtn) confirmBtn.disabled = false;
}

function renderImportResult(valid, errors) {
  const el = document.getElementById('import-validation');
  if (!el) return;
  if (valid) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="surface-card p-4" style="border-color: var(--danger); background: var(--danger-soft);">
      <div class="flex items-center gap-2 mb-2">
        <i class="fa-solid fa-circle-exclamation text-danger text-[14px]" aria-hidden="true"></i>
        <span class="text-danger text-[13px] font-semibold">Validation failed (${errors.length})</span>
      </div>
      <ul class="text-[11px] text-danger space-y-1 max-h-40 overflow-y-auto pl-4 list-disc">
        ${errors.slice(0, 15).map((e) => `<li>${esc(e)}</li>`).join('')}
      </ul>
    </div>`;
}

async function confirmImport() {
  if (!STATE.importBuffer) return;
  const btn = document.getElementById('btn-modal-import-confirm');
  if (btn) btn.disabled = true;

  try {
    await DB.bulkImport(STATE.importBuffer);
    STATE.importBuffer = null;
    Modal.close('modal-import');
    refreshUserChrome();
    Router.refresh();
    updateHeaderKPIs();
    showToast('Data imported successfully', 'success');
  } catch (err) {
    console.error('[Octane] Import failed:', err);
    showToast(`Import failed: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}

/* ============================================================================
   23 · CANVAS CHARTS (HiDPI + roundRect + theme-aware)
   ============================================================================ */

const CHART_PALETTE = ['#6d8cff', '#8f6dff', '#5fc9e8', '#ffb648', '#ff7a45', '#ff5d5d', '#4ade80', '#a855f7'];

function pickPalette(i) { return CHART_PALETTE[i % CHART_PALETTE.length]; }

function resolveColor(c) {
  if (!c) return '#6d8cff';
  const s = String(c).trim();
  if (s.startsWith('var(')) {
    const m = s.match(/var\(([^)]+)\)/);
    if (m) {
      const v = cssVar(m[1].trim());
      return v || '#6d8cff';
    }
  }
  return s;
}

function setupHiDPICanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height || parseInt(canvas.getAttribute('height'), 10) || 240));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBarChart(canvas, data, opts = {}) {
  if (!canvas || !Array.isArray(data)) return;

  const money = Boolean(opts.money);
  const { ctx, w, h } = setupHiDPICanvas(canvas);

  const paddingLeft = 110;
  const paddingRight = 60;
  const paddingTop = 6;
  const paddingBottom = 6;
  const barGap = 8;
  const trackWidth = Math.max(60, w - paddingLeft - paddingRight);
  const rowCount = data.length;
  const rowH = Math.max(20, (h - paddingTop - paddingBottom) / Math.max(rowCount, 1));
  const barH = Math.max(12, Math.min(24, rowH - barGap));

  const maxVal = Math.max(1, ...data.map((d) => Number(d.value) || 0));

  const txtPrimary = cssVar('--txt-primary') || '#e8eaf0';
  const txtSecondary = cssVar('--txt-secondary') || '#8a91a6';
  const trackBg = cssVar('--bg-hover') || 'rgba(255,255,255,0.05)';

  ctx.textBaseline = 'middle';
  ctx.font = '600 11px Inter, system-ui, sans-serif';

  data.forEach((d, i) => {
    const y = paddingTop + i * rowH;
    const barY = y + (rowH - barH) / 2;
    const value = Number(d.value) || 0;
    const ratio = value / maxVal;
    const barW = Math.max(0, trackWidth * ratio);

    // Label (left)
    ctx.fillStyle = txtSecondary;
    ctx.textAlign = 'right';
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    let label = String(d.label ?? '');
    const maxLabelW = paddingLeft - 12;
    while (ctx.measureText(label).width > maxLabelW && label.length > 3) {
      label = label.slice(0, -2) + '…';
    }
    ctx.fillText(label, paddingLeft - 10, y + rowH / 2);

    // Track (background bar)
    ctx.fillStyle = trackBg;
    roundRectPath(ctx, paddingLeft, barY, trackWidth, barH, barH / 2);
    ctx.fill();

    // Value bar
    const color = resolveColor(d.color) || pickPalette(i);
    const grad = ctx.createLinearGradient(paddingLeft, 0, paddingLeft + barW, 0);
    grad.addColorStop(0, hexToRgba(color, 0.85));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    roundRectPath(ctx, paddingLeft, barY, Math.max(barW, 2), barH, barH / 2);
    ctx.fill();

    // Value text (right)
    ctx.fillStyle = txtPrimary;
    ctx.textAlign = 'left';
    ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
    const text = money ? formatMoney(value) : String(value);
    ctx.fillText(text, paddingLeft + trackWidth + 10, y + rowH / 2);
  });
}

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(109,140,255,${alpha})`;
  const s = hex.replace('#', '');
  let r, g, b;
  if (s.length === 3) {
    r = parseInt(s[0] + s[0], 16);
    g = parseInt(s[1] + s[1], 16);
    b = parseInt(s[2] + s[2], 16);
  } else if (s.length === 6) {
    r = parseInt(s.slice(0, 2), 16);
    g = parseInt(s.slice(2, 4), 16);
    b = parseInt(s.slice(4, 6), 16);
  } else {
    return `rgba(109,140,255,${alpha})`;
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ============================================================================
   24 · MIGRATION (Sanitize v1 → v2)
   ============================================================================ */

async function migrateSanitizeV2() {
  if (Number(STATE.settings._sanitizeV || 1) >= 2) return;
  console.log('[Octane] Running sanitize migration');
  let touched = 0;

  const FIELDS = ['name', 'phone', 'email', 'agent', 'channel', 'project', 'location', 'requirements', 'followUpNote'];

  for (const lead of STATE.leads) {
    let changed = false;
    for (const f of FIELDS) {
      if (typeof lead[f] === 'string' && lead[f]) {
        const d = Sanitize.decode(lead[f]);
        if (d !== lead[f]) { lead[f] = d; changed = true; }
      }
    }
    if (changed) { touched++; if (STATE.useIDB) await idbPut(STORES.LEADS, lead); }
  }
  if (!STATE.useIDB && touched) LSFallback.save('leads', STATE.leads);

  for (const arr of Object.values(STATE.comments)) {
    for (const c of arr) {
      let changed = false;
      for (const f of ['text', 'author']) {
        if (typeof c[f] === 'string' && c[f]) {
          const d = Sanitize.decode(c[f]);
          if (d !== c[f]) { c[f] = d; changed = true; }
        }
      }
      if (changed) { touched++; if (STATE.useIDB) await idbPut(STORES.COMMENTS, c); }
    }
  }
  if (!STATE.useIDB) LSFallback.save('comments', STATE.comments);

  for (const arr of Object.values(STATE.auditLogs)) {
    for (const e of arr) {
      let changed = false;
      for (const f of ['action', 'agent']) {
        if (typeof e[f] === 'string' && e[f]) {
          const d = Sanitize.decode(e[f]);
          if (d !== e[f]) { e[f] = d; changed = true; }
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
      if (changed) { touched++; if (STATE.useIDB) await idbPut(STORES.AUDIT, e); }
    }
  }
  if (!STATE.useIDB) LSFallback.save('audit', STATE.auditLogs);

  if (STATE.settings.waTemplates && typeof STATE.settings.waTemplates === 'object') {
    for (const [k, v] of Object.entries(STATE.settings.waTemplates)) {
      if (typeof v === 'string') STATE.settings.waTemplates[k] = Sanitize.decode(v);
    }
  }

  STATE.settings._sanitizeV = 2;
  await DB.saveSettings();

  if (touched > 0) {
    console.log(`[Octane] Migrated ${touched} records`);
    showToast(`Migrated ${touched} records`, 'info');
  }
}

/* ============================================================================
   25 · DEMO SEED
   ============================================================================ */

async function seedDemoData() {
  const now = new Date();
  const offsetDays = (d) => {
    const x = new Date(now); x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };

  const demo = [
    {
      name: 'Ahmed Hassan', phone: '+201012345678', email: 'ahmed.hassan@gmail.com',
      stage: 'Negotiation', agent: 'Youssef Hassan', channel: 'Meta Ads',
      project: 'Palm Hills', budget: 450000, location: 'Sheikh Zayed',
      priority: 'urgent',
      requirements: '3 bedrooms, ground floor, garden, near school',
      followUpDate: offsetDays(-1), followUpTime: '14:00',
      followUpNote: 'Discuss final pricing',
    },
    {
      name: 'Sara Mohamed', phone: '+201198765432', email: 'sara.m@outlook.com',
      stage: 'Meeting Scheduled', agent: 'Sara Ahmed', channel: 'Referral',
      project: 'Madinaty', budget: 280000, location: 'New Cairo',
      priority: 'high',
      requirements: '2 bedrooms, high floor, pool view',
      followUpDate: offsetDays(0), followUpTime: '16:30',
      followUpNote: 'Site visit scheduled',
    },
    {
      name: 'Khalid Ibrahim', phone: '+201567890123', email: 'khalid.i@company.com',
      stage: 'Proposal Sent', agent: 'Mohamed Ali', channel: 'Cold Call',
      project: 'New Capital Tower', budget: 750000, location: 'New Administrative Capital',
      priority: 'high',
      requirements: 'Office space, min 200 sqm, corner unit',
      followUpDate: offsetDays(1), followUpTime: '11:00',
      followUpNote: 'Follow up on proposal review',
    },
    {
      name: 'Nour Ali', phone: '+201234567890', email: 'nour.ali@mail.com',
      stage: 'Contacted', agent: 'Layla Ibrahim', channel: 'WhatsApp',
      project: 'Hyde Park', budget: 320000, location: 'New Cairo',
      priority: 'medium',
      requirements: 'Family home, 4 bedrooms, private garden',
      followUpDate: offsetDays(7), followUpTime: '10:00',
      followUpNote: 'Send brochure and pricing',
    },
    {
      name: 'Layla Mansour', phone: '+201111222333', email: '',
      stage: 'New Lead', agent: 'Youssef Hassan', channel: 'Website',
      project: 'Mountain View', budget: 180000, location: '6th of October',
      priority: 'low',
      requirements: '1 bedroom studio, investment purpose',
      followUpDate: '', followUpTime: '',
    },
    {
      name: 'Omar Farouk', phone: '+201444555666', email: 'omar.f@biz.net',
      stage: 'Won', agent: 'Youssef Hassan', channel: 'Direct',
      project: 'Palm Hills', budget: 620000, location: 'Sheikh Zayed',
      priority: 'medium',
      requirements: 'Villa, 5 bedrooms, private pool',
      followUpDate: '', followUpTime: '',
    },
    {
      name: 'Dina Youssef', phone: '+201777888999', email: 'dina.y@gmail.com',
      stage: 'Lost', agent: 'Sara Ahmed', channel: 'Meta Ads',
      project: 'Madinaty', budget: 200000, location: 'New Cairo',
      priority: 'low',
      requirements: 'Small apartment, near metro',
      followUpDate: '', followUpTime: '',
    },
  ];

  for (let i = 0; i < demo.length; i++) {
    const d = demo[i];
    const lead = {
      id: generateId('lead'),
      ...d,
      slaHours: 24,
      attempts: 0,
      createdAt: new Date(now.getTime() - 86400000 * (i + 1)).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    STATE.leads.push(lead);
    await DB.saveLead(lead);
    createAuditEntry(lead.id, 'lead_created', { name: lead.name, stage: lead.stage });
  }
}

/* ============================================================================
   26 · BOOT
   ============================================================================ */

async function boot() {
  try {
    STATE.db = await openDatabase();
    STATE.useIDB = true;
    console.log('[Octane] IndexedDB ready');
  } catch (err) {
    console.warn('[Octane] IndexedDB unavailable, using LocalStorage:', err.message);
    STATE.useIDB = false;
  }

  try {
    await DB.loadAll();
  } catch (err) {
    console.error('[Octane] Load failed:', err);
    showToast('Warning: could not load saved data', 'error');
  }

  // Ensure there is always at least one user
  if (!STATE.users || STATE.users.length === 0) {
    STATE.users = [...DEFAULT_USERS];
    for (const u of STATE.users) {
      try { if (STATE.useIDB) await idbPut(STORES.USERS, u); } catch (_) { /* noop */ }
    }
    if (!STATE.useIDB) LSFallback.save('users', STATE.users);
    STATE.currentUserId = STATE.users[0].id;
  }

  // Ensure currentUserId is valid
  if (!STATE.users.some((u) => u.id === STATE.currentUserId)) {
    STATE.currentUserId = STATE.users[0]?.id || DEFAULT_USERS[0].id;
  }

  await migrateSanitizeV2();

  if (STATE.leads.length === 0) {
    await seedDemoData();
  }

  Confirm.bind();
  installGlobalDelegation();
  Theme.load();

  refreshUserChrome();
  updateHeaderKPIs();
  setSyncStatus('live');

  let startView = 'action-center';
  try {
    const saved = localStorage.getItem('octane8_last_view');
    if (saved && VIEW_META[saved]) startView = saved;
  } catch (_) { /* noop */ }

  Router.navigate(startView);

  // Global SLA header tick
  if (STATE.slaTickTimer) clearInterval(STATE.slaTickTimer);
  STATE.slaTickTimer = setInterval(() => {
    updateHeaderKPIs();
    // Refresh open drawer SLA display
    if (STATE.drawerLeadId && Drawer.isOpen('lead-interaction')) {
      const lead = findLead(STATE.drawerLeadId);
      if (lead) {
        const fuEl = document.querySelector('[data-drawer-lead="followup-summary"]');
        if (fuEl && lead.followUpDate) {
          const iso = `${lead.followUpDate}T${lead.followUpTime || '09:00'}`;
          const band = slaBandOf(lead);
          const color = { breached: '#ff5d5d', critical: '#ff7a45', warning: '#ffb648', ontrack: '#4ade80' }[band] || 'var(--txt-secondary)';
          const cd = countdownOf(lead);
          const cdTxt = cd ? (cd.overdue ? `▲ ${cd.days}d ${pad2(cd.hours)}:${pad2(cd.mins)}:${pad2(cd.secs)}` : `${cd.days}d ${pad2(cd.hours)}:${pad2(cd.mins)}:${pad2(cd.secs)}`) : '';
          fuEl.innerHTML = `
            <i class="fa-regular fa-clock mr-1" aria-hidden="true"></i>
            <span style="color:${color};">${formatDateTimeLocal(iso)}</span>
            <span class="font-mono ml-2" style="color:${color};">${cdTxt}</span>`;
        }
      }
    }
  }, 1000);

  // Re-render charts on window resize
  window.addEventListener('resize', debounce(() => {
    if (STATE.activeView === 'analytics' || STATE.activeView === 'financial-engine') {
      Router.refresh();
    }
  }, 200));

  // Reveal
  const loading = document.getElementById('app-loading');
  const shell = document.getElementById('app-shell');
  if (loading) loading.style.display = 'none';
  if (shell) shell.classList.remove('is-hidden');

  STATE.booted = true;
  console.log('[Octane] CRM V8 Enterprise booted ✓');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}