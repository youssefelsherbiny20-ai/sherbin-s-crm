/* ============================================================
   Youssef · Sales CRM — single-file vanilla JS app
   Data persists in this browser via localStorage.
   ============================================================ */

const LS_KEY = "youssef_crm_state_v1";
const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (n) => (n < 0 ? "-" : "") + Math.round(Math.abs(n)).toLocaleString() + " EGP";
const fmtNum = (n) => Math.round(n).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—";
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const monthKey = (d) => d.slice(0, 7); // YYYY-MM

/* ---------------- default settings & pricing (from existing business data) ---------------- */
function defaultSettings() {
  return {
    vatRate: 0.14,
    commissionNew: 0.10,
    commissionRenewal: 0.05,
    payoutDay: 10,
    targetMonthly: 800000,
    callsTarget: 40,
    meetingsTarget: 20,
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
      HR: {} // not confirmed — left empty/editable, deals use manual override price
    }
  };
}

/* ---------------- seed demo data (relative to real "today") ---------------- */
function buildSeed() {
  const settings = defaultSettings();
  const clients = ["Nile Retail Group", "Cairo Fintech Co", "Delta Logistics", "Alexandria Motors",
    "Giza HealthCare", "Red Sea Hospitality", "Sphinx Manufacturing", "Luxor Education Group",
    "Zamalek Media House", "October Real Estate"];
  const products = ["CRM", "Navi", "HR"];
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const today = new Date();

  function priceLookup(product, users, duration) {
    const table = settings.pricing[product] || {};
    const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (!tiers.length) return null;
    let u = tiers.reduce((a, b) => Math.abs(b - users) < Math.abs(a - users) ? b : a);
    const row = table[u];
    if (!row) return null;
    return row[duration] || row[1] || null;
  }

  const deals = [];
  const payments = [];

  // Won deals across the last ~75 days, with realistic payment histories
  for (let i = 0; i < 16; i++) {
    const daysAgo = Math.floor(Math.random() * 75);
    const date = addDays(today, -daysAgo);
    const product = rnd(products.length && Math.random() < 0.55 ? ["CRM"] : (Math.random() < 0.7 ? ["Navi"] : ["HR"]));
    const dealType = Math.random() < 0.5 ? "New Deal" : (Math.random() < 0.7 ? "Renewal" : "Upgrade");
    const duration = product === "CRM" ? rnd([1, 1, 2, 3]) : 1;
    let oldUsers = 0, newUsers;
    const tierPool = [5, 10, 15, 20, 25, 30, 40, 50];
    if (dealType === "Upgrade") {
      oldUsers = rnd(tierPool.slice(0, 5));
      newUsers = oldUsers + rnd([5, 10, 15]);
    } else {
      newUsers = rnd(tierPool);
    }
    const vat = Math.random() < 0.75;
    const dealId = uid("D");
    let overridePrice = null;
    if (product === "HR") {
      overridePrice = newUsers * 900; // no confirmed HR pricing — manual price
    }
    deals.push({
      id: dealId, date, client: rnd(clients), product, dealType,
      oldUsers, newUsers, duration, vat, overridePrice, stage: "Won",
      commissionPaid: daysAgo > 40 && Math.random() < 0.7,
      commissionPaidDate: null, notes: ""
    });

    // build invoice + payment plan
    const usersForPrice = dealType === "Upgrade" ? Math.max(newUsers - oldUsers, 0) : newUsers;
    let base = overridePrice != null ? overridePrice : priceLookup(product, usersForPrice, duration);
    if (base == null) base = usersForPrice * 1000;
    const vatAmt = vat ? base * settings.vatRate : 0;
    const invoiceTotal = base + vatAmt;
    const installments = rnd([1, 1, 2, 3]);
    let remaining = invoiceTotal;
    for (let k = 0; k < installments; k++) {
      const amt = k === installments - 1 ? remaining : Math.round(invoiceTotal / installments);
      remaining -= amt;
      const due = addDays(date, 15 * (k + 1));
      let paidDate = null, amountPaid = 0;
      const dueDate = new Date(due);
      if (dueDate <= today) {
        const r = Math.random();
        if (r < 0.65) { amountPaid = amt; paidDate = addDays(due, Math.floor(Math.random() * 5)); if (new Date(paidDate) > today) paidDate = todayStr(); }
        else if (r < 0.85) { amountPaid = Math.round(amt * (0.3 + Math.random() * 0.4)); paidDate = addDays(due, 2); }
      }
      payments.push({ id: uid("P"), dealId, dueDate: due, paidDate, amountDue: amt, amountPaid, method: amountPaid > 0 ? rnd(["Bank Transfer", "Cheque", "Instapay", "Cash"]) : "" });
    }
  }

  // Open pipeline (pre-close) deals — no invoicing yet
  const stages = ["New", "New", "Qualified", "Qualified", "Meeting", "Negotiation"];
  for (let i = 0; i < 10; i++) {
    const product = rnd(products);
    const newUsers = rnd([5, 10, 15, 20, 30]);
    deals.push({
      id: uid("D"), date: addDays(today, -Math.floor(Math.random() * 20)), client: rnd(clients.concat(["Nasr City Retail", "Mansoura Trading", "Tanta Textiles"])),
      product, dealType: "New Deal", oldUsers: 0, newUsers, duration: 1, vat: true, overridePrice: null,
      stage: rnd(stages), commissionPaid: false, commissionPaidDate: null, notes: ""
    });
  }

  // activity log — last 30 days
  const activity = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    const isWeekend = [0, 6].includes(new Date(d).getDay());
    activity.push({
      date: d,
      calls: isWeekend ? Math.floor(Math.random() * 12) : 28 + Math.floor(Math.random() * 20),
      meetings: isWeekend ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 5),
    });
  }

  return { settings, deals, payments, activity };
}

/* ---------------- state load/save ---------------- */
let STATE = load();
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const seed = buildSeed();
  localStorage.setItem(LS_KEY, JSON.stringify(seed));
  return seed;
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ============================================================
   Calculation helpers (deal-level engine)
   ============================================================ */
function priceLookup(product, users, duration) {
  const table = STATE.settings.pricing[product] || {};
  const tiers = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!tiers.length) return null;
  // exact match preferred, else nearest
  if (table[users]) { const row = table[users]; return row[duration] || row[1] || null; }
  let u = tiers.reduce((a, b) => Math.abs(b - users) < Math.abs(a - users) ? b : a);
  const row = table[u];
  return row ? (row[duration] || row[1] || null) : null;
}
function usersForPricing(deal) {
  return deal.dealType === "Upgrade" ? Math.max(deal.newUsers - deal.oldUsers, 0) : deal.newUsers;
}
function standardPrice(deal) { return priceLookup(deal.product, usersForPricing(deal), deal.duration); }
function basePrice(deal) {
  if (deal.overridePrice != null && deal.overridePrice !== "") return Number(deal.overridePrice);
  return standardPrice(deal) || 0;
}
function vatAmount(deal) { return deal.vat ? basePrice(deal) * STATE.settings.vatRate : 0; }
function invoiceTotal(deal) { return basePrice(deal) + vatAmount(deal); }
function dealPayments(dealId) { return STATE.payments.filter(p => p.dealId === dealId); }
function collected(deal) { return dealPayments(deal.id).reduce((s, p) => s + (Number(p.amountPaid) || 0), 0); }
function outstanding(deal) { return invoiceTotal(deal) - collected(deal); }
function isPaymentOverdue(p) { return p.dueDate < todayStr() && Number(p.amountPaid || 0) < Number(p.amountDue); }
function collectionStatus(deal) {
  if (deal.stage !== "Won") return "—";
  const out = outstanding(deal);
  if (out <= 0.5) return "Paid";
  if (dealPayments(deal.id).some(isPaymentOverdue)) return "Overdue";
  if (collected(deal) > 0) return "Partial";
  return "Due";
}
function commissionPct(deal) {
  const s = STATE.settings;
  if (deal.dealType === "New Deal") return s.commissionNew;
  if (deal.dealType === "Renewal") return s.commissionRenewal;
  if (deal.dealType === "Upgrade") {
    const added = Math.max(deal.newUsers - deal.oldUsers, 0);
    const tier = s.tiers.find(t => added >= t.min && added <= t.max);
    return tier ? tier.pct : 0;
  }
  return 0;
}
function commissionEarned(deal) { return collected(deal) * commissionPct(deal); }
function expectedCommissionDate(deal) {
  const d = new Date(deal.date);
  let m = d.getMonth() + 1, y = d.getFullYear();
  m += 1; if (m > 11) { m = 0; y += 1; }
  const dt = new Date(y, m, STATE.settings.payoutDay);
  return dt.toISOString().slice(0, 10);
}
function nextUnpaidDue(dealId) {
  const ps = dealPayments(dealId).filter(p => Number(p.amountPaid || 0) < Number(p.amountDue)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return ps.length ? ps[0].dueDate : null;
}
function wonDeals() { return STATE.deals.filter(d => d.stage === "Won"); }
function inMonth(dateStr, ym) { return dateStr.slice(0, 7) === ym; }
function currentYM() { return todayStr().slice(0, 7); }

/* ============================================================
   Router
   ============================================================ */
const ROUTES = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "deals", label: "Deals", icon: "◇" },
  { id: "clients", label: "Clients", icon: "☺" },
  { id: "collections", label: "Collections", icon: "$" },
  { id: "commission", label: "Commission", icon: "%" },
  { id: "activity", label: "Activity", icon: "▤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];
function buildNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = ROUTES.map(r =>
    `<a data-route="${r.id}" href="#/${r.id}"><span class="ic">${r.icon}</span><span class="lbl">${r.label}</span></a>`
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
  map[r]();
}
window.addEventListener("hashchange", renderRoute);

/* ============================================================
   HOME
   ============================================================ */
function renderHome() {
  const main = document.getElementById("main");
  const ym = currentYM();
  const s = STATE.settings;
  const won = wonDeals();

  const revenue = won.filter(d => inMonth(d.date, ym)).reduce((sum, d) => sum + invoiceTotal(d), 0);
  const collectedThisMonth = STATE.payments.filter(p => p.paidDate && inMonth(p.paidDate, ym)).reduce((s2, p) => s2 + Number(p.amountPaid || 0), 0);
  const totalOutstanding = won.reduce((sum, d) => sum + outstanding(d), 0);
  const commissionThisMonth = won.filter(d => inMonth(d.date, ym)).reduce((sum, d) => sum + commissionEarned(d), 0);
  const achievement = s.targetMonthly ? revenue / s.targetMonthly : 0;
  const remaining = Math.max(s.targetMonthly - revenue, 0);

  const todayAct = STATE.activity.find(a => a.date === todayStr()) || { calls: 0, meetings: 0 };
  const dealsToday = STATE.deals.filter(d => d.date === todayStr()).length;

  const overdueDeals = won.filter(d => collectionStatus(d) === "Overdue");
  const topOverdue = overdueDeals.sort((a, b) => outstanding(b) - outstanding(a))[0];
  const dueThisWeekPayments = STATE.payments.filter(p => p.dueDate >= todayStr() && p.dueDate <= addDays(todayStr(), 7) && Number(p.amountPaid || 0) < Number(p.amountDue));
  const dueThisWeekAmt = dueThisWeekPayments.reduce((s2, p) => s2 + (Number(p.amountDue) - Number(p.amountPaid || 0)), 0);
  const commissionPending = won.filter(d => !d.commissionPaid).reduce((s2, d) => s2 + commissionEarned(d), 0);
  const meetingStageCount = STATE.deals.filter(d => d.stage === "Meeting").length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stages = ["New", "Qualified", "Meeting", "Negotiation", "Won", "Collected"];
  const stageColor = { New: "var(--indigo)", Qualified: "var(--teal)", Meeting: "#a78bfa", Negotiation: "var(--gold)", Won: "var(--green)", Collected: "#16a34a" };
  const pipelineHtml = stages.map(st => {
    let n, v;
    if (st === "Collected") { n = won.filter(d => collectionStatus(d) === "Paid").length; v = won.reduce((s2, d) => s2 + collected(d), 0); }
    else if (st === "Won") { n = won.length; v = won.reduce((s2, d) => s2 + invoiceTotal(d), 0); }
    else { const ds = STATE.deals.filter(d => d.stage === st); n = ds.length; v = ds.reduce((s2, d) => s2 + (basePrice(d) || 0), 0); }
    return `<div class="pipe-stage" style="--stage-c:${stageColor[st]}"><div class="n">${n}</div><div class="l">${st}</div><div class="v">${fmtNum(v)} EGP</div></div>`;
  }).join("");

  main.innerHTML = `
    <div class="page-head">
      <div><h1>${greeting}, Youssef 👋</h1><p>${new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })} · Personal Revenue &amp; Sales OS</p></div>
      <button class="btn" onclick="openDealForm()">+ New Deal</button>
    </div>

    <div class="kpi-row">
      <div class="kpi accent-gold"><div class="lbl">Revenue (this month)</div><div class="val">${fmtMoney(revenue)}</div></div>
      <div class="kpi accent-green"><div class="lbl">Collected (this month)</div><div class="val">${fmtMoney(collectedThisMonth)}</div></div>
      <div class="kpi accent-red"><div class="lbl">Outstanding</div><div class="val">${fmtMoney(totalOutstanding)}</div></div>
      <div class="kpi accent-teal"><div class="lbl">Commission (this month)</div><div class="val">${fmtMoney(commissionThisMonth)}</div></div>
    </div>

    <div class="panel">
      <h3>Target vs Achievement <small>${fmtMoney(s.targetMonthly)} monthly target</small></h3>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.min(achievement * 100, 100)}%"></div></div>
      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--muted);">
        <span><b style="color:var(--text)">${(achievement * 100).toFixed(1)}%</b> achieved</span>
        <span>${fmtMoney(remaining)} remaining</span>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="panel">
        <h3>Today</h3>
        <div class="kpi-row" style="margin-bottom:0;">
          <div class="kpi"><div class="lbl">Calls</div><div class="val">${todayAct.calls} <span style="font-size:13px; color:var(--muted); font-weight:400;">/ ${s.callsTarget}</span></div></div>
          <div class="kpi"><div class="lbl">Meetings</div><div class="val">${todayAct.meetings}</div></div>
          <div class="kpi"><div class="lbl">Deals</div><div class="val">${dealsToday}</div></div>
        </div>
      </div>
      <div class="panel">
        <h3>Action Center</h3>
        <div class="action-item"><div class="dot red"></div><div class="txt">${topOverdue ? `Payment overdue — <b>${topOverdue.client}</b> — ${fmtMoney(outstanding(topOverdue))}` : "No overdue payments"}</div></div>
        <div class="action-item"><div class="dot amber"></div><div class="txt"><b>${dueThisWeekPayments.length}</b> payment(s) due this week — ${fmtMoney(dueThisWeekAmt)}</div></div>
        <div class="action-item"><div class="dot green"></div><div class="txt">Commission expected — <b>${fmtMoney(commissionPending)}</b></div></div>
        <div class="action-item"><div class="dot teal"></div><div class="txt"><b>${meetingStageCount}</b> deal(s) in Meeting stage</div></div>
      </div>
    </div>

    <div class="panel">
      <h3>Pipeline</h3>
      <div class="pipeline">${pipelineHtml}</div>
    </div>
  `;
}

/* ============================================================
   DEALS
   ============================================================ */
let dealFilters = { stage: "All", q: "" };
function renderDeals() {
  const main = document.getElementById("main");
  const stages = ["All", "New", "Qualified", "Meeting", "Negotiation", "Won"];
  main.innerHTML = `
    <div class="page-head">
      <div><h1>Deals</h1><p>${STATE.deals.length} total · every deal, one clean card</p></div>
      <button class="btn" onclick="openDealForm()">+ New Deal</button>
    </div>
    <div class="filter-bar">
      <select id="stageFilter">${stages.map(s => `<option ${s === dealFilters.stage ? "selected" : ""}>${s}</option>`).join("")}</select>
      <input id="dealSearch" type="text" placeholder="Search client…" value="${dealFilters.q}">
    </div>
    <div class="card-grid" id="dealCards"></div>
  `;
  document.getElementById("stageFilter").onchange = (e) => { dealFilters.stage = e.target.value; renderDealCards(); };
  document.getElementById("dealSearch").oninput = (e) => { dealFilters.q = e.target.value; renderDealCards(); };
  renderDealCards();
}
function renderDealCards() {
  const el = document.getElementById("dealCards");
  let list = STATE.deals.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (dealFilters.stage !== "All") list = list.filter(d => d.stage === dealFilters.stage);
  if (dealFilters.q) list = list.filter(d => d.client.toLowerCase().includes(dealFilters.q.toLowerCase()));
  if (!list.length) { el.innerHTML = `<div class="empty">No deals match this filter.</div>`; return; }
  el.innerHTML = list.map(d => {
    const isWon = d.stage === "Won";
    const status = collectionStatus(d);
    const badgeClass = { Paid: "paid", Overdue: "overdue", Due: "due", Partial: "partial" }[status] || "stage";
    const nd = isWon ? nextUnpaidDue(d.id) : null;
    return `
    <div class="rec-card" onclick="openDealForm('${d.id}')">
      <div class="top">
        <div><div class="cli">${d.client}</div><div class="tag">${d.product} · ${d.dealType}</div></div>
        <span class="badge ${isWon ? badgeClass : "stage"}">${isWon ? status : d.stage}</span>
      </div>
      ${isWon ? `
        <div class="row"><span>Value</span><b>${fmtMoney(invoiceTotal(d))}</b></div>
        <div class="row"><span>Collected</span><b>${fmtMoney(collected(d))}</b></div>
        <div class="row"><span>Remaining</span><b>${fmtMoney(outstanding(d))}</b></div>
        <div class="row"><span>Next payment</span><b>${nd ? fmtDateShort(nd) : "—"}</b></div>
        <div class="row"><span>Commission</span><b>${fmtMoney(commissionEarned(d))}</b></div>
      ` : `
        <div class="row"><span>Estimated value</span><b>${fmtMoney(basePrice(d) || 0)}</b></div>
        <div class="row"><span>Users</span><b>${d.newUsers}</b></div>
        <div class="row"><span>Logged</span><b>${fmtDateShort(d.date)}</b></div>
      `}
    </div>`;
  }).join("");
}

function openDealForm(dealId) {
  const editing = dealId ? STATE.deals.find(d => d.id === dealId) : null;
  const d = editing || { id: null, date: todayStr(), client: "", product: "CRM", dealType: "New Deal", oldUsers: 0, newUsers: 10, duration: 1, vat: true, overridePrice: "", stage: "Won", commissionPaid: false, notes: "" };
  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>${editing ? "Edit deal" : "New deal"}</h2>
    <p class="hint">Pricing, VAT, invoice total and commission all calculate automatically.</p>
    <div class="form-grid">
      <div class="field full"><label>Client</label><input id="f_client" value="${d.client}" placeholder="Client name"></div>
      <div class="field"><label>Product</label><select id="f_product">${["CRM", "Navi", "HR"].map(p => `<option ${p === d.product ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      <div class="field"><label>Deal type</label><select id="f_type">${["New Deal", "Renewal", "Upgrade"].map(t => `<option ${t === d.dealType ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Old users (upgrade only)</label><input id="f_old" type="number" value="${d.oldUsers}"></div>
      <div class="field"><label>New users</label><input id="f_new" type="number" value="${d.newUsers}"></div>
      <div class="field"><label>Duration (years)</label><select id="f_dur">${[1, 2, 3].map(y => `<option ${y === d.duration ? "selected" : ""}>${y}</option>`).join("")}</select></div>
      <div class="field"><label>VAT applies?</label><select id="f_vat">${["Yes", "No"].map(v => `<option ${(v === "Yes") === d.vat ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>Override price (optional)</label><input id="f_override" type="number" value="${d.overridePrice ?? ""}" placeholder="leave blank to auto-price"></div>
      <div class="field"><label>Stage</label><select id="f_stage">${["New", "Qualified", "Meeting", "Negotiation", "Won"].map(s => `<option ${s === d.stage ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Deal date</label><input id="f_date" type="date" value="${d.date}"></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes" rows="2">${d.notes || ""}</textarea></div>
    </div>
    ${editing && d.stage === "Won" ? renderPaymentsSection(d) : ""}
    <div class="modal-actions">
      ${editing ? `<button class="btn danger" onclick="deleteDeal('${d.id}')">Delete</button>` : ""}
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveDeal('${d.id || ""}')">Save deal</button>
    </div>
  `;
  showModal();
}
function renderPaymentsSection(d) {
  const ps = dealPayments(d.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const rows = ps.map(p => `
    <div class="r">
      <div class="c1">${fmtDateShort(p.dueDate)}</div>
      <div class="c2">${p.paidDate ? "paid " + fmtDateShort(p.paidDate) : "unpaid"}</div>
      <div class="c3">${fmtNum(p.amountPaid)} / ${fmtNum(p.amountDue)}</div>
      <div class="c4"><span class="badge ${p.amountPaid >= p.amountDue ? "paid" : (p.dueDate < todayStr() ? "overdue" : "due")}">${p.amountPaid >= p.amountDue ? "Paid" : (p.dueDate < todayStr() ? "Overdue" : "Due")}</span></div>
    </div>`).join("");
  return `
    <div class="panel" style="margin-top:16px; background:var(--panel2);">
      <h3>Invoice &amp; payments <small>Invoice ${fmtMoney(invoiceTotal(d))} · Collected ${fmtMoney(collected(d))} · Outstanding ${fmtMoney(outstanding(d))}</small></h3>
      <div class="rlist">${rows || '<div class="empty">No payments logged yet.</div>'}</div>
      <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; align-items:flex-end;">
        <div class="field"><label>Due date</label><input id="p_due" type="date" value="${todayStr()}"></div>
        <div class="field"><label>Amount due</label><input id="p_due_amt" type="number" placeholder="0"></div>
        <div class="field"><label>Amount paid</label><input id="p_paid_amt" type="number" placeholder="0"></div>
        <div class="field"><label>Paid date</label><input id="p_paid_date" type="date"></div>
        <button class="btn small" onclick="addPayment('${d.id}')">+ Add payment</button>
      </div>
    </div>
  `;
}
function addPayment(dealId) {
  const due = document.getElementById("p_due").value || todayStr();
  const dueAmt = Number(document.getElementById("p_due_amt").value) || 0;
  const paidAmt = Number(document.getElementById("p_paid_amt").value) || 0;
  const paidDate = document.getElementById("p_paid_date").value || (paidAmt > 0 ? todayStr() : null);
  if (!dueAmt) { toast("Enter an amount due"); return; }
  STATE.payments.push({ id: uid("P"), dealId, dueDate: due, paidDate: paidAmt > 0 ? paidDate : null, amountDue: dueAmt, amountPaid: paidAmt, method: paidAmt > 0 ? "Bank Transfer" : "" });
  save(); toast("Payment added"); openDealForm(dealId);
}
function saveDeal(id) {
  const payload = {
    client: document.getElementById("f_client").value.trim() || "Unnamed client",
    product: document.getElementById("f_product").value,
    dealType: document.getElementById("f_type").value,
    oldUsers: Number(document.getElementById("f_old").value) || 0,
    newUsers: Number(document.getElementById("f_new").value) || 0,
    duration: Number(document.getElementById("f_dur").value),
    vat: document.getElementById("f_vat").value === "Yes",
    overridePrice: document.getElementById("f_override").value === "" ? null : Number(document.getElementById("f_override").value),
    stage: document.getElementById("f_stage").value,
    date: document.getElementById("f_date").value || todayStr(),
    notes: document.getElementById("f_notes").value,
  };
  if (id) {
    Object.assign(STATE.deals.find(d => d.id === id), payload);
    toast("Deal updated");
  } else {
    STATE.deals.push({ id: uid("D"), commissionPaid: false, commissionPaidDate: null, ...payload });
    toast("Deal created");
  }
  save(); closeModal(); renderRoute();
}
function deleteDeal(id) {
  STATE.deals = STATE.deals.filter(d => d.id !== id);
  STATE.payments = STATE.payments.filter(p => p.dealId !== id);
  save(); closeModal(); toast("Deal deleted"); renderRoute();
}

/* ============================================================
   CLIENTS
   ============================================================ */
function uniqueClients() { return [...new Set(STATE.deals.map(d => d.client))].sort(); }
function renderClients() {
  const main = document.getElementById("main");
  const clients = uniqueClients();
  main.innerHTML = `
    <div class="page-head"><div><h1>Clients</h1><p>${clients.length} accounts · rolled up automatically from Deals &amp; Payments</p></div></div>
    <div class="filter-bar"><input id="cliSearch" placeholder="Search clients…"></div>
    <div class="card-grid" id="cliCards"></div>
  `;
  document.getElementById("cliSearch").oninput = (e) => renderClientCards(e.target.value);
  renderClientCards("");
}
function renderClientCards(q) {
  const el = document.getElementById("cliCards");
  let clients = uniqueClients();
  if (q) clients = clients.filter(c => c.toLowerCase().includes(q.toLowerCase()));
  if (!clients.length) { el.innerHTML = `<div class="empty">No clients match.</div>`; return; }
  el.innerHTML = clients.map(c => {
    const deals = STATE.deals.filter(d => d.client === c);
    const won = deals.filter(d => d.stage === "Won");
    const revenue = won.reduce((s, d) => s + invoiceTotal(d), 0);
    const coll = won.reduce((s, d) => s + collected(d), 0);
    const out = revenue - coll;
    const counts = {}; won.forEach(d => counts[d.product] = (counts[d.product] || 0) + invoiceTotal(d));
    const primary = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "—";
    return `
    <div class="rec-card" onclick="openClientDetail('${c.replace(/'/g, "\\'")}')">
      <div class="top"><div><div class="cli">${c}</div><div class="tag">${primary} · ${deals.length} deal(s)</div></div></div>
      <div class="row"><span>Revenue</span><b>${fmtMoney(revenue)}</b></div>
      <div class="row"><span>Collected</span><b>${fmtMoney(coll)}</b></div>
      <div class="row"><span>Outstanding</span><b>${fmtMoney(out)}</b></div>
    </div>`;
  }).join("");
}
function openClientDetail(client) {
  const deals = STATE.deals.filter(d => d.client === client).sort((a, b) => b.date.localeCompare(a.date));
  const won = deals.filter(d => d.stage === "Won");
  const revenue = won.reduce((s, d) => s + invoiceTotal(d), 0);
  const coll = won.reduce((s, d) => s + collected(d), 0);
  const commSum = won.reduce((s, d) => s + commissionEarned(d), 0);
  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <h2>${client}</h2>
    <p class="hint">Client 360 — every deal, payment and commission in one place.</p>
    <div class="kpi-row" style="margin:14px 0;">
      <div class="kpi"><div class="lbl">Revenue</div><div class="val" style="font-size:16px;">${fmtMoney(revenue)}</div></div>
      <div class="kpi"><div class="lbl">Collected</div><div class="val" style="font-size:16px;">${fmtMoney(coll)}</div></div>
      <div class="kpi"><div class="lbl">Outstanding</div><div class="val" style="font-size:16px;">${fmtMoney(revenue - coll)}</div></div>
      <div class="kpi"><div class="lbl">Commission</div><div class="val" style="font-size:16px;">${fmtMoney(commSum)}</div></div>
    </div>
    <h3 style="margin-bottom:8px;">Deal history</h3>
    <div class="rlist">
      ${deals.map(d => `
        <div class="r" style="cursor:pointer;" onclick="closeModal(); openDealForm('${d.id}')">
          <div class="c1">${d.product} · ${d.dealType}</div>
          <div class="c2">${fmtDateShort(d.date)}</div>
          <div class="c3">${d.stage === "Won" ? fmtNum(invoiceTotal(d)) : fmtNum(basePrice(d) || 0)}</div>
          <div class="c4"><span class="badge ${d.stage === "Won" ? { Paid: "paid", Overdue: "overdue", Due: "due", Partial: "partial" }[collectionStatus(d)] : "stage"}">${d.stage === "Won" ? collectionStatus(d) : d.stage}</span></div>
        </div>`).join("") || '<div class="empty">No deals yet.</div>'}
    </div>
    <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Close</button></div>
  `;
  showModal();
}

/* ============================================================
   COLLECTIONS
   ============================================================ */
function renderCollections() {
  const main = document.getElementById("main");
  const won = wonDeals();
  const totalDue = won.reduce((s, d) => s + invoiceTotal(d), 0);
  const totalColl = won.reduce((s, d) => s + collected(d), 0);
  const totalOut = totalDue - totalColl;
  const overdueAmt = won.filter(d => collectionStatus(d) === "Overdue").reduce((s, d) => s + outstanding(d), 0);
  const rate = totalDue ? totalColl / totalDue : 0;

  const upcoming = STATE.payments.filter(p => Number(p.amountPaid || 0) < Number(p.amountDue)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  main.innerHTML = `
    <div class="page-head"><div><h1>Collections</h1><p>What's collected, what's due, what's overdue</p></div></div>
    <div class="kpi-row">
      <div class="kpi accent-green"><div class="lbl">Collected</div><div class="val">${fmtMoney(totalColl)}</div></div>
      <div class="kpi accent-gold"><div class="lbl">Outstanding</div><div class="val">${fmtMoney(totalOut)}</div></div>
      <div class="kpi accent-red"><div class="lbl">Overdue</div><div class="val">${fmtMoney(overdueAmt)}</div></div>
      <div class="kpi accent-teal"><div class="lbl">Collection rate</div><div class="val">${(rate * 100).toFixed(1)}%</div></div>
    </div>
    <div class="panel">
      <h3>Due &amp; overdue payments <small>${upcoming.length} open</small></h3>
      <div class="rlist">
        ${upcoming.map(p => {
          const deal = STATE.deals.find(d => d.id === p.dealId);
          const remaining = Number(p.amountDue) - Number(p.amountPaid || 0);
          const badge = p.dueDate < todayStr() ? "overdue" : "due";
          const label = p.dueDate < todayStr() ? "Overdue" : "Due";
          return `<div class="r"><div class="c1">${deal ? deal.client : "—"}</div><div class="c2">due ${fmtDateShort(p.dueDate)}</div><div class="c3">${fmtNum(remaining)} EGP</div><div class="c4"><span class="badge ${badge}">${label}</span></div></div>`;
        }).join("") || '<div class="empty">Nothing due — you\'re all caught up.</div>'}
      </div>
    </div>
  `;
}

/* ============================================================
   COMMISSION
   ============================================================ */
function renderCommission() {
  const main = document.getElementById("main");
  const won = wonDeals();
  const earned = won.reduce((s, d) => s + commissionEarned(d), 0);
  const paid = won.filter(d => d.commissionPaid).reduce((s, d) => s + commissionEarned(d), 0);
  const pending = earned - paid;
  const nextPayouts = won.filter(d => !d.commissionPaid).map(d => expectedCommissionDate(d)).sort();
  const nextPayout = nextPayouts.length ? nextPayouts[0] : null;

  main.innerHTML = `
    <div class="page-head"><div><h1>Commission</h1><p>Calculated on actual collected money only</p></div></div>
    <div class="kpi-row">
      <div class="kpi accent-green"><div class="lbl">Earned</div><div class="val">${fmtMoney(earned)}</div></div>
      <div class="kpi accent-teal"><div class="lbl">Paid</div><div class="val">${fmtMoney(paid)}</div></div>
      <div class="kpi accent-gold"><div class="lbl">Pending</div><div class="val">${fmtMoney(pending)}</div></div>
      <div class="kpi"><div class="lbl">Next payout date</div><div class="val" style="font-size:16px;">${nextPayout ? fmtDate(nextPayout) : "—"}</div></div>
    </div>
    <div class="panel">
      <h3>Commission by deal</h3>
      <div class="rlist">
        ${won.sort((a, b) => b.date.localeCompare(a.date)).map(d => `
          <div class="r">
            <div class="c1">${d.client} <span style="color:var(--dim); font-weight:400;">· ${d.dealType}</span></div>
            <div class="c2">expected ${fmtDateShort(expectedCommissionDate(d))}</div>
            <div class="c3">${fmtNum(commissionEarned(d))} EGP</div>
            <div class="c4">
              <span class="badge ${d.commissionPaid ? "paid" : "due"}" style="cursor:pointer;" onclick="toggleCommissionPaid('${d.id}')">${d.commissionPaid ? "Paid" : "Pending"}</span>
            </div>
          </div>`).join("") || '<div class="empty">No won deals yet.</div>'}
      </div>
    </div>
  `;
}
function toggleCommissionPaid(id) {
  const d = STATE.deals.find(x => x.id === id);
  d.commissionPaid = !d.commissionPaid;
  d.commissionPaidDate = d.commissionPaid ? todayStr() : null;
  save(); renderCommission(); toast(d.commissionPaid ? "Marked as paid" : "Marked as pending");
}

/* ============================================================
   ACTIVITY
   ============================================================ */
function renderActivity() {
  const main = document.getElementById("main");
  const s = STATE.settings;
  const today = STATE.activity.find(a => a.date === todayStr());
  const weekStart = addDays(todayStr(), -new Date().getDay());
  const weekMeetings = STATE.activity.filter(a => a.date >= weekStart && a.date <= todayStr()).reduce((s2, a) => s2 + a.meetings, 0);
  const sorted = STATE.activity.slice().sort((a, b) => b.date.localeCompare(a.date));

  main.innerHTML = `
    <div class="page-head"><div><h1>Activity</h1><p>Answered calls and meetings, tracked against target</p></div></div>
    <div class="kpi-row">
      <div class="kpi accent-gold"><div class="lbl">Today's calls</div><div class="val">${today ? today.calls : 0} <span style="font-size:12px; color:var(--muted); font-weight:400;">/ ${s.callsTarget}</span></div></div>
      <div class="kpi accent-teal"><div class="lbl">This week's meetings</div><div class="val">${weekMeetings} <span style="font-size:12px; color:var(--muted); font-weight:400;">/ ${s.meetingsTarget}</span></div></div>
    </div>
    <div class="panel">
      <h3>Log today</h3>
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
        <div class="field"><label>Date</label><input id="a_date" type="date" value="${todayStr()}"></div>
        <div class="field"><label>Answered calls</label><input id="a_calls" type="number" value="${today ? today.calls : ""}" placeholder="0"></div>
        <div class="field"><label>Meetings</label><input id="a_meetings" type="number" value="${today ? today.meetings : ""}" placeholder="0"></div>
        <button class="btn" onclick="saveActivity()">Save</button>
      </div>
    </div>
    <div class="panel">
      <h3>Daily log</h3>
      <div class="rlist">
        ${sorted.slice(0, 30).map(a => `<div class="r"><div class="c1">${fmtDate(a.date)}</div><div class="c2"></div><div class="c3">${a.calls} calls</div><div class="c4">${a.meetings} meetings</div></div>`).join("")}
      </div>
    </div>
  `;
}
function saveActivity() {
  const date = document.getElementById("a_date").value || todayStr();
  const calls = Number(document.getElementById("a_calls").value) || 0;
  const meetings = Number(document.getElementById("a_meetings").value) || 0;
  let row = STATE.activity.find(a => a.date === date);
  if (row) { row.calls = calls; row.meetings = meetings; }
  else STATE.activity.push({ date, calls, meetings });
  save(); toast("Activity saved"); renderActivity();
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  const main = document.getElementById("main");
  const s = STATE.settings;
  main.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>Only what actually matters — everything else calculates from here</p></div></div>
    <div class="settings-grid">
      <div class="panel">
        <h3>Targets</h3>
        <div class="set-row"><label>Monthly revenue target (EGP)</label><input id="s_target" type="number" value="${s.targetMonthly}"></div>
        <div class="set-row"><label>Daily calls target</label><input id="s_calls" type="number" value="${s.callsTarget}"></div>
        <div class="set-row"><label>Weekly meetings target</label><input id="s_meetings" type="number" value="${s.meetingsTarget}"></div>
      </div>
      <div class="panel">
        <h3>Tax &amp; commission</h3>
        <div class="set-row"><label>VAT rate</label><input id="s_vat" type="number" step="0.01" value="${s.vatRate}"></div>
        <div class="set-row"><label>New deal commission %</label><input id="s_commnew" type="number" step="0.01" value="${s.commissionNew}"></div>
        <div class="set-row"><label>Renewal commission %</label><input id="s_commren" type="number" step="0.01" value="${s.commissionRenewal}"></div>
        <div class="set-row"><label>Payout day (of next month)</label><input id="s_payout" type="number" value="${s.payoutDay}"></div>
      </div>
    </div>
    <div class="panel">
      <h3>Upgrade commission tiers <small>⚠ example values — not confirmed, edit freely</small></h3>
      <table class="pricing-table"><tr><th>Min added users</th><th>Max added users</th><th>Commission %</th></tr>
        ${s.tiers.map((t, i) => `<tr><td><input data-tier="${i}" data-f="min" type="number" value="${t.min}"></td><td><input data-tier="${i}" data-f="max" type="number" value="${t.max}"></td><td><input data-tier="${i}" data-f="pct" type="number" step="0.01" value="${t.pct}"></td></tr>`).join("")}
      </table>
    </div>
    <div class="settings-grid">
      <div class="panel">
        <h3>Pricing — CRM</h3>
        <table class="pricing-table"><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr>
          ${Object.keys(s.pricing.CRM).map(u => `<tr><td>${u}</td>${[1, 2, 3].map(y => `<td><input data-p="CRM" data-u="${u}" data-y="${y}" type="number" value="${s.pricing.CRM[u][y] || ""}"></td>`).join("")}</tr>`).join("")}
        </table>
      </div>
      <div class="panel">
        <h3>Pricing — Navi</h3>
        <table class="pricing-table"><tr><th>Users</th><th>1yr</th></tr>
          ${Object.keys(s.pricing.Navi).map(u => `<tr><td>${u}</td><td><input data-p="Navi" data-u="${u}" data-y="1" type="number" value="${s.pricing.Navi[u][1] || ""}"></td></tr>`).join("")}
        </table>
      </div>
    </div>
    <div class="panel">
      <h3>Pricing — HR <small>⚠ not confirmed by the company — enter real prices; deals will auto-price once filled in</small></h3>
      <table class="pricing-table"><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr>
        ${[10, 20, 30, 50, 100].map(u => `<tr><td>${u}</td>${[1, 2, 3].map(y => `<td><input data-p="HR" data-u="${u}" data-y="${y}" type="number" value="${(s.pricing.HR[u] && s.pricing.HR[u][y]) || ""}"></td>`).join("")}</tr>`).join("")}
      </table>
    </div>
    <div class="modal-actions" style="justify-content:flex-start;"><button class="btn" onclick="saveSettings()">Save settings</button></div>
  `;
}
function saveSettings() {
  const s = STATE.settings;
  s.targetMonthly = Number(document.getElementById("s_target").value) || s.targetMonthly;
  s.callsTarget = Number(document.getElementById("s_calls").value) || s.callsTarget;
  s.meetingsTarget = Number(document.getElementById("s_meetings").value) || s.meetingsTarget;
  s.vatRate = Number(document.getElementById("s_vat").value);
  s.commissionNew = Number(document.getElementById("s_commnew").value);
  s.commissionRenewal = Number(document.getElementById("s_commren").value);
  s.payoutDay = Number(document.getElementById("s_payout").value) || s.payoutDay;
  document.querySelectorAll("[data-tier]").forEach(inp => {
    const i = Number(inp.dataset.tier), f = inp.dataset.f;
    s.tiers[i][f] = Number(inp.value);
  });
  document.querySelectorAll("[data-p]").forEach(inp => {
    const p = inp.dataset.p, u = inp.dataset.u, y = inp.dataset.y;
    if (!s.pricing[p][u]) s.pricing[p][u] = {};
    if (inp.value !== "") s.pricing[p][u][y] = Number(inp.value);
  });
  save(); toast("Settings saved");
}

/* ============================================================
   Modal helpers + boot
   ============================================================ */
function showModal() { document.getElementById("overlay").classList.add("show"); }
function closeModal() { document.getElementById("overlay").classList.remove("show"); }
document.getElementById("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

buildNav();
if (!location.hash) location.hash = "#/home";
renderRoute();
