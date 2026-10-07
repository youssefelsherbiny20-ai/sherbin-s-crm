/* =============================================================
   YOUSSEF SALES CRM v3.0 — CORE JS
   Part 2: IndexedDB, State Management, Schema Validation,
           XSS Sanitization, Multi-Tab Sync, Utilities
============================================================= */

'use strict';

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const DB_NAME    = 'YoussefCRM_v3';
const DB_VERSION = 1;
const STORES = {
  LEADS    : 'leads',
  COMMENTS : 'comments',
  AUDIT    : 'audit_log',
  SETTINGS : 'settings',
};

const STAGES = [
  'New Lead', 'Contacted', 'Meeting Scheduled',
  'Proposal Sent', 'Negotiation', 'Won', 'Lost'
];

const STAGE_CLASS_MAP = {
  'New Lead'          : 'stage-new',
  'Contacted'         : 'stage-contacted',
  'Meeting Scheduled' : 'stage-meeting',
  'Proposal Sent'     : 'stage-proposal',
  'Negotiation'       : 'stage-negotiation',
  'Won'               : 'stage-won',
  'Lost'              : 'stage-lost',
};

const STAGE_EMOJI = {
  'New Lead'          : '🌱',
  'Contacted'         : '📞',
  'Meeting Scheduled' : '📅',
  'Proposal Sent'     : '📄',
  'Negotiation'       : '🤝',
  'Won'               : '🏆',
  'Lost'              : '❌',
};

const PRIORITY_COLORS = {
  low    : '#5a6178',
  medium : '#4f8ef7',
  high   : '#f59e0b',
  urgent : '#ef4444',
};

const CHANNELS = [
  'Meta Ads', 'WhatsApp', 'Referral', 'Cold Call',
  'Direct', 'Website', 'Email', 'Other'
];

const DEFAULT_WA_TEMPLATES = {
  'New Lead'          : 'Hello {name}! 👋 Thank you for your interest. I\'m {agent} from Youssef Real Estate. I\'d love to tell you more about our available properties. When would be a good time to chat?',
  'Contacted'         : 'Hi {name}, following up on our conversation. I have some great properties that match your requirements. Shall we schedule a viewing this week?',
  'Meeting Scheduled' : 'Hi {name}! 📅 Just confirming our meeting. Looking forward to presenting you with the best options for your dream property. See you soon!',
  'Proposal Sent'     : 'Hello {name}! 📄 I\'ve sent over the proposal for {project}. Please take a look and let me know if you have any questions. I\'m here to help!',
  'Negotiation'       : 'Hi {name}, thank you for your counter-offer. I\'ve spoken with our team and I\'m confident we can find the best deal for you. Let\'s finalize this!',
  'Won'               : '🎉 Congratulations {name}! We\'re thrilled to welcome you to the {project} family. Our team will contact you with next steps. Welcome home!',
  'Lost'              : 'Hi {name}, I understand your decision. If you ever reconsider or need real estate assistance in the future, please don\'t hesitate to reach out. All the best!',
};

const DEFAULT_SETTINGS = {
  currentUser    : 'Youssef',
  agents         : ['Youssef', 'Ahmed', 'Sarah', 'Mohamed'],
  projects       : ['Palm Hills', 'Madinaty', 'New Capital Tower', 'Hyde Park', 'Mountain View'],
  waTemplates    : { ...DEFAULT_WA_TEMPLATES },
  storageEngine  : 'indexeddb',
};

/* ─────────────────────────────────────────────
   GLOBAL APPLICATION STATE
───────────────────────────────────────────── */
const STATE = {
  db           : null,            // IDB instance
  useIDB       : false,           // Whether IndexedDB is available
  leads        : [],              // Array of lead objects
  comments     : {},              // { leadId: [comment,...] }
  auditLogs    : {},              // { leadId: [entry,...] }
  settings     : { ...DEFAULT_SETTINGS },
  filters      : {
    search   : '',
    stage    : '',
    agent    : '',
    channel  : '',
    sla      : '',
    project  : '',
  },
  activeLeadId : null,
  currentPage  : 'leads',
  slaTimers    : {},              // { leadId: intervalId }
  acCountdown  : null,           // Interval for action center countdown
  importBuffer : null,           // Validated import data waiting confirmation
};

/* ─────────────────────────────────────────────
   XSS SANITIZER
   Strips all HTML tags and encodes dangerous chars
───────────────────────────────────────────── */
const Sanitize = (() => {
  const ENCODE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  function encode(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/[&<>"'`=/]/g, c => ENCODE_MAP[c]);
  }

  function stripTags(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/<[^>]*>/g, '').trim();
  }

  function text(str) {
    return encode(stripTags(str));
  }

  function number(val, fallback = 0) {
    const n = parseFloat(val);
    return isNaN(n) || !isFinite(n) ? fallback : n;
  }

  function url(str) {
    try {
      const u = new URL(str);
      if (['https:', 'http:', 'tel:', 'mailto:', 'whatsapp:'].includes(u.protocol)) {
        return u.href;
      }
    } catch (_) {}
    return '#';
  }

  return { encode, stripTags, text, number, url };
})();

/* ─────────────────────────────────────────────
   JSON SCHEMA VALIDATOR
   Validates imported backup data structure
───────────────────────────────────────────── */
const SchemaValidator = (() => {

  const LEAD_REQUIRED = ['id','name','stage','createdAt'];
  const LEAD_STAGES   = new Set(STAGES);
  const MAX_LEADS     = 50000;

  function validateLead(lead) {
    if (typeof lead !== 'object' || lead === null) return 'Lead must be an object';
    for (const f of LEAD_REQUIRED) {
      if (!(f in lead)) return `Lead missing required field: "${f}"`;
    }
    if (typeof lead.id !== 'string' || !lead.id.trim()) return 'Lead id must be a non-empty string';
    if (typeof lead.name !== 'string' || !lead.name.trim()) return 'Lead name must be a non-empty string';
    if (!LEAD_STAGES.has(lead.stage)) return `Lead stage "${lead.stage}" is not a valid stage`;
    if (isNaN(Date.parse(lead.createdAt))) return 'Lead createdAt is not a valid date string';
    return null;
  }

  function validateComments(comments) {
    if (typeof comments !== 'object' || comments === null || Array.isArray(comments)) {
      return 'comments must be a plain object';
    }
    for (const [leadId, arr] of Object.entries(comments)) {
      if (!Array.isArray(arr)) return `comments["${leadId}"] must be an array`;
      for (const c of arr) {
        if (typeof c !== 'object' || c === null) return 'Each comment must be an object';
        if (!c.id || !c.text || !c.author || !c.timestamp) {
          return 'Comment missing required field (id, text, author, timestamp)';
        }
      }
    }
    return null;
  }

  function validateAuditLogs(logs) {
    if (typeof logs !== 'object' || logs === null || Array.isArray(logs)) {
      return 'auditLogs must be a plain object';
    }
    for (const [leadId, arr] of Object.entries(logs)) {
      if (!Array.isArray(arr)) return `auditLogs["${leadId}"] must be an array`;
      for (const e of arr) {
        if (typeof e !== 'object' || e === null) return 'Each audit entry must be an object';
        if (!e.id || !e.action || !e.timestamp) {
          return 'Audit entry missing required field (id, action, timestamp)';
        }
      }
    }
    return null;
  }

  function validateSettings(settings) {
    if (typeof settings !== 'object' || settings === null) return 'settings must be an object';
    if (!Array.isArray(settings.agents)) return 'settings.agents must be an array';
    if (!Array.isArray(settings.projects)) return 'settings.projects must be an array';
    return null;
  }

  function validate(data) {
    const errors = [];

    // Top-level structure
    if (typeof data !== 'object' || data === null) {
      return { valid: false, errors: ['Root must be a JSON object'] };
    }
    if (!data.version || !data.exportedAt) {
      errors.push('Missing version or exportedAt at root');
    }

    // Leads
    if (!Array.isArray(data.leads)) {
      errors.push('leads must be an array');
    } else {
      if (data.leads.length > MAX_LEADS) {
        errors.push(`leads array too large (${data.leads.length} > ${MAX_LEADS})`);
      } else {
        const ids = new Set();
        data.leads.forEach((lead, idx) => {
          const err = validateLead(lead);
          if (err) errors.push(`Lead[${idx}]: ${err}`);
          if (lead && lead.id) {
            if (ids.has(lead.id)) errors.push(`Duplicate lead id: ${lead.id}`);
            ids.add(lead.id);
          }
        });
      }
    }

    // Comments
    if (data.comments !== undefined) {
      const err = validateComments(data.comments);
      if (err) errors.push(err);
    }

    // Audit Logs
    if (data.auditLogs !== undefined) {
      const err = validateAuditLogs(data.auditLogs);
      if (err) errors.push(err);
    }

    // Settings
    if (data.settings !== undefined) {
      const err = validateSettings(data.settings);
      if (err) errors.push(err);
    }

    return { valid: errors.length === 0, errors };
  }

  return { validate };
})();

/* ─────────────────────────────────────────────
   UNIQUE ID GENERATOR
───────────────────────────────────────────── */
function generateId() {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 7);
  return `crm_${ts}_${rnd}`;
}

/* ─────────────────────────────────────────────
   INDEXEDDB SETUP
───────────────────────────────────────────── */
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.LEADS)) {
        const leadsStore = db.createObjectStore(STORES.LEADS, { keyPath: 'id' });
        leadsStore.createIndex('stage',     'stage',     { unique: false });
        leadsStore.createIndex('agent',     'agent',     { unique: false });
        leadsStore.createIndex('channel',   'channel',   { unique: false });
        leadsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.COMMENTS)) {
        const commentsStore = db.createObjectStore(STORES.COMMENTS, { keyPath: 'id' });
        commentsStore.createIndex('leadId',    'leadId',    { unique: false });
        commentsStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.AUDIT)) {
        const auditStore = db.createObjectStore(STORES.AUDIT, { keyPath: 'id' });
        auditStore.createIndex('leadId',    'leadId',    { unique: false });
        auditStore.createIndex('agent',     'agent',     { unique: false });
        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };

    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
    req.onblocked  = ()  => reject(new Error('IndexedDB blocked'));
  });
}

/* ─────────────────────────────────────────────
   IDB HELPERS (Promise-wrapped)
───────────────────────────────────────────── */
function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx  = STATE.db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbPut(storeName, record) {
  return new Promise((resolve, reject) => {
    const tx  = STATE.db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function idbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx  = STATE.db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbClear(storeName) {
  return new Promise((resolve, reject) => {
    const tx  = STATE.db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

function idbGetByIndex(storeName, indexName, value) {
  return new Promise((resolve, reject) => {
    const tx    = STATE.db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    const req   = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/* ─────────────────────────────────────────────
   LOCALSTORAGE FALLBACK LAYER
───────────────────────────────────────────── */
const LSFallback = (() => {
  const PREFIX = 'ycrm_';

  function _key(name) { return `${PREFIX}${name}`; }

  function save(name, data) {
    try {
      localStorage.setItem(_key(name), JSON.stringify(data));
      return true;
    } catch(e) {
      console.error('LocalStorage save failed:', e);
      return false;
    }
  }

  function load(name, fallback = null) {
    try {
      const raw = localStorage.getItem(_key(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch(e) {
      return fallback;
    }
  }

  function remove(name) {
    try { localStorage.removeItem(_key(name)); } catch(_) {}
  }

  function clear() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch(_) {}
  }

  return { save, load, remove, clear };
})();

/* ─────────────────────────────────────────────
   PERSISTENCE ADAPTER
   Unified read/write API regardless of engine
───────────────────────────────────────────── */
const DB = {

  async saveLead(lead) {
    if (STATE.useIDB) {
      await idbPut(STORES.LEADS, lead);
    } else {
      LSFallback.save('leads', STATE.leads);
    }
    DB._notifyOtherTabs('lead_changed', lead.id);
  },

  async deleteLead(leadId) {
    if (STATE.useIDB) {
      await idbDelete(STORES.LEADS, leadId);
      // also delete comments and audit entries for this lead
      const comments  = await idbGetByIndex(STORES.COMMENTS, 'leadId', leadId);
      const auditRows = await idbGetByIndex(STORES.AUDIT, 'leadId', leadId);
      for (const c of comments)  await idbDelete(STORES.COMMENTS, c.id);
      for (const a of auditRows) await idbDelete(STORES.AUDIT, a.id);
    } else {
      LSFallback.save('leads',    STATE.leads);
      LSFallback.save('comments', STATE.comments);
      LSFallback.save('audit',    STATE.auditLogs);
    }
    DB._notifyOtherTabs('lead_deleted', leadId);
  },

  async saveComment(comment) {
    if (STATE.useIDB) {
      await idbPut(STORES.COMMENTS, comment);
    } else {
      LSFallback.save('comments', STATE.comments);
    }
    DB._notifyOtherTabs('comment_added', comment.leadId);
  },

  async saveAuditEntry(entry) {
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
    DB._notifyOtherTabs('settings_changed', null);
  },

  async loadAll() {
    if (STATE.useIDB) {
      const [leads, comments, auditRows, settingsArr] = await Promise.all([
        idbGetAll(STORES.LEADS),
        idbGetAll(STORES.COMMENTS),
        idbGetAll(STORES.AUDIT),
        idbGetAll(STORES.SETTINGS),
      ]);

      STATE.leads = leads || [];

      STATE.comments = {};
      (comments || []).forEach(c => {
        if (!STATE.comments[c.leadId]) STATE.comments[c.leadId] = [];
        STATE.comments[c.leadId].push(c);
      });
      for (const arr of Object.values(STATE.comments)) {
        arr.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      STATE.auditLogs = {};
      (auditRows || []).forEach(e => {
        if (!STATE.auditLogs[e.leadId]) STATE.auditLogs[e.leadId] = [];
        STATE.auditLogs[e.leadId].push(e);
      });
      for (const arr of Object.values(STATE.auditLogs)) {
        arr.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
      }

      const settingsRow = (settingsArr || []).find(s => s.key === 'main');
      if (settingsRow) {
        const { key, ...rest } = settingsRow;
        STATE.settings = { ...DEFAULT_SETTINGS, ...rest };
      }
    } else {
      STATE.leads     = LSFallback.load('leads',    []);
      STATE.comments  = LSFallback.load('comments', {});
      STATE.auditLogs = LSFallback.load('audit',    {});
      const savedSettings = LSFallback.load('settings', null);
      if (savedSettings) STATE.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
    }
  },

  async clearAll() {
    if (STATE.useIDB) {
      await Promise.all([
        idbClear(STORES.LEADS),
        idbClear(STORES.COMMENTS),
        idbClear(STORES.AUDIT),
      ]);
    } else {
      LSFallback.clear();
    }
    STATE.leads     = [];
    STATE.comments  = {};
    STATE.auditLogs = {};
    DB._notifyOtherTabs('data_cleared', null);
  },

  async bulkImport(data) {
    if (STATE.useIDB) {
      // Clear existing
      await Promise.all([
        idbClear(STORES.LEADS),
        idbClear(STORES.COMMENTS),
        idbClear(STORES.AUDIT),
      ]);
      // Write leads
      for (const lead of data.leads) {
        await idbPut(STORES.LEADS, lead);
      }
      // Write comments
      if (data.comments) {
        for (const arr of Object.values(data.comments)) {
          for (const c of arr) await idbPut(STORES.COMMENTS, c);
        }
      }
      // Write audit
      if (data.auditLogs) {
        for (const arr of Object.values(data.auditLogs)) {
          for (const e of arr) await idbPut(STORES.AUDIT, e);
        }
      }
      // Settings
      if (data.settings) {
        await idbPut(STORES.SETTINGS, { key: 'main', ...data.settings });
      }
    } else {
      LSFallback.save('leads',    data.leads    || []);
      LSFallback.save('comments', data.comments || {});
      LSFallback.save('audit',    data.auditLogs || {});
      if (data.settings) LSFallback.save('settings', data.settings);
    }
    // Reload into state
    await DB.loadAll();
    DB._notifyOtherTabs('bulk_import', null);
  },

  // Multi-tab sync via localStorage events
  _notifyOtherTabs(event, payload) {
    try {
      localStorage.setItem('ycrm_sync', JSON.stringify({
        event, payload, ts: Date.now(), tabId: SELF_TAB_ID
      }));
    } catch(_) {}
  },
};

/* ─────────────────────────────────────────────
   MULTI-TAB SYNC LISTENER
───────────────────────────────────────────── */
const SELF_TAB_ID = generateId();

window.addEventListener('storage', async (e) => {
  if (e.key !== 'ycrm_sync') return;
  try {
    const msg = JSON.parse(e.newValue);
    if (!msg || msg.tabId === SELF_TAB_ID) return;

    setSyncStatus('syncing');

    switch(msg.event) {
      case 'lead_changed':
      case 'lead_deleted':
      case 'comment_added':
      case 'bulk_import':
      case 'data_cleared':
        await DB.loadAll();
        renderLeads();
        renderPipeline();
        renderAnalytics();
        updateKPIs();
        // Refresh action center if open for affected lead
        if (STATE.activeLeadId && msg.payload === STATE.activeLeadId) {
          openActionCenter(STATE.activeLeadId);
        }
        break;
      case 'settings_changed':
        await DB.loadAll();
        applySettings();
        break;
    }

    setTimeout(() => setSyncStatus('live'), 1500);
  } catch(_) {}
});

function setSyncStatus(status) {
  const dot   = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot || !label) return;
  dot.className   = 'sync-dot';
  if (status === 'syncing') {
    dot.classList.add('syncing');
    label.textContent = 'Syncing...';
  } else if (status === 'error') {
    dot.classList.add('error');
    label.textContent = 'Error';
  } else {
    label.textContent = 'Live';
  }
}

/* ─────────────────────────────────────────────
   TOAST NOTIFICATION SYSTEM
───────────────────────────────────────────── */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${Sanitize.encode(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

/* ─────────────────────────────────────────────
   CONFIRM DIALOG
───────────────────────────────────────────── */
function showConfirm({ icon = '⚠️', title = 'Are you sure?', message = '', okText = 'Confirm', okClass = 'btn-danger', onOk }) {
  const overlay = document.getElementById('confirm-overlay');
  document.getElementById('confirm-icon').textContent    = icon;
  document.getElementById('confirm-title').textContent   = title;
  document.getElementById('confirm-message').textContent = message;

  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = okText;
  okBtn.className   = `btn ${okClass}`;

  overlay.classList.add('open');

  function close() {
    overlay.classList.remove('open');
    okBtn.removeEventListener('click', handleOk);
    document.getElementById('confirm-cancel').removeEventListener('click', close);
  }

  function handleOk() {
    close();
    if (typeof onOk === 'function') onOk();
  }

  okBtn.addEventListener('click', handleOk);
  document.getElementById('confirm-cancel').addEventListener('click', close);
}

/* ─────────────────────────────────────────────
   MODAL HELPERS
───────────────────────────────────────────── */
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('open');
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('open');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
  if (e.target.dataset.close) {
    closeModal(e.target.dataset.close);
  }
});

/* ─────────────────────────────────────────────
   DATE / TIME UTILITIES
───────────────────────────────────────────── */
function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    }).format(new Date(isoString));
  } catch(_) { return '—'; }
}

function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).format(new Date(isoString));
  } catch(_) { return '—'; }
}

function formatRelative(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return formatDate(isoString);
}

function getSLAStatus(lead) {
  if (!lead.followUpDate) return 'no-followup';
  const followUpMs = new Date(
    `${lead.followUpDate}T${lead.followUpTime || '09:00'}`
  ).getTime();
  const now      = Date.now();
  const diffMs   = followUpMs - now;
  const slaHours = (lead.slaHours || 24) * 3600000;

  if (diffMs < 0)           return 'overdue';
  if (diffMs <= slaHours)   return 'due-soon';
  return 'on-track';
}

function getCountdownParts(lead) {
  if (!lead.followUpDate) return null;
  const followUpMs = new Date(
    `${lead.followUpDate}T${lead.followUpTime || '09:00'}`
  ).getTime();
  const diffMs = followUpMs - Date.now();
  const abs    = Math.abs(diffMs);
  const days   = Math.floor(abs / 86400000);
  const hours  = Math.floor((abs % 86400000) / 3600000);
  const mins   = Math.floor((abs % 3600000)  / 60000);
  const secs   = Math.floor((abs % 60000)    / 1000);
  return { days, hours, mins, secs, overdue: diffMs < 0, diffMs };
}

function pad2(n) { return String(n).padStart(2, '0'); }

/* ─────────────────────────────────────────────
   LEAD SCORE CALCULATOR
───────────────────────────────────────────── */
function calcLeadScore(lead) {
  let score = 0;
  const stageScores = {
    'New Lead': 10, 'Contacted': 25, 'Meeting Scheduled': 45,
    'Proposal Sent': 60, 'Negotiation': 80, 'Won': 100, 'Lost': 0
  };
  score += stageScores[lead.stage] || 0;
  if (lead.budget > 0)          score += 10;
  if (lead.phone)               score += 5;
  if (lead.email)               score += 5;
  if (lead.project)             score += 5;
  const commentCount = (STATE.comments[lead.id] || []).length;
  score += Math.min(commentCount * 2, 10);
  const sla = getSLAStatus(lead);
  if (sla === 'on-track')  score += 5;
  if (sla === 'overdue')   score -= 10;
  return Math.max(0, Math.min(100, score));
}

/* ─────────────────────────────────────────────
   AUDIT LOG HELPERS
───────────────────────────────────────────── */
function createAuditEntry(leadId, action, meta = {}) {
  const entry = {
    id        : generateId(),
    leadId,
    action    : Sanitize.text(action),
    agent     : Sanitize.text(STATE.settings.currentUser || 'System'),
    timestamp : new Date().toISOString(),
    meta,
  };
  if (!STATE.auditLogs[leadId]) STATE.auditLogs[leadId] = [];
  STATE.auditLogs[leadId].unshift(entry);
  DB.saveAuditEntry(entry);
  return entry;
}

const AUDIT_ICONS = {
  'stage_change'    : '🔄',
  'comment_added'   : '💬',
  'followup_set'    : '📅',
  'lead_created'    : '🌱',
  'lead_edited'     : '✏️',
  'whatsapp_sent'   : '📱',
  'lead_deleted'    : '🗑',
  'score_updated'   : '📈',
  'default'         : '📋',
};

function getAuditIcon(action) {
  return AUDIT_ICONS[action] || AUDIT_ICONS['default'];
}

/* ─────────────────────────────────────────────
   EXPORT / IMPORT
───────────────────────────────────────────── */
function exportData() {
  const payload = {
    version    : '3.0',
    exportedAt : new Date().toISOString(),
    leads      : STATE.leads,
    comments   : STATE.comments,
    auditLogs  : STATE.auditLogs,
    settings   : STATE.settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `youssef-crm-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported successfully', 'success');
}

function importData(jsonString, filename) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch(e) {
    showImportResult(false, ['Invalid JSON file: ' + e.message]);
    return;
  }

  const { valid, errors } = SchemaValidator.validate(parsed);

  if (!valid) {
    showImportResult(false, errors);
    return;
  }

  STATE.importBuffer = parsed;
  showImportResult(true, [], {
    leads    : parsed.leads.length,
    comments : Object.values(parsed.comments || {}).flat().length,
    filename,
  });
  document.getElementById('btn-confirm-import').disabled = false;
}

function showImportResult(valid, errors, stats = null) {
  const el = document.getElementById('import-validation-result');
  if (!el) return;
  el.style.display = 'block';
  if (valid) {
    el.innerHTML = `
      <div class="sla-badge on-track" style="margin-bottom:8px;">✅ Validation Passed</div>
      <div class="text-sm" style="color:var(--text-secondary);">
        ${stats ? `${stats.leads} leads, ${stats.comments} comments ready to import from <strong>${Sanitize.encode(stats.filename)}</strong>` : ''}
      </div>`;
  } else {
    el.innerHTML = `
      <div class="sla-badge overdue" style="margin-bottom:8px;">❌ Validation Failed (${errors.length} error${errors.length !== 1 ? 's' : ''})</div>
      <ul style="font-size:0.75rem;color:var(--accent-red);padding-left:14px;display:flex;flex-direction:column;gap:3px;">
        ${errors.slice(0, 10).map(e => `<li>${Sanitize.encode(e)}</li>`).join('')}
      </ul>`;
    document.getElementById('btn-confirm-import').disabled = true;
  }
}

/* ─────────────────────────────────────────────
   SETTINGS HELPERS
───────────────────────────────────────────── */
function applySettings() {
  // Populate agent dropdowns
  const agentSelects = [
    document.getElementById('filter-agent'),
    document.getElementById('lf-agent'),
    document.getElementById('ac-audit-filter-agent'),
  ];
  agentSelects.forEach(sel => {
    if (!sel) return;
    const current = sel.value;
    const isFilter = sel.id === 'filter-agent' || sel.id === 'ac-audit-filter-agent';
    sel.innerHTML = isFilter ? '<option value="">All Agents</option>' : '<option value="">Unassigned</option>';
    STATE.settings.agents.forEach(agent => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = Sanitize.text(agent);
      sel.appendChild(opt);
    });
    sel.value = current;
  });

  // Populate project dropdowns
  const projectSelects = [
    document.getElementById('filter-project'),
    document.getElementById('lf-project'),
  ];
  projectSelects.forEach(sel => {
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = sel.id === 'filter-project'
      ? '<option value="">All Projects</option>'
      : '<option value="">Select project...</option>';
    STATE.settings.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = Sanitize.text(p);
      sel.appendChild(opt);
    });
    sel.value = current;
  });

  // Current user input
  const usernameInput = document.getElementById('setting-username');
  if (usernameInput) usernameInput.value = STATE.settings.currentUser || '';

  // Storage engine badge
  const engineLabel  = document.getElementById('storage-engine-label');
  const engineBadge  = document.getElementById('storage-engine-badge');
  if (engineLabel && engineBadge) {
    if (STATE.useIDB) {
      engineLabel.textContent   = 'IndexedDB — High-capacity storage active';
      engineBadge.className     = 'sla-badge on-track';
      engineBadge.textContent   = '✅ IndexedDB';
    } else {
      engineLabel.textContent   = 'LocalStorage fallback — Limited to ~5MB';
      engineBadge.className     = 'sla-badge due-soon';
      engineBadge.textContent   = '⚠️ LocalStorage';
    }
  }

  // Agents list in settings
  renderAgentsList();
  renderProjectsList();
  renderWATemplatesSettings();
}

function renderAgentsList() {
  const container = document.getElementById('agents-list');
  if (!container) return;
  container.innerHTML = STATE.settings.agents.map((agent, idx) => `
    <div style="display:flex;align-items:center;gap:8px;">
      <div class="avatar-sm">${Sanitize.encode(agent.charAt(0).toUpperCase())}</div>
      <span style="font-size:0.875rem;flex:1;">${Sanitize.encode(agent)}</span>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="removeAgent(${idx})" title="Remove">✕</button>
    </div>`).join('');
}

function renderProjectsList() {
  const container = document.getElementById('projects-list');
  if (!container) return;
  container.innerHTML = STATE.settings.projects.map((p, idx) => `
    <div style="display:flex;align-items:center;gap:4px;background:var(--bg-card);border:1px solid var(--border-color);padding:3px 10px;border-radius:var(--radius-full);font-size:0.78rem;">
      <span>${Sanitize.encode(p)}</span>
      <button class="btn btn-ghost btn-sm btn-icon" style="padding:2px 4px;font-size:0.65rem;" onclick="removeProject(${idx})" title="Remove">✕</button>
    </div>`).join('');
}

function renderWATemplatesSettings() {
  const container = document.getElementById('wa-templates-list');
  if (!container) return;
  container.innerHTML = STAGES.map(stage => `
    <div class="form-group">
      <label class="form-label">${Sanitize.encode(stage)}</label>
      <textarea class="form-control full" id="wa-tpl-${stage.replace(/\s+/g,'_')}" style="min-height:60px;">${Sanitize.encode(STATE.settings.waTemplates[stage] || '')}</textarea>
    </div>`).join('');

  // Add save button
  container.innerHTML += `
    <button class="btn btn-primary btn-sm" onclick="saveWATemplates()">💾 Save Templates</button>
  `;
}

function saveWATemplates() {
  STAGES.forEach(stage => {
    const el = document.getElementById(`wa-tpl-${stage.replace(/\s+/g,'_')}`);
    if (el) STATE.settings.waTemplates[stage] = Sanitize.text(el.value);
  });
  DB.saveSettings();
  showToast('WhatsApp templates saved', 'success');
}

window.removeAgent = function(idx) {
  const agent = STATE.settings.agents[idx];
  showConfirm({
    icon: '👤', title: 'Remove Agent',
    message: `Remove "${agent}" from the agent list?`,
    okText: 'Remove', okClass: 'btn-danger',
    onOk: async () => {
      STATE.settings.agents.splice(idx, 1);
      await DB.saveSettings();
      applySettings();
      showToast(`Agent "${agent}" removed`, 'warning');
    }
  });
};

window.removeProject = function(idx) {
  const project = STATE.settings.projects[idx];
  showConfirm({
    icon: '🏗', title: 'Remove Project',
    message: `Remove "${project}" from the project list?`,
    okText: 'Remove', okClass: 'btn-danger',
    onOk: async () => {
      STATE.settings.projects.splice(idx, 1);
      await DB.saveSettings();
      applySettings();
      showToast(`Project "${project}" removed`, 'warning');
    }
  });
};/* =============================================================
   YOUSSEF SALES CRM v3.0 — PART 3
   Action Center, Lead Management, Rendering, Event Listeners
============================================================= */

/* ─────────────────────────────────────────────
   LEAD CRUD OPERATIONS
───────────────────────────────────────────── */
function buildLeadFromForm() {
  const errors = [];
  const name = Sanitize.text(document.getElementById('lf-name').value.trim());
  if (!name) errors.push('Lead name is required');

  if (errors.length) return { errors, lead: null };

  const id = document.getElementById('lf-id').value || generateId();

  const followUpDate = document.getElementById('lf-followup-date').value;
  const followUpTime = document.getElementById('lf-followup-time').value;

  const lead = {
    id,
    name,
    phone      : Sanitize.text(document.getElementById('lf-phone').value.trim()),
    email      : Sanitize.text(document.getElementById('lf-email').value.trim()),
    stage      : document.getElementById('lf-stage').value || 'New Lead',
    agent      : Sanitize.text(document.getElementById('lf-agent').value),
    channel    : Sanitize.text(document.getElementById('lf-channel').value),
    project    : Sanitize.text(document.getElementById('lf-project').value),
    budget     : Sanitize.number(document.getElementById('lf-budget').value, 0),
    location   : Sanitize.text(document.getElementById('lf-location').value.trim()),
    priority   : document.getElementById('lf-priority').value || 'medium',
    requirements : Sanitize.text(document.getElementById('lf-requirements').value.trim()),
    followUpDate : followUpDate || '',
    followUpTime : followUpTime || '',
    followUpNote : Sanitize.text(document.getElementById('lf-followup-note').value.trim()),
    slaHours   : Sanitize.number(document.getElementById('lf-sla-hours').value, 24),
    updatedAt  : new Date().toISOString(),
  };

  const existingLead = STATE.leads.find(l => l.id === id);
  if (!existingLead) {
    lead.createdAt = new Date().toISOString();
    const initialNote = Sanitize.text(document.getElementById('lf-note').value.trim());
    if (initialNote) {
      lead._initialNote = initialNote;
    }
  } else {
    lead.createdAt = existingLead.createdAt;
    lead._oldStage = existingLead.stage;
  }

  return { errors: [], lead };
}

async function saveLead() {
  const { errors, lead } = buildLeadFromForm();

  const errorEl = document.getElementById('lf-errors');
  if (errors.length) {
    errorEl.style.display = 'block';
    errorEl.textContent   = errors.join(', ');
    return;
  }
  errorEl.style.display = 'none';

  const isNew = !STATE.leads.find(l => l.id === lead.id);

  if (isNew) {
    STATE.leads.unshift(lead);
    createAuditEntry(lead.id, 'lead_created', { name: lead.name, stage: lead.stage });
    if (lead._initialNote) {
      const comment = {
        id        : generateId(),
        leadId    : lead.id,
        text      : lead._initialNote,
        author    : Sanitize.text(STATE.settings.currentUser || 'System'),
        timestamp : new Date().toISOString(),
      };
      delete lead._initialNote;
      if (!STATE.comments[lead.id]) STATE.comments[lead.id] = [];
      STATE.comments[lead.id].unshift(comment);
      await DB.saveComment(comment);
      createAuditEntry(lead.id, 'comment_added', { text: lead._initialNote });
    }
  } else {
    const idx = STATE.leads.findIndex(l => l.id === lead.id);
    if (idx > -1) {
      const oldStage = lead._oldStage;
      delete lead._oldStage;
      delete lead._initialNote;
      STATE.leads[idx] = lead;
      if (oldStage && oldStage !== lead.stage) {
        createAuditEntry(lead.id, 'stage_change', { from: oldStage, to: lead.stage });
      }
      createAuditEntry(lead.id, 'lead_edited', { name: lead.name });
    }
  }

  await DB.saveLead(lead);

  closeModal('lead-form-modal');
  resetLeadForm();
  renderLeads();
  renderPipeline();
  renderAnalytics();
  updateKPIs();
  showToast(isNew ? `Lead "${lead.name}" added` : `Lead "${lead.name}" updated`, 'success');

  // If action center is open for this lead, refresh it
  if (STATE.activeLeadId === lead.id) {
    openActionCenter(lead.id);
  }
}

async function deleteLead(leadId) {
  const lead = STATE.leads.find(l => l.id === leadId);
  if (!lead) return;

  showConfirm({
    icon    : '🗑',
    title   : 'Delete Lead',
    message : `Permanently delete "${lead.name}" and all their data?`,
    okText  : 'Delete',
    okClass : 'btn-danger',
    onOk    : async () => {
      STATE.leads = STATE.leads.filter(l => l.id !== leadId);
      delete STATE.comments[leadId];
      delete STATE.auditLogs[leadId];

      await DB.deleteLead(leadId);

      if (STATE.activeLeadId === leadId) {
        closeModal('action-center-modal');
        STATE.activeLeadId = null;
      }

      renderLeads();
      renderPipeline();
      renderAnalytics();
      updateKPIs();
      showToast(`Lead "${lead.name}" deleted`, 'warning');
    }
  });
}

async function changeLeadStage(leadId, newStage) {
  const lead = STATE.leads.find(l => l.id === leadId);
  if (!lead || lead.stage === newStage) return;

  const oldStage  = lead.stage;
  lead.stage      = newStage;
  lead.updatedAt  = new Date().toISOString();

  await DB.saveLead(lead);
  createAuditEntry(leadId, 'stage_change', { from: oldStage, to: newStage });

  renderLeads();
  renderPipeline();
  updateKPIs();
  showToast(`Stage → ${newStage}`, 'success');

  // Refresh action center if open
  if (STATE.activeLeadId === leadId) {
    renderActionCenter(lead);
  }
}

function resetLeadForm() {
  document.getElementById('lf-id').value           = '';
  document.getElementById('lf-name').value          = '';
  document.getElementById('lf-phone').value         = '';
  document.getElementById('lf-email').value         = '';
  document.getElementById('lf-stage').value         = 'New Lead';
  document.getElementById('lf-agent').value         = '';
  document.getElementById('lf-channel').value       = 'Meta Ads';
  document.getElementById('lf-project').value       = '';
  document.getElementById('lf-budget').value        = '';
  document.getElementById('lf-location').value      = '';
  document.getElementById('lf-priority').value      = 'medium';
  document.getElementById('lf-requirements').value  = '';
  document.getElementById('lf-note').value          = '';
  document.getElementById('lf-followup-date').value = '';
  document.getElementById('lf-followup-time').value = '';
  document.getElementById('lf-followup-note').value = '';
  document.getElementById('lf-sla-hours').value     = '24';
  document.getElementById('lf-errors').style.display = 'none';
  document.getElementById('lead-form-title').textContent = 'Add New Lead';
  // Reset tabs
  switchLeadFormTab('lf-tab-basic');
}

function populateLeadForm(lead) {
  document.getElementById('lf-id').value          = lead.id;
  document.getElementById('lf-name').value        = lead.name;
  document.getElementById('lf-phone').value       = lead.phone        || '';
  document.getElementById('lf-email').value       = lead.email        || '';
  document.getElementById('lf-stage').value       = lead.stage        || 'New Lead';
  document.getElementById('lf-agent').value       = lead.agent        || '';
  document.getElementById('lf-channel').value     = lead.channel      || 'Meta Ads';
  document.getElementById('lf-project').value     = lead.project      || '';
  document.getElementById('lf-budget').value      = lead.budget       || '';
  document.getElementById('lf-location').value    = lead.location     || '';
  document.getElementById('lf-priority').value    = lead.priority     || 'medium';
  document.getElementById('lf-requirements').value= lead.requirements || '';
  document.getElementById('lf-followup-date').value = lead.followUpDate || '';
  document.getElementById('lf-followup-time').value = lead.followUpTime || '';
  document.getElementById('lf-followup-note').value = lead.followUpNote || '';
  document.getElementById('lf-sla-hours').value   = lead.slaHours     || 24;
  document.getElementById('lead-form-title').textContent = `Edit — ${lead.name}`;
  switchLeadFormTab('lf-tab-basic');
}

/* ─────────────────────────────────────────────
   LEAD FORM TABS
───────────────────────────────────────────── */
function switchLeadFormTab(targetId) {
  document.querySelectorAll('#lead-form-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === targetId);
  });
  document.querySelectorAll('#lead-form-modal .tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === targetId);
  });
}

document.getElementById('lead-form-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn && btn.dataset.tab) switchLeadFormTab(btn.dataset.tab);
});

/* ─────────────────────────────────────────────
   FILTER & SEARCH
───────────────────────────────────────────── */
function getFilteredLeads() {
  const { search, stage, agent, channel, sla, project } = STATE.filters;
  const searchLower = search.toLowerCase();

  return STATE.leads.filter(lead => {
    if (search && !(
      lead.name.toLowerCase().includes(searchLower)    ||
      (lead.phone   || '').toLowerCase().includes(searchLower) ||
      (lead.email   || '').toLowerCase().includes(searchLower) ||
      (lead.project || '').toLowerCase().includes(searchLower) ||
      (lead.location|| '').toLowerCase().includes(searchLower)
    )) return false;

    if (stage   && lead.stage   !== stage)   return false;
    if (agent   && lead.agent   !== agent)   return false;
    if (channel && lead.channel !== channel) return false;
    if (project && lead.project !== project) return false;

    if (sla) {
      const slaStatus = getSLAStatus(lead);
      if (slaStatus !== sla) return false;
    }

    return true;
  });
}

/* ─────────────────────────────────────────────
   KPI METRICS
───────────────────────────────────────────── */
function updateKPIs() {
  const active = STATE.leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost');
  const won    = STATE.leads.filter(l => l.stage === 'Won').length;
  const closed = STATE.leads.filter(l => l.stage === 'Won' || l.stage === 'Lost').length;
  const overdue  = STATE.leads.filter(l => getSLAStatus(l) === 'overdue').length;
  const dueSoon  = STATE.leads.filter(l => getSLAStatus(l) === 'due-soon').length;
  const totalBudget = active.reduce((s, l) => s + (l.budget || 0), 0);
  const closeRate = closed > 0 ? Math.round((won / closed) * 100) : 0;

  // Today's activity
  const today = new Date().toISOString().slice(0, 10);
  let todayActivity = 0;
  Object.values(STATE.auditLogs).forEach(entries => {
    entries.forEach(e => {
      if (e.timestamp && e.timestamp.startsWith(today)) todayActivity++;
    });
  });

  const fmt = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M`
            : n >= 1000    ? `$${(n/1000).toFixed(0)}K`
            : `$${n}`;

  setText('kpi-pipeline-value', fmt(totalBudget));
  setText('kpi-overdue',        overdue);
  setText('kpi-close-rate',     `${closeRate}%`);
  setText('kpi-today-activity', todayActivity);
  setText('kpi-total-leads',    STATE.leads.length);
  setText('kpi-due-soon',       dueSoon);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ─────────────────────────────────────────────
   RENDER LEADS LIST
───────────────────────────────────────────── */
function renderLeads() {
  const container = document.getElementById('leads-container');
  const emptyEl   = document.getElementById('leads-empty');
  const filtered  = getFilteredLeads();

  if (!container) return;

  // Clear old SLA timers
  Object.values(STATE.slaTimers).forEach(t => clearInterval(t));
  STATE.slaTimers = {};

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = '';
      container.appendChild(emptyEl);
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  container.innerHTML = filtered.map(lead => buildLeadRowHTML(lead)).join('');

  // Start countdown timers
  filtered.forEach(lead => {
    if (lead.followUpDate) {
      const countdownEl = document.getElementById(`countdown-${lead.id}`);
      if (countdownEl) {
        updateCountdownEl(countdownEl, lead);
        STATE.slaTimers[lead.id] = setInterval(() => {
          updateCountdownEl(countdownEl, lead);
        }, 30000);
      }
    }
  });
}

function buildLeadRowHTML(lead) {
  const sla         = getSLAStatus(lead);
  const stageClass  = STAGE_CLASS_MAP[lead.stage] || 'stage-new';
  const priColor    = PRIORITY_COLORS[lead.priority] || PRIORITY_COLORS.medium;
  const initials    = lead.name.trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
  const commentCount = (STATE.comments[lead.id] || []).length;

  const slaBadgeClass = sla === 'no-followup' ? 'no-followup' : sla;
  const slaLabel = {
    'overdue'   : '🔴 Overdue',
    'due-soon'  : '🟡 Due Soon',
    'on-track'  : '🟢 On Track',
    'no-followup': '— No Date',
  }[sla];

  let countdownHtml = '';
  if (lead.followUpDate) {
    countdownHtml = `<span class="countdown-timer ${sla}" id="countdown-${lead.id}">…</span>`;
  } else {
    countdownHtml = `<span class="text-muted text-xs">—</span>`;
  }

  const agentInitial = lead.agent ? lead.agent.charAt(0).toUpperCase() : '?';

  return `
    <div class="lead-row ${sla !== 'no-followup' ? sla : ''}"
         data-lead-id="${Sanitize.encode(lead.id)}"
         onclick="openActionCenter('${Sanitize.encode(lead.id)}')"
         role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')openActionCenter('${Sanitize.encode(lead.id)}')">

      <div class="lead-priority">
        <div class="priority-dot" style="background:${priColor};" title="Priority: ${Sanitize.encode(lead.priority)}"></div>
      </div>

      <div class="lead-info">
        <div class="lead-name">${Sanitize.encode(lead.name)}</div>
        <div class="lead-contact">
          ${lead.phone ? `📞 ${Sanitize.encode(lead.phone)}` : ''}
          ${lead.project ? `• 🏗 ${Sanitize.encode(lead.project)}` : ''}
          ${commentCount > 0 ? `• 💬 ${commentCount}` : ''}
        </div>
      </div>

      <div>
        <span class="stage-badge ${stageClass}">
          ${STAGE_EMOJI[lead.stage] || ''} ${Sanitize.encode(lead.stage)}
        </span>
      </div>

      <div class="col-channel">
        <span class="channel-badge">${Sanitize.encode(lead.channel || '—')}</span>
      </div>

      <div class="col-assignee">
        ${lead.agent ? `
          <div class="assignee-chip">
            <div class="avatar-sm">${Sanitize.encode(agentInitial)}</div>
            <span class="truncate">${Sanitize.encode(lead.agent)}</span>
          </div>` : '<span class="text-muted text-xs">Unassigned</span>'}
      </div>

      <div>
        <span class="sla-badge ${slaBadgeClass}">
          ${sla !== 'no-followup' ? '<span class="sla-pulse"></span>' : ''}
          ${slaLabel}
        </span>
      </div>

      <div class="col-followup" style="display:flex;flex-direction:column;gap:2px;">
        ${lead.followUpDate
          ? `<span class="text-xs">${formatDate(lead.followUpDate + 'T' + (lead.followUpTime || '00:00'))}</span>`
          : '<span class="text-muted text-xs">—</span>'}
        ${countdownHtml}
      </div>

      <div class="lead-row-actions" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm btn-icon" title="Quick WhatsApp"
          onclick="openWAModal('${Sanitize.encode(lead.id)}')">📱</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Edit"
          onclick="editLead('${Sanitize.encode(lead.id)}')">✏️</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Delete"
          onclick="deleteLead('${Sanitize.encode(lead.id)}')">🗑</button>
      </div>
    </div>
  `;
}

function updateCountdownEl(el, lead) {
  if (!el || !lead.followUpDate) return;
  const parts = getCountdownParts(lead);
  if (!parts) { el.textContent = '—'; return; }

  const sla = getSLAStatus(lead);
  el.className = `countdown-timer ${sla}`;

  if (parts.overdue) {
    el.textContent = `▲ ${parts.days > 0 ? parts.days + 'd ' : ''}${pad2(parts.hours)}:${pad2(parts.mins)} ago`;
  } else {
    el.textContent = `${parts.days > 0 ? parts.days + 'd ' : ''}${pad2(parts.hours)}:${pad2(parts.mins)}`;
  }
}

/* ─────────────────────────────────────────────
   RENDER PIPELINE (KANBAN)
───────────────────────────────────────────── */
function renderPipeline() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const stagesToShow = STAGES.filter(s => s !== 'Lost'); // optionally include Lost

  board.innerHTML = STAGES.map(stage => {
    const leads = STATE.leads.filter(l => l.stage === stage);
    const cls   = STAGE_CLASS_MAP[stage] || 'stage-new';

    const cards = leads.map(lead => {
      const sla = getSLAStatus(lead);
      return `
        <div class="kanban-card" onclick="openActionCenter('${Sanitize.encode(lead.id)}')">
          <div class="kanban-card-name">${Sanitize.encode(lead.name)}</div>
          <div class="kanban-card-meta">
            ${lead.project ? `<span>🏗 ${Sanitize.encode(lead.project)}</span>` : ''}
            ${lead.budget  ? `<span>💰 $${lead.budget.toLocaleString()}</span>` : ''}
            ${lead.agent   ? `<span>👤 ${Sanitize.encode(lead.agent)}</span>` : ''}
            ${lead.followUpDate ? `<span class="${sla === 'overdue' ? 'text-red' : ''}" style="${sla==='overdue'?'color:var(--accent-red)':''}">📅 ${formatDate(lead.followUpDate)}</span>` : ''}
            <span class="channel-badge" style="margin-top:4px;align-self:flex-start;">${Sanitize.encode(lead.channel || '—')}</span>
          </div>
        </div>`;
    }).join('');

    const stageColorVar = {
      'New Lead':'--stage-new','Contacted':'--stage-contacted',
      'Meeting Scheduled':'--stage-meeting','Proposal Sent':'--stage-proposal',
      'Negotiation':'--stage-negotiation','Won':'--stage-won','Lost':'--stage-lost',
    }[stage] || '--accent-blue';

    return `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <div class="kanban-col-title">
            <div class="kanban-col-dot" style="background:var(${stageColorVar});"></div>
            ${STAGE_EMOJI[stage]} ${Sanitize.encode(stage)}
          </div>
          <span class="kanban-col-count">${leads.length}</span>
        </div>
        ${cards || `<div style="text-align:center;padding:20px 0;font-size:0.75rem;color:var(--text-muted);">Empty</div>`}
      </div>`;
  }).join('');
}

/* ─────────────────────────────────────────────
   RENDER ANALYTICS
───────────────────────────────────────────── */
function renderAnalytics() {
  const container = document.getElementById('analytics-grid');
  if (!container) return;
  container.innerHTML = '';

  // Leads by Stage
  const stageData = STAGES.map(s => ({
    label : s,
    value : STATE.leads.filter(l => l.stage === s).length,
    color : `var(${({'New Lead':'--stage-new','Contacted':'--stage-contacted','Meeting Scheduled':'--stage-meeting','Proposal Sent':'--stage-proposal','Negotiation':'--stage-negotiation','Won':'--stage-won','Lost':'--stage-lost'}[s]||'--accent-blue')})`,
  }));
  container.appendChild(buildBarChart('📊 Leads by Stage', stageData));

  // Leads by Channel
  const channelMap = {};
  STATE.leads.forEach(l => { channelMap[l.channel || 'Unknown'] = (channelMap[l.channel || 'Unknown'] || 0) + 1; });
  const channelData = Object.entries(channelMap)
    .sort((a,b) => b[1]-a[1])
    .map(([label, value], i) => ({
      label, value,
      color: ['var(--accent-blue)','var(--accent-purple)','var(--accent-cyan)','var(--accent-yellow)','var(--accent-orange)','var(--accent-green)','var(--accent-red)'][i % 7]
    }));
  container.appendChild(buildBarChart('📡 Leads by Channel', channelData));

  // Leads by Agent
  const agentMap = {};
  STATE.leads.forEach(l => { const a = l.agent || 'Unassigned'; agentMap[a] = (agentMap[a] || 0) + 1; });
  const agentData = Object.entries(agentMap)
    .sort((a,b) => b[1]-a[1])
    .map(([label, value]) => ({ label, value, color: 'var(--accent-blue)' }));
  container.appendChild(buildBarChart('👤 Leads by Agent', agentData));

  // Budget by Project
  const projMap = {};
  STATE.leads.forEach(l => { if (l.project && l.budget) projMap[l.project] = (projMap[l.project] || 0) + l.budget; });
  const projData = Object.entries(projMap)
    .sort((a,b) => b[1]-a[1])
    .map(([label, value]) => ({ label, value, color: 'var(--accent-green)', isMonetary: true }));
  if (projData.length > 0) container.appendChild(buildBarChart('💰 Pipeline Value by Project', projData));

  // SLA Overview
  const slaMap = { overdue: 0, 'due-soon': 0, 'on-track': 0, 'no-followup': 0 };
  STATE.leads.forEach(l => { const s = getSLAStatus(l); slaMap[s] = (slaMap[s]||0)+1; });
  const slaData = [
    { label: '🔴 Overdue',    value: slaMap.overdue,     color: 'var(--accent-red)'   },
    { label: '🟡 Due Soon',   value: slaMap['due-soon'], color: 'var(--accent-yellow)'},
    { label: '🟢 On Track',   value: slaMap['on-track'], color: 'var(--accent-green)' },
    { label: '⬜ No Date',    value: slaMap['no-followup'], color: 'var(--text-muted)'},
  ];
  container.appendChild(buildBarChart('⏱ SLA Health Overview', slaData));

  // Priority breakdown
  const priMap = { urgent:0, high:0, medium:0, low:0 };
  STATE.leads.forEach(l => { priMap[l.priority || 'medium'] = (priMap[l.priority||'medium']||0)+1; });
  const priData = [
    { label: '🔥 Urgent',  value: priMap.urgent, color: 'var(--accent-red)' },
    { label: '⚡ High',    value: priMap.high,   color: 'var(--accent-yellow)' },
    { label: '📋 Medium',  value: priMap.medium, color: 'var(--accent-blue)' },
    { label: '📝 Low',     value: priMap.low,    color: 'var(--text-muted)' },
  ];
  container.appendChild(buildBarChart('🎯 Priority Breakdown', priData));
}

function buildBarChart(title, data) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  const maxVal = Math.max(...data.map(d => d.value), 1);
  card.innerHTML = `
    <div class="chart-title">${title}</div>
    <div class="bar-chart">
      ${data.map(d => `
        <div class="bar-row">
          <div class="bar-label" title="${Sanitize.encode(d.label)}">${Sanitize.encode(d.label)}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.round((d.value/maxVal)*100)}%;background:${d.color};">
              ${d.value > 0 ? (d.isMonetary ? `$${(d.value/1000).toFixed(0)}K` : d.value) : ''}
            </div>
          </div>
          <div class="bar-value">${d.isMonetary ? `$${(d.value/1000).toFixed(0)}K` : d.value}</div>
        </div>`).join('')}
    </div>`;
  return card;
}

/* ─────────────────────────────────────────────
   ACTION CENTER
───────────────────────────────────────────── */
window.openActionCenter = function(leadId) {
  const lead = STATE.leads.find(l => l.id === leadId);
  if (!lead) return;

  STATE.activeLeadId = leadId;
  renderActionCenter(lead);
  openModal('action-center-modal');
};

function renderActionCenter(lead) {
  // Header
  const initials = lead.name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('ac-avatar').textContent   = initials;
  document.getElementById('ac-lead-name').textContent = lead.name;
  document.getElementById('ac-modal-title').textContent = `Action Center — ${lead.name}`;

  // Contact info
  const contactEl = document.getElementById('ac-lead-contact');
  contactEl.innerHTML = [
    lead.phone   ? `<span>📞 ${Sanitize.encode(lead.phone)}</span>`  : '',
    lead.email   ? `<span>✉️ ${Sanitize.encode(lead.email)}</span>`  : '',
    lead.agent   ? `<span>👤 ${Sanitize.encode(lead.agent)}</span>`  : '',
    lead.channel ? `<span>📡 ${Sanitize.encode(lead.channel)}</span>`: '',
    `<span class="stage-badge ${STAGE_CLASS_MAP[lead.stage] || 'stage-new'}" style="font-size:0.68rem;">${STAGE_EMOJI[lead.stage]||''} ${Sanitize.encode(lead.stage)}</span>`,
    `<span style="font-size:0.68rem;color:var(--text-muted);">Added ${formatRelative(lead.createdAt)}</span>`,
  ].filter(Boolean).join('');

  // Pipeline Stepper
  renderPipelineStepper(lead);

  // SLA Panel
  renderSLAPanel(lead);

  // Metadata grid
  renderMetaGrid(lead);

  // Stage change sidebar buttons
  renderStageSidebar(lead);

  // Quick actions
  renderQuickActions(lead);

  // WA Templates sidebar
  renderWASidebar(lead);

  // Lead score panel
  renderLeadScore(lead);

  // Comments
  renderComments(lead.id);

  // Audit Log
  renderAuditLog(lead.id);

  // Author label for new comment
  document.getElementById('ac-comment-author-label').textContent =
    STATE.settings.currentUser || 'You';

  // Follow-up inputs
  document.getElementById('ac-followup-date-input').value = lead.followUpDate || '';
  document.getElementById('ac-followup-time-input').value = lead.followUpTime || '';

  // Action Center tabs reset
  switchAcTab('ac-tab-comments');

  // Start AC countdown
  startACCountdown(lead);
}

function renderPipelineStepper(lead) {
  const container = document.getElementById('ac-pipeline-stepper');
  if (!container) return;
  const currentIdx = STAGES.indexOf(lead.stage);
  container.innerHTML = STAGES.map((stage, idx) => {
    const cls = STAGE_CLASS_MAP[stage] || 'stage-new';
    const isActive    = idx === currentIdx;
    const isCompleted = idx < currentIdx;
    const isLost      = stage === 'Lost';
    const classes = [
      'pipeline-step', cls,
      isActive    ? 'active' : '',
      isCompleted ? 'completed' : '',
    ].filter(Boolean).join(' ');
    return `
      <div class="${classes}" onclick="changeLeadStage('${Sanitize.encode(lead.id)}', '${Sanitize.encode(stage)}')" title="Set stage to ${Sanitize.encode(stage)}">
        <div class="step-indicator"></div>
        <div class="step-label">${STAGE_EMOJI[stage]} ${Sanitize.encode(stage)}</div>
      </div>`;
  }).join('');
}

function renderSLAPanel(lead) {
  const sla     = getSLAStatus(lead);
  const badgeEl = document.getElementById('ac-sla-badge');

  const badgeMap = {
    'overdue'    : { cls: 'overdue',    text: '🔴 Overdue'  },
    'due-soon'   : { cls: 'due-soon',   text: '🟡 Due Soon' },
    'on-track'   : { cls: 'on-track',   text: '🟢 On Track' },
    'no-followup': { cls: 'no-followup',text: '⬜ Not Set'  },
  };

  const badge = badgeMap[sla] || badgeMap['no-followup'];
  badgeEl.className   = `sla-badge ${badge.cls}`;
  badgeEl.textContent = badge.text;

  // Follow-up datetime label
  const dtLabel = document.getElementById('ac-followup-datetime-label');
  if (lead.followUpDate) {
    const dt = `${lead.followUpDate}T${lead.followUpTime || '09:00'}`;
    dtLabel.textContent = `📅 ${formatDateTime(dt)}`;
  } else {
    dtLabel.textContent = 'No follow-up scheduled';
  }
}

function startACCountdown(lead) {
  if (STATE.acCountdown) clearInterval(STATE.acCountdown);

  function update() {
    const parts    = getCountdownParts(lead);
    const daysEl   = document.getElementById('ac-days-val');
    const hoursEl  = document.getElementById('ac-hours-val');
    const minsEl   = document.getElementById('ac-mins-val');
    const progEl   = document.getElementById('ac-sla-progress');

    if (!daysEl) return;

    if (!parts) {
      daysEl.textContent  = '—';
      hoursEl.textContent = '—';
      minsEl.textContent  = '—';
      if (progEl) { progEl.style.width = '0%'; progEl.style.background = 'var(--border-color)'; }
      return;
    }

    const sla = getSLAStatus(lead);
    const color = sla === 'overdue' ? 'var(--accent-red)'
                : sla === 'due-soon' ? 'var(--accent-yellow)'
                : 'var(--accent-green)';

    daysEl.textContent  = pad2(parts.days);
    hoursEl.textContent = pad2(parts.hours);
    minsEl.textContent  = pad2(parts.mins);
    daysEl.style.color  = hoursEl.style.color = minsEl.style.color = color;

    // Progress bar: percentage of SLA window elapsed
    if (progEl && lead.followUpDate) {
      const followUpMs   = new Date(`${lead.followUpDate}T${lead.followUpTime||'09:00'}`).getTime();
      const slaWindowMs  = (lead.slaHours || 24) * 3600000;
      const startOfWindow = followUpMs - slaWindowMs;
      const elapsed      = Date.now() - startOfWindow;
      const pct          = Math.min(100, Math.max(0, (elapsed / slaWindowMs) * 100));
      progEl.style.width      = `${pct}%`;
      progEl.style.background = color;
    }
  }

  update();
  STATE.acCountdown = setInterval(update, 1000);
}

function renderMetaGrid(lead) {
  const container = document.getElementById('ac-meta-grid');
  if (!container) return;

  const items = [
    { label: 'Channel / Source', value: lead.channel || '—' },
    { label: 'Target Project',   value: lead.project  || '—' },
    { label: 'Budget',           value: lead.budget ? `$${Number(lead.budget).toLocaleString()}` : '—' },
    { label: 'Location / Area',  value: lead.location || '—' },
    { label: 'Priority',         value: lead.priority ? lead.priority.charAt(0).toUpperCase() + lead.priority.slice(1) : '—' },
    { label: 'SLA Warning',      value: `${lead.slaHours || 24} hours before due` },
    { label: 'Created',          value: formatDateTime(lead.createdAt) },
    { label: 'Last Updated',     value: formatDateTime(lead.updatedAt) },
  ];

  if (lead.requirements) {
    items.push({ label: 'Requirements', value: lead.requirements, full: true });
  }
  if (lead.followUpNote) {
    items.push({ label: 'Follow-Up Note', value: lead.followUpNote, full: true });
  }

  container.innerHTML = items.map(item => `
    <div class="meta-item ${item.full ? 'style="grid-column:1/-1;"' : ''}">
      <div class="meta-item-label">${Sanitize.encode(item.label)}</div>
      <div class="meta-item-value">${Sanitize.encode(item.value)}</div>
    </div>`).join('');
}

function renderStageSidebar(lead) {
  const container = document.getElementById('ac-stage-buttons');
  if (!container) return;
  container.innerHTML = STAGES.map(stage => {
    const isActive = stage === lead.stage;
    const cls = STAGE_CLASS_MAP[stage] || 'stage-new';
    return `
      <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}"
        style="${isActive ? '' : ''} width:100%; justify-content:flex-start;"
        onclick="changeLeadStage('${Sanitize.encode(lead.id)}','${Sanitize.encode(stage)}')"
        ${isActive ? 'disabled' : ''}>
        ${STAGE_EMOJI[stage]} ${Sanitize.encode(stage)}
        ${isActive ? '✓' : ''}
      </button>`;
  }).join('');
}

function renderQuickActions(lead) {
  const container = document.getElementById('ac-quick-actions');
  if (!container) return;
  const actions = [
    { icon: '✏️', label: 'Edit Lead',     fn: `editLead('${Sanitize.encode(lead.id)}')` },
    { icon: '📱', label: 'WhatsApp',      fn: `openWAModal('${Sanitize.encode(lead.id)}')` },
    { icon: '📅', label: 'Set Follow-Up', fn: `focusFollowUpInput()` },
    { icon: '📋', label: 'Copy Info',     fn: `copyLeadInfo('${Sanitize.encode(lead.id)}')` },
    { icon: '📊', label: 'View Audit',    fn: `switchAcTab('ac-tab-audit')` },
    { icon: '🗑', label: 'Delete',        fn: `deleteLead('${Sanitize.encode(lead.id)}')` },
  ];
  container.innerHTML = actions.map(a => `
    <button class="quick-action-btn" onclick="${a.fn}">
      <span class="qa-icon">${a.icon}</span>
      ${Sanitize.encode(a.label)}
    </button>`).join('');
}

function renderWASidebar(lead) {
  const container = document.getElementById('ac-wa-templates');
  if (!container) return;
  const tpl = STATE.settings.waTemplates[lead.stage] || '';
  const filledTpl = fillWATemplate(tpl, lead);

  container.innerHTML = `
    <p class="text-xs text-muted" style="margin-bottom:8px;">Template for <strong style="color:var(--text-primary);">${Sanitize.encode(lead.stage)}</strong>:</p>
    <div style="font-size:0.75rem;color:var(--text-secondary);background:var(--bg-input);padding:8px;border-radius:var(--radius-sm);line-height:1.5;margin-bottom:8px;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow-y:auto;">${Sanitize.encode(filledTpl)}</div>
    <button class="wa-btn" onclick="openWAModal('${Sanitize.encode(lead.id)}')">📱 Send via WhatsApp</button>`;
}

function renderLeadScore(lead) {
  const container = document.getElementById('ac-lead-score-panel');
  if (!container) return;
  const score = calcLeadScore(lead);
  const color  = score >= 75 ? 'var(--accent-green)'
               : score >= 40 ? 'var(--accent-yellow)'
               : 'var(--accent-red)';
  const label  = score >= 75 ? 'Hot Lead 🔥'
               : score >= 40 ? 'Warm Lead 🌡️'
               : 'Cold Lead ❄️';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <span style="font-size:2rem;font-weight:800;color:${color};">${score}</span>
      <span style="font-size:0.75rem;color:${color};font-weight:600;">${label}</span>
    </div>
    <div style="height:8px;background:var(--border-color);border-radius:var(--radius-full);overflow:hidden;">
      <div style="height:100%;width:${score}%;background:${color};border-radius:var(--radius-full);transition:width 0.8s;"></div>
    </div>
    <div class="text-xs text-muted mt-2">Score based on stage, engagement, budget, and SLA</div>`;
}

/* ─────────────────────────────────────────────
   COMMENTS
───────────────────────────────────────────── */
function renderComments(leadId) {
  const list = document.getElementById('ac-comments-list');
  const countEl = document.getElementById('ac-comments-count');
  if (!list) return;

  const comments = (STATE.comments[leadId] || []);
  if (countEl) countEl.textContent = comments.length;

  if (comments.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:24px 0;">
      <div style="font-size:1.5rem;">💬</div>
      <p class="text-xs text-muted">No notes yet. Add the first one above.</p>
    </div>`;
    return;
  }

  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <div class="avatar-sm">${Sanitize.encode((c.author||'?').charAt(0).toUpperCase())}</div>
        <span class="comment-author">${Sanitize.encode(c.author || 'Unknown')}</span>
        <span class="comment-time">${formatRelative(c.timestamp)} · ${formatDateTime(c.timestamp)}</span>
      </div>
      <div class="comment-text">${Sanitize.encode(c.text)}</div>
    </div>`).join('');
}

async function addComment(leadId) {
  const input = document.getElementById('ac-comment-input');
  if (!input) return;

  const rawText = input.value.trim();
  if (!rawText) {
    showToast('Please write a note first', 'warning');
    return;
  }

  const text = Sanitize.text(rawText);
  const comment = {
    id        : generateId(),
    leadId,
    text,
    author    : Sanitize.text(STATE.settings.currentUser || 'Unknown'),
    timestamp : new Date().toISOString(),
  };

  if (!STATE.comments[leadId]) STATE.comments[leadId] = [];
  STATE.comments[leadId].unshift(comment);

  await DB.saveComment(comment);
  createAuditEntry(leadId, 'comment_added', { preview: text.slice(0, 50) });

  input.value = '';
  renderComments(leadId);
  renderAuditLog(leadId);
  updateKPIs();
  showToast('Note added', 'success');
}

/* ─────────────────────────────────────────────
   AUDIT LOG
───────────────────────────────────────────── */
function renderAuditLog(leadId, filterAgent = '') {
  const container = document.getElementById('ac-audit-log');
  const countEl   = document.getElementById('ac-audit-count');
  if (!container) return;

  let entries = STATE.auditLogs[leadId] || [];
  if (filterAgent) entries = entries.filter(e => e.agent === filterAgent);
  if (countEl) countEl.textContent = (STATE.auditLogs[leadId] || []).length;

  if (entries.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:24px 0;">
      <div style="font-size:1.5rem;">📋</div>
      <p class="text-xs text-muted">No audit entries yet.</p>
    </div>`;
    return;
  }

  container.innerHTML = entries.map(entry => {
    const icon    = getAuditIcon(entry.action);
    const text    = buildAuditText(entry);
    return `
      <div class="audit-item">
        <div class="audit-icon">${icon}</div>
        <div class="audit-content">
          <div class="audit-text">${text}</div>
          <div class="audit-time">
            ${Sanitize.encode(entry.agent || 'System')} · ${formatRelative(entry.timestamp)} · ${formatDateTime(entry.timestamp)}
          </div>
        </div>
      </div>`;
  }).join('');
}

function buildAuditText(entry) {
  const agent = `<strong>${Sanitize.encode(entry.agent || 'System')}</strong>`;
  const meta  = entry.meta || {};
  switch(entry.action) {
    case 'lead_created':
      return `${agent} created this lead as <strong>${Sanitize.encode(meta.stage || 'New Lead')}</strong>`;
    case 'stage_change':
      return `${agent} moved stage from <strong>${Sanitize.encode(meta.from)}</strong> → <strong>${Sanitize.encode(meta.to)}</strong>`;
    case 'comment_added':
      return `${agent} added a note${meta.preview ? ': <em>"' + Sanitize.encode(meta.preview) + '…"</em>' : ''}`;
    case 'followup_set':
      return `${agent} scheduled follow-up for <strong>${Sanitize.encode(meta.datetime || '—')}</strong>`;
    case 'lead_edited':
      return `${agent} updated lead details`;
    case 'whatsapp_sent':
      return `${agent} sent a WhatsApp message (${Sanitize.encode(meta.stage || '')})`;
    default:
      return `${agent} performed action: ${Sanitize.encode(entry.action)}`;
  }
}

function switchAcTab(targetId) {
  document.querySelectorAll('[data-ac-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.acTab === targetId);
  });
  document.querySelectorAll('#ac-main-panel .tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === targetId);
  });
}

document.querySelectorAll('[data-ac-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchAcTab(btn.dataset.acTab));
});

/* ─────────────────────────────────────────────
   WHATSAPP MODAL
───────────────────────────────────────────── */
function fillWATemplate(template, lead) {
  if (!template) return '';
  return template
    .replace(/\{name\}/gi,    lead.name    || '')
    .replace(/\{agent\}/gi,   lead.agent   || STATE.settings.currentUser || '')
    .replace(/\{project\}/gi, lead.project || '')
    .replace(/\{phone\}/gi,   lead.phone   || '')
    .replace(/\{stage\}/gi,   lead.stage   || '');
}

window.openWAModal = function(leadId) {
  const lead = STATE.leads.find(l => l.id === leadId);
  if (!lead) return;

  const phoneEl = document.getElementById('wa-phone');
  const msgEl   = document.getElementById('wa-message');
  const selEl   = document.getElementById('wa-template-select');

  // Clean phone
  const cleanPhone = (lead.phone || '').replace(/\D/g,'');
  if (phoneEl) phoneEl.value = cleanPhone ? `+${cleanPhone}` : '';

  // Populate template select
  if (selEl) {
    selEl.innerHTML = '<option value="">Select a template...</option>';
    STAGES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = `${STAGE_EMOJI[s]} ${s}`;
      if (s === lead.stage) opt.selected = true;
      selEl.appendChild(opt);
    });

    // Fill message with current stage template
    const tpl = STATE.settings.waTemplates[lead.stage] || '';
    if (msgEl) msgEl.value = fillWATemplate(tpl, lead);

    selEl.onchange = () => {
      const t = STATE.settings.waTemplates[selEl.value] || '';
      if (msgEl) msgEl.value = fillWATemplate(t, lead);
    };
  }

  // Store leadId for send action
  document.getElementById('btn-send-wa').dataset.leadId = leadId;
  openModal('wa-modal');
};

document.getElementById('btn-send-wa').addEventListener('click', async () => {
  const phone = (document.getElementById('wa-phone').value || '').replace(/\D/g,'');
  const msg   = document.getElementById('wa-message').value.trim();
  const leadId = document.getElementById('btn-send-wa').dataset.leadId;

  if (!phone) { showToast('Please enter a phone number', 'warning'); return; }
  if (!msg)   { showToast('Please write a message', 'warning'); return; }

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');

  if (leadId) {
    const lead = STATE.leads.find(l => l.id === leadId);
    createAuditEntry(leadId, 'whatsapp_sent', { stage: lead ? lead.stage : '' });
    renderAuditLog(leadId);
  }

  closeModal('wa-modal');
  showToast('Opening WhatsApp...', 'success');
});

/* ─────────────────────────────────────────────
   COPY LEAD INFO
───────────────────────────────────────────── */
window.copyLeadInfo = function(leadId) {
  const lead = STATE.leads.find(l => l.id === leadId);
  if (!lead) return;
  const text = [
    `Name: ${lead.name}`,
    `Phone: ${lead.phone || '—'}`,
    `Email: ${lead.email || '—'}`,
    `Stage: ${lead.stage}`,
    `Project: ${lead.project || '—'}`,
    `Budget: ${lead.budget ? '$' + lead.budget.toLocaleString() : '—'}`,
    `Channel: ${lead.channel || '—'}`,
    `Agent: ${lead.agent || '—'}`,
    `Location: ${lead.location || '—'}`,
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('Lead info copied to clipboard', 'success');
  }).catch(() => {
    showToast('Could not copy to clipboard', 'error');
  });
};

/* ─────────────────────────────────────────────
   FOCUS FOLLOW-UP INPUT
───────────────────────────────────────────── */
window.focusFollowUpInput = function() {
  const el = document.getElementById('ac-followup-date-input');
  if (el) { el.focus(); el.click(); }
};

/* ─────────────────────────────────────────────
   NAVIGATION & PAGE SWITCHING
───────────────────────────────────────────── */
function switchPage(page) {
  STATE.currentPage = page;

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  document.querySelectorAll('.page-view').forEach(view => {
    view.classList.toggle('active', view.id === `page-${page}`);
  });

  if (page === 'pipeline')  renderPipeline();
  if (page === 'analytics') renderAnalytics();
  if (page === 'settings')  applySettings();
}

document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

/* ─────────────────────────────────────────────
   FILTER EVENTS
───────────────────────────────────────────── */
function bindFilterEvents() {
  const ids = ['filter-search','filter-stage','filter-agent','filter-channel','filter-sla','filter-project'];
  const keys = ['search','stage','agent','channel','sla','project'];
  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      STATE.filters[keys[i]] = el.value;
      renderLeads();
    });
    el.addEventListener('change', () => {
      STATE.filters[keys[i]] = el.value;
      renderLeads();
    });
  });

  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    STATE.filters = { search:'',stage:'',agent:'',channel:'',sla:'',project:'' };
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    renderLeads();
    showToast('Filters cleared', 'info');
  });
}

/* ─────────────────────────────────────────────
   LEAD FORM OPEN / EDIT
───────────────────────────────────────────── */
function openAddLeadModal() {
  resetLeadForm();
  // Default follow-up to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('lf-followup-date').value = tomorrow.toISOString().slice(0,10);
  document.getElementById('lf-followup-time').value = '10:00';
  openModal('lead-form-modal');
}

window.editLead = function(leadId) {
  const lead = STATE.leads.find(l => l.id === leadId);
  if (!lead) return;
  populateLeadForm(lead);
  closeModal('action-center-modal');
  openModal('lead-form-modal');
};

/* ─────────────────────────────────────────────
   ACTION CENTER SAVE FOLLOW-UP
───────────────────────────────────────────── */
document.getElementById('ac-save-followup').addEventListener('click', async () => {
  const leadId = STATE.activeLeadId;
  const lead   = STATE.leads.find(l => l.id === leadId);
  if (!lead) return;

  const date = document.getElementById('ac-followup-date-input').value;
  const time = document.getElementById('ac-followup-time-input').value;

  if (!date) {
    showToast('Please select a date', 'warning');
    return;
  }

  lead.followUpDate = date;
  lead.followUpTime = time || '09:00';
  lead.updatedAt    = new Date().toISOString();

  await DB.saveLead(lead);
  createAuditEntry(leadId, 'followup_set', {
    datetime: formatDateTime(`${date}T${time || '09:00'}`)
  });

  renderSLAPanel(lead);
  startACCountdown(lead);
  renderAuditLog(leadId);
  renderLeads();
  updateKPIs();
  showToast(`Follow-up set for ${formatDate(date)}`, 'success');
});

/* ─────────────────────────────────────────────
   ACTION CENTER AUDIT FILTER
───────────────────────────────────────────── */
document.getElementById('ac-audit-filter-agent').addEventListener('change', (e) => {
  if (STATE.activeLeadId) renderAuditLog(STATE.activeLeadId, e.target.value);
});

document.getElementById('ac-audit-clear-filter').addEventListener('click', () => {
  document.getElementById('ac-audit-filter-agent').value = '';
  if (STATE.activeLeadId) renderAuditLog(STATE.activeLeadId, '');
});

/* ─────────────────────────────────────────────
   ACTION CENTER COMMENT
───────────────────────────────────────────── */
document.getElementById('ac-btn-add-comment').addEventListener('click', () => {
  if (STATE.activeLeadId) addComment(STATE.activeLeadId);
});

document.getElementById('ac-comment-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    if (STATE.activeLeadId) addComment(STATE.activeLeadId);
  }
});

/* ─────────────────────────────────────────────
   ACTION CENTER EDIT / DELETE BUTTONS
───────────────────────────────────────────── */
document.getElementById('ac-btn-edit').addEventListener('click', () => {
  if (STATE.activeLeadId) window.editLead(STATE.activeLeadId);
});

document.getElementById('ac-btn-delete').addEventListener('click', () => {
  if (STATE.activeLeadId) deleteLead(STATE.activeLeadId);
});

document.getElementById('ac-whatsapp-btn').addEventListener('click', () => {
  if (STATE.activeLeadId) openWAModal(STATE.activeLeadId);
});

/* ─────────────────────────────────────────────
   TOOLBAR BUTTONS
───────────────────────────────────────────── */
document.getElementById('btn-add-lead').addEventListener('click', openAddLeadModal);
document.getElementById('btn-add-lead-empty').addEventListener('click', openAddLeadModal);
document.getElementById('btn-add-lead-pipeline').addEventListener('click', openAddLeadModal);

document.getElementById('btn-save-lead').addEventListener('click', saveLead);

document.getElementById('btn-export').addEventListener('click', exportData);
document.getElementById('btn-export-settings').addEventListener('click', exportData);

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('btn-confirm-import').disabled = true;
  STATE.importBuffer = null;
  openModal('import-modal');
});

document.getElementById('btn-import-settings').addEventListener('click', () => {
  document.getElementById('btn-import').click();
});

document.getElementById('btn-clear-all-data').addEventListener('click', () => {
  showConfirm({
    icon   : '🗑',
    title  : 'Clear All Data',
    message: 'This will permanently delete all leads, comments, and audit logs. This cannot be undone.',
    okText : 'Clear Everything',
    okClass: 'btn-danger',
    onOk   : async () => {
      await DB.clearAll();
      renderLeads();
      renderPipeline();
      renderAnalytics();
      updateKPIs();
      showToast('All data cleared', 'warning');
    }
  });
});

/* ─────────────────────────────────────────────
   IMPORT FILE HANDLING
───────────────────────────────────────────── */
const importDropZone  = document.getElementById('import-drop-zone');
const importFileInput = document.getElementById('import-file-input');

importDropZone.addEventListener('click', () => importFileInput.click());

importDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  importDropZone.classList.add('drag-over');
});

importDropZone.addEventListener('dragleave', () => {
  importDropZone.classList.remove('drag-over');
});

importDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  importDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processImportFile(file);
});

importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) processImportFile(file);
});

function processImportFile(file) {
  if (!file.name.endsWith('.json')) {
    showToast('Please select a .json file', 'error');
    return;
  }
  document.getElementById('import-preview').style.display = 'block';
  document.getElementById('import-file-info').textContent =
    `${file.name} — ${(file.size / 1024).toFixed(1)} KB`;

  const reader = new FileReader();
  reader.onload = (e) => importData(e.target.result, file.name);
  reader.onerror = () => showToast('Failed to read file', 'error');
  reader.readAsText(file);
}

document.getElementById('btn-confirm-import').addEventListener('click', async () => {
  if (!STATE.importBuffer) return;
  try {
    await DB.bulkImport(STATE.importBuffer);
    STATE.importBuffer = null;
    closeModal('import-modal');
    renderLeads();
    renderPipeline();
    renderAnalytics();
    updateKPIs();
    applySettings();
    showToast('Data imported successfully', 'success');
  } catch(err) {
    showToast('Import failed: ' + err.message, 'error');
  }
});

/* ─────────────────────────────────────────────
   SETTINGS PAGE EVENTS
───────────────────────────────────────────── */
document.getElementById('btn-save-username').addEventListener('click', async () => {
  const val = Sanitize.text(document.getElementById('setting-username').value.trim());
  if (!val) { showToast('Please enter a name', 'warning'); return; }
  STATE.settings.currentUser = val;
  await DB.saveSettings();
  applySettings();
  showToast(`Name saved as "${val}"`, 'success');
});

document.getElementById('btn-add-agent').addEventListener('click', async () => {
  const input = document.getElementById('new-agent-input');
  const val   = Sanitize.text(input.value.trim());
  if (!val) { showToast('Please enter an agent name', 'warning'); return; }
  if (STATE.settings.agents.includes(val)) { showToast('Agent already exists', 'warning'); return; }
  STATE.settings.agents.push(val);
  await DB.saveSettings();
  input.value = '';
  applySettings();
  showToast(`Agent "${val}" added`, 'success');
});

document.getElementById('new-agent-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-agent').click();
});

document.getElementById('btn-add-project').addEventListener('click', async () => {
  const input = document.getElementById('new-project-input');
  const val   = Sanitize.text(input.value.trim());
  if (!val) { showToast('Please enter a project name', 'warning'); return; }
  if (STATE.settings.projects.includes(val)) { showToast('Project already exists', 'warning'); return; }
  STATE.settings.projects.push(val);
  await DB.saveSettings();
  input.value = '';
  applySettings();
  showToast(`Project "${val}" added`, 'success');
});

document.getElementById('new-project-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-project').click();
});

/* ─────────────────────────────────────────────
   GLOBAL KEYBOARD SHORTCUTS
───────────────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  // Escape closes top modal
  if (e.key === 'Escape') {
    const openOverlays = document.querySelectorAll('.modal-overlay.open');
    if (openOverlays.length) {
      const top = openOverlays[openOverlays.length - 1];
      top.classList.remove('open');
      if (top.id === 'action-center-modal') {
        if (STATE.acCountdown) clearInterval(STATE.acCountdown);
        STATE.acCountdown  = null;
        STATE.activeLeadId = null;
      }
    }
  }
  // Ctrl/Cmd + K → focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    switchPage('leads');
    document.getElementById('filter-search')?.focus();
  }
  // Ctrl/Cmd + N → add lead
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openAddLeadModal();
  }
});

/* ─────────────────────────────────────────────
   TOGGLE VIEW (LIST / GRID placeholder)
───────────────────────────────────────────── */
document.getElementById('btn-toggle-view').addEventListener('click', () => {
  showToast('Grid view coming soon!', 'info');
});

/* ─────────────────────────────────────────────
   WINDOW EXPOSE (for inline onclick attributes)
───────────────────────────────────────────── */
window.changeLeadStage    = changeLeadStage;
window.switchAcTab        = switchAcTab;
window.saveWATemplates    = saveWATemplates;

/* ─────────────────────────────────────────────
   APP INITIALIZATION
───────────────────────────────────────────── */
async function initApp() {
  // Try IndexedDB, fall back to LocalStorage
  try {
    STATE.db     = await openDatabase();
    STATE.useIDB = true;
    console.log('[CRM] IndexedDB initialized ✅');
  } catch(err) {
    STATE.useIDB = false;
    console.warn('[CRM] IndexedDB not available, using LocalStorage fallback:', err.message);
  }

  // Load all data
  try {
    await DB.loadAll();
  } catch(err) {
    console.error('[CRM] Failed to load data:', err);
    showToast('Warning: Could not load saved data', 'error');
  }

  // Seed demo data if empty
  if (STATE.leads.length === 0) {
    await seedDemoData();
  }

  // Apply settings to dropdowns
  applySettings();

  // Bind filter events
  bindFilterEvents();

  // Initial renders
  renderLeads();
  updateKPIs();

  // Hide loading screen, show app
  document.getElementById('app-loading').style.display = 'none';
  document.getElementById('app').style.display = '';

  // Storage engine badge
  const engineBadge = document.getElementById('storage-engine-badge');
  const engineLabel = document.getElementById('storage-engine-label');
  if (engineBadge && engineLabel) {
    if (STATE.useIDB) {
      engineLabel.textContent = 'IndexedDB — High-capacity storage active';
      engineBadge.className   = 'sla-badge on-track';
      engineBadge.textContent = '✅ IndexedDB';
    } else {
      engineLabel.textContent = 'LocalStorage fallback — Limited to ~5MB';
      engineBadge.className   = 'sla-badge due-soon';
      engineBadge.textContent = '⚠️ LocalStorage';
    }
  }

  console.log('[CRM] Youssef Sales CRM v3.0 initialized 🚀');
}

/* ─────────────────────────────────────────────
   DEMO DATA SEEDER
───────────────────────────────────────────── */
async function seedDemoData() {
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow  = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek  = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7);
  const inHours   = (h) => { const d = new Date(now); d.setHours(d.getHours() + h); return d; };

  const demoLeads = [
    {
      id: generateId(), name: 'Ahmed Hassan', phone: '+201012345678',
      email: 'ahmed.hassan@gmail.com', stage: 'Negotiation',
      agent: 'Youssef', channel: 'Meta Ads', project: 'Palm Hills',
      budget: 450000, location: 'Sheikh Zayed', priority: 'urgent',
      requirements: '3 bedrooms, ground floor, garden, near school',
      followUpDate: yesterday.toISOString().slice(0,10),
      followUpTime: '14:00', followUpNote: 'Discuss final pricing',
      slaHours: 24, createdAt: new Date(now.getTime()-86400000*5).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(), name: 'Sara Mohamed', phone: '+201198765432',
      email: 'sara.m@outlook.com', stage: 'Meeting Scheduled',
      agent: 'Ahmed', channel: 'Referral', project: 'Madinaty',
      budget: 280000, location: 'New Cairo', priority: 'high',
      requirements: '2 bedrooms, high floor, pool view',
      followUpDate: inHours(3).toISOString().slice(0,10),
      followUpTime: inHours(3).toTimeString().slice(0,5),
      followUpNote: 'Site visit scheduled',
      slaHours: 24, createdAt: new Date(now.getTime()-86400000*3).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(), name: 'Khalid Ibrahim', phone: '+201567890123',
      email: 'khalid.i@company.com', stage: 'Proposal Sent',
      agent: 'Sarah', channel: 'Cold Call', project: 'New Capital Tower',
      budget: 750000, location: 'New Administrative Capital', priority: 'high',
      requirements: 'Office space, min 200 sqm, corner unit',
      followUpDate: tomorrow.toISOString().slice(0,10),
      followUpTime: '11:00', followUpNote: 'Follow up on proposal review',
      slaHours: 24, createdAt: new Date(now.getTime()-86400000*7).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(), name: 'Nour Ali', phone: '+201234567890',
      email: 'nour.ali@mail.com', stage: 'Contacted',
      agent: 'Mohamed', channel: 'WhatsApp', project: 'Hyde Park',
      budget: 320000, location: 'New Cairo', priority: 'medium',
      requirements: 'Family home, 4 bedrooms, private garden',
      followUpDate: nextWeek.toISOString().slice(0,10),
      followUpTime: '10:00', followUpNote: 'Send brochure and pricing',
      slaHours: 48, createdAt: new Date(now.getTime()-86400000*2).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(), name: 'Layla Mansour', phone: '+201111222333',
      email: '', stage: 'New Lead',
      agent: 'Youssef', channel: 'Website', project: 'Mountain View',
      budget: 180000, location: '6th of October', priority: 'low',
      requirements: '1 bedroom studio, investment purpose',
      followUpDate: '', followUpTime: '',
      slaHours: 24, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(), name: 'Omar Farouk', phone: '+201444555666',
      email: 'omar.f@biz.net', stage: 'Won',
      agent: 'Youssef', channel: 'Direct', project: 'Palm Hills',
      budget: 620000, location: 'Sheikh Zayed', priority: 'medium',
      requirements: 'Villa, 5 bedrooms, private pool',
      followUpDate: '', followUpTime: '',
      slaHours: 24, createdAt: new Date(now.getTime()-86400000*30).toISOString(),
      updatedAt: new Date(now.getTime()-86400000*2).toISOString(),
    },
    {
      id: generateId(), name: 'Dina Youssef', phone: '+201777888999',
      email: 'dina.y@gmail.com', stage: 'Lost',
      agent: 'Ahmed', channel: 'Meta Ads', project: 'Madinaty',
      budget: 200000, location: 'New Cairo', priority: 'low',
      requirements: 'Small apartment, near metro',
      followUpDate: '', followUpTime: '',
      slaHours: 24, createdAt: new Date(now.getTime()-86400000*15).toISOString(),
      updatedAt: new Date(now.getTime()-86400000*5).toISOString(),
    },
  ];

  for (const lead of demoLeads) {
    STATE.leads.push(lead);
    await DB.saveLead(lead);

    // Seed demo audit entries
    createAuditEntry(lead.id, 'lead_created', { name: lead.name, stage: lead.stage });
    if (lead.stage !== 'New Lead') {
      createAuditEntry(lead.id, 'stage_change', { from: 'New Lead', to: lead.stage });
    }

    // Seed demo comments
    const demoComments = [
      { text: `Initial contact made. Client interested in ${lead.project || 'our properties'}.`, author: lead.agent || 'Youssef' },
      { text: `Budget confirmed at $${(lead.budget||0).toLocaleString()}. Requirements noted.`, author: STATE.settings.currentUser },
    ].filter(() => lead.stage !== 'New Lead');

    for (const dc of demoComments) {
      const comment = {
        id        : generateId(),
        leadId    : lead.id,
        text      : dc.text,
        author    : dc.author,
        timestamp : new Date(now.getTime() - Math.random() * 86400000 * 3).toISOString(),
      };
      if (!STATE.comments[lead.id]) STATE.comments[lead.id] = [];
      STATE.comments[lead.id].unshift(comment);
      await DB.saveComment(comment);
    }
  }
}

/* ─────────────────────────────────────────────
   KICK OFF
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', initApp);