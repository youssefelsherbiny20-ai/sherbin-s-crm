/* ============================================================================
   OCTANE CRM — V8 Enterprise Multi-Tenant SaaS
   app.js — Complete application layer (single-file, zero placeholders)

   Fixes included:
   · calcLeadScore(lead) — fully defined multi-factor scoring engine
   · Removed dangling 'rotation-save-settings' / 'rotation-uncontacted-cap'
   · All boot-time references resolved
   ============================================================================ */

'use strict';

/* ============================================================================
   1 · CONSTANTS & DEFAULTS
   ============================================================================ */

const DB_NAME = 'OctaneCRM_v8_MT';
const DB_VERSION = 1;

const STORES = Object.freeze({
  TENANTS: 'tenants', USERS: 'users', LEADS: 'leads', COMMENTS: 'comments',
  AUDIT: 'audit_log', SETTINGS: 'settings', INVENTORY: 'inventory',
  NOTIFICATIONS: 'notifications', ROTATION_LOG: 'rotation_log', SESSION: 'session',
});

const STAGES = Object.freeze([
  'New Lead', 'Contacted', 'Meeting Scheduled',
  'Proposal Sent', 'Negotiation', 'Won', 'Lost',
]);

const STAGE_EMOJI = Object.freeze({
  'New Lead': '🌱', 'Contacted': '📞', 'Meeting Scheduled': '📅',
  'Proposal Sent': '📄', 'Negotiation': '🤝', 'Won': '🏆', 'Lost': '❌',
});

const STAGE_COLOR = Object.freeze({
  'New Lead': '#06b6d4', 'Contacted': '#4f8ef7', 'Meeting Scheduled': '#a855f7',
  'Proposal Sent': '#f59e0b', 'Negotiation': '#f97316', 'Won': '#22c55e', 'Lost': '#ef4444',
});

const CHANNELS = Object.freeze([
  'Meta Ads', 'Google Ads', 'TikTok Ads', 'WhatsApp', 'Referral',
  'Cold Call', 'Direct', 'Website', 'Email', 'Other',
]);

const LEAD_TEMPERATURES = Object.freeze(['hot', 'warm', 'cold']);
const LEAD_TEMP_SLA = Object.freeze({ hot: 0.25, warm: 1, cold: 24 });

const PRIORITY_COLOR = Object.freeze({
  low: '#5a6178', medium: '#4f8ef7', high: '#f59e0b', urgent: '#ef4444',
});
const PRIORITY_LABEL = Object.freeze({
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
});

const ROLES = Object.freeze(['admin', 'team_leader', 'sales_rep']);
const ROLE_LABEL = Object.freeze({
  admin: 'Admin', team_leader: 'Team Leader', sales_rep: 'Sales Rep',
});

const USER_STATUSES = Object.freeze(['active', 'invited', 'on_leave', 'offline', 'suspended']);
const USER_STATUS_LABEL = Object.freeze({
  active: 'Active', invited: 'Invited', on_leave: 'On Leave',
  offline: 'Offline', suspended: 'Suspended',
});

const SHIFTS = Object.freeze(['morning', 'evening', 'night', 'flexible']);
const SHIFT_LABEL = Object.freeze({
  morning: 'Morning', evening: 'Evening', night: 'Night', flexible: 'Flexible',
});

const PERMISSIONS = Object.freeze([
  { key: 'view_all_leads', label: 'View all leads (not just own)', roles: ['admin', 'team_leader'] },
  { key: 'view_phone', label: 'View phone numbers', roles: ['admin', 'team_leader', 'sales_rep'] },
  { key: 'view_email', label: 'View email addresses', roles: ['admin', 'team_leader', 'sales_rep'] },
  { key: 'edit_leads', label: 'Create / edit leads', roles: ['admin', 'team_leader', 'sales_rep'] },
  { key: 'delete_leads', label: 'Delete leads', roles: ['admin', 'team_leader'] },
  { key: 'edit_deal_value', label: 'Edit deal value / budget', roles: ['admin', 'team_leader'] },
  { key: 'assign_leads', label: 'Assign leads to reps', roles: ['admin', 'team_leader'] },
  { key: 'claim_pool', label: 'Claim leads from pool', roles: ['admin', 'team_leader', 'sales_rep'] },
  { key: 'grant_discount', label: 'Grant discounts', roles: ['admin', 'team_leader'] },
  { key: 'approve_discount', label: 'Approve discount requests', roles: ['admin', 'team_leader'] },
  { key: 'export_data', label: 'Export data', roles: ['admin', 'team_leader'] },
  { key: 'clear_data', label: 'Clear all data', roles: ['admin'] },
  { key: 'manage_users', label: 'Manage users & roles', roles: ['admin'] },
  { key: 'manage_settings', label: 'Manage workspace settings', roles: ['admin'] },
  { key: 'view_financials', label: 'View financial reports', roles: ['admin', 'team_leader'] },
  { key: 'send_whatsapp', label: 'Send WhatsApp messages', roles: ['admin', 'team_leader', 'sales_rep'] },
  { key: 'view_audit', label: 'View full audit log', roles: ['admin', 'team_leader'] },
]);

const TIERS = Object.freeze({
  starter: {
    label: 'Starter', price: 99,
    features: { rotation: true, inventory: false, omnichannel: false, attribution: false, commission: false, cpq: false, ai_calls: false, predictive: false, dsr: false, geofencing: false, cadences: false, voice_simulator: false },
  },
  pro: {
    label: 'Pro', price: 299,
    features: { rotation: true, inventory: true, omnichannel: true, attribution: true, commission: true, cpq: true, ai_calls: false, predictive: false, dsr: false, geofencing: false, cadences: true, voice_simulator: true },
  },
  enterprise: {
    label: 'Enterprise', price: 799,
    features: { rotation: true, inventory: true, omnichannel: true, attribution: true, commission: true, cpq: true, ai_calls: true, predictive: true, dsr: true, geofencing: true, cadences: true, voice_simulator: true },
  },
});

const FEATURE_LABELS = Object.freeze({
  rotation: 'Lead Rotation', inventory: 'Property Inventory',
  omnichannel: 'Omnichannel Inbox', attribution: 'Marketing Attribution',
  commission: 'Commission & Leaderboard', cpq: 'CPQ & Quotes',
  ai_calls: 'AI Call Intelligence', predictive: 'Predictive & NBA',
  dsr: 'Digital Sales Room', geofencing: 'Geofencing',
  cadences: 'Sales Cadences', voice_simulator: 'AI Voice Simulator',
});

const DISPOSITIONS = Object.freeze({
  answered:     { label: 'Answered',      icon: 'fa-phone-volume',       tone: 'ok',    auditAction: 'call_answered', stage: 'Contacted' },
  no_answer:    { label: 'No Answer',     icon: 'fa-phone-slash',        tone: 'warn',  auditAction: 'call_missed',   stage: 'Contacted', autoReschedule: true },
  busy:         { label: 'Busy',          icon: 'fa-circle-xmark',       tone: 'warn',  auditAction: 'call_busy',     stage: 'Contacted', autoReschedule: true },
  voicemail:    { label: 'Voicemail',     icon: 'fa-voicemail',          tone: 'warn',  auditAction: 'call_vm',       stage: 'Contacted', autoReschedule: true },
  call_back:    { label: 'Call Back',     icon: 'fa-rotate-left',        tone: 'info',  auditAction: 'call_back',     stage: null },
  whatsapp:     { label: 'WhatsApp Sent', icon: 'fa-whatsapp',           tone: 'ok',    auditAction: 'whatsapp_sent', stage: 'Contacted' },
  meeting:      { label: 'Meeting Set',   icon: 'fa-calendar-plus',      tone: 'info',  auditAction: 'meeting_set',   stage: 'Meeting Scheduled' },
  wrong_number: { label: 'Wrong Number',  icon: 'fa-triangle-exclamation',tone: 'danger',auditAction: 'call_wrong',    stage: null },
});

const AUTO_RESCHEDULE_HOURS = 4;
const SLA_SOFT_ALERT_RATIO = 0.70;
const SLA_TICK_MS = 5000;

const DEFAULT_WA_TEMPLATES = Object.freeze({
  'New Lead': "Hello {name}! 👋 Thank you for your interest. I'm {agent} from {company}. I'd love to tell you more about our available properties. When would be a good time to chat?",
  'Contacted': "Hi {name}, following up on our conversation. I have some great properties that match your requirements. Shall we schedule a viewing this week?",
  'Meeting Scheduled': "Hi {name}! 📅 Just confirming our meeting. Looking forward to presenting you with the best options for your dream property. See you soon!",
  'Proposal Sent': "Hello {name}! 📄 I've sent over the proposal for {project}. Please take a look and let me know if you have any questions. I'm here to help!",
  'Negotiation': "Hi {name}, thank you for your counter-offer. I've spoken with our team and I'm confident we can find the best deal for you. Let's finalize this!",
  'Won': "🎉 Congratulations {name}! We're thrilled to welcome you to the {project} family. Our team will contact you with next steps. Welcome home!",
  'Lost': "Hi {name}, I understand your decision. If you ever reconsider or need real estate assistance in the future, please don't hesitate to reach out. All the best!",
});

const VIEW_META = Object.freeze({
  'action-center':     { title: 'Action Center',        subtitle: 'Real-time SLA monitoring' },
  'sales-pipeline':    { title: 'Sales Pipeline',       subtitle: 'Kanban view of active deals' },
  'lead-rotation':     { title: 'Lead Rotation',        subtitle: 'Assignments, pool & rotation log' },
  'property-inventory':{ title: 'Property Inventory',   subtitle: 'Available units & matching' },
  'cil-radar':         { title: 'CIL Radar',            subtitle: 'Client intent scoring' },
  'omnichannel':       { title: 'Omnichannel Inbox',    subtitle: 'Unified WhatsApp / Email / SMS' },
  'attribution':       { title: 'Marketing Attribution',subtitle: 'Campaign ROI & CAC' },
  'commission':        { title: 'Commission & Leaderboard', subtitle: 'Earnings & live ranking' },
  'cpq':               { title: 'CPQ & Quotes',         subtitle: 'Payment plans & proposals' },
  'call-intel':        { title: 'AI Call Intelligence', subtitle: 'Transcription & battlecards' },
  'predictive':        { title: 'Predictive & NBA',     subtitle: 'Win probability & next best action' },
  'cadences':          { title: 'Sales Cadences',       subtitle: 'Multi-touch drip sequences' },
  'dsr':               { title: 'Digital Sales Room',   subtitle: 'Client portal & engagement' },
  'voice-simulator':   { title: 'AI Voice Simulator',   subtitle: 'Practice against synthetic buyers' },
  'financial-engine':  { title: 'Financial Engine',     subtitle: 'Commissions, forecasts, revenue' },
  'analytics':         { title: 'Analytics',            subtitle: 'Performance insights' },
  'users':             { title: 'User Management',      subtitle: 'Teams, roles & permissions' },
  'permissions':       { title: 'Roles & Permissions',  subtitle: 'Granular access control' },
  'rotation-settings': { title: 'Rotation Rules',       subtitle: 'Round-robin, weights, caps' },
  'branding':          { title: 'Branding',             subtitle: 'Logo, colors, white-label' },
  'integrations':      { title: 'Integrations',         subtitle: 'Connect WhatsApp, Meta, Google' },
  'settings':          { title: 'Settings',             subtitle: 'Preferences & data management' },
});

const SUPER_VIEW_META = Object.freeze({
  'overview':      { title: 'Platform Overview',  subtitle: 'SaaS health & tenant metrics' },
  'tenants':       { title: 'Tenants',            subtitle: 'Manage customer workspaces' },
  'subscriptions': { title: 'Subscriptions',      subtitle: 'Billing & plan assignments' },
  'mrr':           { title: 'MRR / ARR',          subtitle: 'Recurring revenue analytics' },
  'usage':         { title: 'Usage & Seats',      subtitle: 'Feature adoption metrics' },
  'feature-flags': { title: 'Feature Flags',      subtitle: 'Toggle features per tier' },
  'tiers':         { title: 'Tier Plans',         subtitle: 'Pricing & entitlements' },
  'system':        { title: 'System Health',      subtitle: 'Storage, sync & diagnostics' },
});

/* ============================================================================
   2 · SANITIZE
   ============================================================================ */

const Sanitize = (() => {
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;' };
  const REGEX = /[&<>"'`=/]/g;
  function encode(v) { return v === null || v === undefined ? '' : String(v).replace(REGEX, (c) => MAP[c]); }
  function stripTags(v) { return v === null || v === undefined ? '' : String(v).replace(/<[^>]*>/g, ''); }
  function text(v) { return encode(stripTags(v)); }
  function decode(v) {
    if (typeof v !== 'string' || v.length === 0) return v || '';
    try {
      const doc = new DOMParser().parseFromString(v, 'text/html');
      return doc.documentElement.textContent || '';
    } catch (_) { return v; }
  }
  function number(v, fallback = 0) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function url(v) {
    try {
      const u = new URL(v);
      if (['https:', 'http:', 'tel:', 'mailto:', 'whatsapp:'].includes(u.protocol)) return u.href;
    } catch (_) {}
    return '#';
  }
  return { encode, stripTags, text, decode, number, url };
})();

const esc = (v) => Sanitize.encode(v);
const escAttr = (v) => Sanitize.encode(v).replace(/"/g, '&quot;');

/* ============================================================================
   3 · SCHEMA VALIDATOR
   ============================================================================ */

const SchemaValidator = (() => {
  const STAGE_SET = new Set(STAGES);
  const MAX_LEADS = 100000;
  function isObj(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }
  function validateLead(lead, idx) {
    if (!isObj(lead)) return `Lead[${idx}] must be an object`;
    if (!lead.id || typeof lead.id !== 'string') return `Lead[${idx}].id invalid`;
    if (!lead.tenantId) return `Lead[${idx}].tenantId missing`;
    if (!lead.name || typeof lead.name !== 'string') return `Lead[${idx}].name invalid`;
    if (!STAGE_SET.has(lead.stage)) return `Lead[${idx}].stage invalid`;
    if (Number.isNaN(Date.parse(lead.createdAt))) return `Lead[${idx}].createdAt invalid`;
    return null;
  }
  function validateUsers(users) {
    if (!Array.isArray(users)) return 'users must be an array';
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (!isObj(u) || !u.id || !u.name || !u.email) return `users[${i}] invalid`;
      if (!ROLES.includes(u.role)) return `users[${i}].role invalid`;
    }
    return null;
  }
  function validateTenants(tenants) {
    if (!Array.isArray(tenants)) return 'tenants must be an array';
    for (let i = 0; i < tenants.length; i++) {
      const t = tenants[i];
      if (!isObj(t) || !t.id || !t.name || !t.slug) return `tenants[${i}] invalid`;
      if (!TIERS[t.tier]) return `tenants[${i}].tier invalid`;
    }
    return null;
  }
  function validate(payload) {
    const errors = [];
    if (!isObj(payload)) return { valid: false, errors: ['Root must be an object'] };
    if (!payload.version) errors.push('Missing "version"');
    if (!payload.exportedAt) errors.push('Missing "exportedAt"');
    if (!Array.isArray(payload.leads)) errors.push('"leads" must be array');
    else if (payload.leads.length > MAX_LEADS) errors.push(`"leads" exceeds limit`);
    else {
      const seen = new Set();
      payload.leads.forEach((l, i) => {
        const e = validateLead(l, i);
        if (e) errors.push(e);
        if (l && l.id) {
          if (seen.has(l.id)) errors.push(`Duplicate lead id "${l.id}"`);
          seen.add(l.id);
        }
      });
    }
    if (payload.users) { const e = validateUsers(payload.users); if (e) errors.push(e); }
    if (payload.tenants) { const e = validateTenants(payload.tenants); if (e) errors.push(e); }
    if (payload.comments && !isObj(payload.comments)) errors.push('"comments" must be object');
    if (payload.auditLogs && !isObj(payload.auditLogs)) errors.push('"auditLogs" must be object');
    return { valid: errors.length === 0, errors };
  }
  return { validate };
})();

/* ============================================================================
   4 · UTILITIES
   ============================================================================ */

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }
function safe(fn, label) {
  try { return fn(); }
  catch (err) { console.error(`[Octane] ${label || 'task'} failed:`, err); return null; }
}
function debounce(fn, wait) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}
function nowIso() { return new Date().toISOString(); }
function dateOnly(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}
function timeOnly(d) {
  const x = new Date(d);
  return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}
function parseLocalDate(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr || '09:00'}`);
}
function formatDate(iso) {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)); }
  catch (_) { return '—'; }
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
function formatDateTimeLocal(input) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / 86400000);
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Tomorrow at ${timeStr}`;
  if (diffDays === -1) return `Yesterday at ${timeStr}`;
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days at ${timeStr}`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at ${timeStr}`;
}
function formatRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}
function formatMoney(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toLocaleString()}`;
}
function initialsOf(name) {
  if (!name) return '?';
  return String(name).trim().split(/\s+/).slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase()).join('') || '?';
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function leadTemperature(lead) {
  if (lead.temperature && LEAD_TEMPERATURES.includes(lead.temperature)) return lead.temperature;
  const pri = lead.priority || 'medium';
  if (pri === 'urgent' || pri === 'high') return 'hot';
  if (pri === 'medium') return 'warm';
  return 'cold';
}

function slaWindowMs(lead) {
  const temp = leadTemperature(lead);
  const hours = LEAD_TEMP_SLA[temp] ?? 24;
  return hours * 3600000;
}

function dueMsOf(lead) {
  if (!lead) return null;
  if (lead.slaDueAt) {
    const t = new Date(lead.slaDueAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (lead.followUpDate) {
    const t = new Date(`${lead.followUpDate}T${lead.followUpTime || '09:00'}`).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
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

function slaStatusOf(lead) {
  const due = dueMsOf(lead);
  if (due === null) return 'no-followup';
  const diff = due - Date.now();
  if (diff < 0) return 'overdue';
  if (diff <= slaWindowMs(lead)) return 'due-soon';
  return 'on-track';
}

function slaBandOf(lead) {
  const due = dueMsOf(lead);
  if (due === null) return 'none';
  const diff = due - Date.now();
  if (diff < 0) return 'breached';
  const win = slaWindowMs(lead);
  if (diff <= win * 0.30) return 'critical';
  if (diff <= win * 0.60) return 'warning';
  return 'ontrack';
}

/* ─────────────────────────────────────────────
   LEAD SCORING ENGINE — multi-factor 0–100
   · Stage progression       0–40
   · Temperature             0–20
   · Engagement (calls/notes) 0–15
   · Budget (normalized)     0–10
   · Data completeness       0–5
   · SLA health              -15…+10
───────────────────────────────────────────── */
function calcLeadScore(lead) {
  if (!lead || typeof lead !== 'object') return 0;

  const STAGE_WEIGHT = {
    'New Lead': 5, 'Contacted': 12, 'Meeting Scheduled': 22,
    'Proposal Sent': 30, 'Negotiation': 38, 'Won': 40, 'Lost': 0,
  };
  const stageScore = STAGE_WEIGHT[lead.stage] ?? 0;

  const temp = leadTemperature(lead);
  const TEMP_WEIGHT = { hot: 20, warm: 12, cold: 5 };
  const tempScore = TEMP_WEIGHT[temp] ?? 8;

  const attempts = Number(lead.attempts) || 0;
  const commentCount = (STATE.comments[lead.id] || []).length;
  const engagementScore = Math.min(15, attempts * 2 + commentCount * 3);

  const budget = Number(lead.budget) || 0;
  const budgetScore = Math.min(10, (budget / 1000000) * 10);

  let completenessScore = 0;
  if (lead.phone)    completenessScore += 2;
  if (lead.email)    completenessScore += 1;
  if (lead.project)  completenessScore += 1;
  if (lead.location) completenessScore += 1;

  const band = slaBandOf(lead);
  const SLA_ADJUST = { ontrack: 10, warning: 5, critical: -5, breached: -15, none: 0 };
  const slaScore = SLA_ADJUST[band] ?? 0;

  const total = stageScore + tempScore + engagementScore + budgetScore + completenessScore + slaScore;
  return Math.max(0, Math.min(100, Math.round(total)));
}

/* ============================================================================
   5 · EVENT BUS
   ============================================================================ */

const EventBus = (() => {
  const topics = new Map();
  function on(topic, handler) {
    if (!topics.has(topic)) topics.set(topic, new Set());
    topics.get(topic).add(handler);
    return () => off(topic, handler);
  }
  function off(topic, handler) {
    const set = topics.get(topic);
    if (set) set.delete(handler);
  }
  function emit(topic, payload) {
    const set = topics.get(topic);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (err) { console.error(`[Octane] EventBus "${topic}":`, err); }
    }
  }
  function clear() { topics.clear(); }
  return { on, off, emit, clear };
})();

/* ============================================================================
   6 · INDEXEDDB PRIMITIVES
   ============================================================================ */

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB unsupported')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.TENANTS)) {
        const s = db.createObjectStore(STORES.TENANTS, { keyPath: 'id' });
        s.createIndex('slug', 'slug', { unique: true });
        s.createIndex('tier', 'tier', { unique: false });
        s.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        const s = db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
        s.createIndex('email', 'email', { unique: false });
        s.createIndex('role', 'role', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.LEADS)) {
        const s = db.createObjectStore(STORES.LEADS, { keyPath: 'id' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
        s.createIndex('stage', 'stage', { unique: false });
        s.createIndex('agent', 'agent', { unique: false });
        s.createIndex('assignedToId', 'assignedToId', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
        s.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.COMMENTS)) {
        const s = db.createObjectStore(STORES.COMMENTS, { keyPath: 'id' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
        s.createIndex('leadId', 'leadId', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.AUDIT)) {
        const s = db.createObjectStore(STORES.AUDIT, { keyPath: 'id' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
        s.createIndex('leadId', 'leadId', { unique: false });
        s.createIndex('agent', 'agent', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        const s = db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.INVENTORY)) {
        const s = db.createObjectStore(STORES.INVENTORY, { keyPath: 'id' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
        s.createIndex('project', 'project', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.NOTIFICATIONS)) {
        const s = db.createObjectStore(STORES.NOTIFICATIONS, { keyPath: 'id' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
        s.createIndex('userId', 'userId', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.ROTATION_LOG)) {
        const s = db.createObjectStore(STORES.ROTATION_LOG, { keyPath: 'id' });
        s.createIndex('tenantId', 'tenantId', { unique: false });
        s.createIndex('leadId', 'leadId', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SESSION)) {
        db.createObjectStore(STORES.SESSION, { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function idb(store, mode = 'readonly') {
  return STATE.db.transaction(store, mode).objectStore(store);
}
function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = idb(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(store, record) {
  return new Promise((resolve, reject) => {
    const req = idb(store, 'readwrite').put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const req = idb(store, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbClear(store) {
  return new Promise((resolve, reject) => {
    const req = idb(store, 'readwrite').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function idbGetByIndex(store, index, value) {
  return new Promise((resolve, reject) => {
    const req = idb(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ============================================================================
   7 · LOCALSTORAGE FALLBACK
   ============================================================================ */

const LSFallback = (() => {
  const PREFIX = 'octane8mt_';
  const k = (n) => `${PREFIX}${n}`;
  function save(name, data) {
    try { localStorage.setItem(k(name), JSON.stringify(data)); return true; }
    catch (e) { console.error('[Octane] LS write failed:', e); return false; }
  }
  function load(name, fallback = null) {
    try {
      const raw = localStorage.getItem(k(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }
  function remove(name) { try { localStorage.removeItem(k(name)); } catch (_) {} }
  return { save, load, remove };
})();

/* ============================================================================
   8 · DB ADAPTER + MULTI-TAB SYNC
   ============================================================================ */

const SELF_TAB_ID = uid('tab');
const SYNC_KEY = 'octane8mt_sync';

const DB = {
  async saveTenant(t) {
    if (STATE.useIDB) await idbPut(STORES.TENANTS, t);
    else LSFallback.save('tenants', STATE.tenants);
    DB._broadcast('tenant_changed', t.id);
  },
  async deleteTenant(id) {
    if (STATE.useIDB) await idbDelete(STORES.TENANTS, id);
    else LSFallback.save('tenants', STATE.tenants);
    DB._broadcast('tenant_deleted', id);
  },
  async saveUser(u) {
    if (STATE.useIDB) await idbPut(STORES.USERS, u);
    else LSFallback.save('users', STATE.users);
    DB._broadcast('user_changed', u.id);
  },
  async deleteUser(id) {
    if (STATE.useIDB) await idbDelete(STORES.USERS, id);
    else LSFallback.save('users', STATE.users);
    DB._broadcast('user_deleted', id);
  },
  async saveLead(lead) {
    if (STATE.useIDB) await idbPut(STORES.LEADS, lead);
    else LSFallback.save('leads', STATE.leads);
    DB._broadcast('lead_changed', lead.id);
  },
  async deleteLead(leadId) {
    if (STATE.useIDB) {
      await idbDelete(STORES.LEADS, leadId);
      const cs = await idbGetByIndex(STORES.COMMENTS, 'leadId', leadId);
      const as = await idbGetByIndex(STORES.AUDIT, 'leadId', leadId);
      for (const c of cs) await idbDelete(STORES.COMMENTS, c.id);
      for (const a of as) await idbDelete(STORES.AUDIT, a.id);
    } else {
      LSFallback.save('leads', STATE.leads);
      LSFallback.save('comments', STATE.comments);
      LSFallback.save('audit', STATE.auditLogs);
    }
    DB._broadcast('lead_deleted', leadId);
  },
  async saveComment(c) {
    if (STATE.useIDB) await idbPut(STORES.COMMENTS, c);
    else LSFallback.save('comments', STATE.comments);
    DB._broadcast('comment_added', c.leadId);
  },
  async saveAudit(e) {
    if (STATE.useIDB) await idbPut(STORES.AUDIT, e);
    else LSFallback.save('audit', STATE.auditLogs);
  },
  async saveNotification(n) {
    if (STATE.useIDB) await idbPut(STORES.NOTIFICATIONS, n);
    else LSFallback.save('notifications', STATE.notifications);
  },
  async saveRotationLog(entry) {
    if (STATE.useIDB) await idbPut(STORES.ROTATION_LOG, entry);
    else LSFallback.save('rotationLog', STATE.rotationLog);
  },
  async saveSettings() {
    if (STATE.useIDB) {
      await idbPut(STORES.SETTINGS, { key: `main_${STATE.currentTenantId}`, tenantId: STATE.currentTenantId, ...STATE.settings });
    } else LSFallback.save('settings', STATE.settings);
    DB._broadcast('settings_changed', null);
  },
  async loadAll() {
    if (STATE.useIDB) {
      const [tenants, users, leads, comments, audit, settingsArr, inventory, notifications, rotationLog] = await Promise.all([
        idbGetAll(STORES.TENANTS), idbGetAll(STORES.USERS), idbGetAll(STORES.LEADS),
        idbGetAll(STORES.COMMENTS), idbGetAll(STORES.AUDIT), idbGetAll(STORES.SETTINGS),
        idbGetAll(STORES.INVENTORY), idbGetAll(STORES.NOTIFICATIONS), idbGetAll(STORES.ROTATION_LOG),
      ]);
      STATE.tenants = tenants || [];
      STATE.users = users || [];
      STATE.leads = (leads || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      STATE.inventory = inventory || [];
      STATE.notifications = notifications || [];
      STATE.rotationLog = rotationLog || [];

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

      STATE.settingsByTenant = {};
      for (const row of settingsArr || []) {
        const key = row.key || (row.tenantId ? `main_${row.tenantId}` : null);
        if (key) STATE.settingsByTenant[row.tenantId || 'global'] = row;
      }
    } else {
      STATE.tenants = LSFallback.load('tenants', []);
      STATE.users = LSFallback.load('users', []);
      STATE.leads = LSFallback.load('leads', []);
      STATE.comments = LSFallback.load('comments', {});
      STATE.auditLogs = LSFallback.load('audit', {});
      STATE.inventory = LSFallback.load('inventory', []);
      STATE.notifications = LSFallback.load('notifications', []);
      STATE.rotationLog = LSFallback.load('rotationLog', []);
      STATE.settingsByTenant = LSFallback.load('settingsByTenant', {});
    }
  },
  async saveSession(session) {
    if (STATE.useIDB) await idbPut(STORES.SESSION, { key: 'main', ...session });
    else LSFallback.save('session', session);
  },
  async loadSession() {
    if (STATE.useIDB) {
      return new Promise((resolve) => {
        const req = idb(STORES.SESSION).get('main');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    }
    return LSFallback.load('session', null);
  },
  async clearSession() {
    if (STATE.useIDB) await idbDelete(STORES.SESSION, 'main');
    else LSFallback.remove('session');
  },
  async clearAll() {
    if (STATE.useIDB) {
      await Promise.all([
        idbClear(STORES.LEADS), idbClear(STORES.COMMENTS), idbClear(STORES.AUDIT),
        idbClear(STORES.INVENTORY), idbClear(STORES.NOTIFICATIONS), idbClear(STORES.ROTATION_LOG),
      ]);
    } else {
      LSFallback.remove('leads'); LSFallback.remove('comments'); LSFallback.remove('audit');
      LSFallback.remove('inventory'); LSFallback.remove('notifications'); LSFallback.remove('rotationLog');
    }
    STATE.leads = []; STATE.comments = {}; STATE.auditLogs = {};
    STATE.inventory = []; STATE.notifications = []; STATE.rotationLog = [];
    DB._broadcast('data_cleared', null);
  },
  async bulkImport(payload) {
    const tenantId = STATE.currentTenantId;
    const leads = (payload.leads || []).map((l) => ({ ...l, tenantId: l.tenantId || tenantId }));
    if (STATE.useIDB) {
      for (const store of [STORES.LEADS, STORES.COMMENTS, STORES.AUDIT]) {
        const all = await idbGetAll(store);
        for (const r of all) if (r.tenantId === tenantId) await idbDelete(store, r.id);
      }
      for (const l of leads) await idbPut(STORES.LEADS, l);
      if (payload.comments) {
        for (const arr of Object.values(payload.comments)) {
          for (const c of arr) await idbPut(STORES.COMMENTS, { ...c, tenantId: c.tenantId || tenantId });
        }
      }
      if (payload.auditLogs) {
        for (const arr of Object.values(payload.auditLogs)) {
          for (const e of arr) await idbPut(STORES.AUDIT, { ...e, tenantId: e.tenantId || tenantId });
        }
      }
    } else {
      STATE.leads = leads;
      LSFallback.save('leads', STATE.leads);
      if (payload.comments) LSFallback.save('comments', payload.comments);
      if (payload.auditLogs) LSFallback.save('audit', payload.auditLogs);
    }
    await DB.loadAll();
    DB._broadcast('bulk_import', null);
  },
  _broadcast(event, payload) {
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify({ event, payload, tabId: SELF_TAB_ID, ts: Date.now() }));
    } catch (_) {}
  },
};

/* ============================================================================
   9 · STATE
   ============================================================================ */

const STATE = {
  db: null,
  useIDB: false,
  tenants: [],
  users: [],
  leads: [],
  comments: {},
  auditLogs: {},
  inventory: [],
  notifications: [],
  rotationLog: [],
  settingsByTenant: {},
  session: null,
  currentTenantId: null,
  currentUserId: null,
  impersonating: false,
  activeView: 'action-center',
  activeSuperView: 'overview',
  activeLeadId: null,
  drawerLeadId: null,
  settings: null,
  slaTimer: null,
  acTickTimer: null,
  booted: false,
  charts: [],
};

function getCurrentTenant() {
  return STATE.tenants.find((t) => t.id === STATE.currentTenantId) || null;
}
function getCurrentUser() {
  return STATE.users.find((u) => u.id === STATE.currentUserId) || null;
}
function currentPermissions() {
  const user = getCurrentUser();
  if (!user) return {};
  const base = {};
  for (const p of PERMISSIONS) base[p.key] = p.roles.includes(user.role);
  if (user.permissionOverrides && typeof user.permissionOverrides === 'object') {
    Object.assign(base, user.permissionOverrides);
  }
  return base;
}
function can(permission) { return Boolean(currentPermissions()[permission]); }

function hasFeature(flag) {
  const tenant = getCurrentTenant();
  if (!tenant) return false;
  const tier = TIERS[tenant.tier];
  if (!tier) return false;
  if (tenant.featureOverrides && typeof tenant.featureOverrides === 'object' && flag in tenant.featureOverrides) {
    return Boolean(tenant.featureOverrides[flag]);
  }
  return Boolean(tier.features[flag]);
}

function tenantLeads() {
  return STATE.leads.filter((l) => l.tenantId === STATE.currentTenantId);
}
function tenantUsers() {
  return STATE.users.filter((u) => u.tenantId === STATE.currentTenantId);
}
function tenantNotifications() {
  if (!STATE.currentUserId) return [];
  return STATE.notifications.filter((n) => n.userId === STATE.currentUserId && n.tenantId === STATE.currentTenantId);
}

function defaultSettingsForTenant() {
  return {
    projects: ['Palm Hills', 'Madinaty', 'New Capital Tower', 'Hyde Park', 'Mountain View'],
    waTemplates: { ...DEFAULT_WA_TEMPLATES },
    rotation: {
      mode: 'round_robin', enabled: true, uncontactedCap: 10,
      requireActiveShift: true, claimPoolEnabled: true,
      escalationUserId: null, slaScorePenalty: 5,
    },
    branding: { primary: '#6d8cff', secondary: '#8f6dff', logoDataUrl: '' },
    integrations: { whatsapp: false, meta: false, google: false, tiktok: false },
    _sanitizeV: 2,
  };
}
function loadTenantSettings() {
  const t = STATE.currentTenantId;
  if (!t) { STATE.settings = null; return; }
  const cached = STATE.settingsByTenant[t];
  STATE.settings = cached ? { ...defaultSettingsForTenant(), ...cached } : defaultSettingsForTenant();
}

/* ============================================================================
   10 · AUTH & SESSION
   ============================================================================ */

const Auth = (() => {
  const DEMO_ADMIN_EMAIL = 'youssef@octane.crm';
  const DEMO_ADMIN_PASSWORD = 'octane2024';
  const SUPER_ADMIN_EMAIL = 'super@octane.crm';
  const SUPER_ADMIN_PASSWORD = 'superadmin';

  function findUserByEmail(email, tenantId) {
    return STATE.users.find((u) => u.tenantId === tenantId && u.email.toLowerCase() === email.toLowerCase());
  }
  function validateCredentials(email, password, tenantId) {
    if (email.toLowerCase() === SUPER_ADMIN_EMAIL && password === SUPER_ADMIN_PASSWORD) return { type: 'super' };
    const user = findUserByEmail(email, tenantId);
    if (!user) return { type: 'error', message: 'No user found with that email in this workspace.' };
    if (user.status === 'suspended') return { type: 'error', message: 'This account is suspended.' };
    if (user.status === 'on_leave' || user.status === 'offline') {
      return { type: 'error', message: `Account is currently ${USER_STATUS_LABEL[user.status]}.` };
    }
    if (password && password.length >= 6) return { type: 'tenant', user };
    if (password === DEMO_ADMIN_PASSWORD) return { type: 'tenant', user };
    return { type: 'error', message: 'Invalid password.' };
  }
  async function doLogin(email, password, tenantId) {
    const result = validateCredentials(email, password, tenantId);
    if (result.type === 'error') return result;
    if (result.type === 'super') {
      STATE.session = { mode: 'super', loggedInAt: nowIso() };
      await DB.saveSession(STATE.session);
      return { type: 'super' };
    }
    STATE.session = { mode: 'tenant', tenantId, userId: result.user.id, loggedInAt: nowIso() };
    STATE.currentTenantId = tenantId;
    STATE.currentUserId = result.user.id;
    STATE.impersonating = false;
    loadTenantSettings();
    await DB.saveSession(STATE.session);
    return { type: 'tenant', user: result.user };
  }
  function demoLogin() {
    const tenant = STATE.tenants[0];
    if (!tenant) return null;
    const user = STATE.users.find((u) => u.tenantId === tenant.id && u.role === 'admin')
      || STATE.users.find((u) => u.tenantId === tenant.id);
    if (!user) return null;
    STATE.session = { mode: 'tenant', tenantId: tenant.id, userId: user.id, loggedInAt: nowIso() };
    STATE.currentTenantId = tenant.id;
    STATE.currentUserId = user.id;
    STATE.impersonating = false;
    loadTenantSettings();
    DB.saveSession(STATE.session);
    return { tenant, user };
  }
  async function logout() {
    STATE.session = null;
    STATE.currentTenantId = null;
    STATE.currentUserId = null;
    STATE.impersonating = false;
    await DB.clearSession();
  }
  return { doLogin, demoLogin, logout, SUPER_ADMIN_EMAIL, DEMO_ADMIN_EMAIL };
})();

/* ============================================================================
   11 · THEME
   ============================================================================ */

const Theme = (() => {
  const KEY = 'octane8mt_theme';
  function apply(t) {
    const theme = t === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    for (const id of ['theme-icon', 'super-theme-icon']) {
      const el = document.getElementById(id);
      if (el) el.className = `fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}`;
    }
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    EventBus.emit('theme:changed', theme);
  }
  function current() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
  function toggle() { apply(current() === 'dark' ? 'light' : 'dark'); }
  function load() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    apply(saved || 'dark');
  }
  return { apply, current, toggle, load };
})();

/* ============================================================================
   12 · i18n / DIRECTION
   ============================================================================ */

const i18n = (() => {
  const KEY = 'octane8mt_lang';
  function apply(lang) {
    const l = lang === 'ar' ? 'ar' : 'en';
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem(KEY, l); } catch (_) {}
    EventBus.emit('i18n:changed', l);
  }
  function current() { return document.documentElement.lang === 'ar' ? 'ar' : 'en'; }
  function toggle() { apply(current() === 'ar' ? 'en' : 'ar'); }
  function load() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    apply(saved || 'en');
  }
  return { apply, current, toggle, load };
})();

/* ============================================================================
   13 · TOAST
   ============================================================================ */

const Toast = (() => {
  const ICONS = {
    success: 'fa-circle-check', error: 'fa-circle-exclamation',
    warning: 'fa-triangle-exclamation', info: 'fa-circle-info',
  };
  function host() { return document.getElementById('toast-host'); }
  function show(message, type = 'info', opts = {}) {
    const container = host();
    if (!container) return null;
    const duration = opts.duration ?? 4000;
    const onClick = opts.onClick;
    const el = document.createElement('div');
    el.className = `toast is-${type}${onClick ? ' is-interactive' : ''}`;
    el.setAttribute('role', 'status');
    const icon = document.createElement('i');
    icon.className = `fa-solid ${ICONS[type] || ICONS.info}`;
    icon.setAttribute('aria-hidden', 'true');
    const span = document.createElement('span');
    span.textContent = String(message || '');
    el.appendChild(icon); el.appendChild(span);
    if (onClick) el.addEventListener('click', () => { try { onClick(); } catch (_) {} });
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(16px)';
      setTimeout(() => el.remove(), 320);
    }, duration);
    return el;
  }
  return { show };
})();
const showToast = Toast.show;

/* ============================================================================
   14 · MODAL
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
    if (STACK.length === 0 && !document.querySelector('.drawer.is-open')) document.body.style.overflow = '';
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
   15 · DRAWER
   ============================================================================ */

const Drawer = (() => {
  const MAP = {
    'notifications': { panel: 'drawer-notifications', backdrop: 'drawer-notifications-backdrop' },
    'lead-interaction': { panel: 'drawer-lead-interaction', backdrop: 'drawer-lead-backdrop' },
  };
  function open(name) {
    const cfg = MAP[name]; if (!cfg) return;
    document.getElementById(cfg.panel)?.classList.add('is-open');
    document.getElementById(cfg.backdrop)?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function close(name) {
    const cfg = MAP[name]; if (!cfg) return;
    document.getElementById(cfg.panel)?.classList.remove('is-open');
    document.getElementById(cfg.backdrop)?.classList.remove('is-open');
    if (!document.querySelector('.modal-overlay.is-open')) document.body.style.overflow = '';
  }
  function isOpen(name) {
    const cfg = MAP[name];
    return cfg ? document.getElementById(cfg.panel)?.classList.contains('is-open') || false : false;
  }
  function closeAll() { for (const name of Object.keys(MAP)) close(name); }
  return { open, close, isOpen, closeAll };
})();

/* ============================================================================
   16 · CONFIRM
   ============================================================================ */

const Confirm = (() => {
  let resolver = null;
  function ask(opts = {}) {
    const cfg = {
      icon: '⚠️', title: 'Are you sure?', message: 'This action cannot be undone.',
      okText: 'Confirm', cancelText: 'Cancel', danger: true, ...opts,
    };
    setText('confirm-icon', cfg.icon);
    setText('modal-confirm-title', cfg.title);
    setText('confirm-message', cfg.message);
    setText('confirm-ok', cfg.okText);
    setText('confirm-cancel', cfg.cancelText);
    const ok = document.getElementById('confirm-ok');
    if (ok) ok.className = cfg.danger ? 'btn btn-danger' : 'btn btn-primary';
    Modal.open('modal-confirm');
    return new Promise((resolve) => { resolver = resolve; });
  }
  function resolveWith(v) {
    if (resolver) {
      const fn = resolver; resolver = null;
      Modal.close('modal-confirm');
      fn(v);
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
   17 · ROUTER
   ============================================================================ */

const Router = {
  tenantRoutes: {
    'action-center':      () => Modules.ActionCenter.render(),
    'sales-pipeline':     () => Modules.Pipeline.render(),
    'lead-rotation':      () => Modules.Rotation.render(),
    'property-inventory': () => Modules.Inventory.render(),
    'cil-radar':          () => Modules.CILRadar.render(),
    'omnichannel':        () => Modules.Omnichannel.render(),
    'attribution':        () => Modules.Attribution.render(),
    'commission':         () => Modules.Commission.render(),
    'cpq':                () => Modules.CPQ.render(),
    'call-intel':         () => Modules.CallIntel.render(),
    'predictive':         () => Modules.Predictive.render(),
    'cadences':           () => Modules.Cadences.render(),
    'dsr':                () => Modules.DSR.render(),
    'voice-simulator':    () => Modules.VoiceSimulator.render(),
    'financial-engine':   () => Modules.FinancialEngine.render(),
    'analytics':          () => Modules.Analytics.render(),
    'users':              () => Modules.Users.render(),
    'permissions':        () => Modules.Permissions.render(),
    'rotation-settings':  () => Modules.RotationSettings.render(),
    'branding':           () => Modules.Branding.render(),
    'integrations':       () => Modules.Integrations.render(),
    'settings':           () => Modules.Settings.render(),
  },
  superRoutes: {
    'overview':      () => SuperModules.Overview.render(),
    'tenants':       () => SuperModules.Tenants.render(),
    'subscriptions': () => SuperModules.Subscriptions.render(),
    'mrr':           () => SuperModules.MRR.render(),
    'usage':         () => SuperModules.Usage.render(),
    'feature-flags': () => SuperModules.FeatureFlags.render(),
    'tiers':         () => SuperModules.Tiers.render(),
    'system':        () => SuperModules.System.render(),
  },
  current: null,
  currentSuper: null,

  navigate(view) {
    if (!this.tenantRoutes[view]) view = 'action-center';
    if (!canViewModule(view)) { showToast('This module is not enabled in your current plan.', 'warning'); return; }
    const content = document.getElementById('main-content-view');
    if (!content) return;
    if (this.current && Modules[this.current]?.teardown) safe(() => Modules[this.current].teardown(), `teardown ${this.current}`);
    content.setAttribute('aria-busy', 'true');
    content.innerHTML = '';
    content.scrollTop = 0;
    STATE.charts = [];
    document.querySelectorAll('[data-view]').forEach((el) => {
      const match = el.dataset.view === view;
      el.classList.toggle('is-active', match);
      if (match) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    const meta = VIEW_META[view] || { title: 'CRM', subtitle: '' };
    setText('view-title', meta.title);
    setText('view-subtitle', meta.subtitle);
    try { this.tenantRoutes[view](); }
    catch (err) {
      console.error(`[Octane] Tenant route "${view}" failed:`, err);
      content.innerHTML = `<div class="view-container"><div class="surface-card" style="padding:32px; text-align:center;">
        <div style="font-size:32px; margin-bottom:12px;">💥</div>
        <h3 style="font-size:15px; font-weight:600; margin-bottom:4px;">Something went wrong</h3>
        <p style="font-size:13px; color:var(--txt-secondary);">${esc(err.message)}</p>
      </div></div>`;
    }
    STATE.activeView = view;
    this.current = view;
    content.setAttribute('aria-busy', 'false');
    try { localStorage.setItem('octane8mt_last_view', view); } catch (_) {}
  },

  navigateSuper(view) {
    if (!this.superRoutes[view]) view = 'overview';
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    content.setAttribute('aria-busy', 'true');
    content.innerHTML = '';
    content.scrollTop = 0;
    document.querySelectorAll('[data-super-view]').forEach((el) => {
      const match = el.dataset.superView === view;
      el.classList.toggle('is-active', match);
      if (match) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    const meta = SUPER_VIEW_META[view] || { title: 'Super-Admin', subtitle: '' };
    setText('super-view-title', meta.title);
    setText('super-view-subtitle', meta.subtitle);
    try { this.superRoutes[view](); }
    catch (err) {
      console.error(`[Octane] Super route "${view}" failed:`, err);
      content.innerHTML = `<div class="view-container"><div class="surface-card" style="padding:32px; text-align:center;">
        <div style="font-size:32px; margin-bottom:12px;">💥</div>
        <h3 style="font-size:15px; font-weight:600;">Something went wrong</h3>
        <p style="font-size:13px; color:var(--txt-secondary);">${esc(err.message)}</p>
      </div></div>`;
    }
    STATE.activeSuperView = view;
    this.currentSuper = view;
    content.setAttribute('aria-busy', 'false');
  },

  refresh() {
    if (STATE.session?.mode === 'super' && this.currentSuper) this.navigateSuper(this.currentSuper);
    else if (this.current) this.navigate(this.current);
  },
};

function canViewModule(view) {
  const featureByView = {
    'property-inventory': 'inventory', 'omnichannel': 'omnichannel',
    'attribution': 'attribution', 'commission': 'commission', 'cpq': 'cpq',
    'call-intel': 'ai_calls', 'predictive': 'predictive', 'cadences': 'cadences',
    'dsr': 'dsr', 'voice-simulator': 'voice_simulator',
  };
  const flag = featureByView[view];
  if (flag) return hasFeature(flag);
  return true;
}

/* ============================================================================
   18 · DISPATCH + EVENT DELEGATION
   ============================================================================ */

function dispatchAction(action, el) {
  const handlers = {
    'toggle-login-password': () => {
      const el2 = document.getElementById('login-password');
      if (!el2) return;
      el2.type = el2.type === 'password' ? 'text' : 'password';
    },
    'do-login': () => handleLogin(),
    'demo-login': () => handleDemoLogin(),
    'super-admin-login': () => handleSuperAdminLogin(),
    'logout': () => handleLogout(),
    'super-admin-logout': () => handleLogout(),
    'exit-impersonation': () => exitImpersonation(),
    'toggle-mobile-sidebar': () => {
      const target = el.dataset.target || 'app-sidebar';
      document.getElementById(target)?.classList.toggle('is-mobile-open');
    },
    'toggle-theme': () => Theme.toggle(),
    'toggle-language': () => i18n.toggle(),
    'open-command-palette': () => openCommandPalette(),
    'open-notifications-drawer': () => openNotificationsDrawer(),
    'mark-all-notifications-read': () => markAllNotificationsRead(),
    'filter-notifications': () => filterNotifications(el.dataset.filter),
    'notification-click': () => handleNotificationClick(el.dataset.notificationId),
    'close-drawer': () => Drawer.close(el.dataset.drawer || 'lead-interaction'),
    'toggle-user-menu': () => toggleUserMenu(),
    'switch-user': () => switchCurrentUser(el.dataset.userId),
    'open-user-modal': () => openUserForm(el.dataset.userId || ''),
    'open-checkin': () => openCheckInModal(),
    'open-lead-form': () => openLeadForm(el.dataset.leadId || ''),
    'open-action-center': () => openLeadDrawer(el.dataset.leadId),
    'delete-lead': () => deleteLead(el.dataset.leadId),
    'change-stage': () => changeLeadStage(el.dataset.leadId, el.dataset.stage),
    'save-lead-form': () => saveLeadFromForm(),
    'send-whatsapp': () => sendWhatsApp(),
    'open-whatsapp': () => openWhatsAppModal(el.dataset.leadId),
    'lead-disposition': () => applyDisposition(el.dataset.value),
    'lead-followup': () => applyQuickFollowup(el.dataset.value),
    'lead-followup-custom': () => openCustomFollowupPrompt(),
    'drawer-add-note': () => submitDrawerNote(),
    'drawer-call': () => drawerCall(),
    'drawer-whatsapp': () => { if (STATE.drawerLeadId) openWhatsAppModal(STATE.drawerLeadId); },
    'drawer-email': () => drawerEmail(),
    'drawer-edit': () => { if (STATE.drawerLeadId) openLeadForm(STATE.drawerLeadId); },
    'drawer-save-followup': () => saveDrawerFollowup(),
    'drawer-full-audit': () => { if (STATE.drawerLeadId) showToast('Full audit log available in the timeline', 'info'); },
    'drawer-toggle-claim': () => claimLeadFromPool(el.dataset.leadId),
    'rotation-claim': () => claimLeadFromPool(el.dataset.leadId),
    'rotation-refresh': () => Modules.Rotation.render(),
    'rotation-mode-change': () => changeRotationMode(el.dataset.mode),
    'open-tenant-form': () => openTenantForm(el.dataset.tenantId || ''),
    'save-tenant-form': () => saveTenantFromForm(),
    'delete-tenant': () => deleteTenantFromForm(),
    'impersonate-tenant': () => impersonateTenant(el.dataset.tenantId),
    'open-import-picker': () => document.getElementById('import-file-input')?.click(),
    'confirm-import': () => confirmImport(),
    'do-checkin': () => doCheckIn(),
    'do-checkout': () => doCheckOut(),
    'submit-discount-request': () => submitDiscountRequest(),
    'uf-upload-avatar': () => document.getElementById('uf-avatar-input')?.click(),
    'uf-clear-avatar': () => clearUserAvatar(),
    'uf-toggle-password': () => toggleUserPasswordVisibility(),
    'uf-reset-permissions': () => resetUserPermissions(),
    'save-user-form': () => saveUserFromForm(),
    'delete-user': () => deleteUserFromForm(),
    'tf-toggle-feature': () => toggleTenantFeature(el.dataset.feature),
    'settings-export': () => exportData(),
    'settings-import': () => openImportModal(),
    'settings-clear': () => clearTenantData(),
    'settings-add-project': () => addProject(),
    'settings-remove-project': () => removeProject(el.dataset.project),
    'settings-save-wa': () => saveWATemplates(),
    'branding-save': () => saveBranding(),
    'branding-logo-upload': () => document.getElementById('branding-logo-input')?.click(),
    'branding-logo-clear': () => clearBrandingLogo(),
    'branding-reset-colors': () => resetBrandingColors(),
    'integration-toggle': () => toggleIntegration(el),
    'cmd-execute': () => executeCommand(el.dataset.commandId),
    'modal-open': () => Modal.open(el.dataset.modalId),
    'modal-close-custom': () => Modal.close(el.dataset.modalId),
  };
  const fn = handlers[action];
  if (!fn) { console.warn(`[Octane] Unhandled action: "${action}"`); return false; }
  safe(fn, `action "${action}"`);
  return true;
}

function installGlobalDelegation() {
  document.addEventListener('click', (e) => {
    const userMenu = document.getElementById('user-menu');
    const userTrigger = e.target.closest('[data-action="toggle-user-menu"]');
    if (userMenu?.classList.contains('is-open') && !userTrigger && !e.target.closest('#user-menu')) {
      userMenu.classList.remove('is-open');
      document.querySelector('[data-action="toggle-user-menu"]')?.setAttribute('aria-expanded', 'false');
    }
    const navEl = e.target.closest('[data-view]');
    if (navEl && !navEl.closest('[data-modal-body]')) { e.preventDefault(); Router.navigate(navEl.dataset.view); return; }
    const superEl = e.target.closest('[data-super-view]');
    if (superEl) { e.preventDefault(); Router.navigateSuper(superEl.dataset.superView); return; }
    const mc = e.target.closest('[data-modal-close]');
    if (mc) { e.preventDefault(); Modal.close(mc.dataset.modalClose); return; }
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('is-open')) { Modal.close(e.target.id); return; }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { e.preventDefault(); switchTab(tabBtn.dataset.tab); return; }
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) { if (dispatchAction(actionEl.dataset.action, actionEl)) e.preventDefault(); return; }
  });

  document.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '');
    if (e.key === 'Escape') {
      if (Drawer.isOpen('lead-interaction')) { closeLeadDrawer(); return; }
      if (Drawer.isOpen('notifications')) { Drawer.close('notifications'); return; }
      Modal.closeTop();
      return;
    }
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); return; }
    if (cmd && e.key.toLowerCase() === 'n' && !inField && STATE.session?.mode === 'tenant') { e.preventDefault(); openLeadForm(); return; }
    if (cmd && e.key === ',') { e.preventDefault(); if (STATE.session?.mode === 'tenant') Router.navigate('settings'); return; }
    if (cmd && e.key === 'Enter' && e.target.id === 'drawer-note-input') { e.preventDefault(); submitDrawerNote(); return; }
    if (Modal.isOpen('modal-command-palette')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCommandSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveCommandSelection(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); executeSelectedCommand(); return; }
    }
  });

  window.addEventListener('storage', async (e) => {
    if (e.key !== SYNC_KEY) return;
    try {
      const msg = JSON.parse(e.newValue);
      if (!msg || msg.tabId === SELF_TAB_ID) return;
      setSyncStatus('syncing');
      await DB.loadAll();
      if (STATE.booted) Router.refresh();
      if (STATE.session?.mode === 'super') updateSuperHeaderKPIs();
      else updateHeaderKPIs();
      refreshUserChrome();
      setTimeout(() => setSyncStatus('live'), 800);
    } catch (_) {}
  });

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

  const cmdInput = document.getElementById('cmd-palette-input');
  if (cmdInput) {
    cmdInput.addEventListener('input', () => renderCommandPaletteResults(cmdInput.value));
    cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') e.preventDefault();
    });
  }

  const avatarInput = document.getElementById('uf-avatar-input');
  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) { showToast('Max 2MB', 'warning'); return; }
      const r = new FileReader();
      r.onload = (ev) => setUserAvatarPreview(ev.target.result);
      r.readAsDataURL(f);
    });
  }
  const logoInput = document.getElementById('branding-logo-input');
  if (logoInput) {
    logoInput.addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      if (f.size > 512 * 1024) { showToast('Max 512KB', 'warning'); return; }
      const r = new FileReader();
      r.onload = (ev) => applyBrandingLogoPreview(ev.target.result);
      r.readAsDataURL(f);
    });
  }
  const importInput = document.getElementById('import-file-input');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) handleImportFile(f);
    });
  }
  const roleSel = document.getElementById('uf-role');
  if (roleSel) roleSel.addEventListener('change', () => renderUserPermissionsEditor());
}

function switchTab(tabId) {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
    btn.style.color = active ? 'var(--accent)' : 'var(--txt-secondary)';
    btn.style.fontWeight = active ? '600' : '500';
  });
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.classList.toggle('is-hidden', panel.dataset.tabPanel !== tabId);
  });
}

/* ============================================================================
   19 · HEADER UPDATES + NOTIFICATIONS
   ============================================================================ */

function updateHeaderKPIs() {
  if (STATE.session?.mode !== 'tenant') return;
  const leads = tenantLeads();
  const active = leads.filter((l) => l.stage !== 'Won' && l.stage !== 'Lost');
  const pipeline = active.reduce((s, l) => s + (Number(l.budget) || 0), 0);
  const overdue = leads.filter((l) => slaStatusOf(l) === 'overdue').length;
  const won = leads.filter((l) => l.stage === 'Won').length;
  const closed = leads.filter((l) => l.stage === 'Won' || l.stage === 'Lost').length;
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : 0;
  const hot = leads.filter((l) => calcLeadScore(l) >= 70).length;

  setText('hdr-kpi-pipeline', formatMoney(pipeline));
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
  const claimBadge = document.querySelector('[data-badge="claim-pool"]');
  if (claimBadge) {
    const pool = leads.filter((l) => l.status === 'claim_pool').length;
    claimBadge.textContent = String(pool);
    claimBadge.style.display = pool > 0 ? '' : 'none';
  }
  const dot = document.getElementById('notification-dot');
  if (dot) {
    const unread = tenantNotifications().filter((n) => !n.read).length;
    dot.classList.toggle('is-hidden', unread === 0);
  }
}

function updateSuperHeaderKPIs() {
  const tenants = STATE.tenants;
  const active = tenants.filter((t) => t.status === 'active');
  const mrr = active.reduce((s, t) => s + (Number(t.monthlyPrice) || 0), 0);
  const pastDue = tenants.filter((t) => t.status === 'past_due').length;
  setText('super-kpi-mrr', formatMoney(mrr));
  setText('super-kpi-tenants', String(active.length));
  setText('super-kpi-pastdue', String(pastDue));
  const badge = document.querySelector('[data-super-badge="tenants-count"]');
  if (badge) badge.textContent = String(tenants.length);
}

function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const label = document.getElementById('sync-label');
  if (!dot || !label) return;
  dot.style.animation = '';
  if (status === 'syncing') { dot.style.background = 'var(--warn)'; label.textContent = 'Syncing…'; }
  else if (status === 'error') { dot.style.background = 'var(--danger)'; label.textContent = 'Error'; }
  else { dot.style.background = 'var(--ok)'; label.textContent = 'Live'; }
}

function refreshUserChrome() {
  const user = getCurrentUser();
  const tenant = getCurrentTenant();
  if (tenant) {
    setText('tenant-name', tenant.name);
    setText('tenant-tier', `${TIERS[tenant.tier]?.label || tenant.tier} Tier`);
    const logo = document.getElementById('tenant-logo');
    if (logo) {
      const branding = STATE.settings?.branding || {};
      if (branding.logoDataUrl) {
        logo.style.backgroundImage = `url(${branding.logoDataUrl})`;
        logo.style.backgroundSize = 'cover';
        logo.style.backgroundPosition = 'center';
        logo.textContent = '';
      } else {
        logo.style.backgroundImage = '';
        logo.textContent = (tenant.name || 'O').charAt(0).toUpperCase();
        logo.style.background = `linear-gradient(135deg, ${branding.primary || 'var(--accent)'}, ${branding.secondary || 'var(--violet)'})`;
      }
    }
    const branding = STATE.settings?.branding || {};
    if (branding.primary) document.documentElement.style.setProperty('--accent', branding.primary);
    if (branding.secondary) document.documentElement.style.setProperty('--violet', branding.secondary);
  }
  document.querySelectorAll('[data-current-user-name]').forEach((el) => {
    el.textContent = user ? user.name : '—';
  });
  document.querySelectorAll('[data-current-user-role]').forEach((el) => {
    el.textContent = user ? (ROLE_LABEL[user.role] || user.role) : '—';
  });
  document.querySelectorAll('[data-current-user-avatar]').forEach((el) => {
    if (user?.avatarUrl) {
      el.style.backgroundImage = `url(${user.avatarUrl})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = user ? initialsOf(user.name) : '?';
    }
  });
  const menuList = document.getElementById('user-menu-list');
  if (menuList) {
    const users = tenantUsers();
    menuList.innerHTML = users.map((u) => {
      const active = u.id === STATE.currentUserId;
      const av = u.avatarUrl
        ? `<span class="avatar avatar-sm" style="background-image:url('${escAttr(u.avatarUrl)}'); background-size:cover; background-position:center;"></span>`
        : `<span class="avatar avatar-sm">${esc(initialsOf(u.name))}</span>`;
      return `<button type="button" class="dropdown-item ${active ? 'text-accent' : ''}" data-action="switch-user" data-user-id="${escAttr(u.id)}" role="menuitem">
        ${av}
        <span style="flex:1; min-width:0;">
          <span style="display:block;" class="truncate">${esc(u.name)}</span>
          <span style="display:block; font-size:10px; color:var(--txt-muted);" class="truncate">${esc(ROLE_LABEL[u.role] || u.role)}</span>
        </span>
        ${active ? '<i class="fa-solid fa-check" style="color: var(--accent); font-size:11px;" aria-hidden="true"></i>' : ''}
      </button>`;
    }).join('') || `<div style="padding: 8px 10px; font-size: 12px; color: var(--txt-muted);">No users yet</div>`;
  }
  const banner = document.getElementById('impersonation-banner');
  if (banner) banner.classList.toggle('is-hidden', !STATE.impersonating);
}

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  const trigger = document.querySelector('[data-action="toggle-user-menu"]');
  if (!menu) return;
  const open = menu.classList.toggle('is-open');
  if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function switchCurrentUser(userId) {
  const user = STATE.users.find((u) => u.id === userId && u.tenantId === STATE.currentTenantId);
  if (!user) return;
  const me = getCurrentUser();
  if (!me || (me.role !== 'admin' && me.role !== 'team_leader')) {
    showToast('Only Admins and Team Leaders can switch users', 'warning');
    return;
  }
  STATE.currentUserId = user.id;
  document.getElementById('user-menu')?.classList.remove('is-open');
  refreshUserChrome();
  Router.refresh();
  updateHeaderKPIs();
  showToast(`Switched to ${user.name}`, 'success');
}

function openNotificationsDrawer() {
  renderNotificationsList();
  Drawer.open('notifications');
}
function renderNotificationsList() {
  const el = document.getElementById('notifications-list');
  if (!el) return;
  const list = tenantNotifications().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (list.length === 0) {
    el.innerHTML = `<div style="text-align: center; padding: 48px 16px;">
      <div style="font-size: 32px; opacity: .5; margin-bottom: 8px;">🔔</div>
      <p style="font-size: 12px; color: var(--txt-muted);">No notifications yet.</p>
    </div>`;
    return;
  }
  el.innerHTML = list.map((n) => {
    const tone = { sla: '#ff5d5d', assignment: '#6d8cff', approval: '#ffb648', system: '#8a91a6' }[n.type] || '#8a91a6';
    const icon = { sla: 'fa-triangle-exclamation', assignment: 'fa-user-plus', approval: 'fa-hand', system: 'fa-gear' }[n.type] || 'fa-bell';
    return `<button type="button" data-action="notification-click" data-notification-id="${escAttr(n.id)}"
      class="surface-card" style="width: 100%; text-align: start; padding: 12px; margin-bottom: 8px; border-inline-start: 3px solid ${tone}; ${n.read ? '' : 'background: var(--bg-surface-2);'} cursor: pointer;">
      <div style="display: flex; align-items: start; gap: 10px;">
        <i class="fa-solid ${icon}" style="color: ${tone}; font-size: 12px; margin-top: 3px;" aria-hidden="true"></i>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 600; color: var(--txt-primary); margin-bottom: 2px;">${esc(n.title)}</div>
          <div style="font-size: 12px; color: var(--txt-secondary); line-height: 1.5;">${esc(n.body || '')}</div>
          <div style="font-size: 10px; color: var(--txt-muted); margin-top: 6px;">${formatRelative(n.createdAt)}</div>
        </div>
        ${n.read ? '' : '<span style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 6px;"></span>'}
      </div>
    </button>`;
  }).join('');
}
function markAllNotificationsRead() {
  let count = 0;
  for (const n of STATE.notifications) {
    if (n.userId === STATE.currentUserId && n.tenantId === STATE.currentTenantId && !n.read) {
      n.read = true; count++;
    }
  }
  for (const n of STATE.notifications) {
    if (n.userId === STATE.currentUserId && n.tenantId === STATE.currentTenantId) DB.saveNotification(n);
  }
  renderNotificationsList();
  updateHeaderKPIs();
  showToast(`Marked ${count} notification${count === 1 ? '' : 's'} as read`, 'success');
}
function filterNotifications(filter) {
  document.querySelectorAll('[data-action="filter-notifications"]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.filter === filter);
  });
  renderNotificationsList();
}
function handleNotificationClick(notificationId) {
  const n = STATE.notifications.find((x) => x.id === notificationId);
  if (!n) return;
  n.read = true;
  DB.saveNotification(n);
  renderNotificationsList();
  updateHeaderKPIs();
  if (n.deepLink?.type === 'lead' && n.deepLink.leadId) {
    Drawer.close('notifications');
    openLeadDrawer(n.deepLink.leadId);
  } else if (n.deepLink?.type === 'view' && n.deepLink.view) {
    Drawer.close('notifications');
    Router.navigate(n.deepLink.view);
  }
}
function pushNotification({ tenantId, userId, type, title, body, deepLink, silent }) {
  const n = {
    id: uid('ntf'), tenantId, userId, type: type || 'system',
    title: String(title || '').slice(0, 200),
    body: String(body || '').slice(0, 500),
    deepLink: deepLink || null, read: false, createdAt: nowIso(),
  };
  STATE.notifications.unshift(n);
  DB.saveNotification(n);
  if (!silent && userId === STATE.currentUserId && tenantId === STATE.currentTenantId) {
    updateHeaderKPIs();
    if (Drawer.isOpen('notifications')) renderNotificationsList();
    showToast(title, type === 'sla' ? 'warning' : type === 'approval' ? 'info' : 'info', {
      onClick: () => handleNotificationClick(n.id),
    });
  }
  return n;
}

/* ============================================================================
   20 · COMMAND PALETTE
   ============================================================================ */

const CommandPalette = (() => {
  let currentItems = [];
  let selectedIndex = 0;
  function build() {
    const items = [];
    for (const [view, meta] of Object.entries(VIEW_META)) {
      items.push({ id: `nav:${view}`, category: 'Navigate', icon: 'fa-arrow-right-to-bracket', label: `Go to ${meta.title}`, run: () => Router.navigate(view) });
    }
    items.push({ id: 'act:new-lead', category: 'Actions', icon: 'fa-plus', label: 'Create new lead', run: () => openLeadForm() });
    items.push({ id: 'act:new-user', category: 'Actions', icon: 'fa-user-plus', label: 'Add team member', run: () => openUserForm() });
    items.push({ id: 'act:theme', category: 'Actions', icon: 'fa-moon', label: 'Toggle theme', run: () => Theme.toggle() });
    items.push({ id: 'act:lang', category: 'Actions', icon: 'fa-language', label: 'Toggle language (EN/AR)', run: () => i18n.toggle() });
    items.push({ id: 'act:export', category: 'Actions', icon: 'fa-download', label: 'Export data (JSON)', run: () => exportData() });
    items.push({ id: 'act:import', category: 'Actions', icon: 'fa-upload', label: 'Import data', run: () => openImportModal() });
    items.push({ id: 'act:checkin', category: 'Actions', icon: 'fa-location-dot', label: 'Check In / Out', run: () => openCheckInModal() });
    items.push({ id: 'act:logout', category: 'Actions', icon: 'fa-arrow-right-from-bracket', label: 'Sign out', run: () => handleLogout() });
    const leads = tenantLeads().slice(0, 8);
    for (const l of leads) {
      items.push({ id: `lead:${l.id}`, category: 'Leads', icon: 'fa-user', label: `${l.name}${l.phone ? ' · ' + l.phone : ''}`, run: () => openLeadDrawer(l.id) });
    }
    return items;
  }
  function match(items, query) {
    if (!query) return items.slice(0, 30);
    const q = query.toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q)).slice(0, 40);
  }
  function render(query) {
    const el = document.getElementById('cmd-palette-results');
    if (!el) return;
    currentItems = match(build(), query);
    selectedIndex = 0;
    if (currentItems.length === 0) {
      el.innerHTML = `<div style="padding: 32px 16px; text-align: center; color: var(--txt-muted); font-size: 12px;">No matches</div>`;
      return;
    }
    const groups = new Map();
    currentItems.forEach((it, i) => {
      if (!groups.has(it.category)) groups.set(it.category, []);
      groups.get(it.category).push({ ...it, _index: i });
    });
    let html = '';
    for (const [cat, list] of groups) {
      html += `<div style="padding: 8px 12px 4px; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-dim);">${esc(cat)}</div>`;
      for (const it of list) {
        html += `<button type="button" class="cmd-item ${it._index === selectedIndex ? 'is-selected' : ''}" data-action="cmd-execute" data-command-id="${escAttr(it.id)}">
          <span class="cmd-icon"><i class="fa-solid ${it.icon || 'fa-terminal'}" aria-hidden="true"></i></span>
          <span style="flex: 1; min-width: 0;" class="truncate">${esc(it.label)}</span>
        </button>`;
      }
    }
    el.innerHTML = html;
  }
  function open() {
    render('');
    Modal.open('modal-command-palette');
    setTimeout(() => {
      const input = document.getElementById('cmd-palette-input');
      if (input) { input.value = ''; input.focus(); }
    }, 60);
  }
  function moveSelection(delta) {
    selectedIndex = clamp(selectedIndex + delta, 0, Math.max(0, currentItems.length - 1));
    const nodes = document.querySelectorAll('#cmd-palette-results .cmd-item');
    nodes.forEach((n, i) => n.classList.toggle('is-selected', i === selectedIndex));
    const sel = nodes[selectedIndex];
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function executeSelected() {
    const item = currentItems[selectedIndex];
    if (item) item.run();
    Modal.close('modal-command-palette');
  }
  function executeById(id) {
    const all = build();
    const item = all.find((x) => x.id === id);
    if (item) { item.run(); Modal.close('modal-command-palette'); }
  }
  return { open, render, moveSelection, executeSelected, executeById };
})();

function openCommandPalette() { CommandPalette.open(); }
function renderCommandPaletteResults(q) { CommandPalette.render(q); }
function moveCommandSelection(d) { CommandPalette.moveSelection(d); }
function executeSelectedCommand() { CommandPalette.executeSelected(); }
function executeCommand(id) { CommandPalette.executeById(id); }

/* ============================================================================
   21 · LEAD CRUD + AUDIT + COMMENTS
   ============================================================================ */

function findLead(id) {
  return STATE.leads.find((l) => l.id === id && l.tenantId === STATE.currentTenantId) || null;
}

function createAuditEntry(leadId, action, meta = {}) {
  const u = getCurrentUser();
  const entry = {
    id: uid('aud'), tenantId: STATE.currentTenantId, leadId,
    action: String(action || 'action'),
    agent: u?.name || 'System', userId: u?.id || null,
    timestamp: nowIso(), meta,
  };
  if (!STATE.auditLogs[leadId]) STATE.auditLogs[leadId] = [];
  STATE.auditLogs[leadId].unshift(entry);
  DB.saveAudit(entry);
  return entry;
}

const AUDIT_ICONS = {
  lead_created: '🌱', lead_edited: '✏️', lead_deleted: '🗑', stage_change: '🔄',
  comment_added: '💬', followup_set: '📅', whatsapp_sent: '📱', note_added: '📝',
  call_answered: '📞', call_missed: '❌', call_busy: '⏳', call_vm: '📼',
  call_back: '🔁', call_wrong: '⚠️', meeting_set: '📆', snooze: '💤',
  rotation_assigned: '🎯', rotation_revoked: '⛔', rotation_claimed: '✋',
  user_created: '👤', user_updated: '✏️', user_deleted: '🗑',
  checkin: '📍', checkout: '🏁', discount_requested: '💰', discount_approved: '✅',
  tenant_created: '🏢', tenant_updated: '✏️', tenant_deleted: '🗑',
  default: '📋',
};
function auditIcon(action) { return AUDIT_ICONS[action] || AUDIT_ICONS.default; }

function buildAuditLine(entry) {
  const who = `<strong>${esc(entry.agent || 'System')}</strong>`;
  const meta = entry.meta || {};
  switch (entry.action) {
    case 'lead_created': return `${who} created this lead as <strong>${esc(meta.stage || 'New Lead')}</strong>`;
    case 'stage_change': return `${who} moved stage from <strong>${esc(meta.from || '—')}</strong> → <strong>${esc(meta.to || '—')}</strong>`;
    case 'comment_added': return `${who} added a note`;
    case 'note_added': return `${who} added a quick note`;
    case 'followup_set': return `${who} scheduled follow-up for <strong>${esc(meta.datetime || '—')}</strong>`;
    case 'whatsapp_sent': return `${who} sent a WhatsApp message`;
    case 'lead_edited': return `${who} updated the lead details`;
    case 'snooze': return `${who} snoozed by ${esc(meta.hours || '—')}h`;
    case 'lead_deleted': return `${who} deleted the lead`;
    case 'call_answered': return `${who} logged: <strong>Answered</strong>`;
    case 'call_missed': return `${who} logged: <strong>No Answer</strong>${meta.attempt ? ` (attempt #${esc(meta.attempt)})` : ''}`;
    case 'call_busy': return `${who} logged: <strong>Busy</strong>`;
    case 'call_vm': return `${who} logged: <strong>Voicemail</strong>`;
    case 'call_back': return `${who} logged: <strong>Call Back</strong>`;
    case 'call_wrong': return `${who} logged: <strong>Wrong Number</strong>`;
    case 'meeting_set': return `${who} scheduled a <strong>meeting</strong> for ${esc(meta.datetime || '—')}`;
    case 'rotation_assigned': return `${who} auto-assigned this lead via <strong>${esc(meta.mode || 'rotation')}</strong>`;
    case 'rotation_revoked': return `${who} <strong>revoked</strong> the assignment (SLA breach)`;
    case 'rotation_claimed': return `${who} <strong>claimed</strong> this lead from the pool`;
    case 'user_created': return `${who} added team member <strong>${esc(meta.name || '')}</strong>`;
    case 'user_updated': return `${who} updated team member <strong>${esc(meta.name || '')}</strong>`;
    case 'user_deleted': return `${who} removed team member <strong>${esc(meta.name || '')}</strong>`;
    case 'checkin': return `${who} checked in${meta.location ? ` at ${esc(meta.location)}` : ''}`;
    case 'checkout': return `${who} checked out`;
    case 'discount_requested': return `${who} requested a <strong>${esc(meta.percent || 0)}%</strong> discount`;
    case 'discount_approved': return `${who} approved a discount`;
    default: return `${who} performed ${esc(entry.action)}`;
  }
}

function buildLeadFromForm() {
  const id = document.getElementById('lf-id')?.value || '';
  const name = (document.getElementById('lf-name')?.value || '').trim();
  if (!name) return { error: 'Lead name is required' };
  const existing = id ? findLead(id) : null;
  const now = nowIso();
  const autoAssign = document.getElementById('lf-auto-assign')?.checked ?? true;
  const agentName = (document.getElementById('lf-agent')?.value || '').trim();
  const agentUser = agentName ? tenantUsers().find((u) => u.name === agentName) : null;
  const priority = document.getElementById('lf-priority')?.value || 'medium';
  const temperature = priority === 'urgent' || priority === 'high' ? 'hot' : priority === 'medium' ? 'warm' : 'cold';

  const lead = {
    id: existing ? existing.id : uid('lead'),
    tenantId: STATE.currentTenantId,
    name,
    phone: (document.getElementById('lf-phone')?.value || '').trim(),
    email: (document.getElementById('lf-email')?.value || '').trim(),
    stage: document.getElementById('lf-stage')?.value || 'New Lead',
    agent: agentUser?.name || '',
    assignedToId: agentUser?.id || null,
    assignedAt: agentUser?.id ? now : null,
    channel: document.getElementById('lf-channel')?.value || 'Direct',
    project: document.getElementById('lf-project')?.value || '',
    budget: Sanitize.number(document.getElementById('lf-budget')?.value, 0),
    location: (document.getElementById('lf-location')?.value || '').trim(),
    priority, temperature,
    requirements: (document.getElementById('lf-requirements')?.value || '').trim(),
    followUpDate: document.getElementById('lf-followup-date')?.value || '',
    followUpTime: document.getElementById('lf-followup-time')?.value || '',
    followUpNote: (document.getElementById('lf-followup-note')?.value || '').trim(),
    slaHours: Sanitize.number(document.getElementById('lf-sla-hours')?.value, LEAD_TEMP_SLA[temperature] || 24),
    slaDueAt: null,
    status: 'active',
    attempts: existing ? (existing.attempts || 0) : 0,
    score: existing?.score ?? 0,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    _pendingAutoAssign: autoAssign && !agentUser,
  };
  if (lead.followUpDate) {
    lead.slaDueAt = parseLocalDate(lead.followUpDate, lead.followUpTime || '09:00').toISOString();
  } else if (!existing) {
    lead.slaDueAt = new Date(Date.now() + LEAD_TEMP_SLA[temperature] * 3600000).toISOString();
    lead.followUpDate = dateOnly(lead.slaDueAt);
    lead.followUpTime = timeOnly(lead.slaDueAt);
  }
  return { error: null, lead, existing };
}

async function saveLeadFromForm() {
  const { error, lead, existing } = buildLeadFromForm();
  if (error) { showToast(error, 'warning'); return; }
  if (!can('edit_leads') && !existing) { showToast('No permission to create leads', 'warning'); return; }

  if (lead._pendingAutoAssign) {
    delete lead._pendingAutoAssign;
    const assignee = RotationEngine.pickNextAssignee();
    if (assignee) {
      lead.agent = assignee.name;
      lead.assignedToId = assignee.id;
      lead.assignedAt = nowIso();
    }
  } else {
    delete lead._pendingAutoAssign;
  }

  if (existing) {
    const idx = STATE.leads.findIndex((l) => l.id === existing.id);
    if (idx > -1) STATE.leads[idx] = lead;
    await DB.saveLead(lead);
    if (existing.stage !== lead.stage) createAuditEntry(lead.id, 'stage_change', { from: existing.stage, to: lead.stage });
    createAuditEntry(lead.id, 'lead_edited', { name: lead.name });
    showToast(`Lead "${lead.name}" updated`, 'success');
  } else {
    STATE.leads.unshift(lead);
    await DB.saveLead(lead);
    createAuditEntry(lead.id, 'lead_created', { name: lead.name, stage: lead.stage });
    if (lead.assignedToId) {
      createAuditEntry(lead.id, 'rotation_assigned', { mode: STATE.settings?.rotation?.mode || 'auto' });
      pushNotification({
        tenantId: STATE.currentTenantId, userId: lead.assignedToId, type: 'assignment',
        title: `New lead assigned: ${lead.name}`,
        body: `${lead.channel || 'Direct'} · ${lead.project || 'No project'}`,
        deepLink: { type: 'lead', leadId: lead.id },
      });
    }
    const initialNote = (document.getElementById('lf-note')?.value || '').trim();
    if (initialNote) {
      const c = {
        id: uid('cmt'), tenantId: STATE.currentTenantId, leadId: lead.id,
        text: initialNote, author: getCurrentUser()?.name || 'System',
        userId: getCurrentUser()?.id || null, timestamp: nowIso(),
      };
      if (!STATE.comments[lead.id]) STATE.comments[lead.id] = [];
      STATE.comments[lead.id].unshift(c);
      await DB.saveComment(c);
      createAuditEntry(lead.id, 'comment_added', {});
    }
    showToast(`Lead "${lead.name}" added`, 'success');
  }
  Modal.close('modal-lead-form');
  Router.refresh();
  updateHeaderKPIs();
  EventBus.emit('lead:changed', lead);
}

function openLeadForm(leadId = '') {
  const lead = leadId ? findLead(leadId) : null;
  if (lead && !can('edit_leads')) { showToast('No permission', 'warning'); return; }
  setText('modal-lead-form-title', lead ? `Edit — ${lead.name}` : 'New Lead');
  const stageSel = document.getElementById('lf-stage');
  if (stageSel) stageSel.innerHTML = STAGES.map((s) => `<option value="${escAttr(s)}" ${lead?.stage === s ? 'selected' : ''}>${STAGE_EMOJI[s]} ${esc(s)}</option>`).join('');
  const channelSel = document.getElementById('lf-channel');
  if (channelSel) channelSel.innerHTML = CHANNELS.map((c) => `<option value="${escAttr(c)}" ${lead?.channel === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const projSel = document.getElementById('lf-project');
  if (projSel) {
    const projects = STATE.settings?.projects || [];
    projSel.innerHTML = `<option value="">— Select —</option>` + projects.map((p) => `<option value="${escAttr(p)}" ${lead?.project === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
  }
  const agentSel = document.getElementById('lf-agent');
  if (agentSel) {
    const users = tenantUsers();
    agentSel.innerHTML = `<option value="">— Unassigned —</option>` + users.map((u) => `<option value="${escAttr(u.name)}" ${lead?.agent === u.name ? 'selected' : ''}>${esc(u.name)} (${esc(ROLE_LABEL[u.role])})</option>`).join('');
  }
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v ?? ''; };
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
  const defaultDate = lead?.followUpDate || (() => { const d = new Date(); d.setDate(d.getDate() + 1); return dateOnly(d); })();
  set('lf-followup-date', defaultDate);
  set('lf-followup-time', lead?.followUpTime || '10:00');
  const autoChk = document.getElementById('lf-auto-assign');
  if (autoChk) autoChk.checked = lead ? !lead.assignedToId : true;
  switchTab('lead-form-basic');
  Modal.open('modal-lead-form');
  setTimeout(() => document.getElementById('lf-name')?.focus(), 60);
}

async function deleteLead(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  if (!can('delete_leads')) { showToast('No permission', 'warning'); return; }
  const ok = await Confirm.ask({ icon: '🗑', title: 'Delete Lead', message: `Permanently delete "${lead.name}" and all related data?`, okText: 'Delete', danger: true });
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
  if (!can('edit_leads')) { showToast('No permission', 'warning'); return; }
  const from = lead.stage;
  lead.stage = newStage;
  lead.updatedAt = nowIso();
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
  const c = {
    id: uid('cmt'), tenantId: STATE.currentTenantId, leadId,
    text, author: u?.name || 'Unknown', userId: u?.id || null, timestamp: nowIso(),
  };
  if (!STATE.comments[leadId]) STATE.comments[leadId] = [];
  STATE.comments[leadId].unshift(c);
  await DB.saveComment(c);
  if (!opts.silent) createAuditEntry(leadId, 'comment_added', {});
  return true;
}

/* ============================================================================
   22 · USERS + RBAC + PERMISSIONS
   ============================================================================ */

let _pendingAvatarUrl = null;

function openUserForm(userId = '') {
  if (!can('manage_users')) { showToast('Only admins can manage users', 'warning'); return; }
  const user = userId ? STATE.users.find((u) => u.id === userId && u.tenantId === STATE.currentTenantId) : null;
  setText('modal-user-form-title', user ? `Edit — ${user.name}` : 'Add Team Member');
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v ?? ''; };
  set('uf-id', user?.id || '');
  set('uf-name', user?.name || '');
  set('uf-email', user?.email || '');
  set('uf-role', user?.role || 'sales_rep');
  set('uf-status', user?.status || 'active');
  set('uf-shift', user?.shift || 'morning');
  set('uf-weight', user?.rotationWeight ?? 20);
  set('uf-password', '');
  const delBtn = document.getElementById('uf-delete-btn');
  if (delBtn) delBtn.style.display = user ? '' : 'none';
  const errEl = document.getElementById('uf-errors');
  if (errEl) { errEl.classList.add('is-hidden'); errEl.textContent = ''; }
  _pendingAvatarUrl = user?.avatarUrl || null;
  setUserAvatarPreview(user?.avatarUrl || null);
  renderUserPermissionsEditor(user);
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
function clearUserAvatar() { _pendingAvatarUrl = null; setUserAvatarPreview(null); }
function toggleUserPasswordVisibility() {
  const p = document.getElementById('uf-password');
  if (!p) return;
  p.type = p.type === 'password' ? 'text' : 'password';
}

function renderUserPermissionsEditor(user) {
  const container = document.getElementById('uf-permissions');
  if (!container) return;
  const role = document.getElementById('uf-role')?.value || 'sales_rep';
  const roleDefaults = {};
  for (const p of PERMISSIONS) roleDefaults[p.key] = p.roles.includes(role);
  const current = user?.permissionOverrides || {};
  const effective = { ...roleDefaults, ...current };
  container.innerHTML = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
    ${PERMISSIONS.map((p) => `<label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; padding: 6px; border-radius: 6px; background: var(--bg-surface-2);">
      <input type="checkbox" data-permission="${escAttr(p.key)}" ${effective[p.key] ? 'checked' : ''} style="width: 14px; height: 14px;" />
      <span style="flex: 1; min-width: 0;">${esc(p.label)}</span>
    </label>`).join('')}
  </div>
  <p style="font-size: 10px; color: var(--txt-muted); margin-top: 10px;">Only permissions that differ from the role default will be saved as overrides.</p>`;
}
function resetUserPermissions() {
  const role = document.getElementById('uf-role')?.value || 'sales_rep';
  for (const p of PERMISSIONS) {
    const el = document.querySelector(`[data-permission="${p.key}"]`);
    if (el) el.checked = p.roles.includes(role);
  }
  showToast('Permissions reset to role defaults', 'info');
}

async function saveUserFromForm() {
  if (!can('manage_users')) { showToast('No permission', 'warning'); return; }
  const id = document.getElementById('uf-id')?.value || '';
  const name = (document.getElementById('uf-name')?.value || '').trim();
  const email = (document.getElementById('uf-email')?.value || '').trim();
  const role = document.getElementById('uf-role')?.value || 'sales_rep';
  const status = document.getElementById('uf-status')?.value || 'active';
  const shift = document.getElementById('uf-shift')?.value || 'morning';
  const weight = Sanitize.number(document.getElementById('uf-weight')?.value, 20);
  const password = document.getElementById('uf-password')?.value || '';
  const errors = [];
  if (!name) errors.push('Name required');
  if (!email) errors.push('Email required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email invalid');
  if (!ROLES.includes(role)) errors.push('Role invalid');
  if (!USER_STATUSES.includes(status)) errors.push('Status invalid');
  if (!id && password.length < 8) errors.push('Password must be at least 8 characters');
  const dup = STATE.users.find((u) => u.tenantId === STATE.currentTenantId && u.email.toLowerCase() === email.toLowerCase() && u.id !== id);
  if (dup) errors.push('Email already exists in this workspace');
  const errEl = document.getElementById('uf-errors');
  if (errors.length) {
    if (errEl) { errEl.classList.remove('is-hidden'); errEl.textContent = errors.join(' • '); }
    return;
  }
  if (errEl) { errEl.classList.add('is-hidden'); errEl.textContent = ''; }
  const roleDefaults = {};
  for (const p of PERMISSIONS) roleDefaults[p.key] = p.roles.includes(role);
  const overrides = {};
  document.querySelectorAll('#uf-permissions [data-permission]').forEach((chk) => {
    const key = chk.dataset.permission;
    if (Boolean(chk.checked) !== Boolean(roleDefaults[key])) overrides[key] = chk.checked;
  });
  const existing = id ? STATE.users.find((u) => u.id === id) : null;
  const user = existing ? { ...existing } : { id: uid('usr'), tenantId: STATE.currentTenantId, createdAt: nowIso() };
  user.name = name; user.email = email; user.role = role; user.status = status;
  user.shift = shift; user.rotationWeight = weight;
  user.avatarUrl = _pendingAvatarUrl || '';
  user.permissionOverrides = overrides;
  user.updatedAt = nowIso();
  if (!existing) user.password = password;
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
  if (STATE.activeView === 'permissions') Modules.Permissions.render();
}

async function deleteUserFromForm() {
  const id = document.getElementById('uf-id')?.value || '';
  const user = STATE.users.find((u) => u.id === id);
  if (!user) return;
  const tenantUsersList = tenantUsers();
  if (tenantUsersList.length <= 1) { showToast('Cannot delete the last user', 'warning'); return; }
  if (user.id === STATE.currentUserId) { showToast('Cannot delete your own account', 'warning'); return; }
  const ok = await Confirm.ask({ icon: '🗑', title: 'Delete User', message: `Remove "${user.name}"?`, okText: 'Delete', danger: true });
  if (!ok) return;
  STATE.users = STATE.users.filter((u) => u.id !== id);
  createAuditEntry(id, 'user_deleted', { name: user.name });
  await DB.deleteUser(id);
  Modal.close('modal-user-form');
  refreshUserChrome();
  if (STATE.activeView === 'users') Modules.Users.render();
  showToast(`Deleted "${user.name}"`, 'warning');
}

/* ============================================================================
   23 · LEAD ROTATION ENGINE
   ============================================================================ */

const RotationEngine = {
  cursor: {},
  eligibleUsers() {
    const users = tenantUsers();
    return users.filter((u) => {
      if (u.role === 'admin') return false;
      if (STATE.settings?.rotation?.requireActiveShift !== false) {
        if (u.status !== 'active') return false;
      }
      return true;
    });
  },
  uncontactedCount(userId) {
    return tenantLeads().filter((l) => l.assignedToId === userId && (l.attempts || 0) === 0 && l.status === 'active').length;
  },
  pickNextAssignee() {
    if (!STATE.settings?.rotation?.enabled) return null;
    const cap = STATE.settings.rotation.uncontactedCap ?? 10;
    const eligible = this.eligibleUsers().filter((u) => this.uncontactedCount(u.id) < cap);
    if (eligible.length === 0) return null;
    const mode = STATE.settings.rotation.mode || 'round_robin';
    if (mode === 'round_robin') {
      const key = STATE.currentTenantId;
      const cur = this.cursor[key] || 0;
      const pick = eligible[cur % eligible.length];
      this.cursor[key] = (cur + 1) % eligible.length;
      return pick;
    }
    const totalWeight = eligible.reduce((s, u) => s + Math.max(1, Number(u.rotationWeight) || 1), 0);
    let r = Math.random() * totalWeight;
    for (const u of eligible) {
      r -= Math.max(1, Number(u.rotationWeight) || 1);
      if (r <= 0) return u;
    }
    return eligible[0];
  },
  async reassignStaleLead(lead, reason) {
    const prevAgent = lead.assignedToId;
    if (prevAgent) {
      const u = STATE.users.find((x) => x.id === prevAgent);
      if (u) {
        const penalty = STATE.settings?.rotation?.slaScorePenalty ?? 5;
        u.performanceScore = Math.max(0, (u.performanceScore ?? 100) - penalty);
        await DB.saveUser(u);
      }
    }
    lead.status = 'claim_pool';
    lead.assignedToId = null;
    lead.assignedAt = null;
    lead.agent = '';
    lead.updatedAt = nowIso();
    await DB.saveLead(lead);
    createAuditEntry(lead.id, 'rotation_revoked', { reason: reason || 'SLA breach' });
    const admins = tenantUsers().filter((u) => u.role === 'admin' || u.role === 'team_leader');
    for (const a of admins) {
      pushNotification({
        tenantId: STATE.currentTenantId, userId: a.id, type: 'sla',
        title: `SLA breach: ${lead.name}`, body: 'Lead revoked and added to the claim pool.',
        deepLink: { type: 'lead', leadId: lead.id },
      });
    }
    const reps = tenantUsers().filter((u) => u.role === 'sales_rep');
    for (const r of reps) {
      pushNotification({
        tenantId: STATE.currentTenantId, userId: r.id, type: 'assignment',
        title: `Claim available: ${lead.name}`, body: 'First to claim gets the lead.',
        deepLink: { type: 'view', view: 'lead-rotation' },
      });
    }
    const log = { id: uid('rot'), tenantId: STATE.currentTenantId, leadId: lead.id, action: 'revoked', fromUserId: prevAgent, toUserId: null, createdAt: nowIso() };
    STATE.rotationLog.unshift(log);
    DB.saveRotationLog(log);
    return true;
  },
};

/* ============================================================================
   24 · SLA ENGINE
   ============================================================================ */

const SLAEngine = {
  softAlerted: new Set(),
  tick() {
    if (STATE.session?.mode !== 'tenant') return;
    const now = Date.now();
    let changed = false;
    for (const lead of tenantLeads()) {
      if (lead.status !== 'active') continue;
      if (!lead.slaDueAt) continue;
      const due = new Date(lead.slaDueAt).getTime();
      if (!Number.isFinite(due)) continue;
      const total = slaWindowMs(lead);
      const remaining = due - now;
      if (remaining > 0 && remaining <= total * (1 - SLA_SOFT_ALERT_RATIO)) {
        if (!this.softAlerted.has(lead.id) && lead.assignedToId) {
          this.softAlerted.add(lead.id);
          pushNotification({
            tenantId: STATE.currentTenantId, userId: lead.assignedToId, type: 'sla',
            title: `SLA warning: ${lead.name}`,
            body: `Only ${Math.round(remaining / 60000)} minutes left before breach.`,
            deepLink: { type: 'lead', leadId: lead.id },
          });
        }
      }
      if (remaining <= 0) {
        changed = true;
        safe(() => RotationEngine.reassignStaleLead(lead, 'SLA breach'), 'sla-revoke');
      }
    }
    if (changed) {
      updateHeaderKPIs();
      if (STATE.activeView === 'action-center') Modules.ActionCenter.refresh();
      if (STATE.activeView === 'lead-rotation') Modules.Rotation.refresh();
    }
  },
  start() {
    if (STATE.slaTimer) clearInterval(STATE.slaTimer);
    STATE.slaTimer = setInterval(() => safe(() => this.tick(), 'sla-tick'), SLA_TICK_MS);
  },
  stop() {
    if (STATE.slaTimer) { clearInterval(STATE.slaTimer); STATE.slaTimer = null; }
  },
};

/* ============================================================================
   26 · SUPER-ADMIN MODULES
   ============================================================================ */

const SuperModules = {};

SuperModules.Overview = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    const tenants = STATE.tenants;
    const active = tenants.filter((t) => t.status === 'active');
    const mrr = active.reduce((s, t) => s + (Number(t.monthlyPrice) || 0), 0);
    const arr = mrr * 12;
    const seats = tenants.reduce((s, t) => s + (Number(t.seats) || 0), 0);
    const tierCounts = { starter: 0, pro: 0, enterprise: 0 };
    tenants.forEach((t) => { tierCounts[t.tier] = (tierCounts[t.tier] || 0) + 1; });

    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        ${statCard('MRR', formatMoney(mrr), 'fa-dollar-sign', 'var(--ok)')}
        ${statCard('ARR', formatMoney(arr), 'fa-chart-line', 'var(--accent)')}
        ${statCard('Active Tenants', String(active.length), 'fa-building', 'var(--violet)')}
        ${statCard('Total Seats', String(seats), 'fa-user-group', 'var(--warn)')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 16px;">Tenants by Tier</h3><canvas id="chart-tiers" height="240" style="width: 100%; display: block;"></canvas></div>
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 16px;">MRR by Tier</h3><canvas id="chart-mrr-tier" height="240" style="width: 100%; display: block;"></canvas></div>
      </div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Recent Activity</h3>
        <div style="font-size: 12px; color: var(--txt-secondary);">
          ${tenants.slice(0, 5).map((t) => `<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-line);">
            <div style="min-width: 0;"><div style="font-weight: 600;" class="truncate">${esc(t.name)}</div><div style="font-size: 11px; color: var(--txt-muted);">${esc(TIERS[t.tier]?.label || t.tier)} · ${esc(t.status)}</div></div>
            <div style="font-family: 'JetBrains Mono', monospace; font-weight: 700;">${formatMoney(t.monthlyPrice || 0)}/mo</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;

    requestAnimationFrame(() => {
      drawBarChart(document.getElementById('chart-tiers'), [
        { label: 'Starter', value: tierCounts.starter, color: '#5a6178' },
        { label: 'Pro', value: tierCounts.pro, color: '#6d8cff' },
        { label: 'Enterprise', value: tierCounts.enterprise, color: '#8f6dff' },
      ]);
      const mrrByTier = { starter: 0, pro: 0, enterprise: 0 };
      active.forEach((t) => { mrrByTier[t.tier] = (mrrByTier[t.tier] || 0) + (Number(t.monthlyPrice) || 0); });
      drawBarChart(document.getElementById('chart-mrr-tier'), [
        { label: 'Starter', value: mrrByTier.starter, color: '#5a6178' },
        { label: 'Pro', value: mrrByTier.pro, color: '#6d8cff' },
        { label: 'Enterprise', value: mrrByTier.enterprise, color: '#8f6dff' },
      ], { money: true });
    });
  }
  function statCard(label, value, icon, color) {
    return `<div class="surface-card" style="padding: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted);">${esc(label)}</span>
        <i class="fa-solid ${icon}" style="font-size: 12px; color: ${color};" aria-hidden="true"></i>
      </div>
      <div style="font-size: 22px; font-weight: 700; color: ${color}; font-variant-numeric: tabular-nums;">${esc(value)}</div>
    </div>`;
  }
  return { render };
})();

SuperModules.Tenants = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    const tenants = STATE.tenants;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div><h2 style="font-size: 16px; font-weight: 700;">Tenants</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">${tenants.length} workspaces</p></div>
        <button type="button" class="btn btn-primary" data-action="open-tenant-form"><i class="fa-solid fa-plus" style="font-size: 11px;" aria-hidden="true"></i> New Tenant</button>
      </div>
      <div class="surface-card" style="overflow: hidden;">
        <table class="data-table">
          <thead><tr><th>Company</th><th>Slug</th><th>Tier</th><th>Status</th><th>Seats</th><th>MRR</th><th style="text-align: end;">Actions</th></tr></thead>
          <tbody>
            ${tenants.map((t) => `<tr>
              <td><div style="font-weight: 600;">${esc(t.name)}</div><div style="font-size: 11px; color: var(--txt-muted);">${esc(t.adminEmail || '—')}</div></td>
              <td><code style="font-family: 'JetBrains Mono', monospace; font-size: 12px;">${esc(t.slug)}</code></td>
              <td><span style="font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; background: var(--accent-soft); color: var(--accent);">${esc(TIERS[t.tier]?.label || t.tier)}</span></td>
              <td><span style="font-size: 11px; font-weight: 600; color: ${t.status === 'active' ? 'var(--ok)' : t.status === 'past_due' ? 'var(--danger)' : 'var(--warn)'};">${esc(t.status)}</span></td>
              <td>${esc(t.seats || 0)}</td>
              <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700;">${formatMoney(t.monthlyPrice || 0)}</td>
              <td style="text-align: end;">
                <button type="button" class="icon-btn icon-btn-sm" data-action="impersonate-tenant" data-tenant-id="${escAttr(t.id)}" title="Impersonate"><i class="fa-solid fa-user-secret" style="font-size: 11px;" aria-hidden="true"></i></button>
                <button type="button" class="icon-btn icon-btn-sm" data-action="open-tenant-form" data-tenant-id="${escAttr(t.id)}" title="Edit"><i class="fa-solid fa-pen" style="font-size: 11px;" aria-hidden="true"></i></button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${tenants.length === 0 ? `<div style="padding: 48px; text-align: center; color: var(--txt-muted); font-size: 12px;">No tenants yet.</div>` : ''}
      </div>
    </div>`;
  }
  return { render };
})();

SuperModules.Subscriptions = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    const tenants = STATE.tenants;
    const active = tenants.filter((t) => t.status === 'active');
    const trial = tenants.filter((t) => t.status === 'trial');
    const pastDue = tenants.filter((t) => t.status === 'past_due');
    const suspended = tenants.filter((t) => t.status === 'suspended');
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Subscriptions</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Billing & plan assignments</p></div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${card('Active', active.length, 'var(--ok)')}
        ${card('Trial', trial.length, 'var(--info)')}
        ${card('Past Due', pastDue.length, 'var(--danger)')}
        ${card('Suspended', suspended.length, 'var(--txt-muted)')}
      </div>
      ${pastDue.length > 0 ? `<div class="surface-card" style="padding: 20px; border-inline-start: 3px solid var(--danger);">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px; color: var(--danger);">Past Due Accounts</h3>
        ${pastDue.map((t) => `<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-line);">
          <div><div style="font-weight: 600; font-size: 13px;">${esc(t.name)}</div><div style="font-size: 11px; color: var(--txt-muted);">${esc(t.adminEmail || '—')}</div></div>
          <div style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--danger);">${formatMoney(t.monthlyPrice || 0)}</div>
        </div>`).join('')}
      </div>` : ''}
    </div>`;
  }
  function card(label, value, color) {
    return `<div class="surface-card" style="padding: 16px;"><div style="font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted); margin-bottom: 8px;">${esc(label)}</div><div style="font-size: 24px; font-weight: 700; color: ${color}; font-variant-numeric: tabular-nums;">${value}</div></div>`;
  }
  return { render };
})();

SuperModules.MRR = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    const active = STATE.tenants.filter((t) => t.status === 'active');
    const mrr = active.reduce((s, t) => s + (Number(t.monthlyPrice) || 0), 0);
    const arr = mrr * 12;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">MRR / ARR</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Recurring revenue analytics</p></div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="surface-card" style="padding: 20px;"><div style="font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted); margin-bottom: 8px;">Monthly Recurring Revenue</div><div style="font-size: 32px; font-weight: 800; color: var(--ok); font-variant-numeric: tabular-nums;">${formatMoney(mrr)}</div></div>
        <div class="surface-card" style="padding: 20px;"><div style="font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted); margin-bottom: 8px;">Annual Recurring Revenue</div><div style="font-size: 32px; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums;">${formatMoney(arr)}</div></div>
        <div class="surface-card" style="padding: 20px;"><div style="font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted); margin-bottom: 8px;">Avg. per Tenant</div><div style="font-size: 32px; font-weight: 800; color: var(--violet); font-variant-numeric: tabular-nums;">${formatMoney(active.length ? mrr / active.length : 0)}</div></div>
      </div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Monthly by Tenant</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${active.sort((a, b) => (b.monthlyPrice || 0) - (a.monthlyPrice || 0)).map((t) => `<div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 160px; font-size: 12px; color: var(--txt-secondary);" class="truncate">${esc(t.name)}</div>
            <div style="flex: 1;"><div class="progress-track"><div class="progress-fill" style="width: ${((t.monthlyPrice || 0) / Math.max(mrr, 1)) * 100}%; background: var(--accent);"></div></div></div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; width: 80px; text-align: end;">${formatMoney(t.monthlyPrice || 0)}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }
  return { render };
})();

SuperModules.Usage = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Usage & Seats</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Feature adoption metrics</p></div>
      <div class="surface-card" style="overflow: hidden;">
        <table class="data-table">
          <thead><tr><th>Tenant</th><th>Seats Used</th><th>Leads</th><th>Users</th><th>Adoption</th></tr></thead>
          <tbody>
            ${STATE.tenants.map((t) => {
              const users = STATE.users.filter((u) => u.tenantId === t.id).length;
              const leads = STATE.leads.filter((l) => l.tenantId === t.id).length;
              const seats = t.seats || 0;
              const pct = seats ? Math.min(100, Math.round((users / seats) * 100)) : 0;
              return `<tr>
                <td style="font-weight: 600;">${esc(t.name)}</td>
                <td>${users} / ${seats}</td>
                <td>${leads}</td>
                <td>${users}</td>
                <td><div style="display: flex; align-items: center; gap: 8px;"><div class="progress-track" style="flex: 1;"><div class="progress-fill" style="width: ${pct}%; background: ${pct > 80 ? 'var(--danger)' : 'var(--ok)'};"></div></div><span style="font-size: 11px; font-family: 'JetBrains Mono', monospace; width: 40px;">${pct}%</span></div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }
  return { render };
})();

SuperModules.FeatureFlags = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Feature Flags</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Default entitlements by tier</p></div>
      <div class="surface-card" style="overflow: hidden;">
        <table class="data-table">
          <thead><tr><th>Feature</th><th>Starter</th><th>Pro</th><th>Enterprise</th></tr></thead>
          <tbody>
            ${Object.entries(FEATURE_LABELS).map(([key, label]) => `<tr>
              <td style="font-weight: 600;">${esc(label)}</td>
              ${['starter', 'pro', 'enterprise'].map((tier) => `<td><span style="font-size: 11px; font-weight: 700; color: ${TIERS[tier].features[key] ? 'var(--ok)' : 'var(--txt-muted)'};">${TIERS[tier].features[key] ? '✓' : '—'}</span></td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }
  return { render };
})();

SuperModules.Tiers = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Tier Plans</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Pricing & entitlements</p></div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${Object.entries(TIERS).map(([key, tier]) => `<div class="surface-card" style="padding: 24px;">
          <div style="font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--accent);">${esc(tier.label)}</div>
          <div style="font-size: 36px; font-weight: 800; margin-top: 8px; font-variant-numeric: tabular-nums;">$${tier.price}<span style="font-size: 14px; font-weight: 500; color: var(--txt-muted);">/mo</span></div>
          <ul style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--txt-secondary);">
            ${Object.entries(tier.features).map(([k, v]) => `<li><i class="fa-solid ${v ? 'fa-check' : 'fa-xmark'}" style="color: ${v ? 'var(--ok)' : 'var(--txt-muted)'}; font-size: 10px; width: 14px;" aria-hidden="true"></i> ${esc(FEATURE_LABELS[k] || k)}</li>`).join('')}
          </ul>
        </div>`).join('')}
      </div>
    </div>`;
  }
  return { render };
})();

SuperModules.System = (() => {
  function render() {
    const content = document.getElementById('super-admin-content-view');
    if (!content) return;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">System Health</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Storage, sync & diagnostics</p></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="surface-card" style="padding: 20px;">
          <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Storage Engine</h3>
          <div style="font-size: 12px; color: var(--txt-secondary); display: flex; flex-direction: column; gap: 6px;">
            <div>Engine: <strong>${STATE.useIDB ? 'IndexedDB' : 'LocalStorage'}</strong></div>
            <div>Status: <strong style="color: var(--ok);">Connected</strong></div>
          </div>
        </div>
        <div class="surface-card" style="padding: 20px;">
          <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Data Counts</h3>
          <div style="font-size: 12px; color: var(--txt-secondary); display: flex; flex-direction: column; gap: 6px;">
            <div>Tenants: <strong>${STATE.tenants.length}</strong></div>
            <div>Users: <strong>${STATE.users.length}</strong></div>
            <div>Leads: <strong>${STATE.leads.length}</strong></div>
            <div>Notifications: <strong>${STATE.notifications.length}</strong></div>
          </div>
        </div>
      </div>
    </div>`;
  }
  return { render };
})();

/* ============================================================================
   27 · TENANT MODULES
   ============================================================================ */

const Modules = {};

/* --- 27.1 Action Center --- */
Modules.ActionCenter = (() => {
  const BANDS = [
    { id: 'breached', label: 'Breached', icon: 'fa-fire', tone: 'danger' },
    { id: 'critical', label: 'Critical', icon: 'fa-triangle-exclamation', tone: 'critical' },
    { id: 'warning', label: 'Warning', icon: 'fa-hourglass-half', tone: 'warn' },
    { id: 'ontrack', label: 'On Track', icon: 'fa-circle-check', tone: 'ok' },
    { id: 'all', label: 'All', icon: 'fa-layer-group', tone: 'muted' },
  ];
  let filter = { band: 'all', search: '' };
  let tickTimer = null;
  let lastKey = '';

  function snapshot() {
    return tenantLeads()
      .filter((l) => l.stage !== 'Won' && l.stage !== 'Lost' && l.status === 'active')
      .map((l) => ({ lead: l, band: slaBandOf(l), cd: countdownOf(l), score: calcLeadScore(l) }))
      .filter((r) => r.band !== 'none');
  }
  function applyFilter(rows) {
    const q = (filter.search || '').toLowerCase();
    return rows.filter((r) => {
      if (filter.band !== 'all') {
        if (filter.band === 'breached' && r.band !== 'breached') return false;
        if (filter.band === 'critical' && r.band !== 'critical' && r.band !== 'breached') return false;
        if (filter.band === 'warning' && r.band !== 'warning') return false;
        if (filter.band === 'ontrack' && r.band !== 'ontrack') return false;
      }
      if (q) {
        const l = r.lead;
        const hay = `${l.name || ''} ${l.phone || ''} ${l.email || ''} ${l.project || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!can('view_all_leads')) {
        if (r.lead.assignedToId && r.lead.assignedToId !== STATE.currentUserId) return false;
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
      breached: { c: '#ff5d5d', bg: 'rgba(255,93,93,0.05)', b: 'rgba(255,93,93,0.28)', label: 'BREACHED' },
      critical: { c: '#ff7a45', bg: 'rgba(255,122,69,0.05)', b: 'rgba(255,122,69,0.28)', label: 'CRITICAL' },
      warning: { c: '#ffb648', bg: 'rgba(255,182,72,0.05)', b: 'rgba(255,182,72,0.28)', label: 'WARNING' },
      ontrack: { c: '#4ade80', bg: 'rgba(74,222,128,0.04)', b: 'rgba(74,222,128,0.22)', label: 'ON TRACK' },
    }[band] || { c: '#8a91a6', bg: 'transparent', b: 'rgba(255,255,255,0.06)', label: '—' };
  }

  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const rows = snapshot();
    const stats = statsOf(rows);
    lastKey = rows.map((r) => `${r.lead.id}:${r.band}`).join('|');
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: var(--ok);" aria-hidden="true"></span>
          <div><h2 style="font-size: 16px; font-weight: 700;">SLA Command Center</h2><p style="font-size: 12px; color: var(--txt-muted);">Live monitoring of critical deadlines</p></div>
        </div>
        <button type="button" class="btn btn-secondary" data-action="rotation-refresh"><i class="fa-solid fa-rotate-right" style="font-size: 11px;" aria-hidden="true"></i> Refresh</button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        ${['breached', 'critical', 'warning', 'ontrack'].map((id) => {
          const b = BANDS.find((x) => x.id === id);
          const p = bandPalette(id);
          return `<button type="button" data-action="sla-filter" data-band="${id}" class="surface-card" style="padding: 16px; text-align: start; border-inline-start: 3px solid ${p.c}; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted); margin-bottom: 8px;"><i class="fa-solid ${b.icon}" style="color: ${p.c}; font-size: 10px;" aria-hidden="true"></i><span>${esc(b.label)}</span></div>
            <div style="font-size: 26px; font-weight: 700; color: ${p.c}; font-variant-numeric: tabular-nums;">${stats[id] || 0}</div>
          </button>`;
        }).join('')}
        <div class="surface-card" style="padding: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted); margin-bottom: 8px;"><i class="fa-solid fa-layer-group" style="font-size: 10px;" aria-hidden="true"></i><span>Total</span></div>
          <div style="font-size: 26px; font-weight: 700;">${stats.all}</div>
        </div>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        ${BANDS.map((b) => `<button type="button" class="chip ${filter.band === b.id ? 'is-active' : ''}" data-action="sla-filter" data-band="${b.id}"><i class="fa-solid ${b.icon}" style="font-size: 10px;" aria-hidden="true"></i> ${esc(b.label)} <span style="opacity: .7; margin-inline-start: 4px;">${b.id === 'all' ? stats.all : (stats[b.id] || 0)}</span></button>`).join('')}
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${rows.length === 0 ? emptyState() : sortRows(applyFilter(rows)).map(card).join('')}
      </div>
    </div>`;
    startTick();
  }
  function emptyState() {
    return `<div class="surface-card" style="padding: 48px; text-align: center;">
      <div style="font-size: 40px; opacity: .6; margin-bottom: 12px;">✅</div>
      <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">All clear</h3>
      <p style="font-size: 12px; color: var(--txt-secondary);">No leads match this filter.</p>
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
    const slaMs = slaWindowMs(lead);
    const progress = cd ? Math.min(100, Math.max(0, (1 - Math.max(cd.diffMs, -slaMs) / slaMs) * 100)) : 0;
    const scoreTone = score >= 75 ? '#ff7a45' : score >= 40 ? '#ffb648' : '#8a91a6';
    return `<article class="surface-card" style="padding: 16px; display: flex; flex-direction: column; gap: 16px; border-inline-start: 3px solid ${p.c};">
      <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
        <div class="avatar avatar-md" style="background: linear-gradient(135deg, ${p.c}, ${p.c}cc);">${esc(initials)}</div>
        <div style="min-width: 0; flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 13px; font-weight: 600;" class="truncate">${esc(lead.name)}</span>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: ${prColor}; background: ${prColor}18;">${esc((prLabel || 'Medium').toUpperCase())}</span>
            <span style="font-size: 10px; font-weight: 700; font-family: 'JetBrains Mono', monospace; padding: 2px 6px; border-radius: 4px; color: ${scoreTone}; background: ${scoreTone}18;">${score}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--txt-secondary); margin-top: 4px; flex-wrap: wrap;">
            <span><i class="fa-solid fa-circle" style="color: ${stageColor}; font-size: 7px; margin-inline-end: 4px;" aria-hidden="true"></i>${STAGE_EMOJI[stage] || ''} ${esc(stage)}</span>
            ${lead.project ? `<span style="color: var(--txt-muted);">·</span><span>${esc(lead.project)}</span>` : ''}
            ${lead.agent ? `<span style="color: var(--txt-muted);">·</span><span>${esc(lead.agent)}</span>` : ''}
            ${lead.budget ? `<span style="color: var(--txt-muted);">·</span><span>${formatMoney(lead.budget)}</span>` : ''}
          </div>
        </div>
      </div>
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <span style="font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${p.c};">${esc(p.label)}</span>
          <span style="font-size: 10px; color: var(--txt-muted); font-family: 'JetBrains Mono', monospace;">SLA ${Math.round(slaMs / 3600000)}h</span>
        </div>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: ${p.c};" data-timer-for="${escAttr(lead.id)}">${fmtCd(cd)}</div>
        <div class="progress-track" style="margin-top: 8px;"><div class="progress-fill" style="width: ${progress}%; background: ${p.c};"></div></div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; justify-content: flex-end;">
        <button type="button" class="icon-btn icon-btn-sm" data-action="open-lead-form" data-lead-id="${escAttr(lead.id)}" title="Edit"><i class="fa-solid fa-pen" style="font-size: 11px;" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-primary btn-sm" data-action="open-action-center" data-lead-id="${escAttr(lead.id)}">Open</button>
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
      for (const r of rows) {
        const el = document.querySelector(`[data-timer-for="${CSS.escape(r.lead.id)}"]`);
        if (el) el.textContent = fmtCd(r.cd);
      }
    }, 1000);
  }
  function setFilter(patch) { filter = { ...filter, ...patch }; }
  function refresh() { render(); }
  function teardown() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
  return { render, refresh, setFilter, teardown };
})();

/* --- 27.2 Sales Pipeline --- */
Modules.Pipeline = (() => {
  let search = '';
  function setFilter(p) { search = p.search ?? search; }
  function refresh() { render(); }
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const q = search.toLowerCase();
    const leads = tenantLeads().filter((l) => {
      if (!q) return true;
      return `${l.name || ''} ${l.phone || ''} ${l.project || ''}`.toLowerCase().includes(q);
    });
    const columns = STAGES.map((stage) => {
      const list = leads.filter((l) => l.stage === stage);
      const color = STAGE_COLOR[stage];
      return `<div style="flex-shrink: 0; width: 260px; display: flex; flex-direction: column; gap: 8px;">
        <div class="surface-card" style="padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color};" aria-hidden="true"></span>
            <span style="font-size: 12px; font-weight: 600;" class="truncate">${STAGE_EMOJI[stage]} ${esc(stage)}</span>
          </div>
          <span style="font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--txt-muted);">${list.length}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${list.length === 0 ? `<div style="text-align: center; font-size: 11px; color: var(--txt-dim); padding: 16px 0;">—</div>` : list.map(kcard).join('')}
        </div>
      </div>`;
    }).join('');
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div><h2 style="font-size: 16px; font-weight: 700;">Pipeline View</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Click a card to open the drawer</p></div>
        <button type="button" class="btn btn-primary" data-action="open-lead-form"><i class="fa-solid fa-plus" style="font-size: 11px;" aria-hidden="true"></i> New Lead</button>
      </div>
      <div style="overflow-x: auto; padding-bottom: 12px;"><div style="display: flex; gap: 12px; min-width: max-content;">${columns}</div></div>
    </div>`;
  }
  function kcard(lead) {
    const band = slaBandOf(lead);
    const cd = countdownOf(lead);
    const color = { breached: '#ff5d5d', critical: '#ff7a45', warning: '#ffb648', ontrack: '#4ade80' }[band] || '#8a91a6';
    return `<button type="button" class="surface-card" style="padding: 12px; text-align: start; cursor: pointer;" data-action="open-action-center" data-lead-id="${escAttr(lead.id)}">
      <div style="display: flex; align-items: start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
        <span style="font-size: 12px; font-weight: 600;" class="truncate">${esc(lead.name)}</span>
        ${cd ? `<span style="font-size: 10px; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: ${color}; flex-shrink: 0;">${cd.overdue ? '▲' : ''}${pad2(cd.hours)}:${pad2(cd.mins)}</span>` : ''}
      </div>
      <div style="display: flex; gap: 8px; font-size: 10px; color: var(--txt-muted); flex-wrap: wrap;">
        ${lead.project ? `<span>🏗 ${esc(lead.project)}</span>` : ''}
        ${lead.budget ? `<span>💰 ${formatMoney(lead.budget)}</span>` : ''}
        ${lead.agent ? `<span>👤 ${esc(lead.agent)}</span>` : ''}
      </div>
    </button>`;
  }
  return { render, setFilter, refresh };
})();

/* --- 27.3 Lead Rotation --- */
Modules.Rotation = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const pool = tenantLeads().filter((l) => l.status === 'claim_pool');
    const logs = STATE.rotationLog.slice(0, 20);
    const eligible = RotationEngine.eligibleUsers();
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Lead Rotation</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Round-robin, weights, and the claim pool</p></div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 11px; color: var(--txt-muted); font-weight: 700; letter-spacing: .1em; text-transform: uppercase;">Mode:</span>
        <button type="button" class="chip ${STATE.settings.rotation.mode === 'round_robin' ? 'is-active' : ''}" data-action="rotation-mode-change" data-mode="round_robin">Round-Robin</button>
        <button type="button" class="chip ${STATE.settings.rotation.mode === 'weighted' ? 'is-active' : ''}" data-action="rotation-mode-change" data-mode="weighted">Weighted</button>
      </div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Eligible Reps (${eligible.length})</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${eligible.map((u) => {
            const uncontacted = RotationEngine.uncontactedCount(u.id);
            const cap = STATE.settings.rotation.uncontactedCap ?? 10;
            return `<div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--bg-surface-2); border-radius: 8px;">
              <span class="avatar avatar-sm">${esc(initialsOf(u.name))}</span>
              <div style="flex: 1; min-width: 0;"><div style="font-size: 12px; font-weight: 600;">${esc(u.name)}</div><div style="font-size: 11px; color: var(--txt-muted);">${esc(ROLE_LABEL[u.role])} · Weight ${u.rotationWeight || 20}</div></div>
              <div style="text-align: end; font-size: 11px;"><div style="color: ${uncontacted >= cap ? 'var(--danger)' : 'var(--txt-secondary)'}; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${uncontacted} / ${cap}</div><div style="color: var(--txt-muted); font-size: 10px;">uncontacted</div></div>
            </div>`;
          }).join('') || `<p style="font-size: 12px; color: var(--txt-muted);">No eligible reps.</p>`}
        </div>
      </div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Claim Pool (${pool.length})</h3>
        ${pool.length === 0 ? `<p style="font-size: 12px; color: var(--txt-muted);">No leads awaiting claim.</p>` : `<div style="display: flex; flex-direction: column; gap: 8px;">
          ${pool.map((l) => `<div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--bg-surface-2); border-radius: 8px;">
            <span class="avatar avatar-sm" style="background: linear-gradient(135deg, var(--danger), var(--warn));">${esc(initialsOf(l.name))}</span>
            <div style="flex: 1; min-width: 0;"><div style="font-size: 12px; font-weight: 600;">${esc(l.name)}</div><div style="font-size: 11px; color: var(--txt-muted);">${esc(l.project || '—')} · ${esc(l.channel || '—')}</div></div>
            <button type="button" class="btn btn-sm btn-primary" data-action="rotation-claim" data-lead-id="${escAttr(l.id)}"><i class="fa-solid fa-hand" style="font-size: 10px;" aria-hidden="true"></i> Claim</button>
          </div>`).join('')}
        </div>`}
      </div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Rotation Log</h3>
        ${logs.length === 0 ? `<p style="font-size: 12px; color: var(--txt-muted);">No rotation events yet.</p>` : `<div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
          ${logs.map((log) => `<div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-line);">
            <div><span style="font-weight: 600;">${esc(log.action)}</span><span style="color: var(--txt-muted);"> · lead ${esc(log.leadId.slice(-6))}</span></div>
            <span style="color: var(--txt-muted); font-size: 11px;">${formatRelative(log.createdAt)}</span>
          </div>`).join('')}
        </div>`}
      </div>
    </div>`;
  }
  function refresh() { render(); }
  return { render, refresh };
})();

async function changeRotationMode(mode) {
  if (!STATE.settings.rotation) STATE.settings.rotation = {};
  STATE.settings.rotation.mode = mode;
  await DB.saveSettings();
  Modules.Rotation.render();
  showToast(`Rotation mode: ${mode === 'round_robin' ? 'Round-Robin' : 'Weighted'}`, 'success');
}

/* --- 27.4 Property Inventory --- */
Modules.Inventory = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const rows = STATE.inventory.filter((r) => r.tenantId === STATE.currentTenantId);
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div><h2 style="font-size: 16px; font-weight: 700;">Property Inventory</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">${rows.length} unit${rows.length === 1 ? '' : 's'}</p></div>
      </div>
      ${rows.length === 0 ? `<div class="surface-card" style="padding: 64px 20px; text-align: center;">
        <div style="font-size: 48px; opacity: .5; margin-bottom: 12px;">🏗</div>
        <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 4px;">No units yet</h3>
        <p style="font-size: 13px; color: var(--txt-secondary);">Add property inventory to match against leads.</p>
      </div>` : `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${rows.map((r) => `<div class="surface-card" style="padding: 16px;"><div style="font-size: 13px; font-weight: 600;">${esc(r.name || 'Unit')}</div><div style="font-size: 11px; color: var(--txt-muted); margin-top: 4px;">${esc(r.project || '—')} · ${esc(r.status || '—')}</div></div>`).join('')}
      </div>`}
    </div>`;
  }
  return { render };
})();

/* --- 27.5 CIL Radar --- */
Modules.CILRadar = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const scored = tenantLeads()
      .filter((l) => l.stage !== 'Won' && l.stage !== 'Lost')
      .map((l) => ({ lead: l, score: calcLeadScore(l) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 16px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">CIL Radar</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Client Intent & Lead scoring — top 30</p></div>
      ${scored.length === 0 ? `<div class="surface-card" style="padding: 64px; text-align: center;">
        <div style="font-size: 48px; opacity: .5; margin-bottom: 12px;">📡</div>
        <h3 style="font-size: 15px; font-weight: 600;">Radar is clear</h3>
        <p style="font-size: 13px; color: var(--txt-secondary);">No active leads in scope yet.</p>
      </div>` : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${scored.map(({ lead, score }) => radarCard(lead, score)).join('')}
      </div>`}
    </div>`;
  }
  function radarCard(lead, score) {
    const tone = score >= 75 ? { c: '#ff7a45', l: 'HOT' } : score >= 40 ? { c: '#ffb648', l: 'WARM' } : { c: '#8a91a6', l: 'COLD' };
    return `<button type="button" class="surface-card" style="padding: 16px; text-align: start; cursor: pointer;" data-action="open-action-center" data-lead-id="${escAttr(lead.id)}">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 13px; font-weight: 600;" class="truncate">${esc(lead.name)}</span>
        <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; color: ${tone.c}; background: ${tone.c}18;">${tone.l}</span>
      </div>
      <div style="font-size: 11px; color: var(--txt-muted); margin-bottom: 8px;">${esc(lead.stage)}${lead.project ? ' · ' + esc(lead.project) : ''}</div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="progress-track" style="flex: 1;"><div class="progress-fill" style="width: ${score}%; background: ${tone.c};"></div></div>
        <span style="font-size: 12px; font-weight: 700; color: ${tone.c};">${score}</span>
      </div>
    </button>`;
  }
  return { render };
})();

/* --- Coming-soon shells --- */
function comingSoonShell(title, message, featureKey) {
  return `<div class="view-container"><div class="surface-card coming-soon-shell">
    <div style="font-size: 56px; opacity: .5; margin-bottom: 16px;">🚧</div>
    <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">${esc(title)}</h2>
    <p style="font-size: 13px; color: var(--txt-secondary); max-width: 480px; margin: 0 auto 16px;">${esc(message)}</p>
    ${featureKey ? `<p style="font-size: 11px; color: var(--txt-muted);">Feature flag: <code style="font-family: 'JetBrains Mono', monospace;">${esc(featureKey)}</code></p>` : ''}
    <div style="margin-top: 20px; display: flex; justify-content: center; gap: 8px;"><span class="chip" style="pointer-events: none;"><i class="fa-solid fa-clock" style="font-size: 10px;" aria-hidden="true"></i> Coming in next release</span></div>
  </div></div>`;
}

Modules.Omnichannel = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('Omnichannel Inbox', 'Unified WhatsApp, Email and SMS conversations in a single timeline.', 'omnichannel'); } }))();
Modules.Attribution = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('Marketing Attribution', 'Direct Meta / Google / TikTok API tracking with CAC and ROI.', 'attribution'); } }))();
Modules.Commission = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('Commission & Leaderboard', 'Multi-tiered commission calculator with a live sales leaderboard.', 'commission'); } }))();
Modules.CPQ = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('CPQ & Quotes', 'Dynamic installment plans and print-ready PDF proposals.', 'cpq'); } }))();
Modules.CallIntel = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('AI Call Intelligence', 'Speech-to-text, sentiment analysis and real-time battlecards.', 'ai_calls'); } }))();
Modules.Predictive = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('Predictive & Next Best Action', 'Win-probability scoring with automated next-step recommendations.', 'predictive'); } }))();
Modules.Cadences = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('Sales Cadences', 'Multi-touch drip sequences with auto-pause on client reply.', 'cadences'); } }))();
Modules.DSR = (() => ({ render: () => { const c = document.getElementById('main-content-view'); if (c) c.innerHTML = comingSoonShell('Digital Sales Room', 'Interactive client portal with per-page engagement analytics.', 'dsr'); } }))();

Modules.VoiceSimulator = (() => ({ render: () => {
  const c = document.getElementById('main-content-view');
  if (!c) return;
  c.innerHTML = `<div class="view-container"><div class="surface-card" style="padding: 48px 20px; text-align: center;">
    <div style="width: 64px; height: 64px; border-radius: 16px; margin: 0 auto 16px; background: var(--accent-soft); display: flex; align-items: center; justify-content: center;">
      <i class="fa-solid fa-microphone-lines" style="font-size: 24px; color: var(--accent);" aria-hidden="true"></i>
    </div>
    <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">AI Voice Simulator</h2>
    <p style="font-size: 13px; color: var(--txt-secondary); max-width: 480px; margin: 0 auto 20px;">Practice objection handling against AI personas trained on real buyer objections.</p>
    <button type="button" class="btn btn-secondary" disabled><i class="fa-solid fa-clock" style="font-size: 10px;" aria-hidden="true"></i> Coming Soon</button>
  </div></div>`;
} }))();

/* --- 27.14 Financial Engine --- */
Modules.FinancialEngine = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    if (!can('view_financials')) {
      content.innerHTML = `<div class="view-container"><div class="surface-card" style="padding: 64px; text-align: center;">
        <div style="font-size: 48px; opacity: .5; margin-bottom: 12px;">🔒</div>
        <h3 style="font-size: 15px; font-weight: 600;">Access restricted</h3>
        <p style="font-size: 13px; color: var(--txt-secondary);">Your role does not grant access to financial reports.</p>
      </div></div>`;
      return;
    }
    const leads = tenantLeads();
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
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Financial Engine</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Commissions, forecasts & revenue tracking</p></div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        ${finCard('Closed Revenue', formatMoney(totalWon), 'fa-trophy', 'var(--ok)')}
        ${finCard('Active Pipeline', formatMoney(pipeline), 'fa-chart-simple', 'var(--accent)')}
        ${finCard('Est. Commissions', formatMoney(commission), 'fa-hand-holding-dollar', 'var(--violet)')}
        ${finCard('Weighted Forecast', formatMoney(weighted), 'fa-bullseye', 'var(--warn)')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Revenue by Project</h3><canvas id="chart-fin-project" height="240" style="width: 100%; display: block;"></canvas></div>
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Won Deals</h3><canvas id="chart-fin-won" height="240" style="width: 100%; display: block;"></canvas></div>
      </div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Recently Won Deals (${won.length})</h3>
        ${won.length === 0 ? `<p style="font-size: 12px; color: var(--txt-muted);">No closed deals yet.</p>` : `<div style="display: flex; flex-direction: column;">
          ${won.slice(0, 10).map((l) => `<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-line);">
            <div style="min-width: 0;"><div style="font-size: 13px; font-weight: 500;" class="truncate">${esc(l.name)}</div><div style="font-size: 11px; color: var(--txt-muted);">${esc(l.project || '—')} · ${esc(l.agent || 'Unassigned')}</div></div>
            <div style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--ok);">${formatMoney(l.budget)}</div>
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
      drawBarChart(document.getElementById('chart-fin-project'), Object.entries(projectRevenue).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: pickPalette(i) })), { money: true });
      drawBarChart(document.getElementById('chart-fin-won'), [
        { label: 'Won', value: won.length, color: '#22c55e' },
        { label: 'Active', value: active.length, color: '#6d8cff' },
        { label: 'Lost', value: leads.filter((l) => l.stage === 'Lost').length, color: '#ef4444' },
      ]);
    });
  }
  function finCard(label, value, icon, color) {
    return `<div class="surface-card" style="padding: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted);">${esc(label)}</span>
        <i class="fa-solid ${icon}" style="font-size: 12px; color: ${color};" aria-hidden="true"></i>
      </div>
      <div style="font-size: 22px; font-weight: 700; color: ${color}; font-variant-numeric: tabular-nums;">${esc(value)}</div>
    </div>`;
  }
  return { render };
})();

/* --- 27.15 Analytics --- */
Modules.Analytics = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const leads = tenantLeads();
    const stageData = STAGES.map((s) => ({ label: s, value: leads.filter((l) => l.stage === s).length, color: STAGE_COLOR[s] }));
    const channelMap = {};
    leads.forEach((l) => { const c = l.channel || 'Unknown'; channelMap[c] = (channelMap[c] || 0) + 1; });
    const channelData = Object.entries(channelMap).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: pickPalette(i) }));
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Analytics</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Performance insights across the pipeline</p></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Leads by Stage</h3><canvas id="chart-stage" height="260" style="width: 100%; display: block;"></canvas></div>
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Leads by Channel</h3><canvas id="chart-channel" height="260" style="width: 100%; display: block;"></canvas></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">Priority Breakdown</h3><canvas id="chart-priority" height="220" style="width: 100%; display: block;"></canvas></div>
        <div class="surface-card" style="padding: 20px;"><h3 style="font-size: 13px; font-weight: 700; margin-bottom: 12px;">SLA Health</h3><canvas id="chart-sla" height="220" style="width: 100%; display: block;"></canvas></div>
      </div>
    </div>`;
    requestAnimationFrame(() => {
      drawBarChart(document.getElementById('chart-stage'), stageData);
      drawBarChart(document.getElementById('chart-channel'), channelData);
      const pri = { urgent: 0, high: 0, medium: 0, low: 0 };
      leads.forEach((l) => { pri[l.priority || 'medium']++; });
      drawBarChart(document.getElementById('chart-priority'), [
        { label: 'Urgent', value: pri.urgent, color: '#ff5d5d' },
        { label: 'High', value: pri.high, color: '#ffb648' },
        { label: 'Medium', value: pri.medium, color: '#6d8cff' },
        { label: 'Low', value: pri.low, color: '#5a6178' },
      ]);
      const sla = { breached: 0, critical: 0, warning: 0, ontrack: 0 };
      leads.forEach((l) => { const b = slaBandOf(l); if (sla[b] !== undefined) sla[b]++; });
      drawBarChart(document.getElementById('chart-sla'), [
        { label: 'Breached', value: sla.breached, color: '#ff5d5d' },
        { label: 'Critical', value: sla.critical, color: '#ff7a45' },
        { label: 'Warning', value: sla.warning, color: '#ffb648' },
        { label: 'On Track', value: sla.ontrack, color: '#4ade80' },
      ]);
    });
  }
  return { render };
})();

/* --- 27.16 Users --- */
Modules.Users = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    if (!can('manage_users')) {
      content.innerHTML = `<div class="view-container"><div class="surface-card" style="padding: 64px; text-align: center;">
        <div style="font-size: 48px; opacity: .5; margin-bottom: 12px;">🔒</div>
        <h3 style="font-size: 15px; font-weight: 600;">Admin only</h3>
        <p style="font-size: 13px; color: var(--txt-secondary);">Only Admins can access team management.</p>
      </div></div>`;
      return;
    }
    const users = tenantUsers().slice().sort((a, b) => {
      const order = { admin: 0, team_leader: 1, sales_rep: 2 };
      return (order[a.role] ?? 3) - (order[b.role] ?? 3);
    });
    const counts = { total: users.length, admin: 0, team_leader: 0, sales_rep: 0 };
    users.forEach((u) => { if (counts[u.role] !== undefined) counts[u.role]++; });
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div><h2 style="font-size: 16px; font-weight: 700;">User Management</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Teams, roles & permissions</p></div>
        <button type="button" class="btn btn-primary" data-action="open-user-modal"><i class="fa-solid fa-user-plus" style="font-size: 11px;" aria-hidden="true"></i> Add User</button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        ${roleCard('Total', counts.total, 'fa-users', 'var(--accent)')}
        ${roleCard('Admins', counts.admin, 'fa-crown', 'var(--danger)')}
        ${roleCard('Team Leaders', counts.team_leader, 'fa-user-tie', 'var(--warn)')}
        ${roleCard('Sales Reps', counts.sales_rep, 'fa-user', 'var(--ok)')}
      </div>
      <div class="surface-card" style="overflow: hidden;">
        <table class="data-table">
          <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th>Shift</th><th>Weight</th><th>Assigned Leads</th><th></th></tr></thead>
          <tbody>
            ${users.map((u) => {
              const assigned = tenantLeads().filter((l) => l.assignedToId === u.id).length;
              const current = u.id === STATE.currentUserId;
              const av = u.avatarUrl
                ? `<span class="avatar avatar-sm" style="background-image:url('${escAttr(u.avatarUrl)}'); background-size:cover; background-position:center;"></span>`
                : `<span class="avatar avatar-sm">${esc(initialsOf(u.name))}</span>`;
              return `<tr>
                <td><div style="display: flex; align-items: center; gap: 10px;">${av}<div><div style="font-size: 13px; font-weight: 500;">${esc(u.name)}</div>${current ? '<div style="font-size: 10px; color: var(--accent); font-weight: 700;">YOU</div>' : ''}</div></div></td>
                <td style="font-size: 12px; color: var(--txt-secondary);">${esc(u.email)}</td>
                <td><span style="font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; ${roleBadgeStyle(u.role)}">${esc(ROLE_LABEL[u.role] || u.role)}</span></td>
                <td><span style="font-size: 11px; font-weight: 600; ${statusColor(u.status)}">${esc(USER_STATUS_LABEL[u.status] || u.status)}</span></td>
                <td style="font-size: 12px;">${esc(SHIFT_LABEL[u.shift] || '—')}</td>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px;">${u.rotationWeight || 20}</td>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px;">${assigned}</td>
                <td style="text-align: end;"><button type="button" class="icon-btn icon-btn-sm" data-action="open-user-modal" data-user-id="${escAttr(u.id)}" title="Edit"><i class="fa-solid fa-pen" style="font-size: 11px;" aria-hidden="true"></i></button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }
  function roleCard(label, value, icon, color) {
    return `<div class="surface-card" style="padding: 16px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--txt-muted);">${esc(label)}</span>
        <i class="fa-solid ${icon}" style="font-size: 12px; color: ${color};" aria-hidden="true"></i>
      </div>
      <div style="font-size: 22px; font-weight: 700; color: ${color}; font-variant-numeric: tabular-nums;">${value}</div>
    </div>`;
  }
  function roleBadgeStyle(role) {
    if (role === 'admin') return 'background: var(--danger-soft); color: var(--danger);';
    if (role === 'team_leader') return 'background: var(--warn-soft); color: var(--warn);';
    return 'background: var(--ok-soft); color: var(--ok);';
  }
  function statusColor(status) {
    if (status === 'active') return 'color: var(--ok);';
    if (status === 'invited') return 'color: var(--warn);';
    if (status === 'suspended') return 'color: var(--danger);';
    return 'color: var(--txt-muted);';
  }
  return { render };
})();

/* --- 27.17 Permissions --- */
Modules.Permissions = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Roles & Permissions</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Granular access control matrix</p></div>
      <div class="surface-card" style="overflow: hidden;">
        <table class="data-table">
          <thead><tr><th>Permission</th><th style="text-align: center;">Admin</th><th style="text-align: center;">Team Leader</th><th style="text-align: center;">Sales Rep</th></tr></thead>
          <tbody>
            ${PERMISSIONS.map((p) => `<tr>
              <td style="font-weight: 500;">${esc(p.label)}</td>
              ${['admin', 'team_leader', 'sales_rep'].map((r) => `<td style="text-align: center;"><i class="fa-solid ${p.roles.includes(r) ? 'fa-check' : 'fa-xmark'}" style="color: ${p.roles.includes(r) ? 'var(--ok)' : 'var(--txt-muted)'}; font-size: 12px;" aria-hidden="true"></i></td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="surface-card" style="padding: 16px; font-size: 12px; color: var(--txt-secondary);">
        <i class="fa-solid fa-info-circle" style="color: var(--accent); margin-inline-end: 6px;" aria-hidden="true"></i>
        Per-user overrides are managed when editing a specific team member in <button type="button" data-view="users" style="background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit;">User Management</button>.
      </div>
    </div>`;
  }
  return { render };
})();

/* --- 27.18 Rotation Settings --- */
Modules.RotationSettings = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const r = STATE.settings.rotation || {};
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px; max-width: 720px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Rotation Rules</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Configure auto-assignment behavior</p></div>
      <div class="surface-card" style="padding: 20px;">
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div><div style="font-size: 13px; font-weight: 600;">Enable Auto-Rotation</div><div style="font-size: 11px; color: var(--txt-muted);">New leads are auto-assigned to eligible reps.</div></div>
            <label class="switch"><input type="checkbox" id="rot-enabled" ${r.enabled !== false ? 'checked' : ''} onchange="Modules.RotationSettings.saveField('enabled', this.checked)" /><span class="switch-slider"></span></label>
          </div>
          <div>
            <label class="field-label" for="rot-mode">Mode</label>
            <select id="rot-mode" class="field-input" onchange="Modules.RotationSettings.saveField('mode', this.value)">
              <option value="round_robin" ${r.mode === 'round_robin' ? 'selected' : ''}>Round-Robin</option>
              <option value="weighted" ${r.mode === 'weighted' ? 'selected' : ''}>Weighted by Rep</option>
            </select>
          </div>
          <div>
            <label class="field-label" for="rot-cap">Uncontacted Cap per Rep</label>
            <input id="rot-cap" type="number" min="1" max="100" class="field-input" value="${r.uncontactedCap ?? 10}" onchange="Modules.RotationSettings.saveField('uncontactedCap', Number(this.value) || 10)" />
            <p style="font-size: 10px; color: var(--txt-muted); margin-top: 4px;">Reps at cap are skipped until they action existing leads.</p>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div><div style="font-size: 13px; font-weight: 600;">Require Active Shift</div><div style="font-size: 11px; color: var(--txt-muted);">Skip reps marked On Leave / Offline.</div></div>
            <label class="switch"><input type="checkbox" id="rot-shift" ${r.requireActiveShift !== false ? 'checked' : ''} onchange="Modules.RotationSettings.saveField('requireActiveShift', this.checked)" /><span class="switch-slider"></span></label>
          </div>
          <div>
            <label class="field-label" for="rot-penalty">SLA Breach Penalty (score points)</label>
            <input id="rot-penalty" type="number" min="0" max="50" class="field-input" value="${r.slaScorePenalty ?? 5}" onchange="Modules.RotationSettings.saveField('slaScorePenalty', Number(this.value) || 0)" />
          </div>
        </div>
      </div>
    </div>`;
  }
  async function saveField(key, value) {
    if (!STATE.settings.rotation) STATE.settings.rotation = {};
    STATE.settings.rotation[key] = value;
    await DB.saveSettings();
    showToast('Rotation rule updated', 'success');
  }
  return { render, saveField };
})();

/* --- 27.19 Branding --- */
Modules.Branding = (() => {
  let logoPreview = null;
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const b = STATE.settings.branding || {};
    logoPreview = b.logoDataUrl || null;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px; max-width: 720px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Branding</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Customize your workspace look</p></div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 16px;">Logo</h3>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div id="branding-logo-preview" style="width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 24px; color: #fff; background: linear-gradient(135deg, ${b.primary || 'var(--accent)'}, ${b.secondary || 'var(--violet)'});">${logoPreview ? '' : esc((getCurrentTenant()?.name || 'O').charAt(0).toUpperCase())}</div>
          <div style="flex: 1;">
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-sm btn-secondary" data-action="branding-logo-upload"><i class="fa-solid fa-upload" style="font-size: 10px;" aria-hidden="true"></i> Upload</button>
              <button type="button" class="btn btn-sm btn-ghost" data-action="branding-logo-clear">Remove</button>
              <input type="file" id="branding-logo-input" accept="image/png,image/jpeg,image/svg+xml" class="is-hidden" />
            </div>
            <p style="font-size: 10px; color: var(--txt-muted); margin-top: 6px;">PNG, JPG or SVG. Max 512 KB.</p>
          </div>
        </div>
      </div>
      <div class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 13px; font-weight: 700; margin-bottom: 16px;">Brand Colors</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div><label class="field-label" for="branding-primary">Primary</label><input id="branding-primary" type="color" class="field-input" style="height: 44px; padding: 4px;" value="${b.primary || '#6d8cff'}" /></div>
          <div><label class="field-label" for="branding-secondary">Secondary</label><input id="branding-secondary" type="color" class="field-input" style="height: 44px; padding: 4px;" value="${b.secondary || '#8f6dff'}" /></div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          <button type="button" class="btn btn-primary" data-action="branding-save"><i class="fa-solid fa-floppy-disk" style="font-size: 11px;" aria-hidden="true"></i> Save Branding</button>
          <button type="button" class="btn btn-ghost" data-action="branding-reset-colors">Reset Colors</button>
        </div>
      </div>
    </div>`;
    if (logoPreview) applyLogoPreview(logoPreview);
  }
  function applyLogoPreview(url) {
    logoPreview = url;
    const el = document.getElementById('branding-logo-preview');
    if (!el) return;
    if (url) {
      el.style.backgroundImage = `url(${url})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = (getCurrentTenant()?.name || 'O').charAt(0).toUpperCase();
    }
  }
  return { render, applyLogoPreview, clearPreview: () => applyLogoPreview(null) };
})();

function applyBrandingLogoPreview(url) { Modules.Branding.applyLogoPreview(url); }
function clearBrandingLogo() { Modules.Branding.clearPreview(); }
function resetBrandingColors() {
  const p = document.getElementById('branding-primary');
  const s = document.getElementById('branding-secondary');
  if (p) p.value = '#6d8cff';
  if (s) s.value = '#8f6dff';
}
async function saveBranding() {
  if (!can('manage_settings')) { showToast('No permission', 'warning'); return; }
  const p = document.getElementById('branding-primary')?.value || '#6d8cff';
  const s = document.getElementById('branding-secondary')?.value || '#8f6dff';
  const logoEl = document.getElementById('branding-logo-preview');
  let logoDataUrl = '';
  if (logoEl && logoEl.style.backgroundImage) {
    const m = logoEl.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (m) logoDataUrl = m[1];
  }
  STATE.settings.branding = { primary: p, secondary: s, logoDataUrl };
  await DB.saveSettings();
  refreshUserChrome();
  showToast('Branding saved', 'success');
}

/* --- 27.20 Integrations --- */
Modules.Integrations = (() => {
  const ITEMS = [
    { key: 'whatsapp', label: 'WhatsApp Business API', icon: 'fa-whatsapp', color: '#25d366', description: 'Send templates & receive replies' },
    { key: 'meta', label: 'Meta Ads', icon: 'fa-meta', color: '#0064e0', description: 'Sync campaigns & attribution' },
    { key: 'google', label: 'Google Ads', icon: 'fa-google', color: '#4285f4', description: 'Sync campaigns & conversions' },
    { key: 'tiktok', label: 'TikTok Ads', icon: 'fa-tiktok', color: '#000000', description: 'Sync campaigns & attribution' },
  ];
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    const enabled = STATE.settings.integrations || {};
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px; max-width: 720px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Integrations</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Connect external services</p></div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${ITEMS.map((it) => `<div class="surface-card" style="padding: 16px; display: flex; align-items: center; gap: 16px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: ${it.color}22; display: flex; align-items: center; justify-content: center; color: ${it.color}; flex-shrink: 0;">
            <i class="fa-brands ${it.icon}" style="font-size: 18px;" aria-hidden="true"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; font-weight: 600;">${esc(it.label)}</div>
            <div style="font-size: 11px; color: var(--txt-muted);">${esc(it.description)}</div>
          </div>
          <label class="switch"><input type="checkbox" ${enabled[it.key] ? 'checked' : ''} data-action="integration-toggle" data-integration="${escAttr(it.key)}" onchange="dispatchAction('integration-toggle', this)" /><span class="switch-slider"></span></label>
        </div>`).join('')}
      </div>
      <div class="surface-card" style="padding: 16px; font-size: 11px; color: var(--txt-muted);">
        <i class="fa-solid fa-info-circle" style="color: var(--info); margin-inline-end: 6px;" aria-hidden="true"></i>
        Real API keys are provisioned by your Super-Admin on the SaaS side.
      </div>
    </div>`;
  }
  return { render };
})();

async function toggleIntegration(el) {
  const key = el.dataset.integration;
  if (!key) return;
  if (!STATE.settings.integrations) STATE.settings.integrations = {};
  STATE.settings.integrations[key] = Boolean(el.checked);
  await DB.saveSettings();
  showToast(`${FEATURE_LABELS[key] || key} ${el.checked ? 'enabled' : 'disabled'}`, 'success');
}

/* --- 27.21 Settings --- */
Modules.Settings = (() => {
  function render() {
    const content = document.getElementById('main-content-view');
    if (!content) return;
    content.innerHTML = `<div class="view-container" style="display: flex; flex-direction: column; gap: 20px; max-width: 720px;">
      <div><h2 style="font-size: 16px; font-weight: 700;">Settings</h2><p style="font-size: 12px; color: var(--txt-muted); margin-top: 2px;">Workspace preferences & data</p></div>
      <section class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-building" style="color: var(--accent); font-size: 12px;" aria-hidden="true"></i> Projects</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
          ${(STATE.settings.projects || []).map((p) => `<span style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--bg-surface-2); border: 1px solid var(--border-line); font-size: 12px;">
            ${esc(p)}
            <button type="button" style="color: var(--txt-muted); background: none; border: none; cursor: pointer;" data-action="settings-remove-project" data-project="${escAttr(p)}" title="Remove"><i class="fa-solid fa-xmark" style="font-size: 10px;" aria-hidden="true"></i></button>
          </span>`).join('')}
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="new-project-input" class="field-input" placeholder="Add project name…" />
          <button type="button" class="btn btn-primary" data-action="settings-add-project">Add</button>
        </div>
      </section>
      <section class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-database" style="color: var(--accent); font-size: 12px;" aria-hidden="true"></i> Data Management</h3>
        <div style="display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-line);">
            <div><div style="font-size: 13px; font-weight: 500;">Export Data</div><div style="font-size: 11px; color: var(--txt-muted);">Download a JSON backup</div></div>
            <button type="button" class="btn btn-secondary" data-action="settings-export"><i class="fa-solid fa-download" style="font-size: 10px;" aria-hidden="true"></i> Export</button>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-line);">
            <div><div style="font-size: 13px; font-weight: 500;">Import Data</div><div style="font-size: 11px; color: var(--txt-muted);">Restore from a backup</div></div>
            <button type="button" class="btn btn-secondary" data-action="settings-import"><i class="fa-solid fa-upload" style="font-size: 10px;" aria-hidden="true"></i> Import</button>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border-line);">
            <div><div style="font-size: 13px; font-weight: 500;">Storage Engine</div><div style="font-size: 11px; color: var(--txt-muted);">${STATE.useIDB ? 'IndexedDB — high capacity' : 'LocalStorage — ~5MB limit'}</div></div>
            <span style="font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; ${STATE.useIDB ? 'background: var(--ok-soft); color: var(--ok);' : 'background: var(--warn-soft); color: var(--warn);'}">${STATE.useIDB ? 'IndexedDB' : 'LocalStorage'}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0;">
            <div><div style="font-size: 13px; font-weight: 500;">Clear Workspace Data</div><div style="font-size: 11px; color: var(--txt-muted);">Delete all leads, comments & logs</div></div>
            <button type="button" class="btn btn-danger" data-action="settings-clear"><i class="fa-solid fa-trash" style="font-size: 10px;" aria-hidden="true"></i> Clear</button>
          </div>
        </div>
      </section>
      <section class="surface-card" style="padding: 20px;">
        <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;"><i class="fa-brands fa-whatsapp" style="color: #25d366; font-size: 14px;" aria-hidden="true"></i> WhatsApp Templates</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${STAGES.map((s) => `<div><label class="field-label">${STAGE_EMOJI[s]} ${esc(s)}</label><textarea id="wa-tpl-${s.replace(/\s+/g, '_')}" class="field-input" style="min-height: 60px;">${esc(STATE.settings.waTemplates?.[s] || '')}</textarea></div>`).join('')}
        </div>
        <button type="button" class="btn btn-primary" data-action="settings-save-wa" style="margin-top: 16px;"><i class="fa-solid fa-floppy-disk" style="font-size: 10px;" aria-hidden="true"></i> Save Templates</button>
      </section>
    </div>`;
  }
  return { render };
})();

async function addProject() {
  const input = document.getElementById('new-project-input');
  const val = input?.value.trim();
  if (!val) { showToast('Enter a project name', 'warning'); return; }
  if (!STATE.settings.projects) STATE.settings.projects = [];
  if (STATE.settings.projects.includes(val)) { showToast('Project already exists', 'warning'); return; }
  STATE.settings.projects.push(val);
  await DB.saveSettings();
  input.value = '';
  Modules.Settings.render();
  showToast(`Project "${val}" added`, 'success');
}
async function removeProject(name) {
  const ok = await Confirm.ask({ icon: '🏗', title: 'Remove Project', message: `Remove "${name}"?`, okText: 'Remove' });
  if (!ok) return;
  STATE.settings.projects = (STATE.settings.projects || []).filter((p) => p !== name);
  await DB.saveSettings();
  Modules.Settings.render();
  showToast(`Removed "${name}"`, 'warning');
}
async function saveWATemplates() {
  if (!STATE.settings.waTemplates) STATE.settings.waTemplates = {};
  for (const s of STAGES) {
    const el = document.getElementById(`wa-tpl-${s.replace(/\s+/g, '_')}`);
    if (el) STATE.settings.waTemplates[s] = el.value;
  }
  await DB.saveSettings();
  showToast('Templates saved', 'success');
}
async function clearTenantData() {
  if (!can('clear_data')) { showToast('No permission', 'warning'); return; }
  const ok = await Confirm.ask({ icon: '🗑', title: 'Clear Workspace Data', message: 'Delete all leads, comments, and audit logs for this workspace?', okText: 'Clear Everything' });
  if (!ok) return;
  const tenantId = STATE.currentTenantId;
  const leads = STATE.leads.filter((l) => l.tenantId === tenantId);
  for (const l of leads) await DB.deleteLead(l.id);
  STATE.leads = STATE.leads.filter((l) => l.tenantId !== tenantId);
  STATE.comments = {}; STATE.auditLogs = {};
  Router.refresh();
  updateHeaderKPIs();
  showToast('Workspace data cleared', 'warning');
}

/* ============================================================================
   28 · LEAD INTERACTION DRAWER
   ============================================================================ */

function openLeadDrawer(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  STATE.drawerLeadId = leadId;
  renderDrawerLead(lead);
  Drawer.open('lead-interaction');
  const claimBtn = document.getElementById('drawer-claim-btn');
  if (claimBtn) {
    if (lead.status === 'claim_pool') { claimBtn.style.display = ''; claimBtn.dataset.leadId = leadId; }
    else claimBtn.style.display = 'none';
  }
  setTimeout(() => document.getElementById('drawer-note-input')?.focus(), 200);
  startDrawerTick(leadId);
}

function closeLeadDrawer() {
  Drawer.close('lead-interaction');
  STATE.drawerLeadId = null;
  if (STATE.acTickTimer) { clearInterval(STATE.acTickTimer); STATE.acTickTimer = null; }
}

function setDrawerText(field, value) {
  document.querySelectorAll(`[data-drawer-lead="${field}"]`).forEach((el) => { el.textContent = value ?? '—'; });
}

function renderDrawerLead(lead) {
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
  const contact = [lead.phone || '—', lead.email, lead.project ? `· ${lead.project}` : ''].filter(Boolean).join('  ');
  setDrawerText('contact', contact);
  const stageEl = document.querySelector('[data-drawer-lead="stage-label"]');
  if (stageEl) {
    const stage = lead.stage || 'New Lead';
    stageEl.innerHTML = `<span style="color: ${STAGE_COLOR[stage]};">${STAGE_EMOJI[stage] || ''} ${esc(stage)}</span>`;
  }
  setDrawerText('project', lead.project || '—');
  setDrawerText('budget', lead.budget ? formatMoney(lead.budget) : '—');
  setDrawerText('channel', lead.channel || '—');
  setDrawerText('agent', lead.agent || 'Unassigned');

  const cd = countdownOf(lead);
  const band = slaBandOf(lead);
  const color = { breached: '#ff5d5d', critical: '#ff7a45', warning: '#ffb648', ontrack: '#4ade80' }[band] || 'var(--txt-muted)';
  const badgeEl = document.getElementById('drawer-sla-badge');
  if (badgeEl) {
    badgeEl.textContent = { breached: 'BREACHED', critical: 'CRITICAL', warning: 'WARNING', ontrack: 'ON TRACK', none: '—' }[band];
    badgeEl.style.color = color;
    badgeEl.style.background = `${color}18`;
  }
  setText('drawer-sla-days', cd ? pad2(cd.days) : '—');
  setText('drawer-sla-hours', cd ? pad2(cd.hours) : '—');
  setText('drawer-sla-mins', cd ? pad2(cd.mins) : '—');
  ['drawer-sla-days', 'drawer-sla-hours', 'drawer-sla-mins'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.color = color;
  });
  const prog = document.getElementById('drawer-sla-progress');
  if (prog) {
    const win = slaWindowMs(lead);
    const elapsed = win - (cd?.diffMs ?? win);
    const pct = clamp((elapsed / win) * 100, 0, 100);
    prog.style.width = `${pct}%`;
    prog.style.background = color;
  }
  const fd = document.getElementById('drawer-followup-date');
  const ft = document.getElementById('drawer-followup-time');
  if (fd) fd.value = lead.followUpDate || '';
  if (ft) ft.value = lead.followUpTime || '';
  const sum = document.getElementById('drawer-followup-summary');
  if (sum) {
    if (lead.slaDueAt) {
      sum.innerHTML = `<i class="fa-regular fa-clock" style="margin-inline-end: 4px;" aria-hidden="true"></i>SLA due: <strong style="color: ${color};">${formatDateTimeLocal(lead.slaDueAt)}</strong>`;
    } else {
      sum.textContent = 'No SLA scheduled';
    }
  }
  const audit = STATE.auditLogs[lead.id] || [];
  const lastContact = audit.find((e) => e.action?.startsWith('call_')) || audit[0];
  setDrawerText('last-contact', lastContact ? `Last: ${formatRelative(lastContact.timestamp)}` : 'No contact logged');
  const nba = document.getElementById('drawer-nba');
  if (nba) {
    const score = calcLeadScore(lead);
    const stage = lead.stage;
    let suggestion = 'Schedule a discovery call to qualify the lead.';
    if (stage === 'New Lead') suggestion = 'Send a WhatsApp intro and set a follow-up within 15 minutes.';
    else if (stage === 'Contacted') suggestion = 'Book a property viewing within 48 hours.';
    else if (stage === 'Meeting Scheduled') suggestion = 'Send a pre-meeting reminder and a tailored brochure.';
    else if (stage === 'Proposal Sent') suggestion = 'Follow up on the proposal and address objections.';
    else if (stage === 'Negotiation') suggestion = 'Offer a 3% discount and request a signed reservation.';
    if (band === 'breached' || band === 'critical') suggestion = 'URGENT: Contact immediately to prevent SLA breach.';
    nba.innerHTML = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; color: ${score >= 70 ? '#ff7a45' : '#ffb648'};">${score}</span>
      <span style="font-size: 10px; color: var(--txt-muted);">win score</span>
    </div>
    <div>${esc(suggestion)}</div>`;
  }
  renderDrawerTimeline(lead.id);
}

function startDrawerTick(leadId) {
  if (STATE.acTickTimer) clearInterval(STATE.acTickTimer);
  STATE.acTickTimer = setInterval(() => {
    const lead = findLead(leadId);
    if (!lead || !Drawer.isOpen('lead-interaction')) { clearInterval(STATE.acTickTimer); STATE.acTickTimer = null; return; }
    const cd = countdownOf(lead);
    const band = slaBandOf(lead);
    const color = { breached: '#ff5d5d', critical: '#ff7a45', warning: '#ffb648', ontrack: '#4ade80' }[band] || 'var(--txt-muted)';
    setText('drawer-sla-days', cd ? pad2(cd.days) : '—');
    setText('drawer-sla-hours', cd ? pad2(cd.hours) : '—');
    setText('drawer-sla-mins', cd ? pad2(cd.mins) : '—');
    ['drawer-sla-days', 'drawer-sla-hours', 'drawer-sla-mins'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.color = color;
    });
  }, 1000);
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
    el.innerHTML = `<div style="text-align: center; padding: 32px 0;">
      <div style="font-size: 24px; opacity: .5; margin-bottom: 8px;">📭</div>
      <p style="font-size: 12px; color: var(--txt-muted);">No activity yet. Log a call or add a note below.</p>
    </div>`;
    return;
  }
  el.innerHTML = combined.map((entry) => {
    const icon = entry.isComment ? '💬' : auditIcon(entry.action);
    const text = entry.isComment
      ? `<strong>${esc(entry.agent || 'Someone')}</strong> added a note: <em style="color: var(--txt-secondary);">"${esc((entry.meta?.text || '').slice(0, 140))}"</em>`
      : buildAuditLine(entry);
    return `<div class="timeline-item">
      <div class="timeline-dot">${icon}</div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 12px; color: var(--txt-secondary); line-height: 1.5;">${text}</div>
        <div style="font-size: 10px; color: var(--txt-muted); margin-top: 4px;">${formatRelative(entry.timestamp)} · ${formatDateTime(entry.timestamp)}</div>
      </div>
    </div>`;
  }).join('');
}

async function submitDrawerNote() {
  const input = document.getElementById('drawer-note-input');
  const text = input?.value.trim();
  if (!text || !STATE.drawerLeadId) { showToast('Write a note first', 'warning'); return; }
  await addComment(STATE.drawerLeadId, text);
  input.value = '';
  renderDrawerTimeline(STATE.drawerLeadId);
  const lead = findLead(STATE.drawerLeadId);
  if (lead) renderDrawerLead(lead);
  showToast('Note added', 'success');
}

async function applyDisposition(value) {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  const cfg = DISPOSITIONS[value];
  if (!cfg) return;
  const now = new Date();
  const meta = {};
  if (['no_answer', 'busy', 'voicemail'].includes(value)) {
    lead.attempts = (lead.attempts || 0) + 1;
    meta.attempt = lead.attempts;
    const next = new Date(now.getTime() + AUTO_RESCHEDULE_HOURS * 3600000);
    lead.followUpDate = dateOnly(next);
    lead.followUpTime = timeOnly(next);
    lead.slaDueAt = next.toISOString();
  }
  if (cfg.stage && lead.stage !== cfg.stage && lead.stage !== 'Won' && lead.stage !== 'Lost') {
    meta.stageFrom = lead.stage;
    meta.stageTo = cfg.stage;
    lead.stage = cfg.stage;
  }
  lead.updatedAt = nowIso();
  lead.lastContactedAt = nowIso();
  await DB.saveLead(lead);
  createAuditEntry(lead.id, cfg.auditAction, meta);
  if (cfg.autoReschedule) createAuditEntry(lead.id, 'followup_set', { datetime: formatDateTimeLocal(lead.slaDueAt) });
  renderDrawerLead(lead);
  Router.refresh();
  updateHeaderKPIs();
  const messages = {
    answered: 'Logged: Answered',
    no_answer: `No Answer — retry in ${AUTO_RESCHEDULE_HOURS}h (attempt #${lead.attempts})`,
    busy: `Busy — retry in ${AUTO_RESCHEDULE_HOURS}h`,
    voicemail: `Voicemail — retry in ${AUTO_RESCHEDULE_HOURS}h`,
    call_back: 'Logged: Call Back',
    whatsapp: 'Logged: WhatsApp Sent',
    meeting: 'Stage → Meeting Scheduled',
    wrong_number: 'Logged: Wrong Number',
  };
  showToast(messages[value] || 'Logged', 'success');
}

async function applyQuickFollowup(value) {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  const now = new Date();
  let target = new Date(now);
  switch (value) {
    case '2h': target.setTime(now.getTime() + 2 * 3600000); break;
    case 'today': target.setHours(18, 0, 0, 0); if (target < now) target.setTime(now.getTime() + 2 * 3600000); break;
    case 'tomorrow': target.setDate(target.getDate() + 1); target.setHours(10, 0, 0, 0); break;
    case '3_days': target.setDate(target.getDate() + 3); target.setHours(10, 0, 0, 0); break;
    case '1_week': target.setDate(target.getDate() + 7); target.setHours(10, 0, 0, 0); break;
    case '1_month': target.setMonth(target.getMonth() + 1); target.setHours(10, 0, 0, 0); break;
    default: return;
  }
  lead.followUpDate = dateOnly(target);
  lead.followUpTime = timeOnly(target);
  lead.slaDueAt = target.toISOString();
  lead.updatedAt = nowIso();
  await DB.saveLead(lead);
  createAuditEntry(lead.id, 'followup_set', { datetime: formatDateTimeLocal(target.toISOString()) });
  renderDrawerLead(lead);
  Router.refresh();
  updateHeaderKPIs();
  showToast(`Follow-up: ${formatDateTimeLocal(target.toISOString())}`, 'success');
}

async function openCustomFollowupPrompt() {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  const defaultDate = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return dateOnly(d); })();
  const dateStr = window.prompt('Follow-up date (YYYY-MM-DD):', defaultDate);
  if (!dateStr) return;
  const timeStr = window.prompt('Follow-up time (HH:MM, 24h):', '10:00');
  if (!timeStr) return;
  const dt = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(dt.getTime())) { showToast('Invalid date/time', 'warning'); return; }
  lead.followUpDate = dateStr;
  lead.followUpTime = timeStr;
  lead.slaDueAt = dt.toISOString();
  lead.updatedAt = nowIso();
  await DB.saveLead(lead);
  createAuditEntry(lead.id, 'followup_set', { datetime: formatDateTimeLocal(dt.toISOString()) });
  renderDrawerLead(lead);
  Router.refresh();
  updateHeaderKPIs();
  showToast(`Follow-up: ${formatDateTimeLocal(dt.toISOString())}`, 'success');
}

async function saveDrawerFollowup() {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  const d = document.getElementById('drawer-followup-date')?.value;
  const t = document.getElementById('drawer-followup-time')?.value || '09:00';
  if (!d) { showToast('Pick a date', 'warning'); return; }
  const dt = parseLocalDate(d, t);
  lead.followUpDate = d;
  lead.followUpTime = t;
  lead.slaDueAt = dt.toISOString();
  lead.updatedAt = nowIso();
  await DB.saveLead(lead);
  createAuditEntry(lead.id, 'followup_set', { datetime: formatDateTimeLocal(dt.toISOString()) });
  renderDrawerLead(lead);
  Router.refresh();
  updateHeaderKPIs();
  showToast('Follow-up saved', 'success');
}

function drawerCall() {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  if (lead.phone) window.location.href = `tel:${lead.phone.replace(/[^\d+]/g, '')}`;
  else showToast('No phone number on file', 'warning');
}
function drawerEmail() {
  const lead = findLead(STATE.drawerLeadId);
  if (!lead) return;
  if (lead.email) window.location.href = `mailto:${lead.email}?subject=Regarding ${encodeURIComponent(lead.project || 'your inquiry')}`;
  else showToast('No email on file', 'warning');
}

async function claimLeadFromPool(leadId) {
  const lead = findLead(leadId);
  if (!lead || lead.status !== 'claim_pool') return;
  if (!can('claim_pool')) { showToast('No permission to claim leads', 'warning'); return; }
  const u = getCurrentUser();
  lead.status = 'active';
  lead.assignedToId = u.id;
  lead.assignedAt = nowIso();
  lead.agent = u.name;
  const temp = leadTemperature(lead);
  lead.slaDueAt = new Date(Date.now() + LEAD_TEMP_SLA[temp] * 3600000).toISOString();
  lead.followUpDate = dateOnly(lead.slaDueAt);
  lead.followUpTime = timeOnly(lead.slaDueAt);
  lead.updatedAt = nowIso();
  await DB.saveLead(lead);
  createAuditEntry(lead.id, 'rotation_claimed', { userId: u.id, userName: u.name });
  const log = { id: uid('rot'), tenantId: STATE.currentTenantId, leadId: lead.id, action: 'claimed', fromUserId: null, toUserId: u.id, createdAt: nowIso() };
  STATE.rotationLog.unshift(log);
  DB.saveRotationLog(log);
  showToast(`Claimed "${lead.name}"`, 'success');
  Router.refresh();
  updateHeaderKPIs();
  if (STATE.activeView === 'lead-rotation') Modules.Rotation.render();
  if (Drawer.isOpen('lead-interaction')) openLeadDrawer(leadId);
}

/* ============================================================================
   29 · WHATSAPP
   ============================================================================ */

function fillWATemplate(tpl, lead) {
  if (!tpl) return '';
  const company = getCurrentTenant()?.name || 'Octane';
  return String(tpl)
    .replace(/\{name\}/gi, lead.name || '')
    .replace(/\{agent\}/gi, lead.agent || getCurrentUser()?.name || '')
    .replace(/\{project\}/gi, lead.project || '')
    .replace(/\{phone\}/gi, lead.phone || '')
    .replace(/\{company\}/gi, company)
    .replace(/\{stage\}/gi, lead.stage || '');
}

function openWhatsAppModal(leadId) {
  const lead = findLead(leadId);
  if (!lead) return;
  const phoneEl = document.getElementById('wa-phone');
  const msgEl = document.getElementById('wa-message');
  const selEl = document.getElementById('wa-template-select');
  const clean = (lead.phone || '').replace(/\D/g, '');
  if (phoneEl) phoneEl.value = clean ? `+${clean}` : '';
  if (selEl) {
    selEl.innerHTML = '<option value="">— Select —</option>' + STAGES.map((s) => `<option value="${escAttr(s)}" ${s === lead.stage ? 'selected' : ''}>${STAGE_EMOJI[s]} ${esc(s)}</option>`).join('');
    selEl.onchange = () => {
      const tpl = STATE.settings.waTemplates?.[selEl.value] || '';
      if (msgEl) msgEl.value = fillWATemplate(tpl, lead);
    };
  }
  const tpl = STATE.settings.waTemplates?.[lead.stage] || '';
  if (msgEl) msgEl.value = fillWATemplate(tpl, lead);
  const btn = document.querySelector('[data-action="send-whatsapp"]');
  if (btn) btn.dataset.leadId = leadId;
  Modal.open('modal-whatsapp');
}

function sendWhatsApp() {
  const btn = document.querySelector('[data-action="send-whatsapp"]');
  const leadId = btn?.dataset.leadId;
  const phone = (document.getElementById('wa-phone')?.value || '').replace(/\D/g, '');
  const msg = (document.getElementById('wa-message')?.value || '').trim();
  if (!phone) { showToast('Enter a phone number', 'warning'); return; }
  if (!msg) { showToast('Write a message', 'warning'); return; }
  if (!can('send_whatsapp')) { showToast('No permission', 'warning'); return; }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  if (leadId) {
    const lead = findLead(leadId);
    if (lead) {
      createAuditEntry(leadId, 'whatsapp_sent', {});
      if (lead.stage === 'New Lead') {
        lead.stage = 'Contacted';
        lead.updatedAt = nowIso();
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
   30 · CHECK-IN / CHECK-OUT
   ============================================================================ */

function openCheckInModal() {
  const me = getCurrentUser();
  if (!me) return;
  const status = me.checkInStatus || 'out';
  setText('checkin-current', status === 'in' ? `✅ Checked in at ${formatDateTimeLocal(me.lastCheckInAt)}` : '— Not checked in');
  const el = document.getElementById('checkin-current');
  if (el) el.style.color = status === 'in' ? 'var(--ok)' : 'var(--txt-secondary)';
  const geoEl = document.getElementById('checkin-geo');
  if (geoEl) geoEl.textContent = me.lastGeo ? `📍 ${me.lastGeo.lat.toFixed(4)}, ${me.lastGeo.lng.toFixed(4)}` : '—';
  Modal.open('modal-checkin');
}

async function doCheckIn() {
  const me = getCurrentUser();
  if (!me) return;
  const gps = document.getElementById('checkin-gps')?.checked;
  const notes = (document.getElementById('checkin-notes')?.value || '').trim();
  me.checkInStatus = 'in';
  me.lastCheckInAt = nowIso();
  me.lastCheckInNotes = notes;
  if (gps && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      me.lastGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      DB.saveUser(me);
      createAuditEntry(me.id, 'checkin', { location: `lat ${pos.coords.latitude.toFixed(3)}, lng ${pos.coords.longitude.toFixed(3)}` });
      showToast('Checked in with GPS', 'success');
      Modal.close('modal-checkin');
    }, () => {
      DB.saveUser(me);
      createAuditEntry(me.id, 'checkin', {});
      showToast('Checked in (no GPS)', 'success');
      Modal.close('modal-checkin');
    }, { timeout: 5000 });
  } else {
    await DB.saveUser(me);
    createAuditEntry(me.id, 'checkin', {});
    showToast('Checked in', 'success');
    Modal.close('modal-checkin');
  }
}
async function doCheckOut() {
  const me = getCurrentUser();
  if (!me) return;
  me.checkInStatus = 'out';
  me.lastCheckOutAt = nowIso();
  await DB.saveUser(me);
  createAuditEntry(me.id, 'checkout', {});
  showToast('Checked out', 'success');
  Modal.close('modal-checkin');
}

/* ============================================================================
   31 · DISCOUNT APPROVAL
   ============================================================================ */

async function submitDiscountRequest() {
  const leadId = STATE.drawerLeadId;
  if (!leadId) { showToast('Open a lead first', 'warning'); return; }
  const pct = Sanitize.number(document.getElementById('disc-percent')?.value, 0);
  const reason = (document.getElementById('disc-reason')?.value || '').trim();
  if (pct <= 0 || pct > 50) { showToast('Discount must be 0-50%', 'warning'); return; }
  if (!reason) { showToast('Add a justification', 'warning'); return; }
  const lead = findLead(leadId);
  const leaders = tenantUsers().filter((u) => u.role === 'team_leader' || u.role === 'admin');
  for (const l of leaders) {
    pushNotification({
      tenantId: STATE.currentTenantId, userId: l.id, type: 'approval',
      title: `Discount request: ${pct}% on ${lead.name}`,
      body: reason, deepLink: { type: 'lead', leadId },
    });
  }
  createAuditEntry(leadId, 'discount_requested', { percent: pct, reason });
  Modal.close('modal-discount');
  showToast(`Discount request sent to ${leaders.length} approver(s)`, 'success');
}

/* ============================================================================
   32 · IMPORT / EXPORT
   ============================================================================ */

function exportData() {
  if (!can('export_data')) { showToast('No permission', 'warning'); return; }
  const payload = {
    version: '8.0', exportedAt: nowIso(),
    tenant: getCurrentTenant(), users: tenantUsers(), leads: tenantLeads(),
    comments: Object.fromEntries(Object.entries(STATE.comments).filter(([k]) => findLead(k))),
    auditLogs: Object.fromEntries(Object.entries(STATE.auditLogs).filter(([k]) => findLead(k))),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `octane-backup-${dateOnly(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Data exported', 'success');
}

function openImportModal() {
  STATE.importBuffer = null;
  const el = document.getElementById('import-validation');
  if (el) el.innerHTML = '';
  const btn = document.getElementById('btn-modal-import-confirm');
  if (btn) btn.disabled = true;
  Modal.open('modal-import');
}
function handleImportFile(file) {
  if (!file.name.endsWith('.json')) { showToast('Please select a .json file', 'error'); return; }
  const r = new FileReader();
  r.onload = (e) => validateImport(e.target.result, file.name);
  r.onerror = () => showToast('Failed to read file', 'error');
  r.readAsText(file);
}
function validateImport(jsonString, filename) {
  let parsed;
  try { parsed = JSON.parse(jsonString); }
  catch (err) { renderImportResult(false, [`Invalid JSON: ${err.message}`]); return; }
  const { valid, errors } = SchemaValidator.validate(parsed);
  const confirmBtn = document.getElementById('btn-modal-import-confirm');
  if (!valid) { renderImportResult(false, errors); STATE.importBuffer = null; if (confirmBtn) confirmBtn.disabled = true; return; }
  STATE.importBuffer = parsed;
  const leadCount = parsed.leads.length;
  const commentCount = Object.values(parsed.comments || {}).flat().length;
  const auditCount = Object.values(parsed.auditLogs || {}).flat().length;
  const userCount = (parsed.users || []).length;
  const el = document.getElementById('import-validation');
  if (el) {
    el.innerHTML = `<div class="surface-card" style="padding: 16px; border-color: var(--ok); background: var(--ok-soft);">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <i class="fa-solid fa-circle-check" style="color: var(--ok); font-size: 14px;" aria-hidden="true"></i>
        <span style="color: var(--ok); font-size: 13px; font-weight: 600;">Validation passed</span>
      </div>
      <div style="font-size: 12px; color: var(--txt-secondary); line-height: 1.6;">
        Ready to import from <strong>${esc(filename)}</strong>:
        <ul style="margin-top: 8px; margin-inline-start: 16px; list-style: disc;">
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
  el.innerHTML = `<div class="surface-card" style="padding: 16px; border-color: var(--danger); background: var(--danger-soft);">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <i class="fa-solid fa-circle-exclamation" style="color: var(--danger); font-size: 14px;" aria-hidden="true"></i>
      <span style="color: var(--danger); font-size: 13px; font-weight: 600;">Validation failed (${errors.length})</span>
    </div>
    <ul style="font-size: 11px; color: var(--danger); max-height: 160px; overflow-y: auto; padding-inline-start: 16px; list-style: disc;">
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
   33 · CANVAS CHART HELPERS
   ============================================================================ */

const CHART_PALETTE = ['#6d8cff', '#8f6dff', '#5fc9e8', '#ffb648', '#ff7a45', '#ff5d5d', '#4ade80', '#a855f7'];
function pickPalette(i) { return CHART_PALETTE[i % CHART_PALETTE.length]; }
function resolveColor(c) {
  if (!c) return '#6d8cff';
  const s = String(c).trim();
  if (s.startsWith('var(')) {
    const m = s.match(/var\(([^)]+)\)/);
    if (m) { const v = cssVar(m[1].trim()); return v || '#6d8cff'; }
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
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, radius); return; }
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
    ctx.fillStyle = txtSecondary;
    ctx.textAlign = 'right';
    let label = String(d.label ?? '');
    const maxLabelW = paddingLeft - 12;
    while (ctx.measureText(label).width > maxLabelW && label.length > 3) label = label.slice(0, -2) + '…';
    ctx.fillText(label, paddingLeft - 10, y + rowH / 2);
    ctx.fillStyle = trackBg;
    roundRectPath(ctx, paddingLeft, barY, trackWidth, barH, barH / 2);
    ctx.fill();
    const color = resolveColor(d.color) || pickPalette(i);
    ctx.fillStyle = color;
    roundRectPath(ctx, paddingLeft, barY, Math.max(barW, 2), barH, barH / 2);
    ctx.fill();
    ctx.fillStyle = txtPrimary;
    ctx.textAlign = 'left';
    ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(money ? formatMoney(value) : String(value), paddingLeft + trackWidth + 10, y + rowH / 2);
  });
}

/* ============================================================================
   34 · LOGIN HANDLERS + IMPERSONATION + TENANT FORM
   ============================================================================ */

async function handleLogin() {
  const tenantId = document.getElementById('login-tenant')?.value;
  const email = (document.getElementById('login-email')?.value || '').trim();
  const password = document.getElementById('login-password')?.value || '';
  const errEl = document.getElementById('login-error');
  if (errEl) { errEl.classList.add('is-hidden'); errEl.textContent = ''; }
  if (!email || !password) {
    if (errEl) { errEl.classList.remove('is-hidden'); errEl.textContent = 'Email and password required'; }
    return;
  }
  const result = await Auth.doLogin(email, password, tenantId);
  if (result.type === 'error') {
    if (errEl) { errEl.classList.remove('is-hidden'); errEl.textContent = result.message; }
    return;
  }
  if (result.type === 'super') await enterSuperAdmin();
  else await enterTenantApp();
}

async function handleDemoLogin() {
  const result = Auth.demoLogin();
  if (!result) { showToast('No tenant available', 'error'); return; }
  await enterTenantApp();
}

async function handleSuperAdminLogin() {
  const email = (document.getElementById('login-email')?.value || '').trim();
  const password = document.getElementById('login-password')?.value || '';
  if (!email || !password) {
    const errEl = document.getElementById('login-error');
    if (errEl) { errEl.classList.remove('is-hidden'); errEl.textContent = 'Enter Super-Admin email & password'; }
    return;
  }
  const result = await Auth.doLogin(email, password, null);
  if (result.type === 'super') await enterSuperAdmin();
  else {
    const errEl = document.getElementById('login-error');
    if (errEl) { errEl.classList.remove('is-hidden'); errEl.textContent = 'Invalid Super-Admin credentials'; }
  }
}

async function handleLogout() {
  await Auth.logout();
  SLAEngine.stop();
  Drawer.closeAll();
  Modal.closeTop();
  document.getElementById('screen-tenant')?.classList.remove('is-active');
  document.getElementById('screen-super-admin')?.classList.remove('is-active');
  document.getElementById('screen-login')?.classList.add('is-active');
  showToast('Signed out', 'info');
}

async function impersonateTenant(tenantId) {
  const tenant = STATE.tenants.find((t) => t.id === tenantId);
  if (!tenant) return;
  const user = STATE.users.find((u) => u.tenantId === tenantId && u.role === 'admin') || STATE.users.find((u) => u.tenantId === tenantId);
  if (!user) { showToast('Tenant has no users yet', 'warning'); return; }
  STATE.impersonating = true;
  STATE.currentTenantId = tenantId;
  STATE.currentUserId = user.id;
  loadTenantSettings();
  await enterTenantApp();
  showToast(`Impersonating "${tenant.name}"`, 'info');
}

async function exitImpersonation() {
  STATE.impersonating = false;
  STATE.currentTenantId = null;
  STATE.currentUserId = null;
  await enterSuperAdmin();
  showToast('Returned to Super-Admin', 'info');
}

async function enterTenantApp() {
  document.getElementById('screen-login')?.classList.remove('is-active');
  document.getElementById('screen-super-admin')?.classList.remove('is-active');
  document.getElementById('screen-tenant')?.classList.add('is-active');
  refreshUserChrome();
  updateHeaderKPIs();
  setSyncStatus('live');
  let startView = 'action-center';
  try {
    const saved = localStorage.getItem('octane8mt_last_view');
    if (saved && VIEW_META[saved]) startView = saved;
  } catch (_) {}
  Router.navigate(startView);
  SLAEngine.start();
}

async function enterSuperAdmin() {
  document.getElementById('screen-login')?.classList.remove('is-active');
  document.getElementById('screen-tenant')?.classList.remove('is-active');
  document.getElementById('screen-super-admin')?.classList.add('is-active');
  updateSuperHeaderKPIs();
  Router.navigateSuper('overview');
  SLAEngine.stop();
}

/* --- Tenant CRUD (Super-Admin) --- */
let _pendingTenantFeatures = {};

function openTenantForm(tenantId = '') {
  const tenant = tenantId ? STATE.tenants.find((t) => t.id === tenantId) : null;
  setText('modal-tenant-form-title', tenant ? `Edit — ${tenant.name}` : 'New Tenant');
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v ?? ''; };
  set('tf-id', tenant?.id || '');
  set('tf-name', tenant?.name || '');
  set('tf-domain', tenant?.slug || '');
  set('tf-tier', tenant?.tier || 'enterprise');
  set('tf-status', tenant?.status || 'active');
  set('tf-seats', tenant?.seats || 10);
  set('tf-mrr', tenant?.monthlyPrice || 299);
  set('tf-admin-name', tenant?.adminName || '');
  set('tf-admin-email', tenant?.adminEmail || '');
  const delBtn = document.getElementById('tf-delete-btn');
  if (delBtn) delBtn.style.display = tenant ? '' : 'none';
  const errEl = document.getElementById('tf-errors');
  if (errEl) { errEl.classList.add('is-hidden'); errEl.textContent = ''; }

  // Feature flags
  const tierKey = tenant?.tier || 'enterprise';
  _pendingTenantFeatures = { ...TIERS[tierKey].features, ...(tenant?.featureOverrides || {}) };
  renderTenantFeaturesGrid();

  Modal.open('modal-tenant-form');
  setTimeout(() => document.getElementById('tf-name')?.focus(), 60);
}

function renderTenantFeaturesGrid() {
  const el = document.getElementById('tf-features');
  if (!el) return;
  el.innerHTML = Object.entries(FEATURE_LABELS).map(([key, label]) => `
    <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; cursor: pointer; padding: 6px; border-radius: 6px; background: var(--bg-surface-2);">
      <input type="checkbox" data-feature="${escAttr(key)}" ${_pendingTenantFeatures[key] ? 'checked' : ''} onchange="toggleTenantFeature('${escAttr(key)}', this.checked)" style="width: 14px; height: 14px;" />
      <span style="flex: 1; min-width: 0;">${esc(label)}</span>
    </label>`).join('');
}

function toggleTenantFeature(key, checkedValue) {
  const el = document.querySelector(`[data-feature="${CSS.escape(key)}"]`);
  const value = checkedValue !== undefined ? checkedValue : (el?.checked ?? false);
  _pendingTenantFeatures[key] = value;
}

async function saveTenantFromForm() {
  const id = document.getElementById('tf-id')?.value || '';
  const name = (document.getElementById('tf-name')?.value || '').trim();
  const slug = (document.getElementById('tf-domain')?.value || '').trim().toLowerCase().replace(/\s+/g, '-');
  const tier = document.getElementById('tf-tier')?.value || 'enterprise';
  const status = document.getElementById('tf-status')?.value || 'active';
  const seats = Sanitize.number(document.getElementById('tf-seats')?.value, 10);
  const monthlyPrice = Sanitize.number(document.getElementById('tf-mrr')?.value, 299);
  const adminName = (document.getElementById('tf-admin-name')?.value || '').trim();
  const adminEmail = (document.getElementById('tf-admin-email')?.value || '').trim();

  const errors = [];
  if (!name) errors.push('Name required');
  if (!slug) errors.push('Slug required');
  if (!/^[a-z0-9-]+$/.test(slug)) errors.push('Slug must be lowercase alphanumeric with hyphens');
  if (!TIERS[tier]) errors.push('Invalid tier');
  const dup = STATE.tenants.find((t) => t.slug === slug && t.id !== id);
  if (dup) errors.push('Slug already used by another tenant');
  const errEl = document.getElementById('tf-errors');
  if (errors.length) {
    if (errEl) { errEl.classList.remove('is-hidden'); errEl.textContent = errors.join(' • '); }
    return;
  }
  if (errEl) { errEl.classList.add('is-hidden'); errEl.textContent = ''; }

  const existing = id ? STATE.tenants.find((t) => t.id === id) : null;
  const tenant = existing ? { ...existing } : {
    id: uid('tnt'), createdAt: nowIso(), featureOverrides: {},
  };
  tenant.name = name;
  tenant.slug = slug;
  tenant.tier = tier;
  tenant.status = status;
  tenant.seats = seats;
  tenant.monthlyPrice = monthlyPrice;
  tenant.adminName = adminName;
  tenant.adminEmail = adminEmail;
  tenant.featureOverrides = { ..._pendingTenantFeatures };
  tenant.updatedAt = nowIso();

  if (existing) {
    const idx = STATE.tenants.findIndex((t) => t.id === existing.id);
    if (idx > -1) STATE.tenants[idx] = tenant;
    showToast(`Updated "${tenant.name}"`, 'success');
  } else {
    STATE.tenants.push(tenant);
    showToast(`Added tenant "${tenant.name}"`, 'success');
  }
  await DB.saveTenant(tenant);
  Modal.close('modal-tenant-form');
  updateSuperHeaderKPIs();
  if (STATE.activeSuperView === 'tenants') SuperModules.Tenants.render();
  else if (STATE.activeSuperView === 'overview') SuperModules.Overview.render();
}

async function deleteTenantFromForm() {
  const id = document.getElementById('tf-id')?.value || '';
  const tenant = STATE.tenants.find((t) => t.id === id);
  if (!tenant) return;
  const ok = await Confirm.ask({ icon: '🗑', title: 'Delete Tenant', message: `Delete "${tenant.name}" and all its data?`, okText: 'Delete' });
  if (!ok) return;
  STATE.tenants = STATE.tenants.filter((t) => t.id !== id);
  STATE.users = STATE.users.filter((u) => u.tenantId !== id);
  STATE.leads = STATE.leads.filter((l) => l.tenantId !== id);
  await DB.deleteTenant(id);
  Modal.close('modal-tenant-form');
  updateSuperHeaderKPIs();
  if (STATE.activeSuperView === 'tenants') SuperModules.Tenants.render();
  showToast(`Deleted "${tenant.name}"`, 'warning');
}

/* ============================================================================
   35 · DEMO SEED
   ============================================================================ */

async function seedDemoData() {
  const tenants = [
    {
      id: uid('tnt'), name: 'Octane Realty', slug: 'octane-realty',
      tier: 'enterprise', status: 'active', seats: 25, monthlyPrice: 799,
      adminName: 'Youssef Hassan', adminEmail: 'youssef@octane.crm',
      featureOverrides: {}, createdAt: nowIso(),
    },
    {
      id: uid('tnt'), name: 'Skyline Properties', slug: 'skyline',
      tier: 'pro', status: 'active', seats: 12, monthlyPrice: 299,
      adminName: 'Omar Khaled', adminEmail: 'omar@skyline.com',
      featureOverrides: {}, createdAt: nowIso(),
    },
    {
      id: uid('tnt'), name: 'Coastal Estates', slug: 'coastal',
      tier: 'starter', status: 'past_due', seats: 5, monthlyPrice: 99,
      adminName: 'Mona Adel', adminEmail: 'mona@coastal.com',
      featureOverrides: {}, createdAt: nowIso(),
    },
  ];
  for (const t of tenants) {
    STATE.tenants.push(t);
    await DB.saveTenant(t);
  }

  const tenant1 = tenants[0];
  const users = [
    { id: uid('usr'), tenantId: tenant1.id, name: 'Youssef Hassan', email: 'youssef@octane.crm', role: 'admin', status: 'active', shift: 'morning', rotationWeight: 0, avatarUrl: '', permissionOverrides: {}, performanceScore: 100, createdAt: nowIso() },
    { id: uid('usr'), tenantId: tenant1.id, name: 'Sara Ahmed', email: 'sara@octane.crm', role: 'team_leader', status: 'active', shift: 'morning', rotationWeight: 30, avatarUrl: '', permissionOverrides: {}, performanceScore: 100, createdAt: nowIso() },
    { id: uid('usr'), tenantId: tenant1.id, name: 'Mohamed Ali', email: 'mohamed@octane.crm', role: 'sales_rep', status: 'active', shift: 'morning', rotationWeight: 25, avatarUrl: '', permissionOverrides: {}, performanceScore: 95, createdAt: nowIso() },
    { id: uid('usr'), tenantId: tenant1.id, name: 'Layla Ibrahim', email: 'layla@octane.crm', role: 'sales_rep', status: 'active', shift: 'evening', rotationWeight: 20, avatarUrl: '', permissionOverrides: {}, performanceScore: 88, createdAt: nowIso() },
  ];
  for (const u of users) { STATE.users.push(u); await DB.saveUser(u); }

  const tenant2 = tenants[1];
  const t2users = [
    { id: uid('usr'), tenantId: tenant2.id, name: 'Omar Khaled', email: 'omar@skyline.com', role: 'admin', status: 'active', shift: 'morning', rotationWeight: 0, avatarUrl: '', permissionOverrides: {}, performanceScore: 100, createdAt: nowIso() },
    { id: uid('usr'), tenantId: tenant2.id, name: 'Hana Samir', email: 'hana@skyline.com', role: 'sales_rep', status: 'active', shift: 'morning', rotationWeight: 20, avatarUrl: '', permissionOverrides: {}, performanceScore: 90, createdAt: nowIso() },
  ];
  for (const u of t2users) { STATE.users.push(u); await DB.saveUser(u); }

  const now = new Date();
  const offsetDays = (d) => { const x = new Date(now); x.setDate(x.getDate() + d); return dateOnly(x); };

  const demoLeads = [
    { name: 'Ahmed Hassan', phone: '+201012345678', email: 'ahmed.hassan@gmail.com', stage: 'Negotiation', agent: 'Youssef Hassan', assignedToId: users[0].id, channel: 'Meta Ads', project: 'Palm Hills', budget: 450000, location: 'Sheikh Zayed', priority: 'urgent', requirements: '3 bedrooms, garden, near school', followUpDate: offsetDays(-1), followUpTime: '14:00' },
    { name: 'Sara Mohamed', phone: '+201198765432', email: 'sara.m@outlook.com', stage: 'Meeting Scheduled', agent: 'Sara Ahmed', assignedToId: users[1].id, channel: 'Referral', project: 'Madinaty', budget: 280000, location: 'New Cairo', priority: 'high', requirements: '2 bedrooms, pool view', followUpDate: offsetDays(0), followUpTime: '16:30' },
    { name: 'Khalid Ibrahim', phone: '+201567890123', email: 'khalid.i@company.com', stage: 'Proposal Sent', agent: 'Mohamed Ali', assignedToId: users[2].id, channel: 'Cold Call', project: 'New Capital Tower', budget: 750000, location: 'NAC', priority: 'high', requirements: 'Office space 200 sqm', followUpDate: offsetDays(1), followUpTime: '11:00' },
    { name: 'Nour Ali', phone: '+201234567890', email: 'nour.ali@mail.com', stage: 'Contacted', agent: 'Layla Ibrahim', assignedToId: users[3].id, channel: 'WhatsApp', project: 'Hyde Park', budget: 320000, location: 'New Cairo', priority: 'medium', requirements: 'Family home, 4 bedrooms', followUpDate: offsetDays(7), followUpTime: '10:00' },
    { name: 'Layla Mansour', phone: '+201111222333', email: '', stage: 'New Lead', agent: '', assignedToId: null, channel: 'Website', project: 'Mountain View', budget: 180000, location: '6th of October', priority: 'low', requirements: '1 bedroom studio', followUpDate: '', followUpTime: '' },
    { name: 'Omar Farouk', phone: '+201444555666', email: 'omar.f@biz.net', stage: 'Won', agent: 'Youssef Hassan', assignedToId: users[0].id, channel: 'Direct', project: 'Palm Hills', budget: 620000, location: 'Sheikh Zayed', priority: 'medium', requirements: 'Villa, 5 bedrooms, pool', followUpDate: '', followUpTime: '' },
    { name: 'Dina Youssef', phone: '+201777888999', email: 'dina.y@gmail.com', stage: 'Lost', agent: 'Sara Ahmed', assignedToId: users[1].id, channel: 'Meta Ads', project: 'Madinaty', budget: 200000, location: 'New Cairo', priority: 'low', requirements: 'Small apartment', followUpDate: '', followUpTime: '' },
  ];

  for (let i = 0; i < demoLeads.length; i++) {
    const d = demoLeads[i];
    const temp = d.priority === 'urgent' || d.priority === 'high' ? 'hot' : d.priority === 'medium' ? 'warm' : 'cold';
    const lead = {
      id: uid('lead'), tenantId: tenant1.id, ...d,
      temperature: temp,
      slaHours: LEAD_TEMP_SLA[temp],
      slaDueAt: d.followUpDate ? parseLocalDate(d.followUpDate, d.followUpTime || '09:00').toISOString() : new Date(now.getTime() + LEAD_TEMP_SLA[temp] * 3600000).toISOString(),
      status: 'active', attempts: 0, score: 0,
      createdAt: new Date(now.getTime() - 86400000 * (i + 1)).toISOString(),
      updatedAt: nowIso(),
    };
    STATE.leads.push(lead);
    await DB.saveLead(lead);
    const aud = {
      id: uid('aud'), tenantId: tenant1.id, leadId: lead.id,
      action: 'lead_created', agent: users[0].name, userId: users[0].id,
      timestamp: nowIso(), meta: { name: lead.name, stage: lead.stage },
    };
    if (!STATE.auditLogs[lead.id]) STATE.auditLogs[lead.id] = [];
    STATE.auditLogs[lead.id].unshift(aud);
    await DB.saveAudit(aud);
  }
}

/* ============================================================================
   36 · BOOT
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

  try { await DB.loadAll(); }
  catch (err) { console.error('[Octane] Load failed:', err); }

  if (STATE.tenants.length === 0) {
    await seedDemoData();
  }

  const saved = await DB.loadSession();
  if (saved) STATE.session = saved;

  if (STATE.session?.mode === 'super') {
    STATE.currentTenantId = null;
    STATE.currentUserId = null;
    await enterSuperAdmin();
  } else if (STATE.session?.mode === 'tenant') {
    STATE.currentTenantId = STATE.session.tenantId;
    STATE.currentUserId = STATE.session.userId;
    if (!getCurrentTenant() || !getCurrentUser()) {
      await Auth.logout();
      STATE.session = null;
    } else {
      loadTenantSettings();
      await enterTenantApp();
    }
  }

  const loginTenantSel = document.getElementById('login-tenant');
  if (loginTenantSel) {
    loginTenantSel.innerHTML = STATE.tenants.map((t) => `<option value="${escAttr(t.id)}">${esc(t.name)} (${esc(t.slug)})</option>`).join('');
  }
  const emailInput = document.getElementById('login-email');
  if (emailInput && !emailInput.value) emailInput.value = Auth.DEMO_ADMIN_EMAIL;

  Confirm.bind();
  installGlobalDelegation();
  Theme.load();
  i18n.load();
  refreshUserChrome();
  updateHeaderKPIs();
  updateSuperHeaderKPIs();
  setSyncStatus('live');

  if (!STATE.session) {
    document.getElementById('screen-login')?.classList.add('is-active');
  }

  setInterval(() => {
    if (STATE.session?.mode === 'tenant') updateHeaderKPIs();
    if (STATE.session?.mode === 'super') updateSuperHeaderKPIs();
  }, 5000);

  const splash = document.getElementById('screen-splash');
  if (splash) splash.classList.remove('is-active');

  STATE.booted = true;
  console.log('[Octane] CRM V8 Multi-Tenant booted ✓');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}