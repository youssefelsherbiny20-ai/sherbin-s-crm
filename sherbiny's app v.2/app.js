/* ============================================================
   YOUSSEF SALES CRM — V2
   Single-file vanilla JS. localStorage persistence.
   ============================================================ */

const STATE_VERSION = 2;
const LS_KEY = "youssef_crm_v2";

/* ── Formatters ─────────────────────────────────────────────── */
const fmtMoney = n => {
  if (n == null || isNaN(n)) return "0 EGP";
  const abs = Math.abs(Math.round(n));
  return (n < 0 ? "-" : "") + abs.toLocaleString("en-EG") + " EGP";
};
const fmtNum = n => Math.round(n || 0).toLocaleString("en-EG");
const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateShort = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
const fmtPct = n => (n * 100).toFixed(1) + "%";
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = d => d ? d.slice(0, 7) : "";
const currentYM = () => todayStr().slice(0, 7);
const addDays = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const addMonths = (d, n) => { const x = new Date(d + "T00:00:00"); x.setMonth(x.getMonth() + n); return x.toISOString().slice(0, 10); };
const addYears = (d, n) => { const x = new Date(d + "T00:00:00"); x.setFullYear(x.getFullYear() + n); return x.toISOString().slice(0, 10); };

/* ── ID Generator ───────────────────────────────────────────── */
function nextId(prefix, counterKey) {
  STATE.counters = STATE.counters || {};
  STATE.counters[counterKey] = (STATE.counters[counterKey] || 0) + 1;
  return `${prefix}-${String(STATE.counters[counterKey]).padStart(4, "0")}`;
}

/* ── Default Settings ───────────────────────────────────────── */
function defaultSettings() {
  return {
    vatRate: 0.14,
    commissionNew: 0.10,
    commissionRenewal: 0.05,
    trainingFee: 500,
    payoutDelayMonths: 2,
    payoutDay: 10,
    monthlyTargets: {},
    defaultMonthlyTarget: 800000,
    callsTarget0Meetings: 40,
    callsTarget1Meeting: 20,
    callsTarget2PlusMeetings: 0,
    tiers: [
      { min: 1, max: 5, pct: 0.06 },
      { min: 6, max: 10, pct: 0.07 },
      { min: 11, max: 20, pct: 0.08 },
      { min: 21, max: 50, pct: 0.09 },
      { min: 51, max: 999999, pct: 0.10 },
    ],
    pricing: {
      CRM: {
        5: { 1: 13000, 2: 19500, 3: 26000 },
        10: { 1: 22000, 2: 33000, 3: 44000 },
        15: { 1: 28000, 2: 42000, 3: 56000 },
        20: { 1: 32000, 2: 48000, 3: 64000 },
        25: { 1: 38000, 2: 57000, 3: 76000 },
        30: { 1: 40000, 2: 60000, 3: 80000 },
        40: { 1: 46000, 2: 69000, 3: 92000 },
        50: { 1: 53000, 2: 79500, 3: 106000 },
        70: { 1: 68000, 2: 102000, 3: 136000 },
        100: { 1: 77000, 2: 115500, 3: 154000 },
      },
      Navi: {
        5: { 1: 18000 }, 10: { 1: 30000 }, 15: { 1: 40500 },
        20: { 1: 54000 }, 25: { 1: 60000 }, 30: { 1: 72000 },
      },
      HR: {}
    }
  };
}

/* ── State load/save/migrate ────────────────────────────────── */
let STATE;

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.version === STATE_VERSION) return parsed;
      // Migration from v1
      if (parsed.version === 1 || parsed.deals) return migrateV1(parsed);
    }
    // Check legacy key
    const legacyRaw = localStorage.getItem("youssef_crm_state_v1");
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      return migrateV1(parsed);
    }
  } catch (e) { console.warn("State load failed:", e); }
  return freshState();
}

function migrateV1(old) {
  const s = freshState();
  s.settings = { ...s.settings, ...(old.settings || {}) };
  // counters will auto-increment for new records; old IDs preserved
  let dealCounter = 0;
  (old.deals || []).forEach(d => {
    const numMatch = d.id && d.id.match(/(\d+)/);
    if (numMatch) dealCounter = Math.max(dealCounter, parseInt(numMatch[1]));
    // Map old deal to new schema
    const bp = d.overridePrice != null ? Number(d.overridePrice) : (priceLookupStatic(s.settings, d.product, d.dealType === "Upgrade" ? Math.max(d.newUsers - d.oldUsers, 0) : d.newUsers, d.duration) || 0);
    const vr = s.settings.vatRate;
    const vat = d.vat ? bp * vr : 0;
    const inv = bp + vat;
    s.deals.push({
      id: d.id, clientId: null, clientName: d.client || "Unknown",
      product: d.product, dealType: d.dealType, stage: d.stage,
      dealDate: d.date || todayStr(),
      oldUsers: d.oldUsers || 0, newUsers: d.newUsers || 0,
      durationYears: d.duration || 1,
      vatApplicable: !!d.vat, vatRate: vr,
      overridePrice: d.overridePrice != null ? Number(d.overridePrice) : null,
      basePrice: bp, vatAmount: vat, invoiceTotal: inv,
      renewalDate: d.date ? addYears(d.date, d.duration || 1) : null,
      notes: d.notes || "",
      commissionPaid: !!d.commissionPaid,
      commissionPaidDate: d.commissionPaidDate || null,
      trainingFeeDeducted: false,
      createdAt: d.date || todayStr(), updatedAt: todayStr()
    });
  });
  s.counters.deals = dealCounter;

  let payCounter = 0;
  (old.payments || []).forEach(p => {
    const numMatch = p.id && p.id.match(/(\d+)/);
    if (numMatch) payCounter = Math.max(payCounter, parseInt(numMatch[1]));
    s.payments.push({
      id: p.id, dealId: p.dealId, milestoneNumber: 1,
      amountDue: Number(p.amountDue) || 0,
      amountPaid: Number(p.amountPaid) || 0,
      dueDate: p.dueDate || todayStr(),
      paidDate: p.paidDate || null,
      method: p.method || "",
      notes: "",
      createdAt: todayStr()
    });
  });
  s.counters.payments = payCounter;

  (old.activity || []).forEach(a => {
    s.activity.push({ id: "A-" + a.date, date: a.date, answeredCalls: a.calls || 0, meetings: a.meetings || 0 });
  });

  s.version = STATE_VERSION;
  return s;
}

function freshState() {
  return {
    version: STATE_VERSION,
    counters: { deals: 0, payments: 0, clients: 0, commissions: 0 },
    settings: defaultSettings(),
    clients: [],
    deals: [],
    payments: [],
    commissions: [],
    activity: [],
    ui: { dealFilters: { stage: "All", product: "All", type: "All", q: "", month: "" } }
  };
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) { toast("Save failed — storage full?"); }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `youssef_crm_backup_${todayStr()}.json`;
  a.click();
  toast("Backup exported");
}

function importBackup() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json";
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.deals && !parsed.version) { toast("Invalid backup file"); return; }
        STATE = parsed.version === STATE_VERSION ? parsed : migrateV1(parsed);
        save();
        renderRoute();
        toast("Backup imported successfully");
      } catch (err) { toast("Import failed — invalid file"); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

function resetToDemo() {
  if (!confirm("⚠️ This will ERASE all your data and load demo data. Are you sure?")) return;
  if (!confirm("Last chance — all real data will be deleted. Confirm?")) return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem("youssef_crm_state_v1");
  STATE = freshState();
  buildDemoData();
  save();
  renderRoute();
  toast("Demo data loaded");
}

/* ── Pricing lookup ─────────────────────────────────────────── */
function priceLookupStatic(settings, product, users, duration) {
  const table = (settings.pricing || {})[product] || {};
  const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!tiers.length) return null;
  const u = table[users] ? users : tiers.reduce((a, b) => Math.abs(b - users) < Math.abs(a - users) ? b : a);
  const row = table[u];
  if (!row) return null;
  return row[duration] || row[1] || null;
}

function priceLookup(product, users, duration) {
  return priceLookupStatic(STATE.settings, product, users, duration);
}

/* ── Financial Calculations (single source of truth) ────────── */
function calcDeal(deal) {
  const usersForPrice = deal.dealType === "Upgrade" ? Math.max((deal.newUsers || 0) - (deal.oldUsers || 0), 0) : (deal.newUsers || 0);
  const auto = priceLookup(deal.product, usersForPrice, deal.durationYears || 1);
  const base = deal.overridePrice != null ? Number(deal.overridePrice) : (auto || 0);
  const vr = deal.vatRate != null ? deal.vatRate : STATE.settings.vatRate;
  const vat = deal.vatApplicable ? base * vr : 0;
  const inv = base + vat;
  return { basePrice: base, vatAmount: vat, invoiceTotal: inv, usersForPrice };
}

function dealPayments(dealId) {
  return STATE.payments.filter(p => p.dealId === dealId);
}

function collectedForDeal(dealId) {
  return dealPayments(dealId).reduce((s, p) => s + (Number(p.amountPaid) || 0), 0);
}

function outstandingForDeal(deal) {
  const calc = calcDeal(deal);
  return Math.max(calc.invoiceTotal - collectedForDeal(deal.id), 0);
}

function paymentStatus(p) {
  const due = Number(p.amountDue) || 0;
  const paid = Number(p.amountPaid) || 0;
  if (paid >= due && due > 0) return "Collected";
  if (paid > 0 && paid < due) return "Partially Paid";
  if (!p.paidDate && p.dueDate < todayStr()) return "Overdue";
  if (!p.paidDate && p.dueDate === todayStr()) return "Due";
  if (!p.paidDate && p.dueDate > todayStr()) return "Pending";
  return "Pending";
}

function collectionStatusForDeal(deal) {
  if (deal.stage !== "Won") return "—";
  const inv = calcDeal(deal).invoiceTotal;
  const coll = collectedForDeal(deal.id);
  if (coll <= 0) {
    const ps = dealPayments(deal.id);
    if (ps.some(p => paymentStatus(p) === "Overdue")) return "Overdue";
    return "Due";
  }
  if (Math.abs(inv - coll) < 1) return "Collected";
  if (dealPayments(deal.id).some(p => paymentStatus(p) === "Overdue")) return "Overdue";
  return "Partial";
}

function commissionRateForDeal(deal) {
  const s = STATE.settings;
  if (deal.dealType === "New Deal") return s.commissionNew;
  if (deal.dealType === "Renewal") return s.commissionRenewal;
  if (deal.dealType === "Upgrade") {
    const added = Math.max((deal.newUsers || 0) - (deal.oldUsers || 0), 0);
    const tier = s.tiers.find(t => added >= t.min && added <= t.max);
    return tier ? tier.pct : s.commissionNew;
  }
  return s.commissionNew;
}

// Returns commission breakdown per payment for a deal
function commissionBreakdownForDeal(deal) {
  const rate = commissionRateForDeal(deal);
  const s = STATE.settings;
  const isNew = deal.dealType === "New Deal";
  const fee = isNew ? s.trainingFee : 0;
  const payments = dealPayments(deal.id)
    .filter(p => p.paidDate && Number(p.amountPaid) > 0)
    .sort((a, b) => a.paidDate.localeCompare(b.paidDate));

  let feeRemaining = fee;
  let firstDone = false;
  return payments.map(p => {
    const gross = Number(p.amountPaid) * rate;
    let deduction = 0;
    if (!firstDone && isNew) {
      deduction = Math.min(feeRemaining, gross);
      feeRemaining -= deduction;
      firstDone = true;
    }
    const net = Math.max(gross - deduction, 0);
    const earnedDate = p.paidDate;
    const paidDateObj = new Date(p.paidDate + "T00:00:00");
    const payoutDate = new Date(paidDateObj.getFullYear(), paidDateObj.getMonth() + s.payoutDelayMonths, s.payoutDay);
    const expectedPayout = payoutDate.toISOString().slice(0, 10);
    const now = todayStr();
    let payoutStatus = "Locked";
    if (deal.commissionPaid) payoutStatus = "Paid";
    else if (expectedPayout <= now) payoutStatus = "Available";
    return {
      paymentId: p.id, paidDate: p.paidDate, collectedAmount: Number(p.amountPaid),
      rate, grossCommission: gross, trainingFeeDeduction: deduction,
      netCommission: net, earnedDate, expectedPayoutDate: expectedPayout, payoutStatus
    };
  });
}

function totalCommissionForDeal(deal) {
  return commissionBreakdownForDeal(deal).reduce((s, c) => s + c.netCommission, 0);
}

function renewalDate(deal) {
  if (!deal.dealDate || !deal.durationYears) return null;
  return addYears(deal.dealDate, deal.durationYears);
}

/* ── Demo Data ──────────────────────────────────────────────── */
function buildDemoData() {
  const today = todayStr();
  const clientNames = [
    "Nile Retail Group", "Cairo Fintech Co", "Delta Logistics", "Alexandria Motors",
    "Giza HealthCare", "Red Sea Hospitality", "Sphinx Manufacturing", "Luxor Education Group",
    "Zamalek Media House", "October Real Estate", "Nasr City Retail", "Mansoura Trading"
  ];

  // Create clients
  clientNames.forEach(name => {
    const cid = nextId("C", "clients");
    STATE.clients.push({ id: cid, name, phone: "", email: "", company: name, notes: "", createdAt: today, updatedAt: today });
  });

  function getClientId(name) {
    const c = STATE.clients.find(c => c.name === name);
    return c ? c.id : null;
  }

  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  const scenarios = [
    // Won deals with various payment structures
    { client: "Nile Retail Group", product: "CRM", dealType: "New Deal", stage: "Won", newUsers: 20, durationYears: 2, vat: true, daysAgo: 65, plan: "full", paidPct: 1.0 },
    { client: "Cairo Fintech Co", product: "CRM", dealType: "New Deal", stage: "Won", newUsers: 10, durationYears: 1, vat: true, daysAgo: 55, plan: "50-50", paidPct: 0.5, secondPaidDaysAgo: 10 },
    { client: "Delta Logistics", product: "Navi", dealType: "New Deal", stage: "Won", newUsers: 15, durationYears: 1, vat: true, daysAgo: 40, plan: "full", paidPct: 1.0 },
    { client: "Alexandria Motors", product: "CRM", dealType: "Renewal", stage: "Won", newUsers: 30, durationYears: 1, vat: true, daysAgo: 30, plan: "50-50", paidPct: 0.5, secondPaidDaysAgo: null },
    { client: "Giza HealthCare", product: "HR", dealType: "New Deal", stage: "Won", newUsers: 25, durationYears: 1, vat: false, daysAgo: 25, plan: "3-inst", paidPct: 0.33, override: 22500 },
    { client: "Red Sea Hospitality", product: "CRM", dealType: "Upgrade", stage: "Won", oldUsers: 10, newUsers: 20, durationYears: 1, vat: true, daysAgo: 20, plan: "full", paidPct: 1.0 },
    { client: "Sphinx Manufacturing", product: "Navi", dealType: "Renewal", stage: "Won", newUsers: 10, durationYears: 1, vat: true, daysAgo: 15, plan: "full", paidPct: 0 },
    { client: "Luxor Education Group", product: "CRM", dealType: "New Deal", stage: "Won", newUsers: 50, durationYears: 3, vat: true, daysAgo: 70, plan: "3-inst", paidPct: 1.0 },
    { client: "Zamalek Media House", product: "CRM", dealType: "New Deal", stage: "Won", newUsers: 5, durationYears: 1, vat: true, daysAgo: 10, plan: "50-50", paidPct: 0 },
    { client: "October Real Estate", product: "Navi", dealType: "New Deal", stage: "Won", newUsers: 20, durationYears: 1, vat: true, daysAgo: 5, plan: "full", paidPct: 0 },
    // Pipeline deals
    { client: "Nasr City Retail", product: "CRM", dealType: "New Deal", stage: "New", newUsers: 15, durationYears: 1, vat: true, daysAgo: 3 },
    { client: "Mansoura Trading", product: "CRM", dealType: "New Deal", stage: "Qualified", newUsers: 20, durationYears: 2, vat: true, daysAgo: 7 },
    { client: "Nile Retail Group", product: "HR", dealType: "New Deal", stage: "Meeting", newUsers: 30, durationYears: 1, vat: false, daysAgo: 5, override: 27000 },
    { client: "Cairo Fintech Co", product: "CRM", dealType: "Upgrade", stage: "Negotiation", oldUsers: 10, newUsers: 25, durationYears: 1, vat: true, daysAgo: 2 },
    { client: "Delta Logistics", product: "Navi", dealType: "Renewal", stage: "Meeting", newUsers: 15, durationYears: 1, vat: true, daysAgo: 4 },
  ];

  scenarios.forEach(sc => {
    const dealDate = addDays(today, -(sc.daysAgo || 0));
    const cid = getClientId(sc.client);
    const uForPrice = sc.dealType === "Upgrade" ? Math.max((sc.newUsers || 0) - (sc.oldUsers || 0), 0) : (sc.newUsers || 0);
    const auto = priceLookup(sc.product, uForPrice, sc.durationYears || 1);
    const base = sc.override != null ? sc.override : (auto || 0);
    const vr = STATE.settings.vatRate;
    const vat = sc.vat ? base * vr : 0;
    const inv = base + vat;
    const did = nextId("D", "deals");

    STATE.deals.push({
      id: did, clientId: cid, clientName: sc.client,
      product: sc.product, dealType: sc.dealType, stage: sc.stage,
      dealDate, oldUsers: sc.oldUsers || 0, newUsers: sc.newUsers || 0,
      durationYears: sc.durationYears || 1,
      vatApplicable: !!sc.vat, vatRate: vr,
      overridePrice: sc.override != null ? sc.override : null,
      basePrice: base, vatAmount: vat, invoiceTotal: inv,
      renewalDate: sc.stage === "Won" ? addYears(dealDate, sc.durationYears || 1) : null,
      notes: "", commissionPaid: false, commissionPaidDate: null,
      createdAt: dealDate, updatedAt: today
    });

    if (sc.stage !== "Won" || !sc.plan) return;

    // Build payment milestones
    const milestones = [];
    if (sc.plan === "full") {
      milestones.push({ pct: 1.0, dueOffset: 15 });
    } else if (sc.plan === "50-50") {
      milestones.push({ pct: 0.5, dueOffset: 15 }, { pct: 0.5, dueOffset: 45 });
    } else if (sc.plan === "3-inst") {
      milestones.push({ pct: 0.34, dueOffset: 15 }, { pct: 0.33, dueOffset: 45 }, { pct: 0.33, dueOffset: 75 });
    }

    milestones.forEach((m, i) => {
      const pid = nextId("P", "payments");
      const due = addDays(dealDate, m.dueOffset);
      const amtDue = Math.round(inv * m.pct);
      let amtPaid = 0, paidDate = null;
      const isFirstPaid = sc.paidPct > 0 && i === 0;
      const isSecondPaid = sc.plan === "50-50" && i === 1 && sc.secondPaidDaysAgo != null;
      const isFullPaid = sc.paidPct >= 1.0;

      if (sc.plan === "3-inst") {
        if (sc.paidPct >= 1.0 && new Date(due + "T00:00:00") <= new Date()) {
          amtPaid = amtDue; paidDate = addDays(due, 2);
        } else if (i === 0 && sc.paidPct >= 0.33) {
          amtPaid = amtDue; paidDate = addDays(due, 2);
        }
      } else if (isFullPaid) {
        if (new Date(due + "T00:00:00") <= new Date()) {
          amtPaid = amtDue; paidDate = addDays(due, sc.paidPct > 0 ? 2 : 5);
        }
      } else if (isFirstPaid && i === 0) {
        amtPaid = amtDue; paidDate = addDays(due, 3);
      } else if (isSecondPaid && i === 1) {
        amtPaid = amtDue; paidDate = addDays(today, -sc.secondPaidDaysAgo);
      }

      STATE.payments.push({
        id: pid, dealId: did, milestoneNumber: i + 1,
        amountDue: amtDue, amountPaid: amtPaid,
        dueDate: due, paidDate, method: amtPaid > 0 ? "Bank Transfer" : "",
        notes: "", createdAt: dealDate
      });
    });
  });

  // Activity log — last 30 days
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    const isWeekend = [0, 6].includes(new Date(d + "T00:00:00").getDay());
    STATE.activity.push({
      id: "A-" + d, date: d,
      answeredCalls: isWeekend ? Math.floor(Math.random() * 10) : 25 + Math.floor(Math.random() * 20),
      meetings: isWeekend ? 0 : Math.floor(Math.random() * 4)
    });
  }
}

STATE = loadState();
if (!STATE.deals.length && !STATE.clients.length) {
  buildDemoData();
  save();
}

/* ── Toast ──────────────────────────────────────────────────── */
function toast(msg, type = "info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show " + type;
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ── Router ─────────────────────────────────────────────────── */
const ROUTES = [
  { id: "home", label: "Home", icon: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6h1a1 1 0 00.707-1.707l-7-7z"/></svg>` },
  { id: "deals", label: "Deals", icon: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>` },
  { id: "clients", label: "Clients", icon: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z"/></svg>` },
  { id: "collections", label: "Collections", icon: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"/></svg>` },
  { id: "commission", label: "Commission", icon: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg>` },
  { id: "activity", label: "Activity", icon: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clip-rule="evenodd"/></svg>` },
  { id: "settings", label: "Settings", icon: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>` },
];

function buildNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = ROUTES.map(r =>
    `<a data-route="${r.id}" href="#/${r.id}" title="${r.label}">
      <span class="nav-icon">${r.icon}</span>
      <span class="nav-lbl">${r.label}</span>
    </a>`
  ).join("");
}

function currentRoute() {
  const h = location.hash.replace("#/", "");
  return ROUTES.find(r => r.id === h) ? h : "home";
}

function renderRoute() {
  const r = currentRoute();
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.dataset.route === r));
  const map = { home: renderHome, deals: renderDeals, clients: renderClients, collections: renderCollections, commission: renderCommission, activity: renderActivity, settings: renderSettings };
  (map[r] || renderHome)();
}
window.addEventListener("hashchange", renderRoute);

/* ── SVG Mini Charts ────────────────────────────────────────── */
function sparkBar(values, width = 200, height = 50, color = "var(--accent)") {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const bw = Math.floor(width / values.length) - 2;
  const bars = values.map((v, i) => {
    const h = Math.max((v / max) * height, 2);
    const x = i * (bw + 2);
    const y = height - h;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="2" fill="${color}" opacity="0.85"/>`;
  }).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars}</svg>`;
}

function lineChart(datasets, labels, width = 500, height = 160) {
  if (!datasets.length || !datasets[0].values.length) return '<p style="color:var(--muted); font-size:12px; text-align:center; padding:20px;">No data</p>';
  const allVals = datasets.flatMap(d => d.values);
  const max = Math.max(...allVals, 1);
  const n = datasets[0].values.length;
  const padL = 60, padR = 16, padT = 16, padB = 36;
  const cw = width - padL - padR, ch = height - padT - padB;

  const xPos = (i) => padL + (n > 1 ? (i / (n - 1)) * cw : cw / 2);
  const yPos = (v) => padT + ch - (v / max) * ch;

  let svg = `<svg width="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible">`;

  // Grid lines
  [0, 0.25, 0.5, 0.75, 1].forEach(pct => {
    const y = padT + ch * (1 - pct);
    const val = max * pct;
    svg += `<line x1="${padL}" y1="${y}" x2="${padL + cw}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>`;
    svg += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" fill="var(--muted)" font-size="10">${fmtNum(val)}</text>`;
  });

  // Labels
  const step = Math.max(1, Math.floor(n / 6));
  labels.forEach((l, i) => {
    if (i % step === 0 || i === n - 1) {
      svg += `<text x="${xPos(i)}" y="${padT + ch + 20}" text-anchor="middle" fill="var(--muted)" font-size="10">${l}</text>`;
    }
  });

  // Lines + areas
  datasets.forEach(ds => {
    if (!ds.values.length) return;
    const pts = ds.values.map((v, i) => `${xPos(i)},${yPos(v)}`).join(" ");
    const areaBottom = `${xPos(n-1)},${padT+ch} ${xPos(0)},${padT+ch}`;
    svg += `<polyline points="${pts}" fill="none" stroke="${ds.color}" stroke-width="2" stroke-linejoin="round"/>`;
    svg += `<polygon points="${pts} ${areaBottom}" fill="${ds.color}" opacity="0.08"/>`;
    ds.values.forEach((v, i) => {
      if (i === 0 || i === n - 1 || v === Math.max(...ds.values)) {
        svg += `<circle cx="${xPos(i)}" cy="${yPos(v)}" r="3" fill="${ds.color}"/>`;
      }
    });
  });

  svg += `</svg>`;
  return svg;
}

function donutChart(segments, size = 100) {
  // segments: [{value, color, label}]
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return `<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2-8}" fill="none" stroke="var(--border)" stroke-width="12"/></svg>`;
  const cx = size / 2, cy = size / 2, r = size / 2 - 10;
  let angle = -Math.PI / 2;
  let paths = "";
  segments.forEach(seg => {
    if (!seg.value) return;
    const sweep = (seg.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${seg.color}" opacity="0.9"/>`;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}<circle cx="${cx}" cy="${cy}" r="${r*0.55}" fill="var(--panel)"/></svg>`;
}

/* ── HOME ───────────────────────────────────────────────────── */
let homeDashMonth = currentYM();

function renderHome() {
  const main = document.getElementById("main");
  const ym = homeDashMonth;
  const s = STATE.settings;
  const won = STATE.deals.filter(d => d.stage === "Won");
  const target = (s.monthlyTargets && s.monthlyTargets[ym]) || s.defaultMonthlyTarget;

  // Sales = invoiceTotal of deals closed this month
  const monthDeals = won.filter(d => monthKey(d.dealDate) === ym);
  const sales = monthDeals.reduce((sum, d) => sum + calcDeal(d).invoiceTotal, 0);

  // Collected = payments with paidDate in this month
  const collectedThisMonth = STATE.payments
    .filter(p => p.paidDate && monthKey(p.paidDate) === ym)
    .reduce((s2, p) => s2 + (Number(p.amountPaid) || 0), 0);

  const totalOutstanding = won.reduce((sum, d) => sum + outstandingForDeal(d), 0);

  // Commission for this month's collections
  const commThisMonth = won.reduce((sum, d) => {
    const breakdown = commissionBreakdownForDeal(d);
    return sum + breakdown.filter(c => c.paidDate && monthKey(c.paidDate) === ym).reduce((s2, c) => s2 + c.netCommission, 0);
  }, 0);

  const achievement = target ? sales / target : 0;
  const remaining = Math.max(target - sales, 0);

  // Today's activity
  const todayAct = STATE.activity.find(a => a.date === todayStr()) || { answeredCalls: 0, meetings: 0 };
  const dealsToday = STATE.deals.filter(d => d.dealDate === todayStr()).length;

  // Daily KPI score
  const callsNeeded = todayAct.meetings >= 2 ? 0 : todayAct.meetings === 1 ? s.callsTarget1Meeting : s.callsTarget0Meetings;
  let actScore = 100;
  if (callsNeeded > 0) actScore = Math.min(100, Math.round((todayAct.answeredCalls / callsNeeded) * 100));
  if (todayAct.meetings >= 2) actScore = 100;

  // Action center
  const overduePays = STATE.payments.filter(p => paymentStatus(p) === "Overdue").slice(0, 5);
  const dueSoon = STATE.payments.filter(p => {
    const st = paymentStatus(p);
    return (st === "Pending" || st === "Due") && p.dueDate <= addDays(todayStr(), 7) && p.dueDate >= todayStr();
  });
  const dueSoonAmt = dueSoon.reduce((s2, p) => s2 + (Number(p.amountDue) - Number(p.amountPaid || 0)), 0);

  // Upcoming renewals
  const renewals30 = won.filter(d => {
    const rd = renewalDate(d);
    return rd && rd >= todayStr() && rd <= addDays(todayStr(), 30);
  });
  const renewals60 = won.filter(d => {
    const rd = renewalDate(d);
    return rd && rd > addDays(todayStr(), 30) && rd <= addDays(todayStr(), 60);
  });

  // Commission available
  const allBreakdowns = won.flatMap(d => commissionBreakdownForDeal(d));
  const commAvailable = allBreakdowns.filter(c => c.payoutStatus === "Available").reduce((s2, c) => s2 + c.netCommission, 0);
  const commLocked = allBreakdowns.filter(c => c.payoutStatus === "Locked").reduce((s2, c) => s2 + c.netCommission, 0);

  // Pipeline
  const stageColors = { New: "#6366f1", Qualified: "#0ea5e9", Meeting: "#a78bfa", Negotiation: "#f59e0b", Won: "#10b981", Collected: "#16a34a" };
  const stages = ["New", "Qualified", "Meeting", "Negotiation", "Won"];
  const pipelineHtml = stages.map(st => {
    const ds = STATE.deals.filter(d => d.stage === st);
    const v = ds.reduce((s2, d) => s2 + calcDeal(d).invoiceTotal, 0);
    return `<div class="pipe-stage" style="--stage-c:${stageColors[st]}">
      <div class="ps-n">${ds.length}</div>
      <div class="ps-l">${st}</div>
      <div class="ps-v">${fmtNum(v)}</div>
    </div>`;
  }).join("");

  // Month selector
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const k = d.toISOString().slice(0, 7);
    const lbl = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    months.push({ k, lbl });
  }

  // Charts data — last 6 months
  const chartMonths = months.map(m => m.k);
  const chartLabels = months.map(m => m.lbl);
  const salesByMonth = chartMonths.map(m => won.filter(d => monthKey(d.dealDate) === m).reduce((s2, d) => s2 + calcDeal(d).invoiceTotal, 0));
  const collByMonth = chartMonths.map(m => STATE.payments.filter(p => p.paidDate && monthKey(p.paidDate) === m).reduce((s2, p) => s2 + (Number(p.amountPaid) || 0), 0));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${greeting}, Youssef 👋</h1>
        <p>Sales OS — Personal CRM</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <select id="dashMonth" onchange="homeDashMonth=this.value;renderHome()">
          ${months.map(m => `<option value="${m.k}" ${m.k === ym ? "selected" : ""}>${m.lbl}</option>`).join("")}
        </select>
        <button class="btn primary" onclick="openDealForm()">+ New Deal</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card accent-gold">
        <div class="kc-label">Sales (${months.find(m=>m.k===ym)?.lbl||ym})</div>
        <div class="kc-val">${fmtMoney(sales)}</div>
        <div class="kc-sub">${monthDeals.length} deal(s) closed</div>
      </div>
      <div class="kpi-card accent-green">
        <div class="kc-label">Collected</div>
        <div class="kc-val">${fmtMoney(collectedThisMonth)}</div>
        <div class="kc-sub">cash in hand this month</div>
      </div>
      <div class="kpi-card accent-red">
        <div class="kc-label">Total Outstanding</div>
        <div class="kc-val">${fmtMoney(totalOutstanding)}</div>
        <div class="kc-sub">across all active deals</div>
      </div>
      <div class="kpi-card accent-teal">
        <div class="kc-label">Commission Earned</div>
        <div class="kc-val">${fmtMoney(commThisMonth)}</div>
        <div class="kc-sub">from this month's collections</div>
      </div>
    </div>

    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3>Target Achievement <small>${fmtMoney(target)} target</small></h3>
        <span style="font-size:22px;font-weight:700;color:${achievement >= 1 ? 'var(--green)' : 'var(--gold)'}">${fmtPct(achievement)}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${Math.min(achievement * 100, 100)}%;background:${achievement >= 1 ? 'var(--green)' : 'var(--gold)'}"></div>
      </div>
      <div class="prog-meta">
        <span>${fmtMoney(sales)} achieved</span>
        <span>${achievement < 1 ? fmtMoney(remaining) + ' remaining' : '🎯 Target hit!'}</span>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <h3>Today</h3>
        <div class="today-grid">
          <div class="today-stat">
            <div class="ts-val">${todayAct.answeredCalls}</div>
            <div class="ts-lbl">Calls${callsNeeded > 0 ? ` / ${callsNeeded}` : ''}</div>
          </div>
          <div class="today-stat">
            <div class="ts-val">${todayAct.meetings}</div>
            <div class="ts-lbl">Meetings</div>
          </div>
          <div class="today-stat">
            <div class="ts-val">${dealsToday}</div>
            <div class="ts-lbl">Deals</div>
          </div>
          <div class="today-stat">
            <div class="ts-val ${actScore >= 100 ? 'green' : actScore >= 60 ? 'gold' : 'red'}">${actScore}%</div>
            <div class="ts-lbl">Daily Score</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn small" onclick="quickLog('call')">+1 Call</button>
          <button class="btn small secondary" onclick="quickLog('meeting')">+1 Meeting</button>
        </div>
      </div>
      <div class="panel">
        <h3>Commission Vault</h3>
        <div class="vault-row"><span class="vault-dot locked"></span><span>Locked</span><b>${fmtMoney(commLocked)}</b></div>
        <div class="vault-row"><span class="vault-dot available"></span><span>Available</span><b>${fmtMoney(commAvailable)}</b></div>
        <div class="vault-row" style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;"><span></span><span style="font-weight:600;">Total Pending</span><b style="color:var(--gold)">${fmtMoney(commLocked + commAvailable)}</b></div>
        ${commAvailable > 0 ? `<div class="alert-pill green" style="margin-top:10px;">💰 ${fmtMoney(commAvailable)} ready to claim</div>` : ""}
      </div>
    </div>

    <div class="panel">
      <h3>Action Center</h3>
      <div class="action-list">
        ${overduePays.length ? overduePays.map(p => {
          const d = STATE.deals.find(x => x.id === p.dealId);
          return `<div class="action-item overdue" onclick="location.hash='#/collections'">
            <span class="ai-dot red"></span>
            <div class="ai-txt">Overdue payment — <b>${d ? d.clientName : "?"}</b> — ${fmtMoney(Number(p.amountDue) - Number(p.amountPaid || 0))} due ${fmtDateShort(p.dueDate)}</div>
            <span class="ai-arrow">›</span>
          </div>`;
        }).join("") : `<div class="action-item"><span class="ai-dot green"></span><div class="ai-txt">No overdue payments ✓</div></div>`}
        ${dueSoon.length ? `<div class="action-item" onclick="location.hash='#/collections'">
          <span class="ai-dot amber"></span>
          <div class="ai-txt"><b>${dueSoon.length}</b> payment(s) due in 7 days — ${fmtMoney(dueSoonAmt)}</div>
          <span class="ai-arrow">›</span>
        </div>` : ""}
        ${renewals30.length ? renewals30.map(d => `<div class="action-item" onclick="openDealDetail('${d.id}')">
          <span class="ai-dot amber"></span>
          <div class="ai-txt">Renewal in 30 days — <b>${d.clientName}</b> — ${d.product} expires ${fmtDateShort(renewalDate(d))}</div>
          <span class="ai-arrow">›</span>
        </div>`).join("") : ""}
        ${renewals60.length ? `<div class="action-item">
          <span class="ai-dot teal"></span>
          <div class="ai-txt"><b>${renewals60.length}</b> renewal(s) in 60 days</div>
        </div>` : ""}
        ${commAvailable > 0 ? `<div class="action-item" onclick="location.hash='#/commission'">
          <span class="ai-dot green"></span>
          <div class="ai-txt">Commission available — <b>${fmtMoney(commAvailable)}</b> ready for payout</div>
          <span class="ai-arrow">›</span>
        </div>` : ""}
        ${STATE.deals.filter(d => d.stage === "Meeting").length ? `<div class="action-item" onclick="location.hash='#/deals'">
          <span class="ai-dot teal"></span>
          <div class="ai-txt"><b>${STATE.deals.filter(d => d.stage === "Meeting").length}</b> deal(s) in Meeting stage</div>
          <span class="ai-arrow">›</span>
        </div>` : ""}
      </div>
    </div>

    <div class="panel">
      <h3>Pipeline</h3>
      <div class="pipeline">${pipelineHtml}</div>
    </div>

    <div class="panel">
      <h3>Sales vs Collections — 6 Months</h3>
      ${lineChart([
        { values: salesByMonth, color: "#f59e0b", label: "Sales" },
        { values: collByMonth, color: "#10b981", label: "Collected" }
      ], chartLabels)}
      <div style="display:flex;gap:16px;margin-top:8px;font-size:12px;">
        <span><span style="color:#f59e0b">●</span> Sales</span>
        <span><span style="color:#10b981">●</span> Collected</span>
      </div>
    </div>
  `;
}

function quickLog(type) {
  let row = STATE.activity.find(a => a.date === todayStr());
  if (!row) {
    row = { id: "A-" + todayStr(), date: todayStr(), answeredCalls: 0, meetings: 0 };
    STATE.activity.push(row);
  }
  if (type === "call") { row.answeredCalls++; toast(`Calls: ${row.answeredCalls}`); }
  else { row.meetings++; toast(`Meetings: ${row.meetings}`); }
  save(); renderRoute();
}

/* ── DEALS ──────────────────────────────────────────────────── */
function renderDeals() {
  const main = document.getElementById("main");
  const f = STATE.ui.dealFilters;
  const stages = ["All", "New", "Qualified", "Meeting", "Negotiation", "Won"];
  const products = ["All", "CRM", "Navi", "HR"];
  const types = ["All", "New Deal", "Renewal", "Upgrade"];
  const months = ["All"];
  const allMonths = [...new Set(STATE.deals.map(d => monthKey(d.dealDate)).filter(Boolean))].sort().reverse();
  allMonths.forEach(m => months.push(m));

  main.innerHTML = `
    <div class="page-head">
      <div><h1>Deals</h1><p>${STATE.deals.length} total deals</p></div>
      <button class="btn primary" onclick="openDealForm()">+ New Deal</button>
    </div>
    <div class="filter-bar">
      <input id="dealSearch" type="text" placeholder="Search client or ID…" value="${f.q}" oninput="STATE.ui.dealFilters.q=this.value;renderDealCards()">
      <select id="stageFilter" onchange="STATE.ui.dealFilters.stage=this.value;renderDealCards()">
        ${stages.map(s => `<option ${s === f.stage ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <select id="productFilter" onchange="STATE.ui.dealFilters.product=this.value;renderDealCards()">
        ${products.map(s => `<option ${s === f.product ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <select id="typeFilter" onchange="STATE.ui.dealFilters.type=this.value;renderDealCards()">
        ${types.map(s => `<option ${s === f.type ? "selected" : ""}>${s}</option>`).join("")}
      </select>
      <select id="monthFilter" onchange="STATE.ui.dealFilters.month=this.value;renderDealCards()">
        ${months.map(m => `<option value="${m === "All" ? "" : m}" ${(m === "All" && !f.month) || m === f.month ? "selected" : ""}>${m === "All" ? "All months" : m}</option>`).join("")}
      </select>
    </div>
    <div class="deal-list" id="dealCards"></div>
  `;
  renderDealCards();
}

function renderDealCards() {
  const el = document.getElementById("dealCards");
  if (!el) return;
  const f = STATE.ui.dealFilters;
  let list = STATE.deals.slice().sort((a, b) => b.dealDate.localeCompare(a.dealDate));
  if (f.stage !== "All") list = list.filter(d => d.stage === f.stage);
  if (f.product !== "All") list = list.filter(d => d.product === f.product);
  if (f.type !== "All") list = list.filter(d => d.dealType === f.type);
  if (f.month) list = list.filter(d => monthKey(d.dealDate) === f.month);
  if (f.q) list = list.filter(d => d.clientName.toLowerCase().includes(f.q.toLowerCase()) || d.id.toLowerCase().includes(f.q.toLowerCase()));

  if (!list.length) { el.innerHTML = `<div class="empty-state">No deals match your filters.</div>`; return; }

  const statusBadge = (deal) => {
    if (deal.stage !== "Won") return `<span class="badge stage">${deal.stage}</span>`;
    const st = collectionStatusForDeal(deal);
    const cls = { Collected: "paid", Overdue: "overdue", Partial: "partial", Due: "due" }[st] || "due";
    return `<span class="badge ${cls}">${st}</span>`;
  };

  el.innerHTML = list.map(d => {
    const calc = calcDeal(d);
    const coll = collectedForDeal(d.id);
    const out = outstandingForDeal(d);
    const comm = d.stage === "Won" ? totalCommissionForDeal(d) : 0;
    const ps = dealPayments(d.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const nextDue = d.stage === "Won" ? ps.filter(p => paymentStatus(p) !== "Collected").map(p => p.dueDate).sort()[0] : null;

    return `<div class="deal-card" onclick="openDealDetail('${d.id}')">
      <div class="dc-head">
        <div>
          <div class="dc-id">${d.id}</div>
          <div class="dc-client">${d.clientName}</div>
          <div class="dc-tag">${d.product} · ${d.dealType} · ${d.newUsers} users${d.dealType === "Upgrade" ? ` (from ${d.oldUsers})` : ""}</div>
        </div>
        ${statusBadge(d)}
      </div>
      ${d.stage === "Won" ? `
        <div class="dc-financials">
          <div class="dc-fin-item"><span>Net</span><b>${fmtMoney(calc.basePrice)}</b></div>
          <div class="dc-fin-item"><span>VAT</span><b>${fmtMoney(calc.vatAmount)}</b></div>
          <div class="dc-fin-item"><span>Invoice</span><b>${fmtMoney(calc.invoiceTotal)}</b></div>
          <div class="dc-fin-item"><span>Collected</span><b style="color:var(--green)">${fmtMoney(coll)}</b></div>
          <div class="dc-fin-item"><span>Outstanding</span><b style="color:${out > 0 ? 'var(--red)' : 'var(--muted)'}">${fmtMoney(out)}</b></div>
          <div class="dc-fin-item"><span>Commission</span><b style="color:var(--teal)">${fmtMoney(comm)}</b></div>
        </div>
        ${nextDue ? `<div class="dc-footer">Next payment: <b>${fmtDateShort(nextDue)}</b></div>` : ""}
      ` : `
        <div class="dc-financials">
          <div class="dc-fin-item"><span>Est. Value</span><b>${fmtMoney(calc.invoiceTotal)}</b></div>
          <div class="dc-fin-item"><span>Date</span><b>${fmtDateShort(d.dealDate)}</b></div>
          <div class="dc-fin-item"><span>Duration</span><b>${d.durationYears}yr</b></div>
        </div>
      `}
    </div>`;
  }).join("");
}

/* ── DEAL DETAIL ────────────────────────────────────────────── */
function openDealDetail(dealId) {
  const deal = STATE.deals.find(d => d.id === dealId);
  if (!deal) return;
  const calc = calcDeal(deal);
  const coll = collectedForDeal(deal.id);
  const out = outstandingForDeal(deal);
  const ps = dealPayments(deal.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const breakdown = commissionBreakdownForDeal(deal);
  const totalComm = breakdown.reduce((s, c) => s + c.netCommission, 0);
  const rd = renewalDate(deal);

  const body = document.getElementById("modalBody");
  const statusBadgeHtml = (st) => {
    const cls = { Collected: "paid", Overdue: "overdue", Partial: "partial", Due: "due", Pending: "stage", "Partially Paid": "partial" }[st] || "stage";
    return `<span class="badge ${cls}">${st}</span>`;
  };

  body.innerHTML = `
    <div class="modal-deal-head">
      <div>
        <div class="mdh-id">${deal.id}</div>
        <div class="mdh-client">${deal.clientName}</div>
        <div class="mdh-tag">${deal.product} · ${deal.dealType} · ${deal.durationYears}yr · ${deal.newUsers} users${deal.dealType === "Upgrade" ? ` (added ${deal.newUsers - deal.oldUsers})` : ""}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        ${deal.stage !== "Won" ? `<span class="badge stage">${deal.stage}</span>` : statusBadgeHtml(collectionStatusForDeal(deal))}
        ${rd ? `<span style="font-size:11px;color:var(--muted)">Renews ${fmtDate(rd)}</span>` : ""}
      </div>
    </div>

    <div class="kpi-grid compact" style="margin:16px 0;">
      <div class="kpi-card"><div class="kc-label">Net Price</div><div class="kc-val sm">${fmtMoney(calc.basePrice)}</div></div>
      <div class="kpi-card"><div class="kc-label">VAT (${deal.vatApplicable ? fmtPct(deal.vatRate) : "N/A"})</div><div class="kc-val sm">${fmtMoney(calc.vatAmount)}</div></div>
      <div class="kpi-card accent-gold"><div class="kc-label">Invoice Total</div><div class="kc-val sm">${fmtMoney(calc.invoiceTotal)}</div></div>
      <div class="kpi-card accent-green"><div class="kc-label">Collected</div><div class="kc-val sm">${fmtMoney(coll)}</div></div>
      <div class="kpi-card accent-red"><div class="kc-label">Outstanding</div><div class="kc-val sm">${fmtMoney(out)}</div></div>
      <div class="kpi-card accent-teal"><div class="kc-label">Commission</div><div class="kc-val sm">${fmtMoney(totalComm)}</div></div>
    </div>

    ${deal.stage === "Won" ? `
    <h3 style="margin-bottom:10px;">Payment Milestones</h3>
    <div class="rlist">
      ${ps.length ? ps.map(p => {
        const st = paymentStatus(p);
        const remaining = Number(p.amountDue) - Number(p.amountPaid || 0);
        return `<div class="r">
          <div class="c1" style="flex:1.5">
            <div style="font-weight:600">Milestone ${p.milestoneNumber}</div>
            <div style="font-size:11px;color:var(--muted)">Due ${fmtDate(p.dueDate)}${p.paidDate ? ' · Paid ' + fmtDate(p.paidDate) : ''}</div>
            ${p.method ? `<div style="font-size:11px;color:var(--muted)">${p.method}</div>` : ""}
          </div>
          <div class="c2" style="flex:1;text-align:right">
            <div style="font-weight:600">${fmtMoney(p.amountPaid || 0)} / ${fmtMoney(p.amountDue)}</div>
            ${remaining > 0.5 ? `<div style="font-size:11px;color:var(--muted)">Remaining: ${fmtMoney(remaining)}</div>` : ""}
          </div>
          <div class="c3" style="flex:0 0 90px;text-align:right">${statusBadgeHtml(st)}</div>
        </div>`;
      }).join("") : `<div class="empty-state">No payment milestones.</div>`}
    </div>

    <div style="margin-top:12px;">
      <button class="btn small" onclick="openAddPayment('${deal.id}')">+ Add / Record Payment</button>
    </div>

    ${breakdown.length ? `
    <h3 style="margin:16px 0 10px;">Commission Breakdown</h3>
    <div class="rlist">
      ${breakdown.map(c => `
        <div class="r">
          <div class="c1" style="flex:1.5">
            <div style="font-weight:600">Collection ${fmtDateShort(c.paidDate)}</div>
            <div style="font-size:11px;color:var(--muted)">${fmtMoney(c.collectedAmount)} × ${fmtPct(c.rate)}${c.trainingFeeDeduction ? ` − ${fmtMoney(c.trainingFeeDeduction)} training` : ""}</div>
            <div style="font-size:11px;color:var(--muted)">Payout: ${fmtDate(c.expectedPayoutDate)}</div>
          </div>
          <div class="c2" style="flex:1;text-align:right;font-weight:600">${fmtMoney(c.netCommission)}</div>
          <div class="c3" style="flex:0 0 90px;text-align:right">
            <span class="badge ${c.payoutStatus === 'Paid' ? 'paid' : c.payoutStatus === 'Available' ? 'partial' : 'stage'}">${c.payoutStatus}</span>
          </div>
        </div>`).join("")}
    </div>` : ""}
    ` : ""}

    ${deal.notes ? `<div class="panel" style="margin-top:16px;background:var(--surface2)"><h4>Notes</h4><p>${deal.notes}</p></div>` : ""}

    <div class="modal-actions" style="margin-top:20px;">
      <button class="btn danger" onclick="confirmDeleteDeal('${deal.id}')">Delete</button>
      <div style="flex:1"></div>
      <button class="btn secondary" onclick="closeModal()">Close</button>
      <button class="btn primary" onclick="openDealForm('${deal.id}')">Edit Deal</button>
    </div>
  `;
  showModal("xl");
}

function openAddPayment(dealId) {
  const deal = STATE.deals.find(d => d.id === dealId);
  if (!deal) return;
  const calc = calcDeal(deal);
  const ps = dealPayments(dealId);
  const alreadyScheduled = ps.reduce((s, p) => s + Number(p.amountDue), 0);
  const remaining = Math.max(calc.invoiceTotal - alreadyScheduled, 0);

  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>Add / Record Payment — ${deal.clientName}</h2>
    <p class="hint">Invoice total: ${fmtMoney(calc.invoiceTotal)} · Scheduled: ${fmtMoney(alreadyScheduled)} · Unscheduled: ${fmtMoney(remaining)}</p>
    <div class="form-grid">
      <div class="field"><label>Due Date *</label><input id="p_due" type="date" value="${todayStr()}"></div>
      <div class="field"><label>Amount Due *</label><input id="p_due_amt" type="number" placeholder="0" value="${remaining > 0 ? Math.round(remaining) : ''}"></div>
      <div class="field"><label>Amount Paid</label><input id="p_paid_amt" type="number" placeholder="0"></div>
      <div class="field"><label>Paid Date</label><input id="p_paid_date" type="date"></div>
      <div class="field"><label>Payment Method</label>
        <select id="p_method"><option value="">—</option>${["Bank Transfer","Cheque","Instapay","Cash"].map(m=>`<option>${m}</option>`).join("")}</select>
      </div>
      <div class="field full"><label>Notes</label><input id="p_notes" type="text" placeholder="optional"></div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="openDealDetail('${dealId}')">Back</button>
      <button class="btn primary" onclick="savePayment('${dealId}')">Save Payment</button>
    </div>
  `;
}

function savePayment(dealId) {
  const due = document.getElementById("p_due").value;
  const dueAmt = Number(document.getElementById("p_due_amt").value) || 0;
  const paidAmt = Number(document.getElementById("p_paid_amt").value) || 0;
  const paidDate = document.getElementById("p_paid_date").value;
  const method = document.getElementById("p_method").value;
  const notes = document.getElementById("p_notes").value;

  if (!due) { toast("Due date required", "error"); return; }
  if (dueAmt <= 0) { toast("Amount due must be > 0", "error"); return; }
  if (paidAmt < 0) { toast("Amount paid cannot be negative", "error"); return; }
  if (paidAmt > dueAmt) { if (!confirm(`Paid (${fmtNum(paidAmt)}) exceeds due (${fmtNum(dueAmt)}). Continue?`)) return; }

  const ps = dealPayments(dealId);
  const milestoneNumber = ps.length + 1;

  STATE.payments.push({
    id: nextId("P", "payments"),
    dealId, milestoneNumber, amountDue: dueAmt, amountPaid: paidAmt,
    dueDate: due, paidDate: (paidAmt > 0 && paidDate) ? paidDate : (paidAmt > 0 ? todayStr() : null),
    method: paidAmt > 0 ? method : "", notes, createdAt: todayStr()
  });
  save(); toast("Payment saved", "success"); openDealDetail(dealId);
}

/* ── DEAL FORM ──────────────────────────────────────────────── */
function openDealForm(dealId) {
  const editing = dealId ? STATE.deals.find(d => d.id === dealId) : null;
  const d = editing || {
    id: null, clientName: "", product: "CRM", dealType: "New Deal", stage: "Won",
    dealDate: todayStr(), oldUsers: 0, newUsers: 10, durationYears: 1,
    vatApplicable: true, vatRate: STATE.settings.vatRate, overridePrice: null, notes: ""
  };

  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>${editing ? "Edit deal — " + d.id : "New Deal"}</h2>
    <div class="form-grid">
      <div class="field full"><label>Client Name *</label><input id="f_client" value="${d.clientName}" placeholder="Client / company name" oninput="updateDealPreview()"></div>
      <div class="field"><label>Product *</label>
        <select id="f_product" onchange="updateDealPreview()">
          ${["CRM","Navi","HR"].map(p=>`<option ${p===d.product?"selected":""}>${p}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Deal Type *</label>
        <select id="f_type" onchange="updateDealPreview()">
          ${["New Deal","Renewal","Upgrade"].map(t=>`<option ${t===d.dealType?"selected":""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Old Users (Upgrade)</label><input id="f_old" type="number" value="${d.oldUsers||0}" oninput="updateDealPreview()"></div>
      <div class="field"><label>New Users *</label><input id="f_new" type="number" value="${d.newUsers||0}" oninput="updateDealPreview()"></div>
      <div class="field"><label>Duration (years)</label>
        <select id="f_dur" onchange="updateDealPreview()">
          ${[1,2,3].map(y=>`<option ${y===d.durationYears?"selected":""}>${y}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>VAT Applies?</label>
        <select id="f_vat" onchange="updateDealPreview()">
          <option ${d.vatApplicable?"selected":""}>Yes</option>
          <option ${!d.vatApplicable?"selected":""}>No</option>
        </select>
      </div>
      <div class="field"><label>Override Price (optional)</label><input id="f_override" type="number" value="${d.overridePrice??''}" placeholder="Auto-calculated" oninput="updateDealPreview()"></div>
      <div class="field"><label>Stage *</label>
        <select id="f_stage" onchange="handleStageChange()">
          ${["New","Qualified","Meeting","Negotiation","Won"].map(s=>`<option ${s===d.stage?"selected":""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Deal Date *</label><input id="f_date" type="date" value="${d.dealDate}"></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes" rows="2">${d.notes||""}</textarea></div>
    </div>

    <div class="deal-preview panel" id="dealPreview" style="margin-top:16px;background:var(--surface2)"></div>

    ${!editing ? `
    <div class="panel" id="payPlanPanel" style="margin-top:16px;background:var(--surface2)">
      <h3>Payment Plan</h3>
      <div class="form-grid">
        <div class="field"><label>Plan</label>
          <select id="f_plan" onchange="updatePayPlanFields()">
            ${["Full Payment","50/50","3 Installments","Custom"].map(p=>`<option>${p}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>First payment due</label><input id="f_due1" type="date" value="${addDays(todayStr(), 15)}"></div>
      </div>
      <div id="planFields"></div>
    </div>` : ""}

    <div class="modal-actions">
      ${editing ? `<button class="btn danger" onclick="confirmDeleteDeal('${d.id}')">Delete</button>` : ""}
      <div style="flex:1"></div>
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveDeal('${d.id||""}')">${editing ? "Save Changes" : "Create Deal"}</button>
    </div>
  `;
  showModal("lg");
  updateDealPreview();
  if (!editing) { updatePayPlanFields(); handleStageChange(); }
}

function handleStageChange() {
  const stage = document.getElementById("f_stage")?.value;
  const panel = document.getElementById("payPlanPanel");
  if (panel) panel.style.display = stage === "Won" ? "" : "none";
}

function updateDealPreview() {
  const pr = document.getElementById("dealPreview");
  if (!pr) return;
  const product = document.getElementById("f_product")?.value || "CRM";
  const type = document.getElementById("f_type")?.value || "New Deal";
  const oldU = Number(document.getElementById("f_old")?.value) || 0;
  const newU = Number(document.getElementById("f_new")?.value) || 0;
  const dur = Number(document.getElementById("f_dur")?.value) || 1;
  const vatY = document.getElementById("f_vat")?.value === "Yes";
  const overrideStr = document.getElementById("f_override")?.value;
  const override = overrideStr !== "" ? Number(overrideStr) : null;
  const usersForPrice = type === "Upgrade" ? Math.max(newU - oldU, 0) : newU;
  const auto = priceLookup(product, usersForPrice, dur);
  const base = override != null ? override : (auto || 0);
  const vr = STATE.settings.vatRate;
  const vat = vatY ? base * vr : 0;
  const inv = base + vat;
  const commRate = commissionRateForDeal({ dealType: type, newUsers: newU, oldUsers: oldU });
  const est = inv * commRate;

  pr.innerHTML = `
    <h4 style="margin-bottom:10px;">💡 Price Preview</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
      <div><div style="font-size:11px;color:var(--muted)">Net Price</div><div style="font-weight:700">${fmtMoney(base)}</div>${!override && auto ? '' : (!override ? '<div style="font-size:10px;color:var(--amber)">No price in table</div>' : '')}</div>
      <div><div style="font-size:11px;color:var(--muted)">VAT (14%)</div><div style="font-weight:700">${fmtMoney(vat)}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Invoice Total</div><div style="font-weight:700;color:var(--gold)">${fmtMoney(inv)}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Est. Commission</div><div style="font-weight:700;color:var(--teal)">${fmtMoney(est)}</div></div>
    </div>
  `;
}

function updatePayPlanFields() {
  const plan = document.getElementById("f_plan")?.value;
  const container = document.getElementById("planFields");
  if (!container) return;
  if (plan === "Full Payment" || plan === "50/50" || plan === "3 Installments") {
    container.innerHTML = "";
  } else {
    container.innerHTML = `
      <div style="margin-top:12px;">
        <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Custom — define milestones (percentages must sum to 100%)</p>
        <div id="customMilestones">
          <div class="custom-milestone" style="display:flex;gap:8px;margin-bottom:6px;">
            <input type="number" placeholder="%" class="m-pct" value="50" style="width:70px">
            <input type="date" class="m-date" value="${addDays(todayStr(), 15)}">
          </div>
          <div class="custom-milestone" style="display:flex;gap:8px;margin-bottom:6px;">
            <input type="number" placeholder="%" class="m-pct" value="50" style="width:70px">
            <input type="date" class="m-date" value="${addDays(todayStr(), 45)}">
          </div>
        </div>
        <button class="btn small secondary" onclick="addCustomMilestone()">+ Add Row</button>
      </div>`;
  }
}

function addCustomMilestone() {
  const c = document.getElementById("customMilestones");
  const div = document.createElement("div");
  div.className = "custom-milestone";
  div.style = "display:flex;gap:8px;margin-bottom:6px;";
  div.innerHTML = `<input type="number" placeholder="%" class="m-pct" value="0" style="width:70px"><input type="date" class="m-date" value="${addDays(todayStr(), 30)}">`;
  c.appendChild(div);
}

function saveDeal(id) {
  const client = document.getElementById("f_client").value.trim();
  const newU = Number(document.getElementById("f_new").value) || 0;
  const oldU = Number(document.getElementById("f_old").value) || 0;

  if (!client) { toast("Client name required", "error"); return; }
  if (newU <= 0) { toast("New users must be > 0", "error"); return; }
  const type = document.getElementById("f_type").value;
  if (type === "Upgrade" && newU <= oldU) { toast("For Upgrade, new users must exceed old users", "error"); return; }

  const overrideStr = document.getElementById("f_override").value;
  const override = overrideStr !== "" ? Number(overrideStr) : null;
  const vatY = document.getElementById("f_vat").value === "Yes";
  const dur = Number(document.getElementById("f_dur").value) || 1;
  const product = document.getElementById("f_product").value;
  const stage = document.getElementById("f_stage").value;
  const dealDate = document.getElementById("f_date").value || todayStr();

  const usersForPrice = type === "Upgrade" ? Math.max(newU - oldU, 0) : newU;
  const auto = priceLookup(product, usersForPrice, dur);
  const base = override != null ? override : (auto || 0);
  const vr = STATE.settings.vatRate;
  const vat = vatY ? base * vr : 0;
  const inv = base + vat;

  // Ensure client exists
  let clientObj = STATE.clients.find(c => c.name.toLowerCase() === client.toLowerCase());
  if (!clientObj) {
    const cid = nextId("C", "clients");
    clientObj = { id: cid, name: client, phone: "", email: "", company: client, notes: "", createdAt: todayStr(), updatedAt: todayStr() };
    STATE.clients.push(clientObj);
  }

  if (id) {
    // Edit existing
    const existing = STATE.deals.find(d => d.id === id);
    if (!existing) return;
    Object.assign(existing, {
      clientId: clientObj.id, clientName: client,
      product, dealType: type, stage,
      dealDate, oldUsers: oldU, newUsers: newU, durationYears: dur,
      vatApplicable: vatY, vatRate: vr, overridePrice: override,
      basePrice: base, vatAmount: vat, invoiceTotal: inv,
      renewalDate: stage === "Won" ? addYears(dealDate, dur) : null,
      notes: document.getElementById("f_notes").value, updatedAt: todayStr()
    });
    save(); toast("Deal updated", "success"); closeModal(); renderRoute();
  } else {
    // New deal
    const newId = nextId("D", "deals");
    const newDeal = {
      id: newId, clientId: clientObj.id, clientName: client,
      product, dealType: type, stage, dealDate,
      oldUsers: oldU, newUsers: newU, durationYears: dur,
      vatApplicable: vatY, vatRate: vr, overridePrice: override,
      basePrice: base, vatAmount: vat, invoiceTotal: inv,
      renewalDate: stage === "Won" ? addYears(dealDate, dur) : null,
      notes: document.getElementById("f_notes").value,
      commissionPaid: false, commissionPaidDate: null,
      createdAt: todayStr(), updatedAt: todayStr()
    };
    STATE.deals.push(newDeal);

    // Build payment plan if Won
    if (stage === "Won") {
      const plan = document.getElementById("f_plan")?.value;
      const due1 = document.getElementById("f_due1")?.value || addDays(dealDate, 15);
      const milestones = buildPaymentPlan(plan, inv, due1);
      milestones.forEach((m, i) => {
        STATE.payments.push({
          id: nextId("P", "payments"),
          dealId: newId, milestoneNumber: i + 1,
          amountDue: m.amount, amountPaid: 0,
          dueDate: m.dueDate, paidDate: null, method: "", notes: "", createdAt: todayStr()
        });
      });
    }
    save(); toast(`Deal ${newId} created`, "success"); closeModal(); renderRoute();
  }
}

function buildPaymentPlan(plan, invoiceTotal, firstDue) {
  const inv = invoiceTotal;
  if (plan === "Full Payment") {
    return [{ amount: inv, dueDate: firstDue }];
  } else if (plan === "50/50") {
    const half = Math.round(inv / 2);
    return [
      { amount: half, dueDate: firstDue },
      { amount: inv - half, dueDate: addDays(firstDue, 30) }
    ];
  } else if (plan === "3 Installments") {
    const third = Math.round(inv / 3);
    return [
      { amount: third, dueDate: firstDue },
      { amount: third, dueDate: addDays(firstDue, 30) },
      { amount: inv - 2 * third, dueDate: addDays(firstDue, 60) }
    ];
  } else {
    // Custom
    const rows = document.querySelectorAll(".custom-milestone");
    const results = [];
    let pctSum = 0;
    rows.forEach(row => {
      const pct = Number(row.querySelector(".m-pct").value) || 0;
      const dt = row.querySelector(".m-date").value || firstDue;
      pctSum += pct;
      results.push({ amount: Math.round(inv * pct / 100), dueDate: dt });
    });
    if (Math.abs(pctSum - 100) > 1) { toast(`Custom milestones sum to ${pctSum}%, not 100%`, "error"); return []; }
    // Adjust last to ensure total = invoiceTotal
    const sumAmt = results.reduce((s, r) => s + r.amount, 0);
    if (results.length) results[results.length - 1].amount += (inv - sumAmt);
    return results;
  }
}

function confirmDeleteDeal(id) {
  const d = STATE.deals.find(x => x.id === id);
  if (!d) return;
  if (!confirm(`Delete deal ${d.id} — ${d.clientName}?\n\nThis will also delete all payment records for this deal.`)) return;
  STATE.deals = STATE.deals.filter(x => x.id !== id);
  STATE.payments = STATE.payments.filter(p => p.dealId !== id);
  save(); closeModal(); toast("Deal deleted", "success"); renderRoute();
}

/* ── CLIENTS ────────────────────────────────────────────────── */
function renderClients() {
  const main = document.getElementById("main");
  const clients = STATE.clients.slice().sort((a, b) => a.name.localeCompare(b.name));
  main.innerHTML = `
    <div class="page-head">
      <div><h1>Clients</h1><p>${clients.length} accounts</p></div>
      <button class="btn primary" onclick="openClientForm()">+ New Client</button>
    </div>
    <div class="filter-bar">
      <input id="cliSearch" placeholder="Search clients…" oninput="renderClientCards(this.value)">
    </div>
    <div class="deal-list" id="cliCards"></div>
  `;
  renderClientCards("");
}

function renderClientCards(q) {
  const el = document.getElementById("cliCards");
  let clients = STATE.clients.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (q) clients = clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || (c.email || "").toLowerCase().includes(q.toLowerCase()));
  if (!clients.length) { el.innerHTML = `<div class="empty-state">No clients found.</div>`; return; }

  el.innerHTML = clients.map(c => {
    const deals = STATE.deals.filter(d => d.clientId === c.id || d.clientName === c.name);
    const won = deals.filter(d => d.stage === "Won");
    const revenue = won.reduce((s, d) => s + calcDeal(d).invoiceTotal, 0);
    const coll = won.reduce((s, d) => s + collectedForDeal(d.id), 0);
    const products = [...new Set(won.map(d => d.product))].join(", ") || "—";
    return `<div class="deal-card" onclick="openClientDetail('${c.id}')">
      <div class="dc-head">
        <div>
          <div class="dc-client">${c.name}</div>
          <div class="dc-tag">${products} · ${deals.length} deal(s)</div>
          ${c.phone ? `<div style="font-size:11px;color:var(--muted)">${c.phone}${c.email ? ' · ' + c.email : ''}</div>` : ""}
        </div>
      </div>
      <div class="dc-financials">
        <div class="dc-fin-item"><span>Revenue</span><b>${fmtMoney(revenue)}</b></div>
        <div class="dc-fin-item"><span>Collected</span><b style="color:var(--green)">${fmtMoney(coll)}</b></div>
        <div class="dc-fin-item"><span>Outstanding</span><b style="color:${revenue - coll > 0 ? 'var(--red)' : 'var(--muted)'}">${fmtMoney(revenue - coll)}</b></div>
      </div>
    </div>`;
  }).join("");
}

function openClientDetail(clientId) {
  const client = STATE.clients.find(c => c.id === clientId);
  if (!client) return;
  const deals = STATE.deals.filter(d => d.clientId === clientId || d.clientName === client.name).sort((a, b) => b.dealDate.localeCompare(a.dealDate));
  const won = deals.filter(d => d.stage === "Won");
  const revenue = won.reduce((s, d) => s + calcDeal(d).invoiceTotal, 0);
  const coll = won.reduce((s, d) => s + collectedForDeal(d.id), 0);
  const comm = won.reduce((s, d) => s + totalCommissionForDeal(d), 0);
  const upcoming = STATE.payments.filter(p => {
    const d = deals.find(x => x.id === p.dealId);
    return d && paymentStatus(p) !== "Collected" && p.dueDate >= todayStr();
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);

  const rd30 = won.filter(d => {
    const rd = renewalDate(d);
    return rd && rd >= todayStr() && rd <= addDays(todayStr(), 60);
  });

  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <div class="dc-head" style="margin-bottom:16px;">
      <div>
        <div class="dc-client" style="font-size:22px">${client.name}</div>
        ${client.phone ? `<div style="font-size:13px;color:var(--muted)">${client.phone}${client.email ? ' · ' + client.email : ''}</div>` : ""}
      </div>
      <button class="btn small secondary" onclick="openClientForm('${clientId}')">Edit</button>
    </div>

    <div class="kpi-grid compact" style="margin-bottom:16px;">
      <div class="kpi-card accent-gold"><div class="kc-label">Revenue</div><div class="kc-val sm">${fmtMoney(revenue)}</div></div>
      <div class="kpi-card accent-green"><div class="kc-label">Collected</div><div class="kc-val sm">${fmtMoney(coll)}</div></div>
      <div class="kpi-card accent-red"><div class="kc-label">Outstanding</div><div class="kc-val sm">${fmtMoney(revenue - coll)}</div></div>
      <div class="kpi-card accent-teal"><div class="kc-label">Commission</div><div class="kc-val sm">${fmtMoney(comm)}</div></div>
    </div>

    ${rd30.length ? `<div class="alert-pill amber" style="margin-bottom:12px;">⚠️ ${rd30.length} renewal(s) within 60 days</div>` : ""}
    ${upcoming.length ? `
      <h4 style="margin-bottom:8px;">Upcoming Payments</h4>
      <div class="rlist" style="margin-bottom:16px;">
        ${upcoming.map(p => {
          const d2 = deals.find(x => x.id === p.dealId);
          return `<div class="r">
            <div class="c1">${d2 ? d2.product + ' ' + d2.id : '—'}</div>
            <div class="c2">${fmtDateShort(p.dueDate)}</div>
            <div class="c3">${fmtMoney(Number(p.amountDue) - Number(p.amountPaid || 0))}</div>
            <div class="c4"><span class="badge ${paymentStatus(p) === 'Overdue' ? 'overdue' : 'due'}">${paymentStatus(p)}</span></div>
          </div>`;
        }).join("")}
      </div>` : ""}

    <h3 style="margin-bottom:10px;">Deal History</h3>
    <div class="rlist">
      ${deals.map(d => {
        const st = d.stage === "Won" ? collectionStatusForDeal(d) : d.stage;
        const cls = { Collected: "paid", Overdue: "overdue", Partial: "partial", Due: "due" }[st] || "stage";
        return `<div class="r" style="cursor:pointer" onclick="closeModal();openDealDetail('${d.id}')">
          <div class="c1" style="flex:1.5">
            <div style="font-weight:600">${d.product} · ${d.dealType}</div>
            <div style="font-size:11px;color:var(--muted)">${d.id} · ${fmtDateShort(d.dealDate)}</div>
          </div>
          <div class="c2" style="flex:1;text-align:right">${fmtMoney(calcDeal(d).invoiceTotal)}</div>
          <div class="c3" style="flex:0 0 90px;text-align:right"><span class="badge ${cls}">${st}</span></div>
        </div>`;
      }).join("") || '<div class="empty-state">No deals.</div>'}
    </div>

    <div class="modal-actions" style="margin-top:20px;">
      <button class="btn secondary" onclick="closeModal()">Close</button>
    </div>
  `;
  showModal("lg");
}

function openClientForm(clientId) {
  const c = clientId ? STATE.clients.find(x => x.id === clientId) : null;
  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>${c ? "Edit Client" : "New Client"}</h2>
    <div class="form-grid">
      <div class="field full"><label>Name *</label><input id="cf_name" value="${c?.name||''}" placeholder="Client / company name"></div>
      <div class="field"><label>Phone</label><input id="cf_phone" value="${c?.phone||''}" placeholder="+20…"></div>
      <div class="field"><label>Email</label><input id="cf_email" type="email" value="${c?.email||''}" placeholder="email@…"></div>
      <div class="field full"><label>Notes</label><textarea id="cf_notes" rows="2">${c?.notes||''}</textarea></div>
    </div>
    <div class="modal-actions">
      ${c ? `<button class="btn danger" onclick="deleteClient('${c.id}')">Delete</button>` : ""}
      <div style="flex:1"></div>
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveClient('${c?.id||''}')">Save</button>
    </div>
  `;
  showModal();
}

function saveClient(id) {
  const name = document.getElementById("cf_name").value.trim();
  if (!name) { toast("Name required", "error"); return; }
  if (id) {
    const c = STATE.clients.find(x => x.id === id);
    if (c) { c.name = name; c.phone = document.getElementById("cf_phone").value; c.email = document.getElementById("cf_email").value; c.notes = document.getElementById("cf_notes").value; c.updatedAt = todayStr(); }
  } else {
    STATE.clients.push({ id: nextId("C", "clients"), name, phone: document.getElementById("cf_phone").value, email: document.getElementById("cf_email").value, company: name, notes: document.getElementById("cf_notes").value, createdAt: todayStr(), updatedAt: todayStr() });
  }
  save(); toast("Client saved", "success"); closeModal(); renderRoute();
}

function deleteClient(id) {
  const hasDeals = STATE.deals.some(d => d.clientId === id);
  if (hasDeals && !confirm("This client has deals. Delete anyway? (Deals will remain but lose client link.)")) return;
  STATE.clients = STATE.clients.filter(c => c.id !== id);
  save(); closeModal(); toast("Client deleted"); renderClients();
}

/* ── COLLECTIONS ────────────────────────────────────────────── */
let collFilter = { status: "All", month: "" };

function renderCollections() {
  const main = document.getElementById("main");
  const won = STATE.deals.filter(d => d.stage === "Won");
  const allPays = STATE.payments;

  const thisMonth = currentYM();
  const collThisMonth = allPays.filter(p => p.paidDate && monthKey(p.paidDate) === thisMonth).reduce((s, p) => s + Number(p.amountPaid || 0), 0);
  const totalInv = won.reduce((s, d) => s + calcDeal(d).invoiceTotal, 0);
  const totalColl = won.reduce((s, d) => s + collectedForDeal(d.id), 0);
  const totalOut = totalInv - totalColl;
  const overdueAmt = allPays.filter(p => paymentStatus(p) === "Overdue").reduce((s, p) => s + Number(p.amountDue) - Number(p.amountPaid || 0), 0);
  const rate = totalInv ? totalColl / totalInv : 0;

  const months = ["All"];
  const allMonths = [...new Set(allPays.map(p => p.paidDate ? monthKey(p.paidDate) : null).filter(Boolean))].sort().reverse();
  allMonths.forEach(m => months.push(m));
  const dueMonths = [...new Set(allPays.map(p => monthKey(p.dueDate)))].filter(Boolean).sort().reverse();
  dueMonths.forEach(m => { if (!months.includes(m)) months.push(m); });

  main.innerHTML = `
    <div class="page-head"><div><h1>Collections</h1><p>Track what's paid, due, and overdue</p></div></div>
    <div class="kpi-grid">
      <div class="kpi-card accent-green"><div class="kc-label">Collected (this month)</div><div class="kc-val">${fmtMoney(collThisMonth)}</div></div>
      <div class="kpi-card accent-gold"><div class="kc-label">Total Outstanding</div><div class="kc-val">${fmtMoney(totalOut)}</div></div>
      <div class="kpi-card accent-red"><div class="kc-label">Overdue</div><div class="kc-val">${fmtMoney(overdueAmt)}</div></div>
      <div class="kpi-card accent-teal"><div class="kc-label">Collection Rate</div><div class="kc-val">${fmtPct(rate)}</div></div>
    </div>
    <div class="filter-bar">
      <select id="collStatusF" onchange="collFilter.status=this.value;renderCollectionList()">
        ${["All","Overdue","Due","Pending","Partially Paid","Collected"].map(s=>`<option ${s===collFilter.status?"selected":""}>${s}</option>`).join("")}
      </select>
      <select id="collMonthF" onchange="collFilter.month=this.value;renderCollectionList()">
        ${months.map(m=>`<option value="${m==="All"?"":m}" ${(m==="All"&&!collFilter.month)||m===collFilter.month?"selected":""}>${m==="All"?"All months":m}</option>`).join("")}
      </select>
    </div>
    <div id="collList"></div>
  `;
  renderCollectionList();
}

function renderCollectionList() {
  const el = document.getElementById("collList");
  if (!el) return;
  let pays = STATE.payments.slice();
  if (collFilter.status !== "All") pays = pays.filter(p => paymentStatus(p) === collFilter.status);
  if (collFilter.month) {
    pays = pays.filter(p => (p.paidDate && monthKey(p.paidDate) === collFilter.month) || (!p.paidDate && monthKey(p.dueDate) === collFilter.month));
  }
  pays.sort((a, b) => {
    const sa = paymentStatus(a), sb = paymentStatus(b);
    const order = { Overdue: 0, Due: 1, "Partially Paid": 2, Pending: 3, Collected: 4 };
    if (order[sa] !== order[sb]) return order[sa] - order[sb];
    return a.dueDate.localeCompare(b.dueDate);
  });

  if (!pays.length) { el.innerHTML = `<div class="empty-state">No payments match this filter.</div>`; return; }

  el.innerHTML = `<div class="panel">
    <div class="rlist">
      ${pays.map(p => {
        const deal = STATE.deals.find(d => d.id === p.dealId);
        const st = paymentStatus(p);
        const remaining = Number(p.amountDue) - Number(p.amountPaid || 0);
        const cls = { Collected: "paid", Overdue: "overdue", "Partially Paid": "partial", Due: "due", Pending: "stage" }[st] || "stage";
        return `<div class="r" style="cursor:pointer" onclick="openDealDetail('${p.dealId}')">
          <div class="c1" style="flex:2">
            <div style="font-weight:600">${deal ? deal.clientName : "—"}</div>
            <div style="font-size:11px;color:var(--muted)">${deal ? deal.id + ' · ' + deal.product : ''} · M${p.milestoneNumber}</div>
            <div style="font-size:11px;color:var(--muted)">Due: ${fmtDate(p.dueDate)}${p.paidDate ? ' · Paid: ' + fmtDate(p.paidDate) : ''}</div>
          </div>
          <div class="c2" style="flex:1;text-align:right">
            <div style="font-weight:600">${fmtMoney(p.amountPaid || 0)}</div>
            <div style="font-size:11px;color:var(--muted)">of ${fmtMoney(p.amountDue)}</div>
            ${remaining > 0.5 ? `<div style="font-size:11px;color:var(--red)">${fmtMoney(remaining)} left</div>` : ""}
          </div>
          <div class="c3" style="flex:0 0 100px;text-align:right"><span class="badge ${cls}">${st}</span></div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

/* ── COMMISSION ─────────────────────────────────────────────── */
function renderCommission() {
  const main = document.getElementById("main");
  const won = STATE.deals.filter(d => d.stage === "Won");
  const allBreakdowns = won.flatMap(d => commissionBreakdownForDeal(d).map(c => ({ ...c, deal: d })));

  const totalEarned = allBreakdowns.reduce((s, c) => s + c.netCommission, 0);
  const locked = allBreakdowns.filter(c => c.payoutStatus === "Locked").reduce((s, c) => s + c.netCommission, 0);
  const available = allBreakdowns.filter(c => c.payoutStatus === "Available").reduce((s, c) => s + c.netCommission, 0);
  const paid = won.filter(d => d.commissionPaid).reduce((s, d) => s + totalCommissionForDeal(d), 0);

  const nextPayout = allBreakdowns.filter(c => c.payoutStatus === "Locked").sort((a, b) => a.expectedPayoutDate.localeCompare(b.expectedPayoutDate))[0];

  main.innerHTML = `
    <div class="page-head"><div><h1>Commission</h1><p>Calculated on actual collected cash only</p></div></div>

    <div class="kpi-grid">
      <div class="kpi-card accent-gold"><div class="kc-label">Total Earned</div><div class="kc-val">${fmtMoney(totalEarned)}</div></div>
      <div class="kpi-card" style="--accent:var(--purple)"><div class="kc-label">🔒 Locked</div><div class="kc-val">${fmtMoney(locked)}</div><div class="kc-sub">awaiting payout date</div></div>
      <div class="kpi-card accent-green"><div class="kc-label">💰 Available</div><div class="kc-val">${fmtMoney(available)}</div><div class="kc-sub">ready to collect</div></div>
      <div class="kpi-card accent-teal"><div class="kc-label">✅ Paid</div><div class="kc-val">${fmtMoney(paid)}</div></div>
    </div>

    ${nextPayout ? `
    <div class="panel" style="background:linear-gradient(135deg,var(--surface2),var(--panel))">
      <h3>Next Payout</h3>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="font-size:28px;font-weight:800;color:var(--gold)">${fmtDate(nextPayout.expectedPayoutDate)}</div>
        <div style="color:var(--muted)">Expected: <b style="color:var(--text)">${fmtMoney(locked)}</b> locked commission</div>
      </div>
    </div>` : available > 0 ? `
    <div class="panel" style="background:linear-gradient(135deg,var(--surface2),var(--panel))">
      <div class="alert-pill green">💰 ${fmtMoney(available)} is available for payout now!</div>
    </div>` : ""}

    <div class="panel">
      <h3>Commission by Deal</h3>
      <div class="rlist">
        ${won.sort((a, b) => b.dealDate.localeCompare(a.dealDate)).map(deal => {
          const breakdown = commissionBreakdownForDeal(deal);
          const totalComm = breakdown.reduce((s, c) => s + c.netCommission, 0);
          const pct = commissionRateForDeal(deal);
          if (!breakdown.length && totalComm === 0) {
            return `<div class="r">
              <div class="c1" style="flex:2">
                <div style="font-weight:600">${deal.clientName}</div>
                <div style="font-size:11px;color:var(--muted)">${deal.id} · ${deal.dealType} · ${fmtPct(pct)}</div>
                <div style="font-size:11px;color:var(--muted)">No collections yet</div>
              </div>
              <div class="c2" style="flex:1;text-align:right;color:var(--muted)">—</div>
              <div class="c3" style="flex:0 0 90px;text-align:right"><span class="badge stage">Pending</span></div>
            </div>`;
          }
          return breakdown.map(c => `
            <div class="r">
              <div class="c1" style="flex:2">
                <div style="font-weight:600">${deal.clientName}</div>
                <div style="font-size:11px;color:var(--muted)">${deal.id} · ${deal.dealType} · ${fmtPct(c.rate)}</div>
                <div style="font-size:11px;color:var(--muted)">Collected ${fmtDateShort(c.paidDate)} · Payout ${fmtDateShort(c.expectedPayoutDate)}</div>
                ${c.trainingFeeDeduction ? `<div style="font-size:10px;color:var(--amber)">Training deduction: −${fmtMoney(c.trainingFeeDeduction)}</div>` : ""}
              </div>
              <div class="c2" style="flex:1;text-align:right">
                <div style="font-weight:700;color:var(--teal)">${fmtMoney(c.netCommission)}</div>
                <div style="font-size:11px;color:var(--muted)">gross ${fmtMoney(c.grossCommission)}</div>
              </div>
              <div class="c3" style="flex:0 0 90px;text-align:right">
                <span class="badge ${c.payoutStatus === 'Paid' ? 'paid' : c.payoutStatus === 'Available' ? 'partial' : 'stage'}" style="cursor:pointer" onclick="toggleCommissionPaid('${deal.id}')">${c.payoutStatus}</span>
              </div>
            </div>`).join("");
        }).join("") || `<div class="empty-state">No won deals yet.</div>`}
      </div>
    </div>
  `;
}

function toggleCommissionPaid(dealId) {
  const d = STATE.deals.find(x => x.id === dealId);
  if (!d) return;
  d.commissionPaid = !d.commissionPaid;
  d.commissionPaidDate = d.commissionPaid ? todayStr() : null;
  save(); renderCommission(); toast(d.commissionPaid ? "Marked as paid ✓" : "Marked as pending");
}

/* ── ACTIVITY ───────────────────────────────────────────────── */
function renderActivity() {
  const main = document.getElementById("main");
  const s = STATE.settings;
  const todayAct = STATE.activity.find(a => a.date === todayStr()) || { answeredCalls: 0, meetings: 0 };
  const callsNeeded = todayAct.meetings >= 2 ? 0 : todayAct.meetings === 1 ? s.callsTarget1Meeting : s.callsTarget0Meetings;
  let actScore = todayAct.meetings >= 2 ? 100 : callsNeeded > 0 ? Math.min(100, Math.round((todayAct.answeredCalls / callsNeeded) * 100)) : 100;

  const weekStart = addDays(todayStr(), -new Date(todayStr() + "T00:00:00").getDay());
  const weekActs = STATE.activity.filter(a => a.date >= weekStart && a.date <= todayStr());
  const weekCalls = weekActs.reduce((s2, a) => s2 + a.answeredCalls, 0);
  const weekMeetings = weekActs.reduce((s2, a) => s2 + a.meetings, 0);

  const sorted = STATE.activity.slice().sort((a, b) => b.date.localeCompare(a.date));
  const last14 = sorted.slice(0, 14).reverse();
  const chartLabels14 = last14.map(a => fmtDateShort(a.date));
  const callData = last14.map(a => a.answeredCalls);
  const meetData = last14.map(a => a.meetings * 10); // scale for visibility

  main.innerHTML = `
    <div class="page-head">
      <div><h1>Activity</h1><p>Calls & meetings tracked against targets</p></div>
      <div style="display:flex;gap:8px;">
        <button class="btn small" onclick="quickLog('call')">+1 Call</button>
        <button class="btn small secondary" onclick="quickLog('meeting')">+1 Meeting</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card accent-gold">
        <div class="kc-label">Today's Calls</div>
        <div class="kc-val">${todayAct.answeredCalls} <span style="font-size:14px;font-weight:400;color:var(--muted)">/ ${callsNeeded || "✓"}</span></div>
        <div class="kc-sub">${todayAct.meetings} meeting(s) today</div>
      </div>
      <div class="kpi-card accent-teal">
        <div class="kc-label">Daily Score</div>
        <div class="kc-val ${actScore >= 100 ? "green-text" : actScore >= 60 ? "gold-text" : "red-text"}">${actScore}%</div>
        <div class="kc-sub">${actScore >= 100 ? "🎯 Target hit!" : callsNeeded + " calls needed"}</div>
      </div>
      <div class="kpi-card">
        <div class="kc-label">This Week Calls</div>
        <div class="kc-val">${weekCalls}</div>
        <div class="kc-sub">${weekMeetings} meetings</div>
      </div>
    </div>

    <div class="panel">
      <h3>Log Activity</h3>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field"><label>Date</label><input id="a_date" type="date" value="${todayStr()}"></div>
        <div class="field"><label>Answered Calls</label><input id="a_calls" type="number" value="${todayAct.answeredCalls}" placeholder="0"></div>
        <div class="field"><label>Meetings</label><input id="a_meetings" type="number" value="${todayAct.meetings}" placeholder="0"></div>
        <button class="btn primary" onclick="saveActivity()">Save</button>
      </div>
    </div>

    <div class="panel">
      <h3>14-Day Activity Trend</h3>
      ${lineChart([
        { values: callData, color: "#f59e0b", label: "Calls" },
        { values: meetData, color: "#10b981", label: "Meetings ×10" }
      ], chartLabels14, 500, 140)}
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Meetings values scaled ×10 for visibility</div>
    </div>

    <div class="panel">
      <h3>Daily Log</h3>
      <div class="rlist">
        ${sorted.slice(0, 30).map(a => {
          const dn = todayAct.meetings >= 2 ? 0 : a.meetings === 1 ? s.callsTarget1Meeting : s.callsTarget0Meetings;
          const sc = dn > 0 ? Math.min(100, Math.round((a.answeredCalls / dn) * 100)) : 100;
          const cls = sc >= 100 ? "paid" : sc >= 60 ? "partial" : "overdue";
          return `<div class="r">
            <div class="c1" style="flex:1.5">${fmtDate(a.date)}${a.date === todayStr() ? ' <span style="color:var(--teal);font-size:10px">TODAY</span>' : ''}</div>
            <div class="c2">${a.answeredCalls} calls</div>
            <div class="c3">${a.meetings} meetings</div>
            <div class="c4"><span class="badge ${cls}">${sc}%</span></div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function saveActivity() {
  const date = document.getElementById("a_date").value || todayStr();
  const calls = Number(document.getElementById("a_calls").value) || 0;
  const meetings = Number(document.getElementById("a_meetings").value) || 0;
  if (calls < 0 || meetings < 0) { toast("Values cannot be negative", "error"); return; }
  let row = STATE.activity.find(a => a.date === date);
  if (row) { row.answeredCalls = calls; row.meetings = meetings; }
  else STATE.activity.push({ id: "A-" + date, date, answeredCalls: calls, meetings });
  save(); toast("Activity saved ✓", "success"); renderActivity();
}

/* ── SETTINGS ───────────────────────────────────────────────── */
function renderSettings() {
  const main = document.getElementById("main");
  const s = STATE.settings;
  const curYM = currentYM();
  const target = (s.monthlyTargets && s.monthlyTargets[curYM]) || s.defaultMonthlyTarget;

  main.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>Configure your CRM — everything calculates from here</p></div></div>

    <div class="settings-grid">
      <div class="panel">
        <h3>Financial</h3>
        <div class="set-row"><label>VAT Rate</label><input id="s_vat" type="number" step="0.01" value="${s.vatRate}" placeholder="0.14"></div>
        <div class="set-row"><label>New Deal Commission %</label><input id="s_comm_new" type="number" step="0.01" value="${s.commissionNew}"></div>
        <div class="set-row"><label>Renewal Commission %</label><input id="s_comm_ren" type="number" step="0.01" value="${s.commissionRenewal}"></div>
        <div class="set-row"><label>Training Fee (EGP)</label><input id="s_training" type="number" value="${s.trainingFee}"></div>
        <div class="set-row"><label>Payout Delay (months)</label><input id="s_payout_delay" type="number" value="${s.payoutDelayMonths}"></div>
        <div class="set-row"><label>Payout Day of month</label><input id="s_payout_day" type="number" value="${s.payoutDay}"></div>
      </div>
      <div class="panel">
        <h3>Targets</h3>
        <div class="set-row"><label>Default Monthly Target (EGP)</label><input id="s_target" type="number" value="${s.defaultMonthlyTarget}"></div>
        <div class="set-row"><label>This month target (${curYM})</label><input id="s_month_target" type="number" value="${target}"></div>
        <div class="set-row"><label>Calls target (0 meetings)</label><input id="s_calls0" type="number" value="${s.callsTarget0Meetings}"></div>
        <div class="set-row"><label>Calls target (1 meeting)</label><input id="s_calls1" type="number" value="${s.callsTarget1Meeting}"></div>
        <div class="set-row"><label>Calls target (2+ meetings)</label><input id="s_calls2" type="number" value="${s.callsTarget2PlusMeetings}"></div>
        <p style="font-size:11px;color:var(--muted);margin-top:8px;">2+ meetings = 100% daily score regardless of calls</p>
      </div>
    </div>

    <div class="panel">
      <h3>Upgrade Commission Tiers <small style="color:var(--amber)">⚠ Editable — confirm with company</small></h3>
      <table class="pricing-table">
        <thead><tr><th>Min Added Users</th><th>Max Added Users</th><th>Commission %</th></tr></thead>
        <tbody>
          ${s.tiers.map((t, i) => `<tr>
            <td><input data-tier="${i}" data-f="min" type="number" value="${t.min}" class="tier-inp"></td>
            <td><input data-tier="${i}" data-f="max" type="number" value="${t.max}" class="tier-inp"></td>
            <td><input data-tier="${i}" data-f="pct" type="number" step="0.01" value="${t.pct}" class="tier-inp"></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="settings-grid">
      <div class="panel">
        <h3>Pricing — CRM</h3>
        <table class="pricing-table">
          <thead><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr></thead>
          <tbody>
            ${Object.keys(s.pricing.CRM).sort((a,b)=>a-b).map(u => `<tr><td>${u}</td>${[1,2,3].map(y=>`<td><input data-p="CRM" data-u="${u}" data-y="${y}" type="number" value="${(s.pricing.CRM[u]||{})[y]||''}" class="price-inp"></td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <h3>Pricing — Navi</h3>
        <table class="pricing-table">
          <thead><tr><th>Users</th><th>1yr</th></tr></thead>
          <tbody>
            ${Object.keys(s.pricing.Navi).sort((a,b)=>a-b).map(u => `<tr><td>${u}</td><td><input data-p="Navi" data-u="${u}" data-y="1" type="number" value="${(s.pricing.Navi[u]||{})[1]||''}" class="price-inp"></td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <h3>Pricing — HR <small style="color:var(--amber)">⚠ Not confirmed — enter actual company prices</small></h3>
      <table class="pricing-table">
        <thead><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr></thead>
        <tbody>
          ${[10,20,30,50,100].map(u => `<tr><td>${u}</td>${[1,2,3].map(y=>`<td><input data-p="HR" data-u="${u}" data-y="${y}" type="number" value="${(s.pricing.HR[u]||{})[y]||''}" placeholder="—" class="price-inp"></td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h3>Data Management</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn primary" onclick="saveSettings()">💾 Save Settings</button>
        <button class="btn secondary" onclick="exportBackup()">⬇ Export Backup</button>
        <button class="btn secondary" onclick="importBackup()">⬆ Import Backup</button>
        <button class="btn danger" onclick="resetToDemo()">🔄 Reset to Demo Data</button>
      </div>
    </div>
  `;
}

function saveSettings() {
  const s = STATE.settings;
  const vatVal = Number(document.getElementById("s_vat").value);
  if (vatVal < 0 || vatVal > 1) { toast("VAT rate should be between 0 and 1 (e.g. 0.14 for 14%)", "error"); return; }
  s.vatRate = vatVal;
  s.commissionNew = Number(document.getElementById("s_comm_new").value);
  s.commissionRenewal = Number(document.getElementById("s_comm_ren").value);
  s.trainingFee = Number(document.getElementById("s_training").value) || 0;
  s.payoutDelayMonths = Number(document.getElementById("s_payout_delay").value) || 2;
  s.payoutDay = Number(document.getElementById("s_payout_day").value) || 10;
  s.defaultMonthlyTarget = Number(document.getElementById("s_target").value) || s.defaultMonthlyTarget;
  s.callsTarget0Meetings = Number(document.getElementById("s_calls0").value) || 40;
  s.callsTarget1Meeting = Number(document.getElementById("s_calls1").value) || 20;
  s.callsTarget2PlusMeetings = Number(document.getElementById("s_calls2").value) || 0;

  const curYM = currentYM();
  const monthTarget = Number(document.getElementById("s_month_target").value);
  if (monthTarget > 0) { s.monthlyTargets = s.monthlyTargets || {}; s.monthlyTargets[curYM] = monthTarget; }

  document.querySelectorAll(".tier-inp").forEach(inp => {
    const i = Number(inp.dataset.tier), f = inp.dataset.f;
    if (!s.tiers[i]) return;
    s.tiers[i][f] = Number(inp.value);
  });
  document.querySelectorAll(".price-inp").forEach(inp => {
    const p = inp.dataset.p, u = inp.dataset.u, y = inp.dataset.y;
    if (!s.pricing[p]) s.pricing[p] = {};
    if (!s.pricing[p][u]) s.pricing[p][u] = {};
    if (inp.value !== "") s.pricing[p][u][y] = Number(inp.value);
  });
  save(); toast("Settings saved ✓", "success");
}

/* ── Modal ──────────────────────────────────────────────────── */
function showModal(size = "") {
  const modal = document.getElementById("modal");
  modal.className = "modal" + (size ? " modal-" + size : "");
  document.getElementById("overlay").classList.add("show");
}
function closeModal() { document.getElementById("overlay").classList.remove("show"); }
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  buildNav();
  if (!location.hash || location.hash === "#") location.hash = "#/home";
  renderRoute();
});
