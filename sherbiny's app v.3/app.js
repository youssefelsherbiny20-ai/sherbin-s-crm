/* ============================================================
   Youssef Sales CRM — v2
   Normalized state, payment-based commission engine, offline SVG charts.
   Vanilla JS, no build step, no server. Data persists in localStorage.
   ============================================================ */

const LS_KEY = "youssef_crm_state_v2";
const LS_KEY_V1 = "youssef_crm_state_v1";
const STATE_VERSION = 2;

/* ---------------- generic utils ---------------- */
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (n) => (n < 0 ? "-" : "") + Math.round(Math.abs(n || 0)).toLocaleString() + " EGP";
const fmtNum = (n) => Math.round(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateShort = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—";
const addDays = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const addMonthsDate = (d, n) => { const x = new Date(d + "T00:00:00"); x.setMonth(x.getMonth() + n); return x; };
const addYearsStr = (d, n) => { const x = new Date(d + "T00:00:00"); x.setFullYear(x.getFullYear() + n); return x.toISOString().slice(0, 10); };
const ymOf = (d) => d.slice(0, 7);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const monthLabel = (ymStr) => { const [y, m] = ymStr.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" }); };
function pad4(n) { return String(n).padStart(4, "0"); }

function toast(msg, isErr) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.toggle("err", !!isErr); t.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------------- default settings ---------------- */
function defaultSettings() {
  return {
    vatRate: 0.14,
    commissionNew: 0.10,
    commissionRenewal: 0.05,
    trainingFee: 500,
    payoutDelayMonths: 2,
    payoutDay: 10,
    tiers: [
      { min: 1, max: 5, pct: 0.06 },
      { min: 6, max: 10, pct: 0.07 },
      { min: 11, max: 20, pct: 0.08 },
      { min: 21, max: 50, pct: 0.09 },
      { min: 51, max: 999999, pct: 0.10 },
    ],
    dailyRules: { zero: 40, one: 20, twoPlus: 0 },
    monthlyTargets: { default: 800000 },
    pricing: {
      CRM: {
        5: { 1: 13000, 2: 19500, 3: 26000 }, 10: { 1: 22000, 2: 33000, 3: 44000 },
        15: { 1: 28000, 2: 42000, 3: 56000 }, 20: { 1: 32000, 2: 48000, 3: 64000 },
        25: { 1: 38000, 2: 57000, 3: 76000 }, 30: { 1: 40000, 2: 60000, 3: 80000 },
        40: { 1: 46000, 2: 69000, 3: 92000 }, 50: { 1: 53000, 2: 79500, 3: 106000 },
        70: { 1: 68000, 2: 102000, 3: 136000 }, 100: { 1: 77000, 2: 115500, 3: 154000 },
      },
      Navi: { 5: { 1: 18000 }, 10: { 1: 30000 }, 15: { 1: 40500 }, 20: { 1: 54000 }, 25: { 1: 60000 }, 30: { 1: 72000 } },
      HR: {} // not confirmed — manual override only
    }
  };
}

function emptyState() {
  return {
    version: STATE_VERSION,
    counters: { deal: 0, payment: 0, client: 0 },
    clients: [],
    deals: [],
    payments: [],
    activity: [],
    settings: defaultSettings(),
  };
}

function nextId(kind) {
  const prefix = { deal: "D", payment: "P", client: "CL" }[kind];
  STATE.counters[kind] = (STATE.counters[kind] || 0) + 1;
  return `${prefix}-${pad4(STATE.counters[kind])}`;
}

function getOrCreateClient(name) {
  name = (name || "").trim() || "Unnamed client";
  let c = STATE.clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (c) return c;
  c = { id: nextId("client"), name, phone: "", email: "", company: "", notes: "", createdAt: todayStr(), updatedAt: todayStr() };
  STATE.clients.push(c);
  return c;
}

/* ============================================================
   FINANCIAL ENGINE — single source of truth for every calculation.
   ============================================================ */
function priceLookup(product, users, duration) {
  const table = STATE.settings.pricing[product] || {};
  const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!tiers.length) return null;
  if (table[users]) { const row = table[users]; return row[duration] || row[1] || null; }
  const u = tiers.reduce((a, b) => Math.abs(b - users) < Math.abs(a - users) ? b : a);
  const row = table[u];
  return row ? (row[duration] || row[1] || null) : null;
}
function addedUsersOf(deal) { return Math.max((deal.newUsers || 0) - (deal.oldUsers || 0), 0); }
function usersForPricing(deal) { return deal.dealType === "Upgrade" ? addedUsersOf(deal) : deal.newUsers; }
function standardPrice(deal) { return priceLookup(deal.product, usersForPricing(deal), deal.durationYears); }
function basePriceOf(deal) {
  if (deal.overridePrice != null && deal.overridePrice !== "") return Number(deal.overridePrice);
  return standardPrice(deal) || 0;
}
function vatAmountOf(deal) { return deal.vatApplicable ? basePriceOf(deal) * STATE.settings.vatRate : 0; }
function invoiceTotalOf(deal) { return basePriceOf(deal) + vatAmountOf(deal); }
function renewalDateOf(deal) { return addYearsStr(deal.dealDate, deal.durationYears || 1); }

function paymentsOfDeal(dealId) { return STATE.payments.filter(p => p.dealId === dealId); }
function collectedOf(deal) { return paymentsOfDeal(deal.id).reduce((s, p) => s + (Number(p.amountPaid) || 0), 0); }
function outstandingOf(deal) { return invoiceTotalOf(deal) - collectedOf(deal); }

/* payment status is ALWAYS derived live — never trusted from stored state */
function paymentStatus(p) {
  const remaining = Number(p.amountDue) - Number(p.amountPaid || 0);
  if (remaining <= 0.5) return "Collected";
  if (p.dueDate < todayStr()) return "Overdue";
  if (p.dueDate === todayStr()) return "Due";
  if (Number(p.amountPaid || 0) > 0) return "Partially Paid";
  return "Pending";
}
function dealCollectionSummary(deal) {
  if (deal.stage !== "Won") return "—";
  const out = outstandingOf(deal);
  if (out <= 0.5) return "Collected";
  const ps = paymentsOfDeal(deal.id);
  if (ps.some(p => paymentStatus(p) === "Overdue")) return "Overdue";
  if (collectedOf(deal) > 0) return "Partial";
  return "Due";
}

/* ---------------- commission: computed per PAID payment, never duplicated ----------------
   Training fee is deducted only from the deal's own paid milestones, in date order,
   only for New Deal (Acquisition), only once total (carried forward if first payment is small). */
function commissionRateOf(deal) {
  const s = STATE.settings;
  if (deal.dealType === "New Deal") return s.commissionNew;
  if (deal.dealType === "Renewal") return s.commissionRenewal;
  if (deal.dealType === "Upgrade") {
    const added = addedUsersOf(deal);
    const tier = s.tiers.find(t => added >= t.min && added <= t.max);
    return tier ? tier.pct : 0;
  }
  return 0;
}
function expectedPayoutDate(earnedDateStr) {
  const s = STATE.settings;
  const d = addMonthsDate(earnedDateStr, s.payoutDelayMonths);
  return new Date(d.getFullYear(), d.getMonth(), s.payoutDay).toISOString().slice(0, 10);
}
/* Returns one commission line per PAID payment of this deal, training fee deducted
   in chronological order so it is never applied twice and never goes negative. */
function commissionLinesForDeal(deal) {
  if (deal.stage !== "Won") return [];
  const rate = commissionRateOf(deal);
  const paidPayments = paymentsOfDeal(deal.id)
    .filter(p => Number(p.amountPaid || 0) > 0)
    .sort((a, b) => (a.paidDate || a.dueDate).localeCompare(b.paidDate || b.dueDate));
  let remainingTraining = deal.dealType === "New Deal" ? STATE.settings.trainingFee : 0;
  const lines = [];
  for (const p of paidPayments) {
    const eligible = Number(p.amountPaid);
    const gross = eligible * rate;
    const deduction = Math.min(remainingTraining, gross);
    remainingTraining -= deduction;
    const net = gross - deduction;
    const earnedDate = p.paidDate || p.dueDate;
    const payoutDate = expectedPayoutDate(earnedDate);
    let payoutStatus = "LOCKED";
    if (p.commissionPaid) payoutStatus = "PAID";
    else if (payoutDate <= todayStr()) payoutStatus = "AVAILABLE";
    lines.push({
      dealId: deal.id, paymentId: p.id, client: deal.client, dealType: deal.dealType,
      eligibleCollectedAmount: eligible, commissionRate: rate, grossCommission: gross,
      trainingFeeDeduction: deduction, netCommission: net, earnedDate, expectedPayoutDate: payoutDate,
      payoutStatus, actualPayoutDate: p.commissionPaidDate || null,
    });
  }
  return lines;
}
function allCommissionLines() { return wonDeals().flatMap(commissionLinesForDeal); }
function commissionVault() {
  const lines = allCommissionLines();
  const sum = (arr) => arr.reduce((s, l) => s + l.netCommission, 0);
  return {
    earned: sum(lines),
    locked: sum(lines.filter(l => l.payoutStatus === "LOCKED")),
    available: sum(lines.filter(l => l.payoutStatus === "AVAILABLE")),
    paid: sum(lines.filter(l => l.payoutStatus === "PAID")),
    lines,
  };
}
function nextPayoutInfo() {
  const upcoming = allCommissionLines().filter(l => l.payoutStatus !== "PAID").sort((a, b) => a.expectedPayoutDate.localeCompare(b.expectedPayoutDate));
  if (!upcoming.length) return null;
  const date = upcoming[0].expectedPayoutDate;
  const sameDate = upcoming.filter(l => l.expectedPayoutDate === date);
  return { date, amount: sameDate.reduce((s, l) => s + l.netCommission, 0) };
}

function wonDeals() { return STATE.deals.filter(d => d.stage === "Won"); }
function inMonth(dateStr, ymStr) { return dateStr && ymOf(dateStr) === ymStr; }
function currentYM() { return ymOf(todayStr()); }
function monthlyTarget(ymStr) { return STATE.settings.monthlyTargets[ymStr] ?? STATE.settings.monthlyTargets.default; }

/* ---------------- activity / daily rules ---------------- */
function requiredCallsFor(meetings) {
  const r = STATE.settings.dailyRules;
  if (meetings >= 2) return r.twoPlus;
  if (meetings === 1) return r.one;
  return r.zero;
}
function activityScore(day) {
  const req = requiredCallsFor(day.meetings);
  if (req <= 0) return 100;
  return clamp(Math.round((day.answeredCalls / req) * 100), 0, 100);
}
function activityOf(dateStr) { return STATE.activity.find(a => a.date === dateStr); }
function getOrCreateActivity(dateStr) {
  let a = activityOf(dateStr);
  if (!a) { a = { date: dateStr, answeredCalls: 0, meetings: 0 }; STATE.activity.push(a); }
  return a;
}

/* ============================================================
   VALIDATION
   ============================================================ */
function validateDealInput(payload) {
  const errs = [];
  if (!payload.client || !payload.client.trim()) errs.push("Client name is required.");
  if (payload.newUsers < 0 || payload.oldUsers < 0) errs.push("Users cannot be negative.");
  if (payload.dealType === "Upgrade" && payload.newUsers <= payload.oldUsers) errs.push("Upgrade requires new users to be greater than old users.");
  if (payload.durationYears < 1 || payload.durationYears > 3) errs.push("Duration must be 1–3 years.");
  if (payload.vatRate != null && (payload.vatRate < 0 || payload.vatRate > 1)) errs.push("Invalid VAT rate.");
  if (!payload.dealDate) errs.push("Deal date is required.");
  return errs;
}
function validateMilestones(milestones, invoiceTotal) {
  const errs = [];
  const total = milestones.reduce((s, m) => s + Number(m.amountDue || 0), 0);
  if (milestones.some(m => Number(m.amountDue) < 0)) errs.push("Milestone amounts cannot be negative.");
  if (milestones.some(m => Number(m.amountPaid || 0) < 0)) errs.push("Paid amounts cannot be negative.");
  if (milestones.some(m => Number(m.amountPaid || 0) > Number(m.amountDue) + 0.5)) errs.push("A milestone's paid amount exceeds its due amount.");
  if (total > invoiceTotal + 1) errs.push(`Milestones total (${fmtNum(total)}) exceeds invoice total (${fmtNum(invoiceTotal)}).`);
  if (milestones.some(m => !m.dueDate)) errs.push("Every milestone needs a due date.");
  return errs;
}
function isDuplicateDealId(id, excludeIdx) {
  return STATE.deals.some((d, i) => d.id === id && i !== excludeIdx);
}

/* ============================================================
   PAYMENT PLAN BUILDER
   ============================================================ */
function buildPlan(planType, invoiceTotal, firstDueDate) {
  const mk = (pct, offsetDays) => ({ id: null, percentage: pct, amountDue: Math.round(invoiceTotal * pct) / 100, dueDate: addDays(firstDueDate, offsetDays), amountPaid: 0, paidDate: null, paymentMethod: "", notes: "", commissionPaid: false, commissionPaidDate: null });
  if (planType === "FULL") return [{ ...mk(100, 0) }];
  if (planType === "50/50") return [mk(50, 0), mk(50, 30)];
  if (planType === "3 INSTALLMENTS") return [mk(34, 0), mk(33, 30), mk(33, 60)];
  return []; // CUSTOM starts empty, user adds rows
}
function reconcileRounding(milestones, invoiceTotal) {
  // fix cent-level rounding drift so sum matches invoice total exactly
  if (!milestones.length) return milestones;
  const sum = milestones.reduce((s, m) => s + Number(m.amountDue), 0);
  const diff = Math.round(invoiceTotal - sum);
  if (diff !== 0) milestones[milestones.length - 1].amountDue = Math.round(Number(milestones[milestones.length - 1].amountDue) + diff);
  return milestones;
}

/* ============================================================
   MIGRATION (v1 flat schema -> v2 normalized) — never destroys real data
   ============================================================ */
function migrateV1(oldRaw) {
  try {
    const old = JSON.parse(oldRaw);
    const st = emptyState();
    st.settings = Object.assign(defaultSettings(), {
      vatRate: old.settings?.vatRate, commissionNew: old.settings?.commissionNew,
      commissionRenewal: old.settings?.commissionRenewal, payoutDay: old.settings?.payoutDay,
      tiers: old.settings?.tiers, monthlyTargets: { default: old.settings?.targetMonthly || 800000 },
      dailyRules: { zero: old.settings?.callsTarget || 40, one: Math.round((old.settings?.callsTarget || 40) / 2), twoPlus: 0 },
      pricing: old.settings?.pricing || defaultSettings().pricing,
    });
    (old.deals || []).forEach(d => {
      const c = getOrCreateClientRaw(st, d.client);
      const id = `D-${pad4(++st.counters.deal)}`;
      st.deals.push({
        id, clientId: c.id, client: c.name, product: d.product, dealType: d.dealType, stage: d.stage || "Won",
        dealDate: d.date, oldUsers: d.oldUsers || 0, newUsers: d.newUsers || 0, durationYears: d.duration || 1,
        vatApplicable: !!d.vat, overridePrice: d.overridePrice ?? null, notes: d.notes || "",
        createdAt: d.date, updatedAt: todayStr(),
      });
      (old.payments || []).filter(p => p.dealId === d.id).forEach(p => {
        st.payments.push({
          id: `P-${pad4(++st.counters.payment)}`, dealId: id, percentage: null,
          amountDue: p.amountDue, amountPaid: p.amountPaid || 0, dueDate: p.dueDate, paidDate: p.paidDate || null,
          paymentMethod: p.method || "", notes: "", commissionPaid: !!d.commissionPaid, commissionPaidDate: d.commissionPaidDate || null,
        });
      });
    });
    st.activity = (old.activity || []).map(a => ({ date: a.date, answeredCalls: a.calls || 0, meetings: a.meetings || 0 }));
    return st;
  } catch (e) { return null; }
}
function getOrCreateClientRaw(st, name) {
  name = (name || "Unnamed client").trim();
  let c = st.clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (c) return c;
  c = { id: `CL-${pad4(++st.counters.client)}`, name, phone: "", email: "", company: "", notes: "", createdAt: todayStr(), updatedAt: todayStr() };
  st.clients.push(c);
  return c;
}

/* ============================================================
   SEED DEMO DATA — realistic, normalized, covers every scenario
   ============================================================ */
function buildSeed() {
  const st = emptyState();
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clientNames = ["Nile Retail Group", "Cairo Fintech Co", "Delta Logistics", "Alexandria Motors",
    "Giza HealthCare", "Red Sea Hospitality", "Sphinx Manufacturing", "Luxor Education Group",
    "Zamalek Media House", "October Real Estate"];
  clientNames.forEach(n => getOrCreateClientRaw(st, n));
  const today = todayStr();

  function priceLookupLocal(product, users, duration) {
    const table = st.settings.pricing[product] || {};
    const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (!tiers.length) return null;
    const u = tiers.reduce((a, b) => Math.abs(b - users) < Math.abs(a - users) ? b : a);
    const row = table[u];
    return row ? (row[duration] || row[1]) : null;
  }

  // Explicit scenario set so every payment-plan / status combination is demonstrated
  const scenarios = [
    { product: "CRM", type: "New Deal", users: 20, dur: 2, vat: true, plan: "FULL", daysAgo: 55, payFull: true },
    { product: "CRM", type: "New Deal", users: 15, dur: 1, vat: true, plan: "50/50", daysAgo: 48, pay: [true, true] },
    { product: "CRM", type: "New Deal", users: 30, dur: 3, vat: true, plan: "50/50", daysAgo: 20, pay: [true, false] },
    { product: "Navi", type: "New Deal", users: 10, dur: 1, vat: true, plan: "3 INSTALLMENTS", daysAgo: 70, pay: [true, true, true] },
    { product: "Navi", type: "New Deal", users: 20, dur: 1, vat: false, plan: "3 INSTALLMENTS", daysAgo: 40, pay: [true, "partial", false] },
    { product: "CRM", type: "Renewal", users: 25, dur: 1, vat: true, plan: "FULL", daysAgo: 10, payFull: true },
    { product: "CRM", type: "Renewal", users: 10, dur: 1, vat: true, plan: "50/50", daysAgo: 65, pay: [true, "overdue"] },
    { product: "HR", type: "New Deal", users: 20, dur: 1, vat: true, plan: "FULL", daysAgo: 5, payFull: false },
    { product: "CRM", type: "Upgrade", users: 40, oldUsers: 20, dur: 2, vat: true, plan: "FULL", daysAgo: 15, payFull: true },
    { product: "CRM", type: "Upgrade", users: 30, oldUsers: 15, dur: 1, vat: true, plan: "50/50", daysAgo: 6, pay: [true, false] },
    { product: "Navi", type: "New Deal", users: 5, dur: 1, vat: true, plan: "FULL", daysAgo: 90, payFull: true },
    { product: "CRM", type: "Renewal", users: 50, dur: 3, vat: true, plan: "3 INSTALLMENTS", daysAgo: 100, pay: [true, true, true] },
    { product: "CRM", type: "New Deal", users: 70, dur: 1, vat: true, plan: "50/50", daysAgo: 3, pay: [false, false] },
  ];

  scenarios.forEach(sc => {
    const client = rnd(clientNames);
    const dealDate = addDays(today, -sc.daysAgo);
    const oldUsers = sc.oldUsers || 0;
    const usersForPrice = sc.type === "Upgrade" ? Math.max(sc.users - oldUsers, 0) : sc.users;
    let base = sc.product === "HR" ? usersForPrice * 900 : priceLookupLocal(sc.product, usersForPrice, sc.dur);
    if (base == null) base = usersForPrice * 1000;
    const vatAmt = sc.vat ? base * st.settings.vatRate : 0;
    const invoiceTotal = base + vatAmt;

    const dealId = `D-${pad4(++st.counters.deal)}`;
    const cObj = getOrCreateClientRaw(st, client);
    st.deals.push({
      id: dealId, clientId: cObj.id, client, product: sc.product, dealType: sc.type, stage: "Won",
      dealDate, oldUsers, newUsers: sc.users, durationYears: sc.dur, vatApplicable: sc.vat,
      overridePrice: sc.product === "HR" ? Math.round(base) : null, notes: "",
      createdAt: dealDate, updatedAt: dealDate,
    });

    let milestones = buildPlan(sc.plan, invoiceTotal, dealDate);
    milestones = reconcileRounding(milestones, invoiceTotal);
    const payFlags = sc.payFull != null ? [sc.payFull] : sc.pay;
    milestones.forEach((m, i) => {
      const flag = payFlags[i];
      let amountPaid = 0, paidDate = null, dueDate = m.dueDate, method = "";
      if (flag === true) { amountPaid = m.amountDue; paidDate = addDays(dueDate, Math.random() < 0.4 ? 3 : -1); if (paidDate > today) paidDate = today; method = rnd(["Bank Transfer", "Instapay", "Cheque"]); }
      else if (flag === "partial") { amountPaid = Math.round(m.amountDue * 0.45); paidDate = addDays(dueDate, 2); method = "Cash"; }
      else if (flag === "overdue") { amountPaid = 0; dueDate = addDays(today, -10); }
      else { amountPaid = 0; }
      st.payments.push({
        id: `P-${pad4(++st.counters.payment)}`, dealId, percentage: m.percentage, amountDue: m.amountDue,
        amountPaid, dueDate, paidDate, paymentMethod: method, notes: "",
        commissionPaid: paidDate && sc.daysAgo > 75, commissionPaidDate: paidDate && sc.daysAgo > 75 ? addDays(paidDate, 60) : null,
      });
    });
  });

  // a few open pipeline (pre-close) deals
  const stages = ["New", "Qualified", "Meeting", "Negotiation"];
  ["Mansoura Trading", "Tanta Textiles", "Port Said Shipping", "Nasr City Retail", "Ismailia Agro", "6th October Foods"].forEach((cn, i) => {
    const product = rnd(["CRM", "Navi", "HR"]);
    const users = rnd([5, 10, 15, 20, 30]);
    const cObj = getOrCreateClientRaw(st, cn);
    st.deals.push({
      id: `D-${pad4(++st.counters.deal)}`, clientId: cObj.id, client: cn, product, dealType: "New Deal",
      stage: stages[i % stages.length], dealDate: addDays(today, -Math.floor(Math.random() * 20)),
      oldUsers: 0, newUsers: users, durationYears: 1, vatApplicable: true, overridePrice: null, notes: "",
      createdAt: today, updatedAt: today,
    });
  });

  // activity: last 30 days, varied meeting counts so all 3 daily-rule bands are demonstrated
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    const isWeekend = [0, 6].includes(new Date(d + "T00:00:00").getDay());
    const meetings = isWeekend ? 0 : rnd([0, 0, 1, 1, 2, 3]);
    const req = meetings >= 2 ? 0 : meetings === 1 ? 20 : 40;
    const calls = isWeekend ? Math.floor(Math.random() * 8) : Math.max(0, Math.round(req * (0.6 + Math.random() * 0.6)));
    st.activity.push({ date: d, answeredCalls: calls, meetings });
  }

  return st;
}

/* ============================================================
   LOAD / SAVE
   ============================================================ */
let toastQueued = null;
let STATE = load();
function load() {
  const rawV2 = localStorage.getItem(LS_KEY);
  if (rawV2) {
    try { const parsed = JSON.parse(rawV2); if (parsed.version === STATE_VERSION) return parsed; } catch (e) {}
  }
  const rawV1 = localStorage.getItem(LS_KEY_V1);
  if (rawV1) {
    const migrated = migrateV1(rawV1);
    if (migrated) { localStorage.setItem(LS_KEY, JSON.stringify(migrated)); toastQueued = "Existing data migrated to v2."; return migrated; }
  }
  const seed = buildSeed();
  localStorage.setItem(LS_KEY, JSON.stringify(seed));
  return seed;
}
function save() { STATE.version = STATE_VERSION; localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }

/* ---------------- backup / restore ---------------- */
function exportBackup() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `youssef-crm-backup-${todayStr()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast("Backup exported");
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.deals || !parsed.payments || !parsed.settings) throw new Error("bad file");
      STATE = parsed; STATE.version = STATE_VERSION; save(); toast("Backup imported"); renderRoute();
    } catch (e) { toast("Invalid backup file", true); }
  };
  reader.readAsText(file);
}
function resetDemoData() {
  if (!confirm("This clears ALL current data and reloads fresh demo data. This cannot be undone. Continue?")) return;
  STATE = buildSeed(); save(); toast("Demo data reset"); location.hash = "#/home"; renderRoute();
}
function clearAllData() {
  if (!confirm("This permanently deletes ALL your data (clients, deals, payments, activity). Continue?")) return;
  STATE = emptyState(); save(); toast("All data cleared"); location.hash = "#/home"; renderRoute();
}

/* ============================================================
   LIGHTWEIGHT OFFLINE SVG CHARTS (no external library)
   ============================================================ */
const CHART_COLORS = ["#E8A33D", "#35C4B0", "#8B8FF7", "#34D399", "#F1636B", "#FBBF24"];

function svgLineChart(seriesArr, labels, opts = {}) {
  const w = opts.w || 260, h = opts.h || 110, pad = 6;
  const allVals = seriesArr.flatMap(s => s.values);
  const max = Math.max(...allVals, 1), min = Math.min(...allVals, 0);
  const range = (max - min) || 1;
  const n = labels.length;
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const toY = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
  const paths = seriesArr.map((s, si) => {
    const pts = s.values.map((v, i) => `${(pad + i * stepX).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
    return `<polyline fill="none" stroke="${CHART_COLORS[si % CHART_COLORS.length]}" stroke-width="2" points="${pts}" />`;
  }).join("");
  const legend = seriesArr.map((s, si) => `<span><i style="background:${CHART_COLORS[si % CHART_COLORS.length]}"></i>${s.name}</span>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${paths}</svg><div class="chart-legend">${legend}</div>`;
}

function svgBarChart(seriesArr, labels, opts = {}) {
  const w = opts.w || 260, h = opts.h || 110, pad = 6, gap = 4;
  const allVals = seriesArr.flatMap(s => s.values);
  const max = Math.max(...allVals, 1);
  const n = labels.length;
  const groupW = (w - pad * 2) / n;
  const barW = (groupW - gap) / seriesArr.length;
  let bars = "";
  labels.forEach((lb, i) => {
    seriesArr.forEach((s, si) => {
      const v = s.values[i] || 0;
      const bh = (v / max) * (h - pad * 2 - 12);
      const x = pad + i * groupW + si * barW;
      const y = h - pad - 12 - bh;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 1.5).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${CHART_COLORS[si % CHART_COLORS.length]}" />`;
    });
    bars += `<text x="${(pad + i * groupW + groupW / 2).toFixed(1)}" y="${h - 2}" font-size="8" fill="#8A93A6" text-anchor="middle">${lb}</text>`;
  });
  const legend = seriesArr.length > 1 ? seriesArr.map((s, si) => `<span><i style="background:${CHART_COLORS[si % CHART_COLORS.length]}"></i>${s.name}</span>`).join("") : "";
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${bars}</svg><div class="chart-legend">${legend}</div>`;
}

function svgDonut(segments, opts = {}) {
  const size = opts.size || 110, r = size / 2 - 10, cx = size / 2, cy = size / 2, circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0, circles = "";
  segments.forEach((seg, i) => {
    const frac = seg.value / total;
    const dash = frac * circumference;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS[i % CHART_COLORS.length]}" stroke-width="14"
      stroke-dasharray="${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" />`;
    offset += dash;
  });
  const legend = segments.map((s, i) => `<span><i style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${s.label} (${fmtNum(s.value)})</span>`).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${circles}</svg><div class="chart-legend">${legend}</div>`;
}

function lastNMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = [
  { id: "home", label: "Home", icon: "⌂" }, { id: "deals", label: "Deals", icon: "◇" },
  { id: "clients", label: "Clients", icon: "☺" }, { id: "collections", label: "Collections", icon: "$" },
  { id: "commission", label: "Commission", icon: "%" }, { id: "activity", label: "Activity", icon: "▤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];
function buildNav() {
  document.getElementById("nav").innerHTML = ROUTES.map(r =>
    `<a data-route="${r.id}" href="#/${r.id}"><span class="ic">${r.icon}</span><span class="lbl">${r.label}</span></a>`).join("");
}
function currentRoute() { const h = location.hash.replace("#/", ""); return ROUTES.find(r => r.id === h) ? h : "home"; }
function renderRoute() {
  const r = currentRoute();
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.dataset.route === r));
  ({ home: renderHome, deals: renderDeals, clients: renderClients, collections: renderCollections, commission: renderCommission, activity: renderActivity, settings: renderSettings })[r]();
  if (toastQueued) { toast(toastQueued); toastQueued = null; }
}
window.addEventListener("hashchange", renderRoute);

/* shared dashboard month filter */
let dashboardYM = currentYM();

/* ============================================================
   HOME
   ============================================================ */
function renderHome() {
  const main = document.getElementById("main");
  const s = STATE.settings;
  const won = wonDeals();
  const monthDeals = won.filter(d => inMonth(d.dealDate, dashboardYM));
  const sales = monthDeals.reduce((sum, d) => sum + invoiceTotalOf(d), 0);
  const collectedThisMonth = STATE.payments.filter(p => p.paidDate && inMonth(p.paidDate, dashboardYM)).reduce((s2, p) => s2 + Number(p.amountPaid || 0), 0);
  const totalOutstanding = won.reduce((sum, d) => sum + outstandingOf(d), 0);
  const commissionThisMonth = allCommissionLines().filter(l => inMonth(l.earnedDate, dashboardYM)).reduce((s2, l) => s2 + l.netCommission, 0);
  const target = monthlyTarget(dashboardYM);
  const achievement = target ? sales / target : 0;
  const remaining = Math.max(target - sales, 0);

  const todayAct = activityOf(todayStr()) || { answeredCalls: 0, meetings: 0 };
  const reqCalls = requiredCallsFor(todayAct.meetings);
  const score = activityScore(todayAct);
  const dealsToday = STATE.deals.filter(d => d.dealDate === todayStr()).length;

  const overdueDeals = won.filter(d => dealCollectionSummary(d) === "Overdue");
  const topOverdue = overdueDeals.sort((a, b) => outstandingOf(b) - outstandingOf(a))[0];
  const dueSoon = STATE.payments.filter(p => paymentStatus(p) !== "Collected" && p.dueDate >= todayStr() && p.dueDate <= addDays(todayStr(), 7));
  const dueSoonAmt = dueSoon.reduce((s2, p) => s2 + (Number(p.amountDue) - Number(p.amountPaid || 0)), 0);
  const vault = commissionVault();
  const meetingStageCount = STATE.deals.filter(d => d.stage === "Meeting").length;
  const upcomingRenewals = won.filter(d => {
    const rd = renewalDateOf(d);
    return rd >= todayStr() && rd <= addDays(todayStr(), 90);
  }).sort((a, b) => renewalDateOf(a).localeCompare(renewalDateOf(b)));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stages = ["New", "Qualified", "Meeting", "Negotiation", "Won", "Collected"];
  const stageColor = { New: "var(--indigo)", Qualified: "var(--teal)", Meeting: "#a78bfa", Negotiation: "var(--gold)", Won: "var(--green)", Collected: "#16a34a" };
  const pipelineHtml = stages.map(st => {
    let n, v;
    if (st === "Collected") { n = won.filter(d => dealCollectionSummary(d) === "Collected").length; v = won.reduce((s2, d) => s2 + collectedOf(d), 0); }
    else if (st === "Won") { n = won.length; v = won.reduce((s2, d) => s2 + invoiceTotalOf(d), 0); }
    else { const ds = STATE.deals.filter(d => d.stage === st); n = ds.length; v = ds.reduce((s2, d) => s2 + (basePriceOf(d) || 0), 0); }
    return `<div class="pipe-stage" style="--stage-c:${stageColor[st]}"><div class="n">${n}</div><div class="l">${st}</div><div class="v">${fmtNum(v)} EGP</div></div>`;
  }).join("");

  /* ---- chart data ---- */
  const months = lastNMonths(6);
  const monthLabels = months.map(monthLabel);
  const salesSeries = months.map(m => won.filter(d => inMonth(d.dealDate, m)).reduce((s2, d) => s2 + invoiceTotalOf(d), 0));
  const collSeries = months.map(m => STATE.payments.filter(p => p.paidDate && inMonth(p.paidDate, m)).reduce((s2, p) => s2 + Number(p.amountPaid || 0), 0));
  const callsSeries = [], meetSeries = [], dayLabels = [];
  for (let i = 13; i >= 0; i--) { const d = addDays(todayStr(), -i); const a = activityOf(d); dayLabels.push(new Date(d + "T00:00:00").getDate()); callsSeries.push(a ? a.answeredCalls : 0); meetSeries.push(a ? a.meetings : 0); }
  const productMix = ["CRM", "Navi", "HR"].map(p => ({ label: p, value: won.filter(d => d.product === p).reduce((s2, d) => s2 + invoiceTotalOf(d), 0) })).filter(x => x.value > 0);
  const typeMix = ["New Deal", "Renewal", "Upgrade"].map(t => ({ label: t, value: won.filter(d => d.dealType === t).reduce((s2, d) => s2 + invoiceTotalOf(d), 0) })).filter(x => x.value > 0);
  const pipelineDist = stages.slice(0, 4).map(st => ({ label: st, value: STATE.deals.filter(d => d.stage === st).length })).filter(x => x.value > 0);

  main.innerHTML = `
    <div class="page-head">
      <div><h1>${greeting}, Youssef 👋</h1><p>${monthLabel(dashboardYM)} · Personal Revenue &amp; Sales OS</p></div>
      <div style="display:flex; gap:10px; align-items:center;">
        <select class="month-select" id="homeMonth">${lastNMonths(12).reverse().map(m => `<option value="${m}" ${m === dashboardYM ? "selected" : ""}>${monthLabel(m)}</option>`).join("")}</select>
        <button class="btn" onclick="openDealForm()">+ New Deal</button>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi accent-gold"><div class="lbl">Sales / Contracted</div><div class="val">${fmtMoney(sales)}</div></div>
      <div class="kpi accent-green"><div class="lbl">Collected Cash</div><div class="val">${fmtMoney(collectedThisMonth)}</div></div>
      <div class="kpi accent-red"><div class="lbl">Outstanding</div><div class="val">${fmtMoney(totalOutstanding)}</div></div>
      <div class="kpi accent-teal"><div class="lbl">Commission (earned)</div><div class="val">${fmtMoney(commissionThisMonth)}</div></div>
    </div>

    <div class="panel">
      <h3>Target achievement <small>${fmtMoney(target)} target for ${monthLabel(dashboardYM)}</small></h3>
      <div class="progress-track"><div class="progress-fill" style="width:${clamp(achievement * 100, 0, 100)}%"></div></div>
      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted);">
        <span><b style="color:var(--text)">${(achievement * 100).toFixed(1)}%</b> achieved</span>
        <span>${fmtMoney(remaining)} remaining</span>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="panel">
        <h3>Today <small>Activity score ${score}%</small></h3>
        <div class="kpi-row" style="margin-bottom:0;">
          <div class="kpi"><div class="lbl">Calls</div><div class="val">${todayAct.answeredCalls} <span style="font-size:12px; color:var(--muted); font-weight:400;">/ ${reqCalls}</span></div></div>
          <div class="kpi"><div class="lbl">Meetings</div><div class="val">${todayAct.meetings}</div></div>
          <div class="kpi"><div class="lbl">Deals logged</div><div class="val">${dealsToday}</div></div>
        </div>
      </div>
      <div class="panel">
        <h3>Action Center</h3>
        <div class="action-item"><div class="dot red"></div><div class="txt">${topOverdue ? `Payment overdue — <b>${topOverdue.client}</b> — ${fmtMoney(outstandingOf(topOverdue))}` : "No overdue payments"}</div></div>
        <div class="action-item"><div class="dot amber"></div><div class="txt"><b>${dueSoon.length}</b> payment(s) due within 7 days — ${fmtMoney(dueSoonAmt)}</div></div>
        <div class="action-item"><div class="dot green"></div><div class="txt">Commission available — <b>${fmtMoney(vault.available)}</b></div></div>
        <div class="action-item"><div class="dot teal"></div><div class="txt"><b>${meetingStageCount}</b> deal(s) in Meeting stage</div></div>
        <div class="action-item"><div class="dot amber"></div><div class="txt">${upcomingRenewals.length ? `<b>${upcomingRenewals[0].client}</b> renews ${fmtDateShort(renewalDateOf(upcomingRenewals[0]))}` : "No renewals in the next 90 days"}</div></div>
      </div>
    </div>

    <div class="panel"><h3>Pipeline</h3><div class="pipeline">${pipelineHtml}</div></div>

    <div class="panel">
      <h3>Analytics</h3>
      <div class="chart-grid">
        <div class="chart-card"><h4>Monthly sales trend</h4>${svgLineChart([{ name: "Sales", values: salesSeries }], monthLabels)}</div>
        <div class="chart-card"><h4>Monthly collection trend</h4>${svgLineChart([{ name: "Collected", values: collSeries }], monthLabels)}</div>
        <div class="chart-card"><h4>Sales vs collected</h4>${svgBarChart([{ name: "Sales", values: salesSeries }, { name: "Collected", values: collSeries }], monthLabels)}</div>
        <div class="chart-card"><h4>Commission: earned / available / paid</h4>${svgBarChart([{ name: "EGP", values: [vault.locked, vault.available, vault.paid] }], ["Locked", "Available", "Paid"])}</div>
        <div class="chart-card"><h4>Pipeline distribution</h4>${pipelineDist.length ? svgDonut(pipelineDist) : '<div class="empty">No open pipeline</div>'}</div>
        <div class="chart-card"><h4>Product mix</h4>${productMix.length ? svgDonut(productMix) : '<div class="empty">No data</div>'}</div>
        <div class="chart-card"><h4>Deal type mix</h4>${typeMix.length ? svgDonut(typeMix) : '<div class="empty">No data</div>'}</div>
        <div class="chart-card"><h4>Calls + meetings (14 days)</h4>${svgLineChart([{ name: "Calls", values: callsSeries }, { name: "Meetings", values: meetSeries }], dayLabels.map(String))}</div>
      </div>
    </div>
  `;
  document.getElementById("homeMonth").onchange = (e) => { dashboardYM = e.target.value; renderHome(); };
}

/* ============================================================
   DEALS
   ============================================================ */
let dealFilters = { stage: "All", product: "All", type: "All", q: "", month: "All" };
function renderDeals() {
  const main = document.getElementById("main");
  const stages = ["All", "New", "Qualified", "Meeting", "Negotiation", "Won"];
  const months = ["All", ...lastNMonths(12).reverse()];
  main.innerHTML = `
    <div class="page-head"><div><h1>Deals</h1><p>${STATE.deals.length} total · every deal, one clean card</p></div><button class="btn" onclick="openDealForm()">+ New Deal</button></div>
    <div class="filter-bar">
      <input id="dealSearch" placeholder="Search client…" value="${dealFilters.q}">
      <select id="stageFilter">${stages.map(s => `<option ${s === dealFilters.stage ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select id="productFilter">${["All", "CRM", "Navi", "HR"].map(p => `<option ${p === dealFilters.product ? "selected" : ""}>${p}</option>`).join("")}</select>
      <select id="typeFilter">${["All", "New Deal", "Renewal", "Upgrade"].map(t => `<option ${t === dealFilters.type ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select id="monthFilter">${months.map(m => `<option value="${m}" ${m === dealFilters.month ? "selected" : ""}>${m === "All" ? "All months" : monthLabel(m)}</option>`).join("")}</select>
    </div>
    <div class="card-grid" id="dealCards"></div>
  `;
  ["stageFilter", "productFilter", "typeFilter", "monthFilter"].forEach(id => {
    document.getElementById(id).onchange = (e) => {
      const key = { stageFilter: "stage", productFilter: "product", typeFilter: "type", monthFilter: "month" }[id];
      dealFilters[key] = e.target.value; renderDealCards();
    };
  });
  document.getElementById("dealSearch").oninput = (e) => { dealFilters.q = e.target.value; renderDealCards(); };
  renderDealCards();
}
function renderDealCards() {
  const el = document.getElementById("dealCards");
  let list = STATE.deals.slice().sort((a, b) => b.dealDate.localeCompare(a.dealDate));
  if (dealFilters.stage !== "All") list = list.filter(d => d.stage === dealFilters.stage);
  if (dealFilters.product !== "All") list = list.filter(d => d.product === dealFilters.product);
  if (dealFilters.type !== "All") list = list.filter(d => d.dealType === dealFilters.type);
  if (dealFilters.month !== "All") list = list.filter(d => inMonth(d.dealDate, dealFilters.month));
  if (dealFilters.q) list = list.filter(d => d.client.toLowerCase().includes(dealFilters.q.toLowerCase()));
  if (!list.length) { el.innerHTML = `<div class="empty">No deals match this filter.</div>`; return; }
  el.innerHTML = list.map(d => {
    const isWon = d.stage === "Won";
    const status = dealCollectionSummary(d);
    const badgeClass = { Collected: "paid", Overdue: "overdue", Due: "due", Partial: "partial" }[status] || "stage";
    const nd = isWon ? paymentsOfDeal(d.id).filter(p => paymentStatus(p) !== "Collected").sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] : null;
    return `<div class="rec-card" onclick="openDealDetail('${d.id}')">
      <div class="top"><div><div class="cli">${d.client}</div><div class="tag">${d.id} · ${d.product} · ${d.dealType}</div></div><span class="badge ${isWon ? badgeClass : "stage"}">${isWon ? status : d.stage}</span></div>
      ${isWon ? `
        <div class="row"><span>Invoice</span><b>${fmtMoney(invoiceTotalOf(d))}</b></div>
        <div class="row"><span>Collected</span><b>${fmtMoney(collectedOf(d))}</b></div>
        <div class="row"><span>Outstanding</span><b>${fmtMoney(outstandingOf(d))}</b></div>
        <div class="row"><span>Next payment</span><b>${nd ? fmtDateShort(nd.dueDate) : "—"}</b></div>
      ` : `
        <div class="row"><span>Estimated value</span><b>${fmtMoney(basePriceOf(d) || 0)}</b></div>
        <div class="row"><span>Users</span><b>${d.newUsers}</b></div>
        <div class="row"><span>Logged</span><b>${fmtDateShort(d.dealDate)}</b></div>
      `}
    </div>`;
  }).join("");
}

/* ---- New Deal form (with live preview + payment plan builder) ---- */
let formMilestones = [];
function openDealForm() {
  formMilestones = [];
  const d = { client: "", product: "CRM", dealType: "New Deal", oldUsers: 0, newUsers: 10, durationYears: 1, vatApplicable: true, overridePrice: "", stage: "Won", dealDate: todayStr(), notes: "" };
  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>New deal</h2>
    <p class="hint">Pricing, VAT, invoice total and commission all calculate automatically.</p>
    <div id="formErrs"></div>
    <div class="form-grid">
      <div class="field full"><label>Client</label><input id="f_client" placeholder="Client name" list="clientList"><datalist id="clientList">${STATE.clients.map(c => `<option value="${c.name}">`).join("")}</datalist></div>
      <div class="field"><label>Product</label><select id="f_product">${["CRM", "Navi", "HR"].map(p => `<option>${p}</option>`).join("")}</select></div>
      <div class="field"><label>Deal type</label><select id="f_type">${["New Deal", "Renewal", "Upgrade"].map(t => `<option>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Old users (upgrade only)</label><input id="f_old" type="number" value="0"></div>
      <div class="field"><label>New users</label><input id="f_new" type="number" value="10"></div>
      <div class="field"><label>Duration (years)</label><select id="f_dur">${[1, 2, 3].map(y => `<option>${y}</option>`).join("")}</select></div>
      <div class="field"><label>VAT applies?</label><select id="f_vat"><option>Yes</option><option>No</option></select></div>
      <div class="field"><label>Override price (optional)</label><input id="f_override" type="number" placeholder="leave blank to auto-price"></div>
      <div class="field"><label>Stage</label><select id="f_stage">${["New", "Qualified", "Meeting", "Negotiation", "Won"].map(s => `<option ${s === "Won" ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Deal date</label><input id="f_date" type="date" value="${todayStr()}"></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes" rows="2"></textarea></div>
    </div>
    <div id="pricePreview" class="panel" style="background:var(--panel2); margin-top:14px;"></div>
    <div id="planSection"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveNewDeal()">Save deal</button>
    </div>
  `;
  showModal();
  ["f_product", "f_type", "f_old", "f_new", "f_dur", "f_vat", "f_override", "f_stage", "f_date"].forEach(id => document.getElementById(id).addEventListener("input", updateFormPreview));
  updateFormPreview();
}
function readFormDealDraft() {
  return {
    client: document.getElementById("f_client").value.trim(),
    product: document.getElementById("f_product").value,
    dealType: document.getElementById("f_type").value,
    oldUsers: Number(document.getElementById("f_old").value) || 0,
    newUsers: Number(document.getElementById("f_new").value) || 0,
    durationYears: Number(document.getElementById("f_dur").value),
    vatApplicable: document.getElementById("f_vat").value === "Yes",
    overridePrice: document.getElementById("f_override").value === "" ? null : Number(document.getElementById("f_override").value),
    stage: document.getElementById("f_stage").value,
    dealDate: document.getElementById("f_date").value || todayStr(),
    notes: document.getElementById("f_notes").value,
  };
}
function updateFormPreview() {
  const draft = readFormDealDraft();
  const base = basePriceOf(draft), vat = vatAmountOf(draft), inv = base + vat;
  document.getElementById("pricePreview").innerHTML = `
    <div style="display:flex; gap:22px; flex-wrap:wrap; font-size:12.5px;">
      <div><span style="color:var(--muted)">Base / Net</span><br><b>${fmtMoney(base)}</b></div>
      <div><span style="color:var(--muted)">VAT (${(STATE.settings.vatRate * 100).toFixed(0)}%)</span><br><b>${fmtMoney(vat)}</b></div>
      <div><span style="color:var(--muted)">Invoice / Gross</span><br><b style="color:var(--gold)">${fmtMoney(inv)}</b></div>
      <div><span style="color:var(--muted)">Renewal date</span><br><b>${fmtDateShort(renewalDateOf(draft))}</b></div>
    </div>`;
  if (draft.stage === "Won") renderPlanBuilder(inv, draft.dealDate); else document.getElementById("planSection").innerHTML = "";
}
function renderPlanBuilder(invoiceTotal, firstDueDate, activePlan) {
  const plans = ["FULL", "50/50", "3 INSTALLMENTS", "CUSTOM"];
  window.__activePlan = activePlan || window.__activePlan || "FULL";
  if (!formMilestones.length || window.__lastInv !== invoiceTotal) {
    formMilestones = buildPlan(window.__activePlan, invoiceTotal, firstDueDate);
    formMilestones = reconcileRounding(formMilestones, invoiceTotal);
    window.__lastInv = invoiceTotal;
  }
  document.getElementById("planSection").innerHTML = `
    <div class="panel" style="margin-top:14px;">
      <h3>Payment plan</h3>
      <div class="plan-btns">${plans.map(p => `<button type="button" class="${p === window.__activePlan ? "active" : ""}" onclick="choosePlan('${p}',${invoiceTotal},'${firstDueDate}')">${p}</button>`).join("")}</div>
      <div id="milestoneRows"></div>
      ${window.__activePlan === "CUSTOM" ? `<button class="btn secondary small" style="margin-top:8px;" onclick="addCustomMilestone(${invoiceTotal},'${firstDueDate}')">+ Add milestone</button>` : ""}
      <div id="planTotal"></div>
    </div>`;
  renderMilestoneRows(invoiceTotal);
}
function choosePlan(plan, invoiceTotal, firstDueDate) {
  window.__activePlan = plan;
  formMilestones = plan === "CUSTOM" ? [] : reconcileRounding(buildPlan(plan, invoiceTotal, firstDueDate), invoiceTotal);
  renderPlanBuilder(invoiceTotal, firstDueDate, plan);
}
function addCustomMilestone(invoiceTotal, firstDueDate) {
  formMilestones.push({ percentage: null, amountDue: 0, dueDate: firstDueDate, amountPaid: 0, paidDate: null, paymentMethod: "", notes: "", commissionPaid: false, commissionPaidDate: null });
  renderMilestoneRows(invoiceTotal);
}
function renderMilestoneRows(invoiceTotal) {
  const el = document.getElementById("milestoneRows");
  el.innerHTML = formMilestones.map((m, i) => `
    <div class="milestone-row">
      <div><span class="mlbl">Due date</span><input type="date" value="${m.dueDate}" onchange="updateMilestone(${i},'dueDate',this.value,${invoiceTotal})"></div>
      <div><span class="mlbl">Amount due</span><input type="number" value="${m.amountDue}" onchange="updateMilestone(${i},'amountDue',this.value,${invoiceTotal})"></div>
      <div><span class="mlbl">Amount paid</span><input type="number" value="${m.amountPaid}" onchange="updateMilestone(${i},'amountPaid',this.value,${invoiceTotal})"></div>
      <div><span class="mlbl">Paid date</span><input type="date" value="${m.paidDate || ""}" onchange="updateMilestone(${i},'paidDate',this.value,${invoiceTotal})"></div>
      <button class="btn danger small" onclick="removeMilestone(${i},${invoiceTotal})">✕</button>
    </div>`).join("");
  const total = formMilestones.reduce((s, m) => s + Number(m.amountDue || 0), 0);
  const ok = Math.abs(total - invoiceTotal) < 1;
  document.getElementById("planTotal").innerHTML = `<div class="plan-total ${ok ? "ok" : "bad"}">Scheduled: ${fmtNum(total)} / ${fmtNum(invoiceTotal)} EGP ${ok ? "✓ matches invoice" : "— must equal invoice total"}</div>`;
}
function updateMilestone(i, field, val, invoiceTotal) {
  formMilestones[i][field] = (field === "amountDue" || field === "amountPaid") ? Number(val) : val;
  if (field === "amountPaid" && val && !formMilestones[i].paidDate) formMilestones[i].paidDate = todayStr();
  renderMilestoneRows(invoiceTotal);
}
function removeMilestone(i, invoiceTotal) { formMilestones.splice(i, 1); renderMilestoneRows(invoiceTotal); }

function saveNewDeal() {
  const draft = readFormDealDraft();
  const errs = validateDealInput(draft);
  if (draft.stage === "Won") {
    const inv = invoiceTotalOf(draft);
    errs.push(...validateMilestones(formMilestones, inv));
    if (!formMilestones.length) errs.push("Add at least one payment milestone for a Won deal.");
  }
  if (errs.length) { document.getElementById("formErrs").innerHTML = `<div class="valid-err">${errs.join("<br>")}</div>`; return; }
  const client = getOrCreateClient(draft.client);
  const id = nextId("deal");
  STATE.deals.push({ id, clientId: client.id, client: client.name, product: draft.product, dealType: draft.dealType,
    stage: draft.stage, dealDate: draft.dealDate, oldUsers: draft.oldUsers, newUsers: draft.newUsers,
    durationYears: draft.durationYears, vatApplicable: draft.vatApplicable, overridePrice: draft.overridePrice,
    notes: draft.notes, createdAt: todayStr(), updatedAt: todayStr() });
  if (draft.stage === "Won") {
    formMilestones.forEach(m => STATE.payments.push({ id: nextId("payment"), dealId: id, percentage: m.percentage,
      amountDue: m.amountDue, amountPaid: Number(m.amountPaid) || 0, dueDate: m.dueDate,
      paidDate: Number(m.amountPaid) > 0 ? (m.paidDate || todayStr()) : null, paymentMethod: m.paymentMethod || "",
      notes: "", commissionPaid: false, commissionPaidDate: null }));
  }
  save(); closeModal(); toast(`Deal ${id} created`); renderRoute();
}

/* ---- Deal 360 detail modal ---- */
function openDealDetail(dealId) {
  const d = STATE.deals.find(x => x.id === dealId);
  if (!d) return;
  const isWon = d.stage === "Won";
  const ps = paymentsOfDeal(d.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const lines = isWon ? commissionLinesForDeal(d) : [];
  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>${d.client} <span style="color:var(--muted); font-weight:400; font-size:13px;">· ${d.id}</span></h2>
    <p class="hint">${d.product} · ${d.dealType} · logged ${fmtDateShort(d.dealDate)}</p>
    <div class="form-grid">
      <div class="field"><label>Stage</label><select id="d_stage">${["New", "Qualified", "Meeting", "Negotiation", "Won"].map(s => `<option ${s === d.stage ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Users</label><input id="d_users" type="number" value="${d.newUsers}"></div>
      <div class="field"><label>Duration (yrs)</label><input id="d_dur" type="number" min="1" max="3" value="${d.durationYears}"></div>
      <div class="field"><label>Override price</label><input id="d_override" type="number" value="${d.overridePrice ?? ""}"></div>
    </div>
    <div class="kpi-row" style="margin:14px 0;">
      <div class="kpi"><div class="lbl">Net</div><div class="val" style="font-size:15px;">${fmtMoney(basePriceOf(d))}</div></div>
      <div class="kpi"><div class="lbl">VAT</div><div class="val" style="font-size:15px;">${fmtMoney(vatAmountOf(d))}</div></div>
      <div class="kpi"><div class="lbl">Invoice</div><div class="val" style="font-size:15px;">${fmtMoney(invoiceTotalOf(d))}</div></div>
      <div class="kpi"><div class="lbl">Collected</div><div class="val" style="font-size:15px; color:var(--green);">${fmtMoney(collectedOf(d))}</div></div>
      <div class="kpi"><div class="lbl">Outstanding</div><div class="val" style="font-size:15px; color:var(--amber);">${fmtMoney(outstandingOf(d))}</div></div>
    </div>
    ${isWon ? `<p style="font-size:11.5px; color:var(--muted); margin:-8px 0 10px;">Renewal date: <b style="color:var(--text)">${fmtDateShort(renewalDateOf(d))}</b></p>` : ""}
    ${isWon ? renderMilestoneTable(ps) : ""}
    ${isWon ? renderCommissionBreakdown(lines) : ""}
    <div style="margin-top:14px;"><label style="font-size:11.5px; color:var(--muted);">Notes</label><textarea id="d_notes" rows="2" style="width:100%; background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:7px; padding:8px;">${d.notes || ""}</textarea></div>
    <div class="modal-actions">
      <button class="btn danger" onclick="deleteDeal('${d.id}')">Delete</button>
      <button class="btn secondary" onclick="closeModal()">Close</button>
      <button class="btn" onclick="saveDealEdits('${d.id}')">Save changes</button>
    </div>
  `;
  showModal();
}
function renderMilestoneTable(ps) {
  const rows = ps.map(p => {
    const st = paymentStatus(p);
    const cls = { Collected: "paid", Overdue: "overdue", Due: "due", "Partially Paid": "partial", Pending: "stage" }[st];
    return `<div class="r">
      <div class="c1">Due ${fmtDateShort(p.dueDate)}</div>
      <div class="c2">${p.paidDate ? "paid " + fmtDateShort(p.paidDate) : "unpaid"}</div>
      <div class="c3">${fmtNum(p.amountPaid)} / ${fmtNum(p.amountDue)}</div>
      <div class="c4"><span class="badge ${cls}">${st}</span></div>
    </div>`;
  }).join("");
  return `<div class="panel" style="background:var(--panel2);">
    <h3>Payment schedule</h3>
    <div class="rlist">${rows || '<div class="empty">No milestones.</div>'}</div>
    <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:flex-end;">
      <div class="field"><label>Due date</label><input id="np_due" type="date" value="${todayStr()}"></div>
      <div class="field"><label>Amount due</label><input id="np_due_amt" type="number" placeholder="0"></div>
      <div class="field"><label>Amount paid</label><input id="np_paid_amt" type="number" placeholder="0"></div>
      <div class="field"><label>Paid date</label><input id="np_paid_date" type="date"></div>
      <button class="btn small" onclick="addMilestoneToExisting('${ps[0] ? ps[0].dealId : ""}')">+ Add payment</button>
    </div>
  </div>`;
}
function renderCommissionBreakdown(lines) {
  if (!lines.length) return `<div class="panel" style="background:var(--panel2);"><h3>Commission</h3><div class="empty">No commission earned yet — no payments collected.</div></div>`;
  const rows = lines.map(l => `<div class="r">
    <div class="c1">${fmtDateShort(l.earnedDate)}</div>
    <div class="c2">rate ${(l.commissionRate * 100).toFixed(0)}%${l.trainingFeeDeduction ? `, -${fmtNum(l.trainingFeeDeduction)} training` : ""}</div>
    <div class="c3">${fmtNum(l.netCommission)} EGP</div>
    <div class="c4"><span class="badge ${l.payoutStatus.toLowerCase()}">${l.payoutStatus}</span></div>
  </div>`).join("");
  return `<div class="panel" style="background:var(--panel2);"><h3>Commission</h3><div class="rlist">${rows}</div></div>`;
}
function addMilestoneToExisting(dealId) {
  const due = document.getElementById("np_due").value || todayStr();
  const dueAmt = Number(document.getElementById("np_due_amt").value) || 0;
  const paidAmt = Number(document.getElementById("np_paid_amt").value) || 0;
  const paidDate = document.getElementById("np_paid_date").value || (paidAmt > 0 ? todayStr() : null);
  if (!dueAmt) { toast("Enter an amount due", true); return; }
  if (Number(paidAmt) > Number(dueAmt) + 0.5) { toast("Paid amount cannot exceed amount due", true); return; }
  STATE.payments.push({ id: nextId("payment"), dealId, percentage: null, amountDue: dueAmt, amountPaid: paidAmt,
    dueDate: due, paidDate: paidAmt > 0 ? paidDate : null, paymentMethod: paidAmt > 0 ? "Bank Transfer" : "", notes: "",
    commissionPaid: false, commissionPaidDate: null });
  save(); toast("Payment added"); openDealDetail(dealId);
}
function saveDealEdits(id) {
  const d = STATE.deals.find(x => x.id === id);
  d.stage = document.getElementById("d_stage").value;
  d.newUsers = Number(document.getElementById("d_users").value) || d.newUsers;
  d.durationYears = Number(document.getElementById("d_dur").value) || d.durationYears;
  const ov = document.getElementById("d_override").value;
  d.overridePrice = ov === "" ? null : Number(ov);
  d.notes = document.getElementById("d_notes").value;
  d.updatedAt = todayStr();
  save(); toast("Deal updated"); closeModal(); renderRoute();
}
function deleteDeal(id) {
  if (!confirm(`Delete deal ${id} and all its payments? This cannot be undone.`)) return;
  STATE.deals = STATE.deals.filter(d => d.id !== id);
  STATE.payments = STATE.payments.filter(p => p.dealId !== id);
  save(); closeModal(); toast("Deal deleted"); renderRoute();
}

/* ============================================================
   CLIENTS
   ============================================================ */
function renderClients() {
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-head"><div><h1>Clients</h1><p>${STATE.clients.length} accounts · rolled up automatically from Deals &amp; Payments</p></div></div>
    <div class="filter-bar"><input id="cliSearch" placeholder="Search clients…"></div>
    <div class="card-grid" id="cliCards"></div>
  `;
  document.getElementById("cliSearch").oninput = (e) => renderClientCards(e.target.value);
  renderClientCards("");
}
function renderClientCards(q) {
  const el = document.getElementById("cliCards");
  let clients = STATE.clients.filter(c => STATE.deals.some(d => d.clientId === c.id));
  if (q) clients = clients.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  if (!clients.length) { el.innerHTML = `<div class="empty">No clients match.</div>`; return; }
  el.innerHTML = clients.map(c => {
    const deals = STATE.deals.filter(d => d.clientId === c.id);
    const won = deals.filter(d => d.stage === "Won");
    const revenue = won.reduce((s, d) => s + invoiceTotalOf(d), 0);
    const coll = won.reduce((s, d) => s + collectedOf(d), 0);
    const mix = {}; won.forEach(d => mix[d.product] = (mix[d.product] || 0) + invoiceTotalOf(d));
    const primary = Object.keys(mix).sort((a, b) => mix[b] - mix[a])[0] || "—";
    return `<div class="rec-card" onclick="openClientDetail('${c.id}')">
      <div class="top"><div><div class="cli">${c.name}</div><div class="tag">${primary} · ${deals.length} deal(s)</div></div></div>
      <div class="row"><span>Revenue</span><b>${fmtMoney(revenue)}</b></div>
      <div class="row"><span>Collected</span><b>${fmtMoney(coll)}</b></div>
      <div class="row"><span>Outstanding</span><b>${fmtMoney(revenue - coll)}</b></div>
    </div>`;
  }).join("");
}
function openClientDetail(clientId) {
  const c = STATE.clients.find(x => x.id === clientId);
  const deals = STATE.deals.filter(d => d.clientId === clientId).sort((a, b) => b.dealDate.localeCompare(a.dealDate));
  const won = deals.filter(d => d.stage === "Won");
  const revenue = won.reduce((s, d) => s + invoiceTotalOf(d), 0);
  const coll = won.reduce((s, d) => s + collectedOf(d), 0);
  const commSum = won.reduce((s, d) => s + commissionLinesForDeal(d).reduce((s2, l) => s2 + l.netCommission, 0), 0);
  const upcomingPay = STATE.payments.filter(p => won.some(d => d.id === p.dealId) && paymentStatus(p) !== "Collected").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nextRenewal = won.map(renewalDateOf).sort()[0];
  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>${c.name}</h2>
    <p class="hint">Client 360 — every deal, payment and commission in one place.</p>
    <div class="kpi-row" style="margin:14px 0;">
      <div class="kpi"><div class="lbl">Total sales</div><div class="val" style="font-size:16px;">${fmtMoney(revenue)}</div></div>
      <div class="kpi"><div class="lbl">Collected</div><div class="val" style="font-size:16px;">${fmtMoney(coll)}</div></div>
      <div class="kpi"><div class="lbl">Outstanding</div><div class="val" style="font-size:16px;">${fmtMoney(revenue - coll)}</div></div>
      <div class="kpi"><div class="lbl">Commission</div><div class="val" style="font-size:16px;">${fmtMoney(commSum)}</div></div>
    </div>
    ${nextRenewal ? `<p style="font-size:12px; color:var(--muted); margin-top:-6px;">Next renewal: <b style="color:var(--text)">${fmtDateShort(nextRenewal)}</b></p>` : ""}
    <h3 style="margin:12px 0 6px;">Upcoming payments</h3>
    <div class="rlist">${upcomingPay.map(p => `<div class="r"><div class="c1">${p.dealId}</div><div class="c2">due ${fmtDateShort(p.dueDate)}</div><div class="c3">${fmtNum(Number(p.amountDue) - Number(p.amountPaid || 0))} EGP</div><div class="c4"><span class="badge ${paymentStatus(p) === "Overdue" ? "overdue" : "due"}">${paymentStatus(p)}</span></div></div>`).join("") || '<div class="empty">Nothing pending.</div>'}</div>
    <h3 style="margin:14px 0 6px;">Deal history</h3>
    <div class="rlist">
      ${deals.map(d => `<div class="r" style="cursor:pointer;" onclick="closeModal(); openDealDetail('${d.id}')">
        <div class="c1">${d.product} · ${d.dealType}</div><div class="c2">${fmtDateShort(d.dealDate)}</div>
        <div class="c3">${d.stage === "Won" ? fmtNum(invoiceTotalOf(d)) : fmtNum(basePriceOf(d) || 0)}</div>
        <div class="c4"><span class="badge ${d.stage === "Won" ? { Collected: "paid", Overdue: "overdue", Due: "due", Partial: "partial" }[dealCollectionSummary(d)] : "stage"}">${d.stage === "Won" ? dealCollectionSummary(d) : d.stage}</span></div>
      </div>`).join("") || '<div class="empty">No deals yet.</div>'}
    </div>
    <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Close</button></div>
  `;
  showModal();
}

/* ============================================================
   COLLECTIONS
   ============================================================ */
let collFilters = { status: "All", month: "All" };
function renderCollections() {
  const main = document.getElementById("main");
  const won = wonDeals();
  const totalDue = won.reduce((s, d) => s + invoiceTotalOf(d), 0);
  const totalColl = won.reduce((s, d) => s + collectedOf(d), 0);
  const totalOut = totalDue - totalColl;
  const collectedThisMonth = STATE.payments.filter(p => p.paidDate && inMonth(p.paidDate, currentYM())).reduce((s, p) => s + Number(p.amountPaid || 0), 0);
  const overdueAmt = STATE.payments.filter(p => paymentStatus(p) === "Overdue").reduce((s, p) => s + (Number(p.amountDue) - Number(p.amountPaid || 0)), 0);
  const rate = totalDue ? totalColl / totalDue : 0;
  const statuses = ["All", "Pending", "Due", "Partially Paid", "Overdue", "Collected"];
  main.innerHTML = `
    <div class="page-head"><div><h1>Collections</h1><p>What's collected, what's due, what's overdue</p></div></div>
    <div class="kpi-row">
      <div class="kpi accent-green"><div class="lbl">Collected this month</div><div class="val">${fmtMoney(collectedThisMonth)}</div></div>
      <div class="kpi accent-gold"><div class="lbl">Outstanding</div><div class="val">${fmtMoney(totalOut)}</div></div>
      <div class="kpi accent-red"><div class="lbl">Overdue</div><div class="val">${fmtMoney(overdueAmt)}</div></div>
      <div class="kpi accent-teal"><div class="lbl">Collection rate</div><div class="val">${(rate * 100).toFixed(1)}%</div></div>
    </div>
    <div class="panel">
      <h3>Due &amp; overdue payments</h3>
      <div class="filter-bar">
        <select id="collStatus">${statuses.map(s => `<option ${s === collFilters.status ? "selected" : ""}>${s}</option>`).join("")}</select>
        <select id="collMonth">${["All", ...lastNMonths(12).reverse()].map(m => `<option value="${m}" ${m === collFilters.month ? "selected" : ""}>${m === "All" ? "All months" : monthLabel(m)}</option>`).join("")}</select>
      </div>
      <div class="rlist" id="collList"></div>
    </div>
  `;
  document.getElementById("collStatus").onchange = (e) => { collFilters.status = e.target.value; renderCollList(); };
  document.getElementById("collMonth").onchange = (e) => { collFilters.month = e.target.value; renderCollList(); };
  renderCollList();
}
function renderCollList() {
  let list = STATE.payments.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (collFilters.status !== "All") list = list.filter(p => paymentStatus(p) === collFilters.status);
  if (collFilters.month !== "All") list = list.filter(p => inMonth(p.dueDate, collFilters.month));
  const el = document.getElementById("collList");
  el.innerHTML = list.map(p => {
    const d = STATE.deals.find(x => x.id === p.dealId);
    const st = paymentStatus(p);
    const cls = { Collected: "paid", Overdue: "overdue", Due: "due", "Partially Paid": "partial", Pending: "stage" }[st];
    return `<div class="r" style="cursor:pointer;" onclick="openDealDetail('${p.dealId}')">
      <div class="c1">${d ? d.client : "—"} <span style="color:var(--dim); font-weight:400;">· ${p.dealId}</span></div>
      <div class="c2">due ${fmtDateShort(p.dueDate)}</div>
      <div class="c3">${fmtNum(Number(p.amountDue) - Number(p.amountPaid || 0))} / ${fmtNum(p.amountDue)}</div>
      <div class="c4"><span class="badge ${cls}">${st}</span></div>
    </div>`;
  }).join("") || '<div class="empty">Nothing matches this filter.</div>';
}

/* ============================================================
   COMMISSION
   ============================================================ */
let commFilters = { status: "All", month: "All" };
function renderCommission() {
  const main = document.getElementById("main");
  const vault = commissionVault();
  const payout = nextPayoutInfo();
  main.innerHTML = `
    <div class="page-head"><div><h1>Commission</h1><p>Calculated on actual collected cash only — training fee deducted from the first Acquisition payment</p></div></div>
    <div class="vault-grid">
      <div class="vault-card locked"><div class="n">${fmtMoney(vault.locked)}</div><div class="l">Locked</div></div>
      <div class="vault-card available"><div class="n">${fmtMoney(vault.available)}</div><div class="l">Available</div></div>
      <div class="vault-card paid"><div class="n">${fmtMoney(vault.paid)}</div><div class="l">Paid</div></div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="lbl">Total earned</div><div class="val">${fmtMoney(vault.earned)}</div></div>
      <div class="kpi"><div class="lbl">Next payout date</div><div class="val" style="font-size:16px;">${payout ? fmtDate(payout.date) : "—"}</div></div>
      <div class="kpi"><div class="lbl">Next payout amount</div><div class="val" style="font-size:16px;">${payout ? fmtMoney(payout.amount) : "—"}</div></div>
    </div>
    <div class="panel">
      <h3>Commission ledger <small>one line per collected payment</small></h3>
      <div class="filter-bar">
        <select id="commStatus">${["All", "LOCKED", "AVAILABLE", "PAID"].map(s => `<option ${s === commFilters.status ? "selected" : ""}>${s}</option>`).join("")}</select>
        <select id="commMonth">${["All", ...lastNMonths(12).reverse()].map(m => `<option value="${m}" ${m === commFilters.month ? "selected" : ""}>${m === "All" ? "All months" : monthLabel(m)}</option>`).join("")}</select>
      </div>
      <div class="rlist" id="commList"></div>
    </div>
  `;
  document.getElementById("commStatus").onchange = (e) => { commFilters.status = e.target.value; renderCommList(); };
  document.getElementById("commMonth").onchange = (e) => { commFilters.month = e.target.value; renderCommList(); };
  renderCommList();
}
function renderCommList() {
  let lines = allCommissionLines().sort((a, b) => b.earnedDate.localeCompare(a.earnedDate));
  if (commFilters.status !== "All") lines = lines.filter(l => l.payoutStatus === commFilters.status);
  if (commFilters.month !== "All") lines = lines.filter(l => inMonth(l.earnedDate, commFilters.month));
  const el = document.getElementById("commList");
  el.innerHTML = lines.map(l => `
    <div class="r">
      <div class="c1">${l.client} <span style="color:var(--dim); font-weight:400;">· ${l.dealId}</span></div>
      <div class="c2">earned ${fmtDateShort(l.earnedDate)} · payout ${fmtDateShort(l.expectedPayoutDate)}</div>
      <div class="c3">${fmtNum(l.netCommission)} EGP</div>
      <div class="c4"><span class="badge ${l.payoutStatus.toLowerCase()}" style="cursor:${l.payoutStatus !== "LOCKED" ? "pointer" : "default"};" onclick="${l.payoutStatus !== "LOCKED" ? `toggleCommissionPaid('${l.paymentId}')` : ""}">${l.payoutStatus}</span></div>
    </div>`).join("") || '<div class="empty">No commission lines match.</div>';
}
function toggleCommissionPaid(paymentId) {
  const p = STATE.payments.find(x => x.id === paymentId);
  p.commissionPaid = !p.commissionPaid;
  p.commissionPaidDate = p.commissionPaid ? todayStr() : null;
  save(); renderCommList(); toast(p.commissionPaid ? "Marked as paid" : "Marked as available");
}

/* ============================================================
   ACTIVITY
   ============================================================ */
function renderActivity() {
  const main = document.getElementById("main");
  const today = getOrCreateActivity(todayStr());
  const req = requiredCallsFor(today.meetings);
  const score = activityScore(today);
  const weekStart = addDays(todayStr(), -new Date().getDay());
  const weekMeetings = STATE.activity.filter(a => a.date >= weekStart && a.date <= todayStr()).reduce((s, a) => s + a.meetings, 0);
  const sorted = STATE.activity.slice().sort((a, b) => b.date.localeCompare(a.date));
  const days = []; for (let i = 13; i >= 0; i--) days.push(addDays(todayStr(), -i));
  const callsSeries = days.map(d => (activityOf(d) || { answeredCalls: 0 }).answeredCalls);
  const meetSeries = days.map(d => (activityOf(d) || { meetings: 0 }).meetings);

  main.innerHTML = `
    <div class="page-head"><div><h1>Activity</h1><p>Answered calls and meetings, tracked against target</p></div></div>
    <div class="kpi-row">
      <div class="kpi accent-gold"><div class="lbl">Today's calls</div><div class="val">${today.answeredCalls} <span style="font-size:12px; color:var(--muted); font-weight:400;">/ ${req}</span></div></div>
      <div class="kpi accent-teal"><div class="lbl">Today's meetings</div><div class="val">${today.meetings}</div></div>
      <div class="kpi accent-green"><div class="lbl">Activity score</div><div class="val">${score}%</div></div>
      <div class="kpi"><div class="lbl">This week's meetings</div><div class="val">${weekMeetings} <span style="font-size:12px; color:var(--muted); font-weight:400;">/ ${STATE.settings.dailyRules ? "" : ""}</span></div></div>
    </div>
    <div class="panel">
      <h3>Quick log — today</h3>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <button class="btn" onclick="quickAdd('calls',1)">+1 Call</button>
        <button class="btn secondary" onclick="quickAdd('calls',-1)">-1 Call</button>
        <button class="btn" onclick="quickAdd('meetings',1)">+1 Meeting</button>
        <button class="btn secondary" onclick="quickAdd('meetings',-1)">-1 Meeting</button>
        <span style="color:var(--muted); font-size:12px;">Required calls updates instantly with meeting count (0 mtg → ${STATE.settings.dailyRules.zero}, 1 mtg → ${STATE.settings.dailyRules.one}, 2+ mtg → ${STATE.settings.dailyRules.twoPlus})</span>
      </div>
      <div style="margin-top:14px; display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div class="field"><label>Date</label><input id="a_date" type="date" value="${todayStr()}"></div>
        <div class="field"><label>Answered calls</label><input id="a_calls" type="number" value="${today.answeredCalls}"></div>
        <div class="field"><label>Meetings</label><input id="a_meetings" type="number" value="${today.meetings}"></div>
        <button class="btn secondary" onclick="saveActivityForm()">Save entry</button>
      </div>
    </div>
    <div class="panel"><h3>Calls + meetings (14 days)</h3>${svgLineChart([{ name: "Calls", values: callsSeries }, { name: "Meetings", values: meetSeries }], days.map(d => new Date(d + "T00:00:00").getDate()))}</div>
    <div class="panel">
      <h3>Daily log</h3>
      <div class="rlist">${sorted.slice(0, 30).map(a => `<div class="r"><div class="c1">${fmtDate(a.date)}</div><div class="c2">score ${activityScore(a)}%</div><div class="c3">${a.answeredCalls} calls</div><div class="c4">${a.meetings} meetings</div></div>`).join("")}</div>
    </div>
  `;
}
function quickAdd(field, delta) {
  const a = getOrCreateActivity(todayStr());
  const key = field === "calls" ? "answeredCalls" : "meetings";
  a[key] = Math.max(0, a[key] + delta);
  save(); renderActivity(); toast(`${field === "calls" ? "Calls" : "Meetings"} updated`);
}
function saveActivityForm() {
  const date = document.getElementById("a_date").value || todayStr();
  const a = getOrCreateActivity(date);
  a.answeredCalls = Math.max(0, Number(document.getElementById("a_calls").value) || 0);
  a.meetings = Math.max(0, Number(document.getElementById("a_meetings").value) || 0);
  save(); toast("Activity saved"); renderActivity();
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  const main = document.getElementById("main");
  const s = STATE.settings;
  const thisMonthTarget = s.monthlyTargets[currentYM()] ?? "";
  main.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>Only what actually matters — everything else calculates from here</p></div></div>
    <div class="settings-grid">
      <div class="panel">
        <h3>Financial</h3>
        <div class="set-row"><label>VAT rate</label><input id="s_vat" type="number" step="0.01" value="${s.vatRate}"></div>
        <div class="set-row"><label>New deal commission %</label><input id="s_commnew" type="number" step="0.01" value="${s.commissionNew}"></div>
        <div class="set-row"><label>Renewal commission %</label><input id="s_commren" type="number" step="0.01" value="${s.commissionRenewal}"></div>
        <div class="set-row"><label>Training fee (EGP, New Deal only)</label><input id="s_training" type="number" value="${s.trainingFee}"></div>
        <div class="set-row"><label>Payout delay (months)</label><input id="s_delay" type="number" value="${s.payoutDelayMonths}"></div>
        <div class="set-row"><label>Payout day of month</label><input id="s_payoutday" type="number" value="${s.payoutDay}"></div>
      </div>
      <div class="panel">
        <h3>Targets</h3>
        <div class="set-row"><label>Default monthly target (EGP)</label><input id="s_target_default" type="number" value="${s.monthlyTargets.default}"></div>
        <div class="set-row"><label>Target for ${monthLabel(currentYM())} (this month)</label><input id="s_target_this" type="number" value="${thisMonthTarget}" placeholder="uses default"></div>
        <h3 style="margin-top:16px;">Daily activity rules</h3>
        <div class="set-row"><label>Calls required — 0 meetings</label><input id="s_rule0" type="number" value="${s.dailyRules.zero}"></div>
        <div class="set-row"><label>Calls required — 1 meeting</label><input id="s_rule1" type="number" value="${s.dailyRules.one}"></div>
        <div class="set-row"><label>Calls required — 2+ meetings</label><input id="s_rule2" type="number" value="${s.dailyRules.twoPlus}"></div>
      </div>
    </div>
    <div class="panel">
      <h3>Upgrade commission tiers <small>⚠ example values — not confirmed, edit freely</small></h3>
      <table class="pricing-table"><tr><th>Min added users</th><th>Max added users</th><th>Commission %</th></tr>
        ${s.tiers.map((t, i) => `<tr><td><input data-tier="${i}" data-f="min" type="number" value="${t.min}"></td><td><input data-tier="${i}" data-f="max" type="number" value="${t.max}"></td><td><input data-tier="${i}" data-f="pct" type="number" step="0.01" value="${t.pct}"></td></tr>`).join("")}
      </table>
    </div>
    <div class="settings-grid">
      <div class="panel"><h3>Pricing — CRM</h3><table class="pricing-table"><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr>
        ${Object.keys(s.pricing.CRM).map(u => `<tr><td>${u}</td>${[1, 2, 3].map(y => `<td><input data-p="CRM" data-u="${u}" data-y="${y}" type="number" value="${s.pricing.CRM[u][y] || ""}"></td>`).join("")}</tr>`).join("")}
      </table></div>
      <div class="panel"><h3>Pricing — Navi</h3><table class="pricing-table"><tr><th>Users</th><th>1yr</th></tr>
        ${Object.keys(s.pricing.Navi).map(u => `<tr><td>${u}</td><td><input data-p="Navi" data-u="${u}" data-y="1" type="number" value="${s.pricing.Navi[u][1] || ""}"></td></tr>`).join("")}
      </table></div>
    </div>
    <div class="panel">
      <h3>Pricing — HR <small>⚠ not confirmed by the company — enter real prices; deals will auto-price once filled in</small></h3>
      <table class="pricing-table"><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr>
        ${[10, 20, 30, 50, 100].map(u => `<tr><td>${u}</td>${[1, 2, 3].map(y => `<td><input data-p="HR" data-u="${u}" data-y="${y}" type="number" value="${(s.pricing.HR[u] && s.pricing.HR[u][y]) || ""}"></td>`).join("")}</tr>`).join("")}
      </table>
    </div>
    <div class="panel">
      <h3>Data</h3>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <button class="btn secondary" onclick="exportBackup()">Export backup (.json)</button>
        <button class="btn secondary" onclick="document.getElementById('importFile').click()">Import backup</button>
        <input type="file" id="importFile" accept=".json" style="display:none" onchange="importBackup(this.files[0])">
        <button class="btn secondary" onclick="downloadSalesReport()">Download monthly report</button>
        <button class="btn danger" onclick="resetDemoData()">Reset demo data</button>
        <button class="btn danger" onclick="clearAllData()">Clear all data</button>
      </div>
    </div>
    <div class="modal-actions" style="justify-content:flex-start;"><button class="btn" onclick="saveSettings()">Save settings</button></div>
  `;
}
function saveSettings() {
  const s = STATE.settings;
  s.vatRate = Number(document.getElementById("s_vat").value);
  s.commissionNew = Number(document.getElementById("s_commnew").value);
  s.commissionRenewal = Number(document.getElementById("s_commren").value);
  s.trainingFee = Number(document.getElementById("s_training").value) || 0;
  s.payoutDelayMonths = Number(document.getElementById("s_delay").value) || 2;
  s.payoutDay = Number(document.getElementById("s_payoutday").value) || 10;
  s.monthlyTargets.default = Number(document.getElementById("s_target_default").value) || s.monthlyTargets.default;
  const thisMonthVal = document.getElementById("s_target_this").value;
  if (thisMonthVal !== "") s.monthlyTargets[currentYM()] = Number(thisMonthVal); else delete s.monthlyTargets[currentYM()];
  s.dailyRules.zero = Number(document.getElementById("s_rule0").value) || 0;
  s.dailyRules.one = Number(document.getElementById("s_rule1").value) || 0;
  s.dailyRules.twoPlus = Number(document.getElementById("s_rule2").value) || 0;
  document.querySelectorAll("[data-tier]").forEach(inp => { s.tiers[Number(inp.dataset.tier)][inp.dataset.f] = Number(inp.value); });
  document.querySelectorAll("[data-p]").forEach(inp => {
    const p = inp.dataset.p, u = inp.dataset.u, y = inp.dataset.y;
    if (!s.pricing[p][u]) s.pricing[p][u] = {};
    if (inp.value !== "") s.pricing[p][u][y] = Number(inp.value);
  });
  save(); toast("Settings saved");
}

/* ============================================================
   SALES REPORT (all figures pulled live from state)
   ============================================================ */
function salesReportText(ymStr) {
  const won = wonDeals().filter(d => inMonth(d.dealDate, ymStr));
  const sales = won.reduce((s, d) => s + invoiceTotalOf(d), 0);
  const collected = STATE.payments.filter(p => p.paidDate && inMonth(p.paidDate, ymStr)).reduce((s, p) => s + Number(p.amountPaid || 0), 0);
  const outstanding = won.reduce((s, d) => s + outstandingOf(d), 0);
  const byType = t => won.filter(d => d.dealType === t).length;
  const act = STATE.activity.filter(a => inMonth(a.date, ymStr));
  const calls = act.reduce((s, a) => s + a.answeredCalls, 0);
  const meetings = act.reduce((s, a) => s + a.meetings, 0);
  const lines = allCommissionLines().filter(l => inMonth(l.earnedDate, ymStr));
  const earned = lines.reduce((s, l) => s + l.netCommission, 0);
  const available = lines.filter(l => l.payoutStatus !== "LOCKED").reduce((s, l) => s + l.netCommission, 0);
  const paid = lines.filter(l => l.payoutStatus === "PAID").reduce((s, l) => s + l.netCommission, 0);
  return [`${monthLabel(ymStr)} — Sales Report`, "", `Sales: ${fmtMoney(sales)}`, `Collected: ${fmtMoney(collected)}`, `Outstanding: ${fmtMoney(outstanding)}`,
    "", `Deals: ${won.length}`, `New: ${byType("New Deal")}`, `Renewals: ${byType("Renewal")}`, `Upgrades: ${byType("Upgrade")}`,
    "", `Answered Calls: ${calls}`, `Meetings: ${meetings}`,
    "", `Commission Earned: ${fmtMoney(earned)}`, `Commission Available: ${fmtMoney(available)}`, `Commission Paid: ${fmtMoney(paid)}`].join("\n");
}
function downloadSalesReport() {
  const text = salesReportText(currentYM());
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `sales-report-${currentYM()}.txt`; a.click();
  URL.revokeObjectURL(url);
  toast("Report downloaded");
}

/* ============================================================
   MODALS + BOOT
   ============================================================ */
function showModal() { document.getElementById("overlay").classList.add("show"); }
function closeModal() { document.getElementById("overlay").classList.remove("show"); }
document.getElementById("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

buildNav();
if (!location.hash) location.hash = "#/home";
renderRoute();
