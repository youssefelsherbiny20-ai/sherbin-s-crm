/* ============================================================
   Youssef Sales CRM — v3
   Normalized state · payment-based commission · offline SVG charts
   Goals/OKR · Cohort Analysis · Document Attachments · Multi-contact
   Vanilla JS · LocalStorage · No build step · No server
   ============================================================ */

const LS_KEY       = "youssef_crm_state_v3";
const LS_KEY_OLD   = "youssef_crm_state_v2";
const STATE_VERSION = 3;
const NOTIF_READ_KEY = "youssef_crm_notif_read_v1";

/* ── generic utils ── */
const todayStr = () => new Date().toLocaleDateString("en-CA");
const fmtMoney = (n) => (n < 0 ? "-" : "") + Math.round(Math.abs(n || 0)).toLocaleString() + " EGP";
const fmtNum   = (n) => Math.round(n || 0).toLocaleString();
const fmtDate  = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" }) : "—";
const fmtDateShort = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { day:"2-digit", month:"short" }) : "—";
const addDays  = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toLocaleDateString("en-CA"); };
const addMonthsDate = (d, n) => { const x = new Date(d + "T00:00:00"); x.setMonth(x.getMonth() + n); return x; };
const addYearsStr   = (d, n) => { const x = new Date(d + "T00:00:00"); x.setFullYear(x.getFullYear() + n); return x.toLocaleDateString("en-CA"); };
const ymOf     = (d) => d ? d.slice(0, 7) : "";
const clamp    = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const monthLabel = (ymStr) => { const [y, m] = ymStr.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month:"short", year:"2-digit" }); };
const currentYM  = () => ymOf(todayStr());
function pad4(n) { return String(n).padStart(4, "0"); }
function inMonth(dateStr, ymStr) { return dateStr && ymOf(dateStr) === ymStr; }

/* ── file size formatter ── */
function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/* ── file type icon ── */
function fileIcon(mime) {
  if (!mime) return "📄";
  if (mime.includes("pdf"))   return "📕";
  if (mime.includes("word") || mime.includes("document")) return "📘";
  if (mime.includes("sheet") || mime.includes("excel"))   return "📗";
  if (mime.includes("image")) return "🖼";
  if (mime.includes("zip") || mime.includes("compressed")) return "🗜";
  return "📄";
}

/* ══════════════════════════════════════════════════════════
   PHONE / WHATSAPP UTILS
   ══════════════════════════════════════════════════════════ */
function normalizeEgyptPhone(raw) {
  if (!raw) return "";
  let d = String(raw).replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0020")) d = d.slice(2);
  if (d.startsWith("20") && d.length === 12) return d;
  if (/^0(10|11|12|15)\d{8}$/.test(d)) return "20" + d.slice(1);
  if (/^(10|11|12|15)\d{8}$/.test(d))  return "20" + d;
  return d;
}
function waLink(rawPhone, message) {
  const n = normalizeEgyptPhone(rawPhone);
  if (!n) return null;
  return `https://wa.me/${n}${message ? "?text=" + encodeURIComponent(message) : ""}`;
}
function telLink(rawPhone) {
  const n = normalizeEgyptPhone(rawPhone);
  return n ? `tel:+${n}` : null;
}
function waBtn(phone, kind, ctx, label) {
  if (!phone) return "";
  return `<button type="button" class="icon-btn wa" title="WhatsApp"
    onclick='event.stopPropagation();openWhatsAppComposer(${JSON.stringify(phone)},${JSON.stringify(kind)},${JSON.stringify(ctx)})'>
    💬${label ? " " + label : ""}
  </button>`;
}
function callBtn(phone) {
  if (!phone) return "";
  const link = telLink(phone);
  if (!link) return "";
  return `<a class="icon-btn call" title="Call" href="${link}" onclick="event.stopPropagation();">📞</a>`;
}

/* ── WhatsApp templates ── */
const WA_TEMPLATES = [
  { key:"payment",   icon:"💳", name:"Payment Reminder",   desc:"Polite nudge for overdue/upcoming invoice",
    build:(ctx) => `Hi ${ctx.clientName||"there"} 👋\n\nThis is Youssef from the sales team. Just a friendly reminder that a payment of *${fmtNum(ctx.amount||0)} EGP* was due on ${fmtDateShort(ctx.dueDate)}.\n\nCould you please update me on the status? Happy to help resolve any questions.\n\nThank you! 🙏` },
  { key:"renewal",   icon:"🔄", name:"Renewal Outreach",   desc:"Start the renewal conversation early",
    build:(ctx) => `Hi ${ctx.clientName||"there"} 👋\n\nHope everything is going well! Your *${ctx.product||"subscription"}* is coming up for renewal on *${fmtDateShort(ctx.renewalDate)}*.\n\nI'd love to schedule a quick call to discuss renewal options. When works best for you? 📅` },
  { key:"followup",  icon:"📋", name:"Meeting Follow-up",  desc:"Post-meeting thank you & next steps",
    build:(ctx) => `Hi ${ctx.clientName||"there"} 👋\n\nThank you for taking the time to meet today — it was great connecting!\n\nI'll send over the proposal shortly. Feel free to reach out with any questions. 🚀` },
  { key:"proposal",  icon:"📄", name:"Proposal Send",      desc:"Introduce a new proposal or quote",
    build:(ctx) => `Hi ${ctx.clientName||"there"} 👋\n\nI've prepared a tailored proposal for *${ctx.product||"our solution"}*. I'd love to walk you through it — would you have 15 minutes this week? 😊` },
  { key:"check_in",  icon:"👋", name:"General Check-in",   desc:"Warm relationship-building touchpoint",
    build:(ctx) => `Hi ${ctx.clientName||"there"} 👋\n\nThis is Youssef — just checking in to see how things are going! Is there anything I can help with? 😊` },
  { key:"intro",     icon:"✨", name:"First Introduction", desc:"Cold/warm intro to a new prospect",
    build:(ctx) => `Hi ${ctx.clientName||"there"} 👋\n\nMy name is Youssef and I believe our *${ctx.product||"solution"}* could be a great fit for your team. Would you be open to a quick 10-minute call? 🙏` },
];
function waTemplate(kind, ctx) {
  const tpl = WA_TEMPLATES.find(t => t.key === kind);
  return tpl ? tpl.build(ctx) : WA_TEMPLATES.find(t => t.key === "check_in").build(ctx);
}
function openWhatsAppComposer(phone, kind, ctx) {
  const n = normalizeEgyptPhone(phone);
  if (!n) { toast("No valid phone number on file", true); return; }
  let selectedKey = WA_TEMPLATES.find(t => t.key === kind) ? kind : "check_in";
  function buildHTML(key) {
    const tpl = WA_TEMPLATES.find(t => t.key === key) || WA_TEMPLATES[0];
    const msg = tpl.build(ctx);
    return `<div class="wa-composer">
      <h2>💬 WhatsApp ${ctx.clientName||""}</h2>
      <p class="hint">Pick a template, edit freely, then open WhatsApp. Never auto-sends.</p>
      <div class="wa-phone-preview">📱 +${n}${ctx.clientName ? " · " + ctx.clientName : ""}</div>
      <div class="wa-template-grid">
        ${WA_TEMPLATES.map(t => `<button type="button" class="wa-tpl-btn ${t.key===key?"selected":""}"
          onclick="refreshWAComposer('${phone}','${t.key}',${JSON.stringify(ctx).replace(/'/g,"&#39;")})">
          <span class="tpl-icon">${t.icon}</span>
          <span class="tpl-name">${t.name}</span>
          <span class="tpl-desc">${t.desc}</span>
        </button>`).join("")}
      </div>
      <div class="wa-divider">or edit message directly</div>
      <textarea id="waMsg" class="wa-msg-area" rows="6"
        oninput="document.getElementById('waCharCount').textContent=this.value.length+' chars'"
        >${msg}</textarea>
      <div class="wa-char-count" id="waCharCount">${msg.length} chars</div>
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn secondary" onclick="closeModal()">Cancel</button>
        <button class="btn" onclick="window.open('https://wa.me/${n}?text='+encodeURIComponent(document.getElementById('waMsg').value),'_blank')">Open WhatsApp ↗</button>
      </div>
    </div>`;
  }
  document.getElementById("modalBody").innerHTML = buildHTML(selectedKey);
  showModal();
  window.refreshWAComposer = (ph, key, c) => {
    document.getElementById("modalBody").innerHTML = buildHTML(key);
  };
}

/* ── toast ── */
function toast(msg, isErr) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.add("show");
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ══════════════════════════════════════════════════════════
   DEFAULT SETTINGS
   ══════════════════════════════════════════════════════════ */
function defaultSettings() {
  return {
    vatRate: 0.14,
    commissionNew: 0.10,
    commissionRenewal: 0.05,
    trainingFee: 500,
    payoutDelayMonths: 2,
    payoutDay: 10,
    tiers: [
      { min:1,  max:5,      pct:0.06 },
      { min:6,  max:10,     pct:0.07 },
      { min:11, max:20,     pct:0.08 },
      { min:21, max:50,     pct:0.09 },
      { min:51, max:999999, pct:0.10 },
    ],
    dailyRules: { zero:40, one:20, twoPlus:0 },
    monthlyTargets: { default:800000 },
    pricing: {
      CRM: {
        5:{1:13000,2:19500,3:26000}, 10:{1:22000,2:33000,3:44000},
        15:{1:28000,2:42000,3:56000}, 20:{1:32000,2:48000,3:64000},
        25:{1:38000,2:57000,3:76000}, 30:{1:40000,2:60000,3:80000},
        40:{1:46000,2:69000,3:92000}, 50:{1:53000,2:79500,3:106000},
        70:{1:68000,2:102000,3:136000}, 100:{1:77000,2:115500,3:154000},
      },
      Navi: { 5:{1:18000}, 10:{1:30000}, 15:{1:40500}, 20:{1:54000}, 25:{1:60000}, 30:{1:72000} },
      HR: {}
    }
  };
}

/* ══════════════════════════════════════════════════════════
   EMPTY STATE — v3 adds okrs, documents, multi-contacts
   ══════════════════════════════════════════════════════════ */
function emptyState() {
  return {
    version: STATE_VERSION,
    counters: { deal:0, payment:0, client:0, okr:0, kr:0, doc:0 },
    clients:  [],   /* each client now has a `contacts: []` array */
    deals:    [],
    payments: [],
    activity: [],
    okrs:     [],   /* { id, title, period, objective, keyResults:[] } */
    documents:[],   /* { id, dealId, clientId, name, mime, size, base64, uploadedAt, notes } */
    settings: defaultSettings(),
  };
}

function nextId(kind) {
  const prefix = { deal:"D", payment:"P", client:"CL", okr:"OKR", kr:"KR", doc:"DOC" }[kind];
  STATE.counters[kind] = (STATE.counters[kind] || 0) + 1;
  return `${prefix}-${pad4(STATE.counters[kind])}`;
}

/* ── client helpers ── */
function getOrCreateClient(name) {
  name = (name || "").trim() || "Unnamed client";
  let c = STATE.clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (c) return c;
  c = {
    id: nextId("client"), name,
    phone:"", email:"", company:"", notes:"",
    contacts: [],   /* NEW: array of contact objects */
    createdAt: todayStr(), updatedAt: todayStr()
  };
  STATE.clients.push(c);
  return c;
}
function getOrCreateClientRaw(st, name, extra) {
  name = (name || "Unnamed client").trim();
  let c = st.clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (c) return c;
  c = {
    id:`CL-${pad4(++st.counters.client)}`, name,
    phone:"", email:"", company:"", notes:"",
    contacts: [],
    createdAt: todayStr(), updatedAt: todayStr(),
    ...(extra || {})
  };
  st.clients.push(c);
  return c;
}

/* Primary phone: first contact with phone, or client.phone legacy field */
function primaryPhone(client) {
  if (!client) return "";
  if (client.contacts && client.contacts.length) {
    const prim = client.contacts.find(c => c.isPrimary) || client.contacts[0];
    if (prim && prim.phone) return prim.phone;
  }
  return client.phone || "";
}

/* ══════════════════════════════════════════════════════════
   FINANCIAL ENGINE
   ══════════════════════════════════════════════════════════ */
function priceLookup(product, users, duration) {
  const table = STATE.settings.pricing[product] || {};
  const row   = table[users];
  if (!row) return null;
  return row[duration] ?? row[1] ?? null;
}
function addedUsersOf(deal)   { return Math.max((deal.newUsers||0) - (deal.oldUsers||0), 0); }
function usersForPricing(deal){ return deal.dealType === "Upgrade" ? addedUsersOf(deal) : deal.newUsers; }
function standardPrice(deal)  { return priceLookup(deal.product, usersForPricing(deal), deal.durationYears); }
function basePriceOf(deal) {
  if (deal.overridePrice != null && deal.overridePrice !== "") return Number(deal.overridePrice);
  return standardPrice(deal) || 0;
}
function hasPriceSource(deal) {
  return (deal.overridePrice != null && deal.overridePrice !== "") || standardPrice(deal) != null;
}
function vatAmountOf(deal)   { return deal.vatApplicable ? basePriceOf(deal) * (deal.vatRateAtSale ?? STATE.settings.vatRate) : 0; }
function invoiceTotalOf(deal){ return basePriceOf(deal) + vatAmountOf(deal); }
function renewalDateOf(deal) { return addYearsStr(deal.dealDate, deal.durationYears || 1); }
function paymentsOfDeal(dealId) { return STATE.payments.filter(p => p.dealId === dealId); }
function collectedOf(deal)   { return paymentsOfDeal(deal.id).reduce((s,p) => s + (Number(p.amountPaid)||0), 0); }
function outstandingOf(deal) { return invoiceTotalOf(deal) - collectedOf(deal); }

function paymentStatus(p) {
  const remaining = Number(p.amountDue) - Number(p.amountPaid||0);
  if (remaining <= 0.5)          return "Collected";
  if (p.dueDate < todayStr())    return "Overdue";
  if (p.dueDate === todayStr())  return "Due";
  if (Number(p.amountPaid||0) > 0) return "Partially Paid";
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

/* ── Commission ── */
function commissionRateOf(deal) {
  const s = STATE.settings;
  if (deal.dealType === "New Deal") return s.commissionNew;
  if (deal.dealType === "Renewal")  return s.commissionRenewal;
  if (deal.dealType === "Upgrade") {
    const added = addedUsersOf(deal);
    const tier  = s.tiers.find(t => added >= t.min && added <= t.max);
    if (tier) return tier.pct;
    const fallback = s.tiers.slice().sort((a,b) => a.min - b.min)[0];
    return fallback ? fallback.pct : s.commissionNew;
  }
  return 0;
}
function expectedPayoutDate(earnedDateStr) {
  const s = STATE.settings;
  const d = addMonthsDate(earnedDateStr, s.payoutDelayMonths);
  return new Date(d.getFullYear(), d.getMonth(), s.payoutDay).toLocaleDateString("en-CA");
}
function commissionLinesForDeal(deal) {
  if (deal.stage !== "Won") return [];
  const rate = commissionRateOf(deal);
  const paidPayments = paymentsOfDeal(deal.id)
    .filter(p => Number(p.amountPaid||0) > 0)
    .sort((a,b) => (a.paidDate||a.dueDate).localeCompare(b.paidDate||b.dueDate));
  let remainingTraining = deal.dealType === "New Deal" ? STATE.settings.trainingFee : 0;
  return paidPayments.map(p => {
    const eligible  = Number(p.amountPaid);
    const gross     = eligible * rate;
    const deduction = Math.min(remainingTraining, gross);
    remainingTraining -= deduction;
    const net         = gross - deduction;
    const earnedDate  = p.paidDate || p.dueDate;
    const payoutDate  = expectedPayoutDate(earnedDate);
    let payoutStatus  = "LOCKED";
    if (p.commissionPaid)          payoutStatus = "PAID";
    else if (payoutDate <= todayStr()) payoutStatus = "AVAILABLE";
    return {
      dealId:deal.id, paymentId:p.id, client:deal.client, dealType:deal.dealType,
      eligibleCollectedAmount:eligible, commissionRate:rate, grossCommission:gross,
      trainingFeeDeduction:deduction, netCommission:net, earnedDate,
      expectedPayoutDate:payoutDate, payoutStatus,
      actualPayoutDate:p.commissionPaidDate||null,
    };
  });
}
function allCommissionLines() { return wonDeals().flatMap(commissionLinesForDeal); }
function commissionVault() {
  const lines = allCommissionLines();
  const sum   = (arr) => arr.reduce((s,l) => s + l.netCommission, 0);
  return {
    earned:    sum(lines),
    locked:    sum(lines.filter(l => l.payoutStatus === "LOCKED")),
    available: sum(lines.filter(l => l.payoutStatus === "AVAILABLE")),
    paid:      sum(lines.filter(l => l.payoutStatus === "PAID")),
    lines,
  };
}
function nextPayoutInfo() {
  const upcoming = allCommissionLines()
    .filter(l => l.payoutStatus !== "PAID")
    .sort((a,b) => a.expectedPayoutDate.localeCompare(b.expectedPayoutDate));
  if (!upcoming.length) return null;
  const date = upcoming[0].expectedPayoutDate;
  return { date, amount: upcoming.filter(l => l.expectedPayoutDate === date).reduce((s,l)=>s+l.netCommission,0) };
}

/* ── MRR / ARR ── */
function calcMRR() {
  const today  = todayStr();
  const active = wonDeals().filter(d => renewalDateOf(d) >= today);
  return active.reduce((sum,d) => sum + basePriceOf(d) / ((d.durationYears||1)*12), 0);
}
function calcARR() { return calcMRR() * 12; }
function calcChurnedMRR() {
  const today = todayStr();
  return wonDeals().filter(d => {
    if (renewalDateOf(d) >= today) return false;
    return !STATE.deals.some(r => r.clientId===d.clientId && r.dealType==="Renewal" && r.dealDate>=renewalDateOf(d) && r.stage==="Won");
  }).reduce((sum,d) => sum + basePriceOf(d)/((d.durationYears||1)*12), 0);
}
function calcNRR() {
  const mrr = calcMRR(), churn = calcChurnedMRR();
  if (mrr + churn === 0) return 100;
  return (mrr / (mrr + churn)) * 100;
}

/* ── Deal helpers ── */
function wonDeals() { return STATE.deals.filter(d => d.stage === "Won"); }
function monthlyTarget(ymStr) { return STATE.settings.monthlyTargets[ymStr] ?? STATE.settings.monthlyTargets.default; }
function requiredDailyPace(remaining) {
  const end = new Date(), lastDay = new Date(end.getFullYear(), end.getMonth()+1, 0).getDate();
  const daysLeft = Math.max(lastDay - end.getDate() + 1, 1);
  return remaining / daysLeft;
}

/* ── Activity ── */
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
function activityOf(dateStr)      { return STATE.activity.find(a => a.date === dateStr); }
function getOrCreateActivity(dateStr) {
  let a = activityOf(dateStr);
  if (!a) { a = { date:dateStr, answeredCalls:0, meetings:0 }; STATE.activity.push(a); }
  return a;
}

/* ── Stale deals ── */
function isDealStale(deal) {
  const activeStages = ["New","Qualified","Meeting","Negotiation"];
  if (!activeStages.includes(deal.stage)) return false;
  const last  = deal.updatedAt || deal.createdAt || deal.dealDate;
  if (!last) return true;
  return Math.round((new Date(todayStr()+"T00:00:00") - new Date(last+"T00:00:00")) / 86400000) > 7;
}
function staleDealDays(deal) {
  const last = deal.updatedAt || deal.createdAt || deal.dealDate;
  if (!last) return 0;
  return Math.round((new Date(todayStr()+"T00:00:00") - new Date(last+"T00:00:00")) / 86400000);
}
function touchDeal(id) {
  const d = STATE.deals.find(x => x.id === id);
  if (!d) return;
  d.updatedAt = todayStr();
  save(); toast(`${d.client} marked as active`);
  kanbanView ? renderKanban() : renderDealCards();
}

/* ── Deal health score ── */
function dealHealthScore(deal) {
  const prob     = STAGE_PROBABILITY[deal.stage] ?? 0;
  const fresh    = isDealStale(deal) ? 0 : 1;
  const avgVal   = STATE.deals.length > 0 ? STATE.deals.reduce((s,d)=>s+(basePriceOf(d)||0),0)/STATE.deals.length : 1;
  const valScore = Math.min((basePriceOf(deal)||0)/avgVal, 2) / 2;
  return Math.round(clamp((prob*.5)+(fresh*.3)+(valScore*.2), 0, 1) * 100);
}
function dealScorePill(deal) {
  const s = dealHealthScore(deal);
  if (s >= 65) return `<span class="deal-score hot" data-tip="Deal score ${s}/100 — Hot">🔥 ${s}</span>`;
  if (s >= 35) return `<span class="deal-score warm" data-tip="Deal score ${s}/100 — Warm">⚡ ${s}</span>`;
  return `<span class="deal-score cold" data-tip="Deal score ${s}/100 — Cold">❄ ${s}</span>`;
}

/* ── Validation ── */
function validateDealInput(payload) {
  const errs = [];
  if (!payload.client || !payload.client.trim()) errs.push("Client name is required.");
  if (payload.newUsers < 0 || payload.oldUsers < 0) errs.push("Users cannot be negative.");
  if (payload.dealType === "Upgrade" && payload.newUsers <= payload.oldUsers) errs.push("Upgrade requires new users > old users.");
  if (payload.durationYears < 1 || payload.durationYears > 3) errs.push("Duration must be 1–3 years.");
  if (!payload.dealDate) errs.push("Deal date is required.");
  if (payload.stage === "Won" && !hasPriceSource(payload)) errs.push("No exact package price found — enter an Override Price.");
  return errs;
}
function validateMilestones(milestones, invoiceTotal) {
  const errs  = [];
  const total = milestones.reduce((s,m) => s + Number(m.amountDue||0), 0);
  if (milestones.some(m => Number(m.amountDue) < 0))                       errs.push("Milestone amounts cannot be negative.");
  if (milestones.some(m => Number(m.amountPaid||0) < 0))                   errs.push("Paid amounts cannot be negative.");
  if (milestones.some(m => Number(m.amountPaid||0) > Number(m.amountDue)+.5)) errs.push("Paid amount exceeds due amount.");
  if (total > invoiceTotal + 1) errs.push(`Milestones total (${fmtNum(total)}) exceeds invoice total (${fmtNum(invoiceTotal)}).`);
  if (milestones.some(m => !m.dueDate)) errs.push("Every milestone needs a due date.");
  return errs;
}

/* ── Payment plan builder ── */
function buildPlan(planType, invoiceTotal, firstDueDate) {
  const mk = (pct, offsetDays) => ({
    id:null, percentage:pct,
    amountDue:Math.round(invoiceTotal*pct)/100,
    dueDate:addDays(firstDueDate, offsetDays),
    amountPaid:0, paidDate:null, paymentMethod:"", notes:"",
    commissionPaid:false, commissionPaidDate:null
  });
  if (planType === "FULL")           return [{ ...mk(100, 0) }];
  if (planType === "50/50")          return [mk(50, 0), mk(50, 30)];
  if (planType === "3 INSTALLMENTS") return [mk(34, 0), mk(33, 30), mk(33, 60)];
  return [];
}
function reconcileRounding(milestones, invoiceTotal) {
  if (!milestones.length) return milestones;
  const sum  = milestones.reduce((s,m) => s + Number(m.amountDue), 0);
  const diff = Math.round(invoiceTotal - sum);
  if (diff !== 0) milestones[milestones.length-1].amountDue = Math.round(Number(milestones[milestones.length-1].amountDue) + diff);
  return milestones;
}

/* ══════════════════════════════════════════════════════════
   MIGRATION v2 → v3
   ══════════════════════════════════════════════════════════ */
function migrateV2toV3(old) {
  old.version  = STATE_VERSION;
  old.counters = { ...{ okr:0, kr:0, doc:0 }, ...old.counters };
  if (!old.okrs)      old.okrs      = [];
  if (!old.documents) old.documents = [];
  /* ensure every client has a contacts array */
  (old.clients||[]).forEach(c => {
    if (!c.contacts) c.contacts = [];
    /* migrate legacy single contact fields into contacts array */
    if ((c.phone || c.contact) && !c.contacts.length) {
      if (c.phone) {
        c.contacts.push({
          id: `CT-${pad4(++old.counters.client)}`,
          name: c.contact || c.name,
          role: "", phone: c.phone, email: c.email||"",
          isPrimary: true, notes: "",
        });
      }
    }
  });
  return old;
}

/* ══════════════════════════════════════════════════════════
   SEED DEMO DATA
   ══════════════════════════════════════════════════════════ */
function buildSeed() {
  const st  = emptyState();
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clientData = [
    ["Nile Retail Group",     "01012345001","Ahmed Samir","CEO"],
    ["Cairo Fintech Co",      "01112345002","Mona Hassan","CFO"],
    ["Delta Logistics",       "01212345003","Karim Youssef","IT Director"],
    ["Alexandria Motors",     "01512345004","Sara Mahmoud","Owner"],
    ["Giza HealthCare",       "01098765005","Dr. Tarek Ali","Director"],
    ["Red Sea Hospitality",   "",            "Nadia Fouad","GM"],
    ["Sphinx Manufacturing",  "01187654006","Hossam Reda","COO"],
    ["Luxor Education Group", "01276543007","Layla Nasser","President"],
    ["Zamalek Media House",   "01555443008","Omar Sherif","MD"],
    ["October Real Estate",   "01023344009","Rania Farouk","Partner"],
  ];
  clientData.forEach(([name, phone, contactName, role]) => {
    const c = getOrCreateClientRaw(st, name, { phone });
    if (phone && contactName) {
      c.contacts.push({
        id:`CT-${pad4(++st.counters.client)}`,
        name:contactName, role, phone, email:"",
        isPrimary:true, notes:"",
      });
      /* add a secondary contact for some */
      if (Math.random() > 0.5) {
        c.contacts.push({
          id:`CT-${pad4(++st.counters.client)}`,
          name:"Assistant " + contactName.split(" ")[0],
          role:"Assistant", phone:"", email:"",
          isPrimary:false, notes:"",
        });
      }
    }
  });

  const today = todayStr();
  function priceLookupLocal(product, users, duration) {
    const table = st.settings.pricing[product]||{};
    const row   = table[users];
    return row ? (row[duration]??row[1]??null) : null;
  }
  const scenarios = [
    { product:"CRM",  type:"New Deal", users:20, dur:2, vat:true,  plan:"FULL",           daysAgo:55, payFull:true },
    { product:"CRM",  type:"New Deal", users:15, dur:1, vat:true,  plan:"50/50",          daysAgo:48, pay:[true,true] },
    { product:"CRM",  type:"New Deal", users:30, dur:3, vat:true,  plan:"50/50",          daysAgo:20, pay:[true,false] },
    { product:"Navi", type:"New Deal", users:10, dur:1, vat:true,  plan:"3 INSTALLMENTS", daysAgo:70, pay:[true,true,true] },
    { product:"Navi", type:"New Deal", users:20, dur:1, vat:false, plan:"3 INSTALLMENTS", daysAgo:40, pay:[true,"partial",false] },
    { product:"CRM",  type:"Renewal",  users:25, dur:1, vat:true,  plan:"FULL",           daysAgo:10, payFull:true },
    { product:"CRM",  type:"Renewal",  users:10, dur:1, vat:true,  plan:"50/50",          daysAgo:65, pay:[true,"overdue"] },
    { product:"HR",   type:"New Deal", users:20, dur:1, vat:true,  plan:"FULL",           daysAgo:5,  payFull:false },
    { product:"CRM",  type:"Upgrade",  users:40, oldUsers:20, dur:2, vat:true, plan:"FULL", daysAgo:15, payFull:true },
    { product:"CRM",  type:"Upgrade",  users:30, oldUsers:15, dur:1, vat:true, plan:"50/50", daysAgo:6, pay:[true,false] },
    { product:"Navi", type:"New Deal", users:5,  dur:1, vat:true,  plan:"FULL",           daysAgo:90, payFull:true },
    { product:"CRM",  type:"Renewal",  users:50, dur:3, vat:true,  plan:"3 INSTALLMENTS", daysAgo:100,pay:[true,true,true] },
    { product:"CRM",  type:"New Deal", users:70, dur:1, vat:true,  plan:"50/50",          daysAgo:3,  pay:[false,false] },
  ];
  const clientNames = clientData.map(([n])=>n);
  scenarios.forEach(sc => {
    const client   = rnd(clientNames);
    const dealDate = addDays(today, -sc.daysAgo);
    const oldUsers = sc.oldUsers || 0;
    const uForPrice= sc.type==="Upgrade" ? Math.max(sc.users-oldUsers,0) : sc.users;
    let base = sc.product==="HR" ? uForPrice*900 : priceLookupLocal(sc.product, uForPrice, sc.dur);
    if (base==null) base = uForPrice*1000;
    const vatAmt = sc.vat ? base*st.settings.vatRate : 0;
    const invoiceTotal = base + vatAmt;
    const dealId = `D-${pad4(++st.counters.deal)}`;
    const cObj   = getOrCreateClientRaw(st, client);
    st.deals.push({
      id:dealId, clientId:cObj.id, client,
      product:sc.product, dealType:sc.type, stage:"Won",
      dealDate, oldUsers, newUsers:sc.users, durationYears:sc.dur,
      vatApplicable:sc.vat, vatRateAtSale:st.settings.vatRate,
      overridePrice:sc.product==="HR"?Math.round(base):null, notes:"",
      createdAt:dealDate, updatedAt:dealDate,
    });
    let milestones = buildPlan(sc.plan, invoiceTotal, dealDate);
    milestones = reconcileRounding(milestones, invoiceTotal);
    const payFlags = sc.payFull!=null ? [sc.payFull] : sc.pay;
    milestones.forEach((m,i) => {
      const flag = payFlags[i];
      let amountPaid=0, paidDate=null, dueDate=m.dueDate, method="";
      if (flag===true) {
        amountPaid=m.amountDue;
        paidDate=addDays(dueDate, Math.random()<.4?3:-1);
        if (paidDate>today) paidDate=today;
        method=rnd(["Bank Transfer","Instapay","Cheque"]);
      } else if (flag==="partial") {
        amountPaid=Math.round(m.amountDue*.45); paidDate=addDays(dueDate,2); method="Cash";
      } else if (flag==="overdue") {
        dueDate=addDays(today,-10);
      }
      st.payments.push({
        id:`P-${pad4(++st.counters.payment)}`, dealId, percentage:m.percentage,
        amountDue:m.amountDue, amountPaid, dueDate, paidDate, paymentMethod:method,
        notes:"", commissionPaid:paidDate&&sc.daysAgo>75,
        commissionPaidDate:paidDate&&sc.daysAgo>75?addDays(paidDate,60):null,
      });
    });
  });

  /* pipeline deals */
  const stages = ["New","Qualified","Meeting","Negotiation"];
  ["Mansoura Trading","Tanta Textiles","Port Said Shipping","Nasr City Retail","Ismailia Agro","6th October Foods"].forEach((cn,i) => {
    const product = rnd(["CRM","Navi","HR"]);
    const users   = rnd([5,10,15,20,30]);
    const cObj    = getOrCreateClientRaw(st, cn);
    st.deals.push({
      id:`D-${pad4(++st.counters.deal)}`, clientId:cObj.id, client:cn,
      product, dealType:"New Deal", stage:stages[i%stages.length],
      dealDate:addDays(today,-Math.floor(Math.random()*20)),
      oldUsers:0, newUsers:users, durationYears:1, vatApplicable:true,
      overridePrice:null, notes:"", createdAt:today, updatedAt:today,
    });
  });

  /* activity */
  for (let i=29;i>=0;i--) {
    const d = addDays(today,-i);
    const isWeekend = [0,6].includes(new Date(d+"T00:00:00").getDay());
    const meetings  = isWeekend ? 0 : rnd([0,0,1,1,2,3]);
    const req       = meetings>=2?0:meetings===1?20:40;
    const calls     = isWeekend ? Math.floor(Math.random()*8) : Math.max(0,Math.round(req*(0.6+Math.random()*.6)));
    st.activity.push({ date:d, answeredCalls:calls, meetings });
  }

  /* ── seed OKRs ── */
  const q = `Q${Math.ceil((new Date().getMonth()+1)/3)} ${new Date().getFullYear()}`;
  st.okrs.push({
    id:`OKR-0001`, title:"Grow Revenue & Market Share", period:q,
    keyResults:[
      { id:"KR-0001", title:"Hit monthly revenue target of 800K EGP",     current:sales_from_won(st)*100, target:800000, unit:"EGP",  dueDate:addDays(today,30),  notes:"" },
      { id:"KR-0002", title:"Close 15 new deals this quarter",             current:st.deals.filter(d=>d.stage==="Won"&&d.dealType==="New Deal").length, target:15, unit:"deals", dueDate:addDays(today,60), notes:"" },
      { id:"KR-0003", title:"Maintain collection rate above 85%",          current:82, target:85, unit:"%", dueDate:addDays(today,30), notes:"" },
    ],
  });
  st.okrs.push({
    id:`OKR-0002`, title:"Build a Healthy Sales Pipeline", period:q,
    keyResults:[
      { id:"KR-0004", title:"Keep pipeline weighted value above 2M EGP",  current:1400000, target:2000000, unit:"EGP",  dueDate:addDays(today,90), notes:"" },
      { id:"KR-0005", title:"Log 40+ answered calls per week (no meeting)",current:35, target:40, unit:"calls/wk", dueDate:addDays(today,7), notes:"" },
      { id:"KR-0006", title:"Convert 6 deals from Negotiation → Won",     current:2, target:6, unit:"deals", dueDate:addDays(today,60), notes:"" },
    ],
  });
  st.counters.okr=2; st.counters.kr=6;

  return st;
}
function sales_from_won(st) {
  /* helper used only during seed — can't call invoiceTotalOf as STATE not set yet */
  return st.deals.filter(d=>d.stage==="Won").length * 48000;
}

/* ══════════════════════════════════════════════════════════
   LOAD / SAVE
   ══════════════════════════════════════════════════════════ */
let toastQueued = null;
let STATE = load();
function load() {
  const rawV3 = localStorage.getItem(LS_KEY);
  if (rawV3) {
    try {
      const p = JSON.parse(rawV3);
      if (p.version === STATE_VERSION) return p;
      if (p.version === 2) { const m=migrateV2toV3(p); localStorage.setItem(LS_KEY,JSON.stringify(m)); toastQueued="Data migrated to v3."; return m; }
    } catch(e) {}
  }
  const rawOld = localStorage.getItem(LS_KEY_OLD);
  if (rawOld) {
    try {
      const p = JSON.parse(rawOld);
      if (p.version === 2) { const m=migrateV2toV3(p); localStorage.setItem(LS_KEY,JSON.stringify(m)); toastQueued="Data migrated to v3."; return m; }
    } catch(e) {}
  }
  const seed = buildSeed();
  localStorage.setItem(LS_KEY, JSON.stringify(seed));
  return seed;
}
function save() { STATE.version = STATE_VERSION; localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }

/* ── backup ── */
function exportBackup() {
  const blob = new Blob([JSON.stringify(STATE,null,2)],{type:"application/json"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`youssef-crm-backup-${todayStr()}.json`; a.click();
  URL.revokeObjectURL(url); toast("Backup exported");
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(reader.result);
      if (!p.deals||!p.payments||!p.settings) throw new Error("bad");
      STATE = p.version<STATE_VERSION ? migrateV2toV3(p) : p;
      STATE.version = STATE_VERSION; save(); toast("Backup imported"); renderRoute();
    } catch(e) { toast("Invalid backup file",true); }
  };
  reader.readAsText(file);
}
function resetDemoData() {
  if (!confirm("Clear ALL data and reload fresh demo data?")) return;
  localStorage.removeItem(LS_KEY);
  STATE = buildSeed(); save(); toast("Demo data reset"); location.hash="#/home"; renderRoute();
}
function clearAllData() {
  if (!confirm("Permanently delete ALL data? This cannot be undone.")) return;
  STATE = emptyState(); save(); toast("All data cleared"); location.hash="#/home"; renderRoute();
}

/* ══════════════════════════════════════════════════════════
   SVG CHARTS
   ══════════════════════════════════════════════════════════ */
const CHART_COLORS = ["#E8A33D","#35C4B0","#8B8FF7","#34D399","#F1636B","#FBBF24"];
function svgLineChart(seriesArr, labels, opts={}) {
  const w=opts.w||260, h=opts.h||110, pad=6;
  const allVals=seriesArr.flatMap(s=>s.values);
  const max=Math.max(...allVals,1), min=Math.min(...allVals,0), range=(max-min)||1;
  const n=labels.length, stepX=n>1?(w-pad*2)/(n-1):0;
  const toY=v=>h-pad-((v-min)/range)*(h-pad*2);
  const paths=seriesArr.map((s,si)=>{
    const pts=s.values.map((v,i)=>`${(pad+i*stepX).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
    return `<polyline fill="none" stroke="${CHART_COLORS[si%CHART_COLORS.length]}" stroke-width="2" points="${pts}"/>`;
  }).join("");
  const legend=seriesArr.map((s,si)=>`<span><i style="background:${CHART_COLORS[si%CHART_COLORS.length]}"></i>${s.name}</span>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${paths}</svg><div class="chart-legend">${legend}</div>`;
}
function svgBarChart(seriesArr, labels, opts={}) {
  const w=opts.w||260, h=opts.h||110, pad=6, gap=4;
  const allVals=seriesArr.flatMap(s=>s.values), max=Math.max(...allVals,1);
  const n=labels.length, groupW=(w-pad*2)/n, barW=(groupW-gap)/seriesArr.length;
  let bars="";
  labels.forEach((lb,i)=>{
    seriesArr.forEach((s,si)=>{
      const v=s.values[i]||0, bh=(v/max)*(h-pad*2-12);
      const x=pad+i*groupW+si*barW, y=h-pad-12-bh;
      bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW-1.5).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${CHART_COLORS[si%CHART_COLORS.length]}"/>`;
    });
    bars+=`<text x="${(pad+i*groupW+groupW/2).toFixed(1)}" y="${h-2}" font-size="8" fill="#8A93A6" text-anchor="middle">${lb}</text>`;
  });
  const legend=seriesArr.length>1?seriesArr.map((s,si)=>`<span><i style="background:${CHART_COLORS[si%CHART_COLORS.length]}"></i>${s.name}</span>`).join(""):""
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${bars}</svg><div class="chart-legend">${legend}</div>`;
}
function svgDonut(segments, opts={}) {
  const size=opts.size||110, r=size/2-10, cx=size/2, cy=size/2, circ=2*Math.PI*r;
  const total=segments.reduce((s,x)=>s+x.value,0)||1;
  let offset=0, circles="";
  segments.forEach((seg,i)=>{
    const frac=seg.value/total, dash=frac*circ;
    const click=seg.onclick?` style="cursor:pointer" onclick="${seg.onclick}"`:"";
    circles+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS[i%CHART_COLORS.length]}" stroke-width="14" stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}"${click}/>`;
    offset+=dash;
  });
  const legend=segments.map((s,i)=>`<span${s.onclick?` style="cursor:pointer" onclick="${s.onclick}"`:""}><i style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></i>${s.label} (${fmtNum(s.value)})</span>`).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${circles}</svg><div class="chart-legend">${legend}</div>`;
}
function lastNMonths(n) {
  const out=[], d=new Date();
  for (let i=n-1;i>=0;i--) { const x=new Date(d.getFullYear(),d.getMonth()-i,1); out.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`); }
  return out;
}

/* ══════════════════════════════════════════════════════════
   KANBAN CONFIG
   ══════════════════════════════════════════════════════════ */
const KANBAN_STAGES = ["New","Qualified","Meeting","Negotiation","Won"];
const KANBAN_COLORS = { New:"#8B8FF7", Qualified:"#35C4B0", Meeting:"#a78bfa", Negotiation:"#E8A33D", Won:"#34D399" };
const STAGE_PROBABILITY = { New:.10, Qualified:.25, Meeting:.50, Negotiation:.75, Won:1.00 };
const FORECAST_SCENARIOS = {
  base:       { label:"Base",        mult:1.00 },
  optimistic: { label:"Optimistic",  mult:1.25 },
  pessimistic:{ label:"Pessimistic", mult:0.65 },
};
let activeForecastScenario = "base";
let kanbanView = false;
let kanbanDragState = { draggedId:null, sourceStage:null, overCol:null };

/* ══════════════════════════════════════════════════════════
   ROUTER
   ══════════════════════════════════════════════════════════ */
const ROUTES = [
  { id:"home",       label:"Home",       icon:"⌂" },
  { id:"deals",      label:"Deals",      icon:"◇" },
  { id:"clients",    label:"Clients",    icon:"☺" },
  { id:"collections",label:"Collections",icon:"$" },
  { id:"commission", label:"Commission", icon:"%" },
  { id:"activity",   label:"Activity",   icon:"▤" },
  { id:"okr",        label:"Goals / OKR",icon:"🎯" },
  { id:"cohort",     label:"Cohort",     icon:"📊" },
  { id:"settings",   label:"Settings",   icon:"⚙" },
];
function buildNav() {
  document.getElementById("nav").innerHTML = ROUTES.map(r =>
    `<a data-route="${r.id}" href="#/${r.id}"><span class="ic">${r.icon}</span><span class="lbl">${r.label}</span></a>`
  ).join("");
}
function currentRoute() {
  const h = location.hash.replace("#/","");
  return ROUTES.find(r => r.id===h) ? h : "home";
}
function renderRoute() {
  const r = currentRoute();
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.dataset.route===r));
  const map = {
    home:renderHome, deals:renderDeals, clients:renderClients,
    collections:renderCollections, commission:renderCommission,
    activity:renderActivity, okr:renderOKR, cohort:renderCohort,
    settings:renderSettings,
  };
  (map[r] || renderHome)();
  setTimeout(initNotifBadge, 80);
  if (toastQueued) { toast(toastQueued); toastQueued=null; }
}
window.addEventListener("hashchange", renderRoute);

let dashboardYM = currentYM();
let dealFilters = { stage:"All", product:"All", type:"All", q:"", month:"All" };

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
function getReadNotifIds() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_READ_KEY)||"[]")); } catch { return new Set(); }
}
function saveReadNotifIds(set) { localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...set])); }

function generateAlerts() {
  const alerts=[], today=todayStr();
  STATE.payments.forEach(p => {
    if (paymentStatus(p)!=="Overdue") return;
    const deal=STATE.deals.find(d=>d.id===p.dealId); if(!deal) return;
    const days=Math.round((new Date(today+"T00:00:00")-new Date(p.dueDate+"T00:00:00"))/86400000);
    const remaining=Number(p.amountDue)-Number(p.amountPaid||0);
    const cl=STATE.clients.find(c=>c.id===deal.clientId);
    alerts.push({ id:`overdue_${p.id}`, type:"overdue", priority:1, icon:"💸", iconClass:"red",
      title:`${deal.client} — payment overdue ${days}d`,
      sub:`${fmtMoney(remaining)} due on ${fmtDateShort(p.dueDate)}`,
      time:p.dueDate, dealId:deal.id, phone:primaryPhone(cl)||"",
      waKind:"payment", waCtx:{clientName:deal.client,amount:remaining,dueDate:p.dueDate} });
  });
  STATE.payments.forEach(p => {
    const st=paymentStatus(p);
    if (st==="Collected"||st==="Overdue") return;
    if (p.dueDate<today||p.dueDate>addDays(today,7)) return;
    const deal=STATE.deals.find(d=>d.id===p.dealId); if(!deal) return;
    const remaining=Number(p.amountDue)-Number(p.amountPaid||0);
    const daysUntil=Math.round((new Date(p.dueDate+"T00:00:00")-new Date(today+"T00:00:00"))/86400000);
    const cl=STATE.clients.find(c=>c.id===deal.clientId);
    alerts.push({ id:`due_soon_${p.id}`, type:"due_soon", priority:2, icon:"⏰", iconClass:"amber",
      title:`${deal.client} — due ${daysUntil===0?"today":`in ${daysUntil}d`}`,
      sub:`${fmtMoney(remaining)} · ${fmtDateShort(p.dueDate)}`,
      time:p.dueDate, dealId:deal.id, phone:primaryPhone(cl)||"",
      waKind:"payment", waCtx:{clientName:deal.client,amount:remaining,dueDate:p.dueDate} });
  });
  wonDeals().forEach(d => {
    const rd=renewalDateOf(d);
    if (rd<today||rd>addDays(today,90)) return;
    const daysUntil=Math.round((new Date(rd+"T00:00:00")-new Date(today+"T00:00:00"))/86400000);
    const cl=STATE.clients.find(c=>c.id===d.clientId);
    alerts.push({ id:`renewal_${d.id}`, type:"renewal", priority:3, icon:"🔄", iconClass:"teal",
      title:`${d.client} — renewal in ${daysUntil}d`,
      sub:`${d.product} · ${fmtDateShort(rd)} · ${fmtMoney(basePriceOf(d))}`,
      time:rd, dealId:d.id, phone:primaryPhone(cl)||"",
      waKind:"renewal", waCtx:{clientName:d.client,product:d.product,renewalDate:rd} });
  });
  STATE.deals.forEach(d => {
    if (!isDealStale(d)) return;
    alerts.push({ id:`stale_${d.id}`, type:"stale", priority:4, icon:"🕐", iconClass:"indigo",
      title:`${d.client} — deal stale ${staleDealDays(d)}d`,
      sub:`${d.product} · ${d.stage} · last update ${fmtDateShort(d.updatedAt||d.dealDate)}`,
      time:d.updatedAt||d.dealDate, dealId:d.id, phone:"", waKind:"general", waCtx:{clientName:d.client} });
  });
  const vault=commissionVault();
  if (vault.available>0) alerts.push({
    id:`comm_available_${currentYM()}`, type:"commission", priority:5, icon:"💰", iconClass:"green",
    title:`Commission available — ${fmtMoney(vault.available)}`,
    sub:"Ready to be collected · click to view",
    time:today, dealId:null, phone:"", waKind:null, waCtx:{} });
  alerts.sort((a,b)=>a.priority-b.priority||a.time.localeCompare(b.time));
  return alerts;
}

const NOTIF_TABS_DEF = [
  {key:"all",label:"All"},{key:"overdue",label:"Overdue"},{key:"due_soon",label:"Due Soon"},
  {key:"renewal",label:"Renewals"},{key:"stale",label:"Stale"},{key:"commission",label:"Commission"},
];
let activeNotifTab = "all";
let notifOpen = false;

function initNotifBadge() {
  const alerts=generateAlerts(), readIds=getReadNotifIds();
  const unread=alerts.filter(a=>!readIds.has(a.id)).length;
  const badge=document.getElementById("notifBadge");
  if (badge) { badge.textContent=unread>99?"99+":unread; badge.classList.toggle("hidden",unread===0); }
}
function renderNotifDropdown() {
  const alerts=generateAlerts(), readIds=getReadNotifIds();
  const unread=alerts.filter(a=>!readIds.has(a.id)).length;
  const badge=document.getElementById("notifBadge");
  if (badge) { badge.textContent=unread>99?"99+":unread; badge.classList.toggle("hidden",unread===0); }
  const tabsEl=document.getElementById("notifTabs");
  if (tabsEl) tabsEl.innerHTML=NOTIF_TABS_DEF.map(t=>{
    const count=t.key==="all"?alerts.length:alerts.filter(a=>a.type===t.key).length;
    return `<button class="notif-tab ${t.key===activeNotifTab?"active":""}" onclick="setNotifTab('${t.key}')">
      ${t.label}${count>0?`<span class="tab-count">${count}</span>`:""}
    </button>`;
  }).join("");
  const listEl=document.getElementById("notifList");
  if (!listEl) return;
  const filtered=activeNotifTab==="all"?alerts:alerts.filter(a=>a.type===activeNotifTab);
  if (!filtered.length) { listEl.innerHTML=`<div class="notif-empty">✅ All clear — nothing here</div>`; return; }
  listEl.innerHTML=filtered.map(a=>{
    const isUnread=!readIds.has(a.id);
    return `<div class="notif-item ${isUnread?"unread":""}" onclick="notifItemClick('${a.id}','${a.dealId||""}','${a.type}')">
      <div class="notif-icon ${a.iconClass}">${a.icon}</div>
      <div class="notif-body">
        <div class="nb-title">${a.title}</div>
        <div class="nb-sub">${a.sub}</div>
        <div class="nb-time">${fmtDateShort(a.time)}</div>
      </div>
      <div class="notif-item-actions" onclick="event.stopPropagation()">
        ${a.phone?waBtn(a.phone,a.waKind,a.waCtx):""}
        ${a.phone?callBtn(a.phone):""}
      </div>
    </div>`;
  }).join("");
}
function setNotifTab(key) { activeNotifTab=key; renderNotifDropdown(); }
function notifItemClick(alertId, dealId, type) {
  const readIds=getReadNotifIds(); readIds.add(alertId); saveReadNotifIds(readIds);
  toggleNotifDropdown(false);
  if (type==="commission") { location.hash="#/commission"; renderRoute(); return; }
  if (dealId) { openDealDetail(dealId); return; }
  location.hash="#/collections"; renderRoute();
}
function markAllNotifsRead() {
  const alerts=generateAlerts(), readIds=getReadNotifIds();
  alerts.forEach(a=>readIds.add(a.id)); saveReadNotifIds(readIds);
  renderNotifDropdown(); toast("All notifications marked as read");
}
function toggleNotifDropdown(forceState) {
  notifOpen = forceState!==undefined ? forceState : !notifOpen;
  const dd=document.getElementById("notifDropdown");
  if (!dd) return;
  if (notifOpen) {
    dd.classList.remove("hidden"); renderNotifDropdown();
    const bell=document.getElementById("notifBell");
    if (bell) { bell.classList.add("ringing"); setTimeout(()=>bell.classList.remove("ringing"),600); }
  } else { dd.classList.add("hidden"); }
}
document.addEventListener("click",(e)=>{
  if (!notifOpen) return;
  const wrap=document.getElementById("notifWrap");
  if (wrap&&!wrap.contains(e.target)) toggleNotifDropdown(false);
});

/* ══════════════════════════════════════════════════════════
   FORECASTING ENGINE
   ══════════════════════════════════════════════════════════ */
function calcWeightedPipelineValue(scenario) {
  const mult=FORECAST_SCENARIOS[scenario]?.mult??1;
  return STATE.deals.reduce((sum,d)=>{
    const prob=STAGE_PROBABILITY[d.stage]??0;
    const value=d.stage==="Won"?invoiceTotalOf(d):(basePriceOf(d)||0);
    return sum+value*prob*(d.stage==="Won"?1:mult);
  },0);
}
function calcNextMonthForecast(scenario) {
  const mult=FORECAST_SCENARIOS[scenario]?.mult??1, today=todayStr();
  const thisMonthWon=wonDeals().filter(d=>inMonth(d.dealDate,currentYM())).reduce((s,d)=>s+invoiceTotalOf(d),0);
  const pipelineContrib=STATE.deals.filter(d=>d.stage!=="Won").reduce((s,d)=>{
    const prob=(STAGE_PROBABILITY[d.stage]??0)*mult, value=basePriceOf(d)||0;
    const last=d.updatedAt||d.dealDate;
    const daysSince=Math.round((new Date(today+"T00:00:00")-new Date(last+"T00:00:00"))/86400000);
    const velocity=daysSince<=7?1:daysSince<=14?.8:daysSince<=30?.5:.2;
    return s+value*prob*velocity;
  },0);
  const mrrBase=calcMRR();
  const nm=addMonthsDate(today,1);
  const nmStr=`${nm.getFullYear()}-${String(nm.getMonth()+1).padStart(2,"0")}`;
  return { mrrBase, thisMonthWon, pipelineContrib, total:mrrBase+pipelineContrib, nmStr };
}
function calcMRRProjection(months) {
  const today=todayStr(); let runningMRR=calcMRR();
  const past3=lastNMonths(3);
  const avgNewMRR=past3.reduce((s,ym)=>{
    const won=wonDeals().filter(d=>inMonth(d.dealDate,ym));
    return s+won.reduce((s2,d)=>s2+basePriceOf(d)/((d.durationYears||1)*12),0);
  },0)/3;
  const churnedMRR=calcChurnedMRR(), churnRate=runningMRR>0?Math.min(churnedMRR/runningMRR,.15):0;
  const result=[];
  for (let i=1;i<=months;i++) {
    const dt=addMonthsDate(today,i);
    const ymS=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
    runningMRR=runningMRR*(1-churnRate)+avgNewMRR;
    result.push({ym:ymS,label:monthLabel(ymS),mrr:Math.round(runningMRR)});
  }
  return result;
}
function calcForecastConfidence() {
  const openDeals=STATE.deals.filter(d=>d.stage!=="Won");
  const freshDeals=openDeals.filter(d=>!isDealStale(d)).length;
  const freshnessScore=openDeals.length>0?(freshDeals/openDeals.length):.5;
  const cutoff=addDays(todayStr(),-90);
  const recent=STATE.deals.filter(d=>d.dealDate>=cutoff);
  const convRate=recent.length>0?recent.filter(d=>d.stage==="Won").length/recent.length:.3;
  const depthScore=Math.min(openDeals.length/10,1);
  return Math.round(clamp((freshnessScore*.4)+(convRate*.4)+(depthScore*.2),0,1)*100);
}
function calcStageBreakdown(scenario) {
  const mult=FORECAST_SCENARIOS[scenario]?.mult??1;
  return KANBAN_STAGES.map(stage=>{
    const deals=STATE.deals.filter(d=>d.stage===stage);
    const raw=deals.reduce((s,d)=>s+(d.stage==="Won"?invoiceTotalOf(d):(basePriceOf(d)||0)),0);
    const prob=STAGE_PROBABILITY[stage]??0;
    return {stage,count:deals.length,raw,prob,weighted:raw*prob*(stage==="Won"?1:mult),color:KANBAN_COLORS[stage]};
  });
}
function renderForecastWidget() {
  const scenario=activeForecastScenario, fcast=calcNextMonthForecast(scenario);
  const breakdown=calcStageBreakdown(scenario), confidence=calcForecastConfidence();
  const projection=calcMRRProjection(6), maxWeighted=Math.max(...breakdown.map(b=>b.weighted),1);
  const thisMonthActual=wonDeals().filter(d=>inMonth(d.dealDate,currentYM())).reduce((s,d)=>s+invoiceTotalOf(d),0);
  const delta=fcast.total-thisMonthActual, deltaSign=delta>=0?"up":"down";
  const deltaPct=thisMonthActual>0?Math.abs(Math.round((delta/thisMonthActual)*100)):0;
  const projLabels=projection.map(p=>p.label.split(" ")[0]);
  const projValues=projection.map(p=>p.mrr);
  const confColor=confidence>=65?"var(--green)":confidence>=40?"var(--amber)":"var(--red)";
  const confLabel=confidence>=65?"High":confidence>=40?"Medium":"Low";
  return `<div class="forecast-widget" id="forecastWidget">
    <h3>📈 Revenue Forecast <span class="fw-badge">AI-weighted pipeline</span></h3>
    <div class="scenario-tabs">
      ${Object.entries(FORECAST_SCENARIOS).map(([key,sc])=>`
        <button class="scenario-tab ${key===scenario?"active":""}"
          onclick="activeForecastScenario='${key}';reinjectForecast();">${sc.label}
        </button>`).join("")}
    </div>
    <div class="forecast-main">
      <div class="forecast-num-card">
        <div class="fnc-label" data-tip="Weighted pipeline + MRR carryover">Next Month Forecast</div>
        <div class="fnc-value" style="color:var(--indigo);">${fmtMoney(Math.round(fcast.total))}</div>
        <div class="fnc-sub">${monthLabel(fcast.nmStr)}</div>
        <span class="fnc-delta ${deltaSign}">${deltaSign==="up"?"↑":"↓"} ${deltaPct}% vs this month</span>
      </div>
      <div class="forecast-num-card">
        <div class="fnc-label" data-tip="Monthly recurring revenue from active contracts">MRR (live)</div>
        <div class="fnc-value" style="color:var(--gold);">${fmtMoney(Math.round(fcast.mrrBase))}</div>
        <div class="fnc-sub">ARR: ${fmtMoney(Math.round(fcast.mrrBase*12))}</div>
      </div>
      <div class="forecast-num-card">
        <div class="fnc-label" data-tip="Pipeline weighted by stage probability × velocity">Pipeline Contrib.</div>
        <div class="fnc-value" style="color:var(--teal);">${fmtMoney(Math.round(fcast.pipelineContrib))}</div>
        <div class="fnc-sub">${STATE.deals.filter(d=>d.stage!=="Won").length} open deals</div>
      </div>
      <div class="forecast-num-card">
        <div class="fnc-label">Won This Month</div>
        <div class="fnc-value" style="color:var(--green);">${fmtMoney(thisMonthActual)}</div>
        <div class="fnc-sub">Target: ${fmtMoney(monthlyTarget(currentYM()))}</div>
      </div>
    </div>
    <div class="forecast-breakdown">
      <h4>Pipeline breakdown — ${FORECAST_SCENARIOS[scenario].label} scenario</h4>
      ${breakdown.map(b=>`<div class="fcast-stage-row">
        <div class="fsr-label">${b.stage}</div>
        <div class="fsr-bar-wrap"><div class="fsr-bar" style="width:${maxWeighted>0?Math.round((b.weighted/maxWeighted)*100):0}%;background:${b.color};opacity:.85;"></div></div>
        <div class="fsr-val">${fmtNum(Math.round(b.weighted))} EGP</div>
        <div class="fsr-pct">${Math.round(b.prob*100)}%</div>
      </div>`).join("")}
    </div>
    <div class="forecast-chart-area">
      <h4>MRR 6-month projection</h4>
      ${svgLineChart([{name:"Projected MRR",values:projValues}],projLabels,{w:380,h:90})}
      <div class="mrr-projection-band">
        ${projection.slice(0,3).map(p=>`<div class="mrr-proj-item">
          <div class="mpi-label">${p.label}</div>
          <div class="mpi-val" style="color:var(--indigo)">${fmtMoney(p.mrr)}</div>
        </div>`).join("")}
      </div>
    </div>
    <div class="forecast-confidence">
      <span>Forecast confidence</span>
      <div class="confidence-bar-wrap"><div class="confidence-bar" style="width:${confidence}%"></div></div>
      <span class="confidence-label" style="color:${confColor};">${confLabel} (${confidence}%)</span>
    </div>
  </div>`;
}
function reinjectForecast() {
  const slot=document.getElementById("forecastSlot");
  if (slot) slot.innerHTML=renderForecastWidget();
}/* ══════════════════════════════════════════════════════════
   HOME
   ══════════════════════════════════════════════════════════ */
function renderHome() {
  const main = document.getElementById("main");
  const won  = wonDeals();
  const monthDeals = won.filter(d => inMonth(d.dealDate, dashboardYM));
  const sales = monthDeals.reduce((sum,d) => sum + invoiceTotalOf(d), 0);
  const collectedThisMonth = STATE.payments
    .filter(p => p.paidDate && inMonth(p.paidDate, dashboardYM))
    .reduce((s,p) => s + Number(p.amountPaid||0), 0);
  const totalOutstanding = won.reduce((sum,d) => sum + outstandingOf(d), 0);
  const commissionThisMonth = allCommissionLines()
    .filter(l => inMonth(l.earnedDate, dashboardYM))
    .reduce((s,l) => s + l.netCommission, 0);
  const target      = monthlyTarget(dashboardYM);
  const achievement = target ? sales / target : 0;
  const remaining   = Math.max(target - sales, 0);
  const todayAct    = activityOf(todayStr()) || { answeredCalls:0, meetings:0 };
  const reqCalls    = requiredCallsFor(todayAct.meetings);
  const score       = activityScore(todayAct);
  const dealsToday  = STATE.deals.filter(d => d.dealDate === todayStr()).length;
  const overdueDeals   = won.filter(d => dealCollectionSummary(d) === "Overdue");
  const topOverdue     = overdueDeals.sort((a,b) => outstandingOf(b)-outstandingOf(a))[0];
  const dueSoon        = STATE.payments.filter(p =>
    paymentStatus(p) !== "Collected" && p.dueDate >= todayStr() && p.dueDate <= addDays(todayStr(),7));
  const dueSoonAmt     = dueSoon.reduce((s,p) => s+(Number(p.amountDue)-Number(p.amountPaid||0)),0);
  const vault          = commissionVault();
  const meetingCount   = STATE.deals.filter(d => d.stage==="Meeting").length;
  const upcomingRenewals = won.filter(d => {
    const rd = renewalDateOf(d);
    return rd >= todayStr() && rd <= addDays(todayStr(),90);
  }).sort((a,b) => renewalDateOf(a).localeCompare(renewalDateOf(b)));
  const hour     = new Date().getHours();
  const greeting = hour<12 ? "Good morning" : hour<18 ? "Good afternoon" : "Good evening";
  const pipelineValue = STATE.deals.reduce((s,d) => s+(d.stage==="Won"?invoiceTotalOf(d):(basePriceOf(d)||0)),0);

  /* pipeline strip */
  const stagesStrip = ["New","Qualified","Meeting","Negotiation","Won","Collected"];
  const stageColor  = { New:"var(--indigo)",Qualified:"var(--teal)",Meeting:"#a78bfa",Negotiation:"var(--gold)",Won:"var(--green)",Collected:"#16a34a" };
  const pipelineHtml = stagesStrip.map(st => {
    let n, v;
    if (st==="Collected") { n=won.filter(d=>dealCollectionSummary(d)==="Collected").length; v=won.reduce((s,d)=>s+collectedOf(d),0); }
    else if (st==="Won")  { n=won.length; v=won.reduce((s,d)=>s+invoiceTotalOf(d),0); }
    else { const ds=STATE.deals.filter(d=>d.stage===st); n=ds.length; v=ds.reduce((s,d)=>s+(basePriceOf(d)||0),0); }
    return `<div class="pipe-stage" style="--stage-c:${stageColor[st]}"
      onclick="${st==="Collected"?"location.hash='#/collections';":`goToDealsFilteredByStage('${st}')`}">
      <div class="n">${n}</div><div class="l">${st}</div><div class="v">${fmtNum(v)} EGP</div>
    </div>`;
  }).join("");

  /* charts */
  const months      = lastNMonths(6);
  const monthLabels = months.map(monthLabel);
  const salesSeries = months.map(m => won.filter(d=>inMonth(d.dealDate,m)).reduce((s,d)=>s+invoiceTotalOf(d),0));
  const collSeries  = months.map(m => STATE.payments.filter(p=>p.paidDate&&inMonth(p.paidDate,m)).reduce((s,p)=>s+Number(p.amountPaid||0),0));
  const callsSeries=[], meetSeries=[], dayLabels=[];
  for (let i=13;i>=0;i--) {
    const d=addDays(todayStr(),-i), a=activityOf(d);
    dayLabels.push(new Date(d+"T00:00:00").getDate());
    callsSeries.push(a?a.answeredCalls:0); meetSeries.push(a?a.meetings:0);
  }
  const productMix = ["CRM","Navi","HR"].map(p=>({label:p,value:won.filter(d=>d.product===p).reduce((s,d)=>s+invoiceTotalOf(d),0),onclick:`goToDealsFilteredByProduct('${p}')`})).filter(x=>x.value>0);
  const typeMix    = ["New Deal","Renewal","Upgrade"].map(t=>({label:t,value:won.filter(d=>d.dealType===t).reduce((s,d)=>s+invoiceTotalOf(d),0),onclick:`goToDealsFilteredByType('${t}')`})).filter(x=>x.value>0);
  const pipeDist   = ["New","Qualified","Meeting","Negotiation"].map(st=>({label:st,value:STATE.deals.filter(d=>d.stage===st).length,onclick:`goToDealsFilteredByStage('${st}')`})).filter(x=>x.value>0);

  /* MRR panel */
  const mrrHtml = `
    <div class="panel mrr-panel" style="border-color:rgba(139,143,247,.3);background:linear-gradient(135deg,var(--panel) 0%,rgba(139,143,247,.04) 100%);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
        <div><h3 style="margin:0 0 2px 0;">Recurring Revenue</h3><p style="margin:0;font-size:11.5px;color:var(--muted);">Live from active contracts · excl. VAT</p></div>
        <div style="display:flex;gap:22px;flex-wrap:wrap;">
          ${[{label:"MRR",val:Math.round(calcMRR()),color:"var(--indigo)"},{label:"ARR",val:Math.round(calcARR()),color:"var(--gold)"},{label:"Churned MRR",val:Math.round(calcChurnedMRR()),color:"var(--red)"},{label:"NRR",raw:`${calcNRR().toFixed(1)}%`,color:calcNRR()>=100?"var(--green)":"var(--amber)"}]
            .map(item=>`<div style="text-align:center;"><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">${item.label}</div><div style="font-size:21px;font-weight:700;color:${item.color};font-variant-numeric:tabular-nums;">${item.raw??fmtMoney(item.val)}</div></div>`).join("")}
        </div>
      </div>
    </div>`;

  /* hot deals */
  const hotDeals = STATE.deals.filter(d=>d.stage!=="Won").map(d=>({d,score:dealHealthScore(d)})).sort((a,b)=>b.score-a.score).slice(0,3);
  const hotDealsHtml = hotDeals.length ? `
    <div class="panel">
      <h3>🔥 Hottest Open Deals <small>ranked by deal health score</small></h3>
      <div class="rlist">${hotDeals.map(({d,score})=>{
        const cl=STATE.clients.find(c=>c.id===d.clientId);
        const ph=primaryPhone(cl);
        return `<div class="r" style="cursor:pointer;" onclick="openDealDetail('${d.id}')">
          <div class="c1">${d.client}</div>
          <div class="c2" style="color:var(--muted);">${d.product} · ${d.stage}</div>
          <div class="c3">${fmtMoney(basePriceOf(d)||0)}</div>
          <div class="c4">${dealScorePill(d)}</div>
          <div class="actions" onclick="event.stopPropagation()">${ph?callBtn(ph):""}${ph?waBtn(ph,"general",{clientName:d.client}):""}</div>
        </div>`;
      }).join("")}</div>
    </div>` : "";

  /* OKR snapshot */
  const okrSnap = STATE.okrs.length ? (() => {
    const obj = STATE.okrs[0];
    const avgPct = obj.keyResults.length ? Math.round(obj.keyResults.reduce((s,kr)=>s+Math.min(kr.current/kr.target,1)*100,0)/obj.keyResults.length) : 0;
    return `<div class="panel" style="cursor:pointer;" onclick="location.hash='#/okr'">
      <h3>🎯 OKR Snapshot <small>${obj.period}</small></h3>
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${obj.title}</div>
      <div class="progress-track"><div class="progress-fill" style="width:${avgPct}%;background:linear-gradient(90deg,var(--indigo),#a78bfa);"></div></div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px;">${avgPct}% overall · ${obj.keyResults.length} key results · click to manage</div>
    </div>`;
  })() : "";

  main.innerHTML = `
    <div class="page-head">
      <div><h1>${greeting}, Youssef 👋</h1><p>${monthLabel(dashboardYM)} · Personal Revenue &amp; Sales OS</p></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <select class="month-select" id="homeMonth">
          ${lastNMonths(12).reverse().map(m=>`<option value="${m}" ${m===dashboardYM?"selected":""}>${monthLabel(m)}</option>`).join("")}
        </select>
        <button class="btn" onclick="openDealForm()">+ New Deal</button>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi accent-gold"><div class="lbl">Sales / Contracted</div><div class="val">${fmtMoney(sales)}</div></div>
      <div class="kpi accent-green"><div class="lbl">Collected Cash</div><div class="val">${fmtMoney(collectedThisMonth)}</div></div>
      <div class="kpi accent-red"><div class="lbl">Outstanding</div><div class="val">${fmtMoney(totalOutstanding)}</div></div>
      <div class="kpi accent-teal"><div class="lbl">Commission Earned</div><div class="val">${fmtMoney(commissionThisMonth)}</div></div>
      <div class="kpi" style="cursor:pointer;border-color:rgba(251,191,36,.35);" onclick="location.hash='#/commission'">
        <div class="lbl">Commission Available</div><div class="val" style="color:var(--amber);">${fmtMoney(vault.available)}</div>
      </div>
      <div class="kpi" style="cursor:pointer;" onclick="location.hash='#/deals'">
        <div class="lbl">Pipeline Value</div><div class="val">${fmtMoney(pipelineValue)}</div>
      </div>
    </div>

    ${mrrHtml}
    <div id="forecastSlot">${renderForecastWidget()}</div>

    <div class="panel">
      <h3>Target achievement <small>${fmtMoney(target)} target for ${monthLabel(dashboardYM)}</small></h3>
      <div class="progress-track"><div class="progress-fill" style="width:${clamp(achievement*100,0,100)}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);">
        <span><b style="color:var(--text)">${(achievement*100).toFixed(1)}%</b> achieved</span>
        <span>${fmtMoney(remaining)} remaining${dashboardYM===currentYM()?` · ${fmtMoney(requiredDailyPace(remaining))}/day needed`:""}</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div class="panel">
        <h3>Today <small>Activity score ${score}%</small></h3>
        <div class="kpi-row" style="margin-bottom:10px;">
          <div class="kpi"><div class="lbl">Calls</div><div class="val">${todayAct.answeredCalls} <span style="font-size:12px;color:var(--muted);font-weight:400;">/ ${reqCalls}</span></div></div>
          <div class="kpi"><div class="lbl">Meetings</div><div class="val">${todayAct.meetings}</div></div>
          <div class="kpi"><div class="lbl">Deals logged</div><div class="val">${dealsToday}</div></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn secondary small" onclick="quickAdd('calls',1);renderHome();">+1 Call</button>
          <button class="btn secondary small" onclick="quickAdd('meetings',1);renderHome();">+1 Meeting</button>
        </div>
      </div>
      <div class="panel">
        <h3>Action Center</h3>
        <div class="action-item ${topOverdue?"clickable":""}" ${topOverdue?`onclick="openDealDetail('${topOverdue.id}')"`:""}">
          <div class="dot red"></div>
          <div class="txt">${topOverdue?`Payment overdue — <b>${topOverdue.client}</b> — ${fmtMoney(outstandingOf(topOverdue))}`:"No overdue payments"}</div>
          ${topOverdue?`<div class="actions">${(()=>{const cl=STATE.clients.find(c=>c.id===topOverdue.clientId);const ph=primaryPhone(cl);return callBtn(ph)+waBtn(ph,"payment",{clientName:topOverdue.client,amount:outstandingOf(topOverdue),dueDate:todayStr()});})()}</div>`:""}
        </div>
        <div class="action-item clickable" onclick="location.hash='#/collections'">
          <div class="dot amber"></div><div class="txt"><b>${dueSoon.length}</b> payment(s) due within 7 days — ${fmtMoney(dueSoonAmt)}</div>
        </div>
        <div class="action-item clickable" onclick="location.hash='#/commission'">
          <div class="dot green"></div><div class="txt">Commission available — <b>${fmtMoney(vault.available)}</b></div>
        </div>
        <div class="action-item clickable" onclick="goToDealsFilteredByStage('Meeting')">
          <div class="dot teal"></div><div class="txt"><b>${meetingCount}</b> deal(s) in Meeting stage</div>
        </div>
        <div class="action-item ${upcomingRenewals.length?"clickable":""}" ${upcomingRenewals.length?`onclick="openDealDetail('${upcomingRenewals[0].id}')"`:""}">
          <div class="dot amber"></div>
          <div class="txt">${upcomingRenewals.length?`<b>${upcomingRenewals[0].client}</b> renews ${fmtDateShort(renewalDateOf(upcomingRenewals[0]))} (${Math.round((new Date(renewalDateOf(upcomingRenewals[0])+"T00:00:00")-new Date(todayStr()+"T00:00:00"))/86400000)}d)`:"No renewals in next 90 days"}</div>
          ${upcomingRenewals.length?`<div class="actions">${(()=>{const cl=STATE.clients.find(c=>c.id===upcomingRenewals[0].clientId);return waBtn(primaryPhone(cl),"renewal",{clientName:upcomingRenewals[0].client,product:upcomingRenewals[0].product,renewalDate:renewalDateOf(upcomingRenewals[0])});})()}</div>`:""}
        </div>
      </div>
    </div>

    <div class="panel"><h3>Pipeline</h3><div class="pipeline">${pipelineHtml}</div></div>
    ${hotDealsHtml}
    ${okrSnap}

    <div class="panel">
      <h3>Analytics</h3>
      <div class="chart-grid">
        <div class="chart-card"><h4>Monthly sales trend</h4>${svgLineChart([{name:"Sales",values:salesSeries}],monthLabels)}</div>
        <div class="chart-card"><h4>Monthly collection trend</h4>${svgLineChart([{name:"Collected",values:collSeries}],monthLabels)}</div>
        <div class="chart-card"><h4>Sales vs collected</h4>${svgBarChart([{name:"Sales",values:salesSeries},{name:"Collected",values:collSeries}],monthLabels)}</div>
        <div class="chart-card"><h4>Commission vault</h4>${svgBarChart([{name:"EGP",values:[vault.locked,vault.available,vault.paid]}],["Locked","Available","Paid"])}</div>
        <div class="chart-card"><h4>Pipeline distribution</h4>${pipeDist.length?svgDonut(pipeDist):'<div class="empty">No open pipeline</div>'}</div>
        <div class="chart-card"><h4>Product mix</h4>${productMix.length?svgDonut(productMix):'<div class="empty">No data</div>'}</div>
        <div class="chart-card"><h4>Deal type mix</h4>${typeMix.length?svgDonut(typeMix):'<div class="empty">No data</div>'}</div>
        <div class="chart-card"><h4>Calls + meetings (14d)</h4>${svgLineChart([{name:"Calls",values:callsSeries},{name:"Meetings",values:meetSeries}],dayLabels.map(String))}</div>
      </div>
    </div>`;

  document.getElementById("homeMonth").onchange = (e) => { dashboardYM=e.target.value; renderHome(); };
}

/* ══════════════════════════════════════════════════════════
   DEALS — list + kanban
   ══════════════════════════════════════════════════════════ */
function goToDealsFilteredByStage(stage)   { dealFilters.stage=stage;   location.hash="#/deals"; renderDeals(); }
function goToDealsFilteredByProduct(prod)  { dealFilters.product=prod;  location.hash="#/deals"; renderDeals(); }
function goToDealsFilteredByType(type)     { dealFilters.type=type;     location.hash="#/deals"; renderDeals(); }

function renderDeals() {
  const main = document.getElementById("main");
  const staleCount = STATE.deals.filter(isDealStale).length;
  const stages  = ["All","New","Qualified","Meeting","Negotiation","Won"];
  const months  = ["All",...lastNMonths(12).reverse()];
  main.innerHTML = `
    <div class="page-head">
      <div><h1>Deals</h1><p>${STATE.deals.length} total · list &amp; kanban views</p></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        ${staleCount>0?`<span class="stale-chip" title="${staleCount} deals not updated in 7+ days">⚠ ${staleCount} stale</span>`:""}
        <div class="view-toggle">
          <button id="viewGrid"  class="${!kanbanView?"active":""}" onclick="setDealView(false)">☰ List</button>
          <button id="viewKanban" class="${kanbanView?"active":""}"  onclick="setDealView(true)">⠿ Kanban</button>
        </div>
        <button class="btn" onclick="openDealForm()">+ New Deal</button>
      </div>
    </div>
    <div class="filter-bar">
      <input id="dealSearch" placeholder="Search client…" value="${dealFilters.q}">
      <select id="stageFilter">${stages.map(s=>`<option ${s===dealFilters.stage?"selected":""}>${s}</option>`).join("")}</select>
      <select id="productFilter">${["All","CRM","Navi","HR"].map(p=>`<option ${p===dealFilters.product?"selected":""}>${p}</option>`).join("")}</select>
      <select id="typeFilter">${["All","New Deal","Renewal","Upgrade"].map(t=>`<option ${t===dealFilters.type?"selected":""}>${t}</option>`).join("")}</select>
      <select id="monthFilter">${months.map(m=>`<option value="${m}" ${m===dealFilters.month?"selected":""}>${m==="All"?"All months":monthLabel(m)}</option>`).join("")}</select>
    </div>
    <div id="dealViewContainer"></div>`;
  ["stageFilter","productFilter","typeFilter","monthFilter"].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    el.onchange=(e)=>{ const key={stageFilter:"stage",productFilter:"product",typeFilter:"type",monthFilter:"month"}[id]; dealFilters[key]=e.target.value; kanbanView?renderKanban():renderDealCards(); };
  });
  document.getElementById("dealSearch").oninput=(e)=>{ dealFilters.q=e.target.value; kanbanView?renderKanban():renderDealCards(); };
  kanbanView ? renderKanban() : renderDealCards();
}
function setDealView(isKanban) { kanbanView=isKanban; renderDeals(); }

function getFilteredDeals() {
  let list = STATE.deals.slice().sort((a,b)=>b.dealDate.localeCompare(a.dealDate));
  if (dealFilters.product!=="All") list=list.filter(d=>d.product===dealFilters.product);
  if (dealFilters.type!=="All")    list=list.filter(d=>d.dealType===dealFilters.type);
  if (dealFilters.month!=="All")   list=list.filter(d=>inMonth(d.dealDate,dealFilters.month));
  if (dealFilters.q) list=list.filter(d=>d.client.toLowerCase().includes(dealFilters.q.toLowerCase()));
  return list;
}

function renderDealCards() {
  const el = document.getElementById("dealViewContainer");
  let list = getFilteredDeals();
  if (dealFilters.stage!=="All") list=list.filter(d=>d.stage===dealFilters.stage);
  if (!list.length) { el.innerHTML=`<div class="card-grid"><div class="empty">No deals match this filter.</div></div>`; return; }
  el.innerHTML=`<div class="card-grid">`+list.map(d=>{
    const isWon=d.stage==="Won", stale=isDealStale(d), staleDays=staleDealDays(d);
    const status=dealCollectionSummary(d);
    const badgeClass={Collected:"paid",Overdue:"overdue",Due:"due",Partial:"partial"}[status]||"stage";
    const nd=isWon?paymentsOfDeal(d.id).filter(p=>paymentStatus(p)!=="Collected").sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0]:null;
    const cl=STATE.clients.find(c=>c.id===d.clientId), ph=primaryPhone(cl);
    return `<div class="rec-card ${stale?"stale":""}" onclick="openDealDetail('${d.id}')">
      <div class="top">
        <div><div class="cli">${d.client}</div><div class="tag">${d.id} · ${d.product} · ${d.dealType}</div></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
          <span class="badge ${isWon?badgeClass:"stage"}">${isWon?status:d.stage}</span>
          ${stale?`<span class="stale-badge">⚠ ${staleDays}d stale</span>`:""}
        </div>
      </div>
      ${isWon?`
        <div class="row"><span>Invoice</span><b>${fmtMoney(invoiceTotalOf(d))}</b></div>
        <div class="row"><span>Collected</span><b>${fmtMoney(collectedOf(d))}</b></div>
        <div class="row"><span>Outstanding</span><b>${fmtMoney(outstandingOf(d))}</b></div>
        <div class="row"><span>Next payment</span><b>${nd?fmtDateShort(nd.dueDate):"—"}</b></div>`:`
        <div class="row"><span>Est. value</span><b>${fmtMoney(basePriceOf(d)||0)}</b></div>
        <div class="row"><span>Users</span><b>${d.newUsers}</b></div>
        <div class="row"><span>Logged</span><b>${fmtDateShort(d.dealDate)}</b></div>`}
      <div class="quick-actions">
        <span class="quick-action-label">Quick:</span>
        ${ph?callBtn(ph):""}${ph?waBtn(ph,"general",{clientName:d.client}):""}
        ${ph&&isWon&&nd?waBtn(ph,"payment",{clientName:d.client,amount:Number(nd.amountDue)-Number(nd.amountPaid||0),dueDate:nd.dueDate},"Reminder"):""}
        ${!isWon?`<button type="button" class="icon-btn" style="color:var(--green);border-color:rgba(52,211,153,.4);font-size:11px;" onclick="event.stopPropagation();kanbanPromote('${d.id}')">▲ Advance</button>`:""}
        ${stale?`<button type="button" class="icon-btn" style="color:var(--red);border-color:rgba(241,99,107,.4);font-size:11px;" onclick="event.stopPropagation();touchDeal('${d.id}')">✓ Activate</button>`:""}
      </div>
    </div>`;
  }).join("")+`</div>`;
}

/* ── Kanban ── */
function renderKanban() {
  const container = document.getElementById("dealViewContainer");
  if (!container) return;
  const deals = getFilteredDeals();
  const totalWeighted = deals.reduce((s,d)=>s+(basePriceOf(d)||0)*(STAGE_PROBABILITY[d.stage]||0),0);
  const stageFilter   = dealFilters.stage!=="All" ? dealFilters.stage : null;
  const visibleStages = stageFilter ? [stageFilter] : KANBAN_STAGES;
  const colsHtml = visibleStages.map(stage=>{
    const stageDeals = deals.filter(d=>d.stage===stage);
    const stageValue = stageDeals.reduce((s,d)=>s+(d.stage==="Won"?invoiceTotalOf(d):(basePriceOf(d)||0)),0);
    return `<div class="kanban-col" data-stage="${stage}"
      ondragover="kanbanDragOver(event,'${stage}')"
      ondragleave="kanbanDragLeave(event,'${stage}')"
      ondrop="kanbanDrop(event,'${stage}')">
      <div class="kanban-col-header">
        <div class="col-title"><div class="col-dot" style="background:${KANBAN_COLORS[stage]}"></div>${stage}<span class="col-count">${stageDeals.length}</span></div>
        <span class="col-value">${fmtNum(stageValue)} EGP</span>
      </div>
      <div class="kanban-col-body" id="kanbancol_${stage}">
        ${stageDeals.length?stageDeals.map(d=>buildKanbanCard(d)).join(""):`<div class="kanban-empty">Drop deals here</div>`}
      </div>
    </div>`;
  }).join("");
  container.innerHTML=`
    <div class="kanban-wrapper"><div class="kanban-board">${colsHtml}</div></div>
    <div class="kanban-summary">
      <span>Total pipeline: <b>${fmtNum(deals.reduce((s,d)=>s+(basePriceOf(d)||0),0))} EGP</b></span>
      <span>Weighted: <b style="color:var(--gold)">${fmtNum(totalWeighted)} EGP</b></span>
      <span>Won: <b style="color:var(--green)">${fmtNum(deals.filter(d=>d.stage==="Won").reduce((s,d)=>s+invoiceTotalOf(d),0))} EGP</b></span>
    </div>`;
}
function buildKanbanCard(d) {
  const cl=STATE.clients.find(c=>c.id===d.clientId), ph=primaryPhone(cl);
  const isWon=d.stage==="Won", value=isWon?invoiceTotalOf(d):(basePriceOf(d)||0), stale=isDealStale(d);
  const last=d.updatedAt||d.dealDate;
  const days=Math.round((new Date(todayStr()+"T00:00:00")-new Date(last+"T00:00:00"))/86400000);
  const daysSinceStr=days===0?"today":`${days}d ago`;
  const status=isWon?dealCollectionSummary(d):null;
  const badgeClass={Collected:"paid",Overdue:"overdue",Due:"due",Partial:"partial"}[status]||"stage";
  return `<div class="kanban-card" draggable="true" data-id="${d.id}" data-stage="${d.stage}"
    ondragstart="kanbanDragStart(event,'${d.id}','${d.stage}')"
    ondragend="kanbanDragEnd(event)"
    onclick="openDealDetail('${d.id}')">
    ${stale?`<div class="kc-stale" title="${staleDealDays(d)}d without update"></div>`:""}
    <div class="kc-client">${d.client}</div>
    <div class="kc-sub">${d.product} · ${d.dealType} · ${d.newUsers}u</div>
    <div class="kc-value">${fmtMoney(value)}</div>
    <div class="kc-meta">
      <span class="kc-tag">${d.durationYears}yr</span>
      <span class="kc-tag">${daysSinceStr}</span>
      ${dealScorePill(d)}
      ${isWon&&status?`<span class="badge ${badgeClass}" style="font-size:10px;padding:1px 6px;">${status}</span>`:""}
    </div>
    <div class="kc-actions" onclick="event.stopPropagation()">
      ${ph?callBtn(ph):""}${ph?waBtn(ph,"general",{clientName:d.client}):""}
      ${!isWon?`<button class="icon-btn" style="font-size:11px;color:var(--green);border-color:rgba(52,211,153,.35);" onclick="event.stopPropagation();kanbanPromote('${d.id}')">▲</button>`:""}
    </div>
  </div>`;
}

/* ── Drag & Drop ── */
function kanbanDragStart(event,dealId,stage) {
  kanbanDragState.draggedId=dealId; kanbanDragState.sourceStage=stage;
  event.dataTransfer.effectAllowed="move"; event.dataTransfer.setData("text/plain",dealId);
  setTimeout(()=>{ const el=document.querySelector(`.kanban-card[data-id="${dealId}"]`); if(el) el.classList.add("dragging"); },0);
}
function kanbanDragEnd(event) {
  document.querySelectorAll(".kanban-card.dragging").forEach(el=>el.classList.remove("dragging"));
  document.querySelectorAll(".kanban-col.drag-over").forEach(el=>el.classList.remove("drag-over"));
  document.querySelectorAll(".kanban-drop-placeholder").forEach(el=>el.remove());
  kanbanDragState={draggedId:null,sourceStage:null,overCol:null};
}
function kanbanDragOver(event,stage) {
  event.preventDefault(); event.dataTransfer.dropEffect="move";
  if (kanbanDragState.overCol!==stage) {
    document.querySelectorAll(".kanban-col.drag-over").forEach(el=>el.classList.remove("drag-over"));
    const col=document.querySelector(`.kanban-col[data-stage="${stage}"]`);
    if (col) col.classList.add("drag-over");
    kanbanDragState.overCol=stage;
    const body=document.getElementById(`kanbancol_${stage}`);
    if (body&&!body.querySelector(".kanban-drop-placeholder")) {
      const ph=document.createElement("div"); ph.className="kanban-drop-placeholder"; body.appendChild(ph);
    }
  }
}
function kanbanDragLeave(event,stage) {
  const col=document.querySelector(`.kanban-col[data-stage="${stage}"]`);
  if (col&&!col.contains(event.relatedTarget)) {
    col.classList.remove("drag-over");
    const body=document.getElementById(`kanbancol_${stage}`);
    if (body) body.querySelectorAll(".kanban-drop-placeholder").forEach(el=>el.remove());
    if (kanbanDragState.overCol===stage) kanbanDragState.overCol=null;
  }
}
function kanbanDrop(event,targetStage) {
  event.preventDefault();
  const dealId=kanbanDragState.draggedId||event.dataTransfer.getData("text/plain");
  if (!dealId) return;
  const d=STATE.deals.find(x=>x.id===dealId);
  if (!d||d.stage===targetStage) { kanbanDragEnd(event); return; }
  if (targetStage==="Won") { kanbanDragEnd(event); toast("Open the deal to mark as Won and add milestones"); openDealDetail(dealId); return; }
  d.stage=targetStage; d.updatedAt=todayStr(); save(); toast(`${d.client} → ${targetStage}`);
  kanbanDragEnd(event); renderKanban();
}
function kanbanPromote(id) {
  const d=STATE.deals.find(x=>x.id===id); if(!d) return;
  const idx=KANBAN_STAGES.indexOf(d.stage);
  if (idx<0||idx>=KANBAN_STAGES.length-1) return;
  if (KANBAN_STAGES[idx+1]==="Won") { toast("Open the deal to configure Won milestones"); openDealDetail(id); return; }
  d.stage=KANBAN_STAGES[idx+1]; d.updatedAt=todayStr(); save(); toast(`${d.client} → ${d.stage}`); renderKanban();
}

/* ── Deal form ── */
let formMilestones = [];
function openDealForm() {
  formMilestones=[];
  window.__activePlan="FULL"; window.__lastInv=null;
  document.getElementById("modalBody").innerHTML=`
    <h2>New deal</h2>
    <p class="hint">Pricing, VAT, invoice total and commission calculate automatically.</p>
    <div id="formErrs"></div>
    <div class="form-grid">
      <div class="field full"><label>Client</label><input id="f_client" placeholder="Client name" list="clientList"><datalist id="clientList">${STATE.clients.map(c=>`<option value="${c.name}">`).join("")}</datalist></div>
      <div class="field"><label>Product</label><select id="f_product">${["CRM","Navi","HR"].map(p=>`<option>${p}</option>`).join("")}</select></div>
      <div class="field"><label>Deal type</label><select id="f_type">${["New Deal","Renewal","Upgrade"].map(t=>`<option>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Old users (upgrade)</label><input id="f_old" type="number" value="0"></div>
      <div class="field"><label>New users</label><input id="f_new" type="number" value="10"></div>
      <div class="field"><label>Duration (years)</label><select id="f_dur">${[1,2,3].map(y=>`<option>${y}</option>`).join("")}</select></div>
      <div class="field"><label>VAT applies?</label><select id="f_vat"><option>Yes</option><option>No</option></select></div>
      <div class="field"><label>Override price (optional)</label><input id="f_override" type="number" placeholder="leave blank to auto-price"></div>
      <div class="field"><label>Stage</label><select id="f_stage">${["New","Qualified","Meeting","Negotiation","Won"].map(s=>`<option ${s==="Won"?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Deal date</label><input id="f_date" type="date" value="${todayStr()}"></div>
      <div class="field full"><label>Notes</label><textarea id="f_notes" rows="2"></textarea></div>
    </div>
    <div id="pricePreview" class="panel" style="background:var(--panel2);margin-top:14px;"></div>
    <div id="planSection"></div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveNewDeal()">Save deal</button>
    </div>`;
  showModal();
  ["f_product","f_type","f_old","f_new","f_dur","f_vat","f_override","f_stage","f_date"].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener("input",updateFormPreview); });
  updateFormPreview();
}
function readFormDealDraft() {
  return {
    client:document.getElementById("f_client").value.trim(),
    product:document.getElementById("f_product").value,
    dealType:document.getElementById("f_type").value,
    oldUsers:Number(document.getElementById("f_old").value)||0,
    newUsers:Number(document.getElementById("f_new").value)||0,
    durationYears:Number(document.getElementById("f_dur").value),
    vatApplicable:document.getElementById("f_vat").value==="Yes",
    overridePrice:document.getElementById("f_override").value===""?null:Number(document.getElementById("f_override").value),
    stage:document.getElementById("f_stage").value,
    dealDate:document.getElementById("f_date").value||todayStr(),
    notes:document.getElementById("f_notes").value,
  };
}
function updateFormPreview() {
  const draft=readFormDealDraft();
  const base=basePriceOf(draft), vat=vatAmountOf(draft), inv=base+vat;
  const noMatch=!hasPriceSource(draft);
  document.getElementById("pricePreview").innerHTML=`
    <div style="display:flex;gap:22px;flex-wrap:wrap;font-size:12.5px;">
      <div><span style="color:var(--muted)">Base / Net</span><br><b>${fmtMoney(base)}</b></div>
      <div><span style="color:var(--muted)">VAT (${(STATE.settings.vatRate*100).toFixed(0)}%)</span><br><b>${fmtMoney(vat)}</b></div>
      <div><span style="color:var(--muted)">Invoice / Gross</span><br><b style="color:var(--gold)">${fmtMoney(inv)}</b></div>
      <div><span style="color:var(--muted)">Renewal date</span><br><b>${fmtDateShort(renewalDateOf(draft))}</b></div>
    </div>
    ${noMatch?`<div class="valid-err" style="margin-top:10px;">No exact ${draft.product} package for ${usersForPricing(draft)} users / ${draft.durationYears}yr — enter an Override Price.</div>`:""}`;
  if (draft.stage==="Won") renderPlanBuilder(inv,draft.dealDate); else document.getElementById("planSection").innerHTML="";
}
function renderPlanBuilder(invoiceTotal,firstDueDate,activePlan) {
  const plans=["FULL","50/50","3 INSTALLMENTS","CUSTOM"];
  window.__activePlan=activePlan||window.__activePlan||"FULL";
  if (!formMilestones.length||window.__lastInv!==invoiceTotal) {
    formMilestones=reconcileRounding(buildPlan(window.__activePlan,invoiceTotal,firstDueDate),invoiceTotal);
    window.__lastInv=invoiceTotal;
  }
  document.getElementById("planSection").innerHTML=`
    <div class="panel" style="margin-top:14px;">
      <h3>Payment plan</h3>
      <div class="plan-btns">${plans.map(p=>`<button type="button" class="${p===window.__activePlan?"active":""}" onclick="choosePlan('${p}',${invoiceTotal},'${firstDueDate}')">${p}</button>`).join("")}</div>
      <div id="milestoneRows"></div>
      ${window.__activePlan==="CUSTOM"?`<button class="btn secondary small" style="margin-top:8px;" onclick="addCustomMilestone(${invoiceTotal},'${firstDueDate}')">+ Add milestone</button>`:""}
      <div id="planTotal"></div>
    </div>`;
  renderMilestoneRows(invoiceTotal);
}
function choosePlan(plan,invoiceTotal,firstDueDate) {
  window.__activePlan=plan;
  formMilestones=plan==="CUSTOM"?[]:reconcileRounding(buildPlan(plan,invoiceTotal,firstDueDate),invoiceTotal);
  renderPlanBuilder(invoiceTotal,firstDueDate,plan);
}
function addCustomMilestone(invoiceTotal,firstDueDate) {
  formMilestones.push({percentage:null,amountDue:0,dueDate:firstDueDate,amountPaid:0,paidDate:null,paymentMethod:"",notes:"",commissionPaid:false,commissionPaidDate:null});
  renderMilestoneRows(invoiceTotal);
}
function renderMilestoneRows(invoiceTotal) {
  const el=document.getElementById("milestoneRows");
  el.innerHTML=formMilestones.map((m,i)=>`
    <div class="milestone-row">
      <div><span class="mlbl">Due date</span><input type="date" value="${m.dueDate}" onchange="updateMilestone(${i},'dueDate',this.value,${invoiceTotal})"></div>
      <div><span class="mlbl">Amount due</span><input type="number" value="${m.amountDue}" onchange="updateMilestone(${i},'amountDue',this.value,${invoiceTotal})"></div>
      <div><span class="mlbl">Amount paid</span><input type="number" value="${m.amountPaid}" onchange="updateMilestone(${i},'amountPaid',this.value,${invoiceTotal})"></div>
      <div><span class="mlbl">Paid date</span><input type="date" value="${m.paidDate||""}" onchange="updateMilestone(${i},'paidDate',this.value,${invoiceTotal})"></div>
      <button class="btn danger small" onclick="removeMilestone(${i},${invoiceTotal})">✕</button>
    </div>`).join("");
  const total=formMilestones.reduce((s,m)=>s+Number(m.amountDue||0),0);
  const ok=Math.abs(total-invoiceTotal)<1;
  document.getElementById("planTotal").innerHTML=`<div class="plan-total ${ok?"ok":"bad"}">Scheduled: ${fmtNum(total)} / ${fmtNum(invoiceTotal)} EGP ${ok?"✓ matches invoice":"— must equal invoice total"}</div>`;
}
function updateMilestone(i,field,val,invoiceTotal) {
  formMilestones[i][field]=(field==="amountDue"||field==="amountPaid")?Number(val):val;
  if (field==="amountPaid"&&val&&!formMilestones[i].paidDate) formMilestones[i].paidDate=todayStr();
  renderMilestoneRows(invoiceTotal);
}
function removeMilestone(i,invoiceTotal) { formMilestones.splice(i,1); renderMilestoneRows(invoiceTotal); }

function saveNewDeal() {
  const draft=readFormDealDraft();
  const errs=validateDealInput(draft);
  if (draft.stage==="Won") {
    const inv=invoiceTotalOf(draft);
    errs.push(...validateMilestones(formMilestones,inv));
    if (!formMilestones.length) errs.push("Add at least one payment milestone for a Won deal.");
  }
  if (errs.length) { document.getElementById("formErrs").innerHTML=`<div class="valid-err">${errs.join("<br>")}</div>`; return; }
  const client=getOrCreateClient(draft.client);
  const id=nextId("deal");
  STATE.deals.push({ id, clientId:client.id, client:client.name, product:draft.product, dealType:draft.dealType,
    stage:draft.stage, dealDate:draft.dealDate, oldUsers:draft.oldUsers, newUsers:draft.newUsers,
    durationYears:draft.durationYears, vatApplicable:draft.vatApplicable, vatRateAtSale:STATE.settings.vatRate,
    overridePrice:draft.overridePrice, notes:draft.notes, createdAt:todayStr(), updatedAt:todayStr() });
  if (draft.stage==="Won") {
    formMilestones.forEach(m=>STATE.payments.push({ id:nextId("payment"), dealId:id, percentage:m.percentage,
      amountDue:m.amountDue, amountPaid:Number(m.amountPaid)||0, dueDate:m.dueDate,
      paidDate:Number(m.amountPaid)>0?(m.paidDate||todayStr()):null, paymentMethod:m.paymentMethod||"",
      notes:"", commissionPaid:false, commissionPaidDate:null }));
  }
  save(); closeModal(); toast(`Deal ${id} created`); renderRoute();
}

/* ── Deal 360 detail ── */
function openDealDetail(dealId) {
  const d=STATE.deals.find(x=>x.id===dealId); if(!d) return;
  const isWon=d.stage==="Won";
  const cl=STATE.clients.find(c=>c.id===d.clientId);
  const ps=paymentsOfDeal(d.id).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const lines=isWon?commissionLinesForDeal(d):[];
  const docs=STATE.documents.filter(doc=>doc.dealId===d.id);
  const ph=primaryPhone(cl);
  document.getElementById("modalBody").innerHTML=`
    <h2>${d.client} <span style="color:var(--muted);font-weight:400;font-size:13px;">· ${d.id}</span></h2>
    <p class="hint">${d.product} · ${d.dealType} · logged ${fmtDateShort(d.dealDate)}</p>
    <div style="display:flex;gap:8px;margin:-6px 0 10px;">${callBtn(ph)}${waBtn(ph,"general",{clientName:d.client})}</div>
    <div class="form-grid">
      <div class="field"><label>Stage</label><select id="d_stage">${["New","Qualified","Meeting","Negotiation","Won"].map(s=>`<option ${s===d.stage?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Product</label><select id="d_product">${["CRM","Navi","HR"].map(p=>`<option ${p===d.product?"selected":""}>${p}</option>`).join("")}</select></div>
      <div class="field"><label>Users</label><input id="d_users" type="number" value="${d.newUsers}"></div>
      <div class="field"><label>Duration (yrs)</label><input id="d_dur" type="number" min="1" max="3" value="${d.durationYears}"></div>
      <div class="field"><label>VAT applies?</label><select id="d_vat"><option value="yes" ${d.vatApplicable?"selected":""}>Yes</option><option value="no" ${!d.vatApplicable?"selected":""}>No</option></select></div>
      <div class="field"><label>Override price</label><input id="d_override" type="number" value="${d.overridePrice??""}" placeholder="auto-price"></div>
    </div>
    <div class="kpi-row" style="margin:14px 0;">
      <div class="kpi"><div class="lbl">Net</div><div class="val" style="font-size:15px;">${fmtMoney(basePriceOf(d))}</div></div>
      <div class="kpi"><div class="lbl">VAT${d.vatRateAtSale!=null?` (${(d.vatRateAtSale*100).toFixed(0)}%)`:""}</div><div class="val" style="font-size:15px;">${fmtMoney(vatAmountOf(d))}</div></div>
      <div class="kpi"><div class="lbl">Invoice</div><div class="val" style="font-size:15px;">${fmtMoney(invoiceTotalOf(d))}</div></div>
      <div class="kpi"><div class="lbl">Collected</div><div class="val" style="font-size:15px;color:var(--green);">${fmtMoney(collectedOf(d))}</div></div>
      <div class="kpi"><div class="lbl">Outstanding</div><div class="val" style="font-size:15px;color:var(--amber);">${fmtMoney(outstandingOf(d))}</div></div>
    </div>
    ${isWon?`<p style="font-size:11.5px;color:var(--muted);margin:-8px 0 10px;">Renewal: <b style="color:var(--text)">${fmtDateShort(renewalDateOf(d))}</b></p>`:""}
    ${d.dealType==="Upgrade"?renderUpgradeTransparency(d):""}
    ${isWon?renderMilestoneTable(ps,d):""}
    ${isWon?renderCommissionBreakdown(lines):""}
    ${renderDealDocuments(docs,d.id)}
    <div style="margin-top:14px;"><label style="font-size:11.5px;color:var(--muted);">Notes</label>
      <textarea id="d_notes" rows="2" style="width:100%;background:var(--panel2);border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px;">${d.notes||""}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn danger" onclick="deleteDeal('${d.id}')">Delete</button>
      <button class="btn secondary" onclick="closeModal()">Close</button>
      <button class="btn" onclick="saveDealEdits('${d.id}')">Save changes</button>
    </div>`;
  showModal();
}
function renderUpgradeTransparency(d) {
  const oldVal=priceLookup(d.product,d.oldUsers,d.durationYears);
  const newVal=priceLookup(d.product,d.newUsers,d.durationYears);
  const added=addedUsersOf(d);
  return `<div class="panel" style="background:var(--panel2);">
    <h3>Upgrade calculation</h3>
    <div style="display:flex;gap:22px;flex-wrap:wrap;font-size:12.5px;">
      <div><span style="color:var(--muted)">Previous</span><br><b>${d.oldUsers}u${oldVal!=null?" — "+fmtMoney(oldVal):" (no match)"}</b></div>
      <div><span style="color:var(--muted)">New</span><br><b>${d.newUsers}u${newVal!=null?" — "+fmtMoney(newVal):" (no match)"}</b></div>
      <div><span style="color:var(--muted)">Added users</span><br><b>${added}</b></div>
      <div><span style="color:var(--muted)">Commission tier</span><br><b>${(commissionRateOf(d)*100).toFixed(0)}%</b></div>
    </div>
  </div>`;
}
function renderMilestoneTable(ps,deal) {
  const cl=STATE.clients.find(c=>c.id===deal.clientId), ph=primaryPhone(cl);
  const rows=ps.map(p=>{
    const st=paymentStatus(p);
    const cls={Collected:"paid",Overdue:"overdue",Due:"due","Partially Paid":"partial",Pending:"stage"}[st];
    const overdueDays=st==="Overdue"?Math.round((new Date(todayStr())-new Date(p.dueDate))/86400000):0;
    return `<div class="r">
      <div class="c1">Due ${fmtDateShort(p.dueDate)}${overdueDays?` <span style="color:var(--red);font-size:10.5px;">(${overdueDays}d)</span>`:""}</div>
      <div class="c2">${p.paidDate?"paid "+fmtDateShort(p.paidDate):"unpaid"}${p.paymentMethod?" · "+p.paymentMethod:""}</div>
      <div class="c3">${fmtNum(p.amountPaid)} / ${fmtNum(p.amountDue)}</div>
      <div class="c4"><span class="badge ${cls}">${st}</span></div>
      <div class="actions">
        ${st!=="Collected"?`<button class="icon-btn" onclick="markMilestonePaid('${p.id}');openDealDetail('${deal.id}');" title="Mark fully paid">✓ Paid</button>`:""}
        <button class="icon-btn" onclick="toggleMilestoneEdit('${p.id}')">✎</button>
        ${waBtn(ph,"payment",{clientName:deal.client,amount:Number(p.amountDue)-Number(p.amountPaid||0),dueDate:p.dueDate})}
      </div>
    </div>
    <div id="edit_${p.id}" style="display:none;padding:8px 4px 12px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field"><label>Due date</label><input id="e_due_${p.id}" type="date" value="${p.dueDate}"></div>
        <div class="field"><label>Amount due</label><input id="e_amt_${p.id}" type="number" value="${p.amountDue}"></div>
        <div class="field"><label>Amount paid</label><input id="e_paid_${p.id}" type="number" value="${p.amountPaid}"></div>
        <div class="field"><label>Paid date</label><input id="e_paiddate_${p.id}" type="date" value="${p.paidDate||""}"></div>
        <div class="field"><label>Method</label><select id="e_method_${p.id}"><option value="">—</option>${["Bank Transfer","Cheque","Cash","Instapay"].map(m=>`<option ${p.paymentMethod===m?"selected":""}>${m}</option>`).join("")}</select></div>
        <button class="btn small" onclick="saveMilestoneEdit('${p.id}','${deal.id}')">Save</button>
        <button class="btn secondary small" onclick="toggleMilestoneEdit('${p.id}')">Cancel</button>
      </div>
    </div>`;
  }).join("");
  return `<div class="panel" style="background:var(--panel2);">
    <h3>Payment schedule</h3>
    <div class="rlist">${rows||'<div class="empty">No milestones.</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:flex-end;">
      <div class="field"><label>Due date</label><input id="np_due" type="date" value="${todayStr()}"></div>
      <div class="field"><label>Amount due</label><input id="np_due_amt" type="number" placeholder="0"></div>
      <div class="field"><label>Amount paid</label><input id="np_paid_amt" type="number" placeholder="0"></div>
      <div class="field"><label>Paid date</label><input id="np_paid_date" type="date"></div>
      <button class="btn small" onclick="addMilestoneToExisting('${deal.id}')">+ Add payment</button>
    </div>
  </div>`;
}
function toggleMilestoneEdit(pid) { const el=document.getElementById(`edit_${pid}`); if(el) el.style.display=el.style.display==="none"?"block":"none"; }
function markMilestonePaid(pid) { const p=STATE.payments.find(x=>x.id===pid); p.amountPaid=p.amountDue; if(!p.paidDate) p.paidDate=todayStr(); save(); toast("Marked as fully paid"); }
function saveMilestoneEdit(pid,dealId) {
  const p=STATE.payments.find(x=>x.id===pid);
  const due=Number(document.getElementById(`e_amt_${pid}`).value);
  const paid=Number(document.getElementById(`e_paid_${pid}`).value);
  if (due<0||paid<0) { toast("Amounts cannot be negative",true); return; }
  if (paid>due+.5)   { toast("Paid amount cannot exceed amount due",true); return; }
  p.dueDate=document.getElementById(`e_due_${pid}`).value||p.dueDate;
  p.amountDue=due; p.amountPaid=paid;
  p.paidDate=document.getElementById(`e_paiddate_${pid}`).value||(paid>0?(p.paidDate||todayStr()):null);
  p.paymentMethod=document.getElementById(`e_method_${pid}`).value;
  save(); toast("Payment updated"); openDealDetail(dealId);
}
function renderCommissionBreakdown(lines) {
  if (!lines.length) return `<div class="panel" style="background:var(--panel2);"><h3>Commission</h3><div class="empty">No commission earned yet.</div></div>`;
  return `<div class="panel" style="background:var(--panel2);">
    <h3>Commission</h3>
    <div class="rlist">${lines.map(l=>`<div class="r">
      <div class="c1">${fmtDateShort(l.earnedDate)}</div>
      <div class="c2">rate ${(l.commissionRate*100).toFixed(0)}%${l.trainingFeeDeduction?`, -${fmtNum(l.trainingFeeDeduction)} training`:""}</div>
      <div class="c3">${fmtNum(l.netCommission)} EGP</div>
      <div class="c4"><span class="badge ${l.payoutStatus.toLowerCase()}" style="cursor:${l.payoutStatus!=="LOCKED"?"pointer":"default"};" onclick="${l.payoutStatus!=="LOCKED"?`toggleCommissionPaid('${l.paymentId}')`:""}">${l.payoutStatus}</span></div>
    </div>`).join("")}</div>
  </div>`;
}
function addMilestoneToExisting(dealId) {
  const due=document.getElementById("np_due").value||todayStr();
  const dueAmt=Number(document.getElementById("np_due_amt").value)||0;
  const paidAmt=Number(document.getElementById("np_paid_amt").value)||0;
  const paidDate=document.getElementById("np_paid_date").value||(paidAmt>0?todayStr():null);
  if (!dueAmt) { toast("Enter an amount due",true); return; }
  if (paidAmt>dueAmt+.5) { toast("Paid amount cannot exceed amount due",true); return; }
  STATE.payments.push({ id:nextId("payment"), dealId, percentage:null, amountDue:dueAmt, amountPaid:paidAmt,
    dueDate:due, paidDate:paidAmt>0?paidDate:null, paymentMethod:paidAmt>0?"Bank Transfer":"", notes:"",
    commissionPaid:false, commissionPaidDate:null });
  save(); toast("Payment added"); openDealDetail(dealId);
}
function saveDealEdits(id) {
  const d=STATE.deals.find(x=>x.id===id);
  d.stage=document.getElementById("d_stage").value;
  d.product=document.getElementById("d_product").value;
  d.newUsers=Number(document.getElementById("d_users").value)||d.newUsers;
  d.durationYears=Number(document.getElementById("d_dur").value)||d.durationYears;
  d.vatApplicable=document.getElementById("d_vat").value==="yes";
  const ov=document.getElementById("d_override").value;
  d.overridePrice=ov===""?null:Number(ov);
  d.notes=document.getElementById("d_notes").value;
  if (d.stage==="Won"&&d.vatRateAtSale==null) d.vatRateAtSale=STATE.settings.vatRate;
  d.updatedAt=todayStr();
  save(); toast("Deal updated"); closeModal(); renderRoute();
}
function deleteDeal(id) {
  if (!confirm(`Delete deal ${id} and all its payments?`)) return;
  STATE.deals=STATE.deals.filter(d=>d.id!==id);
  STATE.payments=STATE.payments.filter(p=>p.dealId!==id);
  STATE.documents=STATE.documents.filter(doc=>doc.dealId!==id);
  save(); closeModal(); toast("Deal deleted"); renderRoute();
}

/* ══════════════════════════════════════════════════════════
   DOCUMENT ATTACHMENTS
   ══════════════════════════════════════════════════════════ */
const MAX_DOC_SIZE = 2 * 1024 * 1024; /* 2 MB per file */
const MAX_TOTAL_DOCS_MB = 20;

function renderDealDocuments(docs, dealId) {
  return `<div class="panel" style="background:var(--panel2);">
    <div class="section-head"><h3>📎 Attachments <small>${docs.length} file(s)</small></h3></div>
    <div class="doc-drop-zone" id="docDropZone_${dealId}"
      onclick="document.getElementById('docFileInput_${dealId}').click()"
      ondragover="event.preventDefault();this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')"
      ondrop="event.preventDefault();this.classList.remove('drag-over');handleDocDrop(event,'${dealId}')">
      <div class="dz-icon">📁</div>
      <div class="dz-label">Drop files here or click to browse</div>
      <div class="dz-sub">PDF, Word, Excel, Images · max 2 MB per file</div>
    </div>
    <input type="file" id="docFileInput_${dealId}" style="display:none" multiple
      onchange="handleDocFiles(this.files,'${dealId}')">
    <div class="doc-list" id="docList_${dealId}">
      ${docs.map(doc=>renderDocItem(doc)).join("")}
    </div>
  </div>`;
}

function renderDocItem(doc) {
  return `<div class="doc-item" id="docItem_${doc.id}">
    <div class="di-icon">${fileIcon(doc.mime)}</div>
    <div class="di-info">
      <div class="di-name" title="${doc.name}">${doc.name}</div>
      <div class="di-meta">${fmtBytes(doc.size)} · ${fmtDateShort(doc.uploadedAt)}${doc.notes?" · "+doc.notes:""}</div>
    </div>
    <div class="di-actions">
      <button class="icon-btn" onclick="downloadDoc('${doc.id}')" title="Download">⬇</button>
      <button class="icon-btn" onclick="deleteDoc('${doc.id}')" title="Delete" style="color:var(--red);border-color:rgba(241,99,107,.35);">✕</button>
    </div>
  </div>`;
}

function handleDocDrop(event, dealId) {
  handleDocFiles(event.dataTransfer.files, dealId);
}

function handleDocFiles(files, dealId) {
  let added = 0, skipped = 0;
  const currentTotalBytes = STATE.documents.reduce((s,d)=>s+d.size,0);
  const maxTotalBytes = MAX_TOTAL_DOCS_MB * 1024 * 1024;
  Array.from(files).forEach(file => {
    if (file.size > MAX_DOC_SIZE) { skipped++; return; }
    if (currentTotalBytes + file.size > maxTotalBytes) { skipped++; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const doc = {
        id: nextId("doc"), dealId, clientId: null,
        name: file.name, mime: file.type, size: file.size,
        base64: e.target.result, uploadedAt: todayStr(), notes: "",
      };
      /* attach clientId from deal */
      const deal = STATE.deals.find(d=>d.id===dealId);
      if (deal) doc.clientId = deal.clientId;
      STATE.documents.push(doc);
      added++;
      save();
      /* refresh doc list without closing modal */
      const listEl = document.getElementById(`docList_${dealId}`);
      if (listEl) {
        const newDocs = STATE.documents.filter(d=>d.dealId===dealId);
        listEl.innerHTML = newDocs.map(renderDocItem).join("");
      }
      toast(`${file.name} uploaded`);
    };
    reader.readAsDataURL(file);
  });
  if (skipped) toast(`${skipped} file(s) skipped — too large or storage limit reached`, true);
}

function downloadDoc(docId) {
  const doc = STATE.documents.find(d=>d.id===docId);
  if (!doc) return;
  const a = document.createElement("a");
  a.href = doc.base64; a.download = doc.name; a.click();
}
function deleteDoc(docId) {
  if (!confirm("Delete this attachment? Cannot be undone.")) return;
  const doc = STATE.documents.find(d=>d.id===docId);
  const dealId = doc?.dealId;
  STATE.documents = STATE.documents.filter(d=>d.id!==docId);
  save(); toast("Attachment deleted");
  if (dealId) {
    const listEl = document.getElementById(`docList_${dealId}`);
    if (listEl) listEl.innerHTML = STATE.documents.filter(d=>d.dealId===dealId).map(renderDocItem).join("");
  }
}

/* ══════════════════════════════════════════════════════════
   CLIENTS + MULTI-CONTACT
   ══════════════════════════════════════════════════════════ */
function renderClients() {
  const main = document.getElementById("main");
  main.innerHTML=`
    <div class="page-head"><div><h1>Clients</h1><p>${STATE.clients.length} accounts · multi-contact · document library</p></div></div>
    <div class="filter-bar"><input id="cliSearch" placeholder="Search clients…"></div>
    <div class="card-grid" id="cliCards"></div>`;
  document.getElementById("cliSearch").oninput=(e)=>renderClientCards(e.target.value);
  renderClientCards("");
}
function renderClientCards(q) {
  const el=document.getElementById("cliCards");
  let clients=STATE.clients.filter(c=>STATE.deals.some(d=>d.clientId===c.id));
  if (q) clients=clients.filter(c=>c.name.toLowerCase().includes(q.toLowerCase()));
  if (!clients.length) { el.innerHTML=`<div class="empty">No clients match.</div>`; return; }
  el.innerHTML=clients.map(c=>{
    const deals=STATE.deals.filter(d=>d.clientId===c.id);
    const won=deals.filter(d=>d.stage==="Won");
    const revenue=won.reduce((s,d)=>s+invoiceTotalOf(d),0);
    const coll=won.reduce((s,d)=>s+collectedOf(d),0);
    const mix={};won.forEach(d=>mix[d.product]=(mix[d.product]||0)+invoiceTotalOf(d));
    const primary=Object.keys(mix).sort((a,b)=>mix[b]-mix[a])[0]||"—";
    const ph=primaryPhone(c);
    const contactCount=c.contacts?c.contacts.length:0;
    const docCount=STATE.documents.filter(d=>d.clientId===c.id).length;
    return `<div class="rec-card" onclick="openClientDetail('${c.id}')">
      <div class="top"><div><div class="cli">${c.name}</div><div class="tag">${primary} · ${deals.length} deal(s) · ${contactCount} contact(s)</div></div></div>
      <div class="row"><span>Revenue</span><b>${fmtMoney(revenue)}</b></div>
      <div class="row"><span>Collected</span><b>${fmtMoney(coll)}</b></div>
      <div class="row"><span>Outstanding</span><b>${fmtMoney(revenue-coll)}</b></div>
      ${docCount?`<div class="row"><span>Attachments</span><b>${docCount} file(s)</b></div>`:""}
      ${ph?`<div style="display:flex;gap:6px;margin-top:8px;">${callBtn(ph)}${waBtn(ph,"general",{clientName:c.name})}</div>`:""}
    </div>`;
  }).join("");
}

function openClientDetail(clientId) {
  const c=STATE.clients.find(x=>x.id===clientId); if(!c) return;
  if (!c.contacts) c.contacts=[];
  const deals=STATE.deals.filter(d=>d.clientId===clientId).sort((a,b)=>b.dealDate.localeCompare(a.dealDate));
  const won=deals.filter(d=>d.stage==="Won");
  const revenue=won.reduce((s,d)=>s+invoiceTotalOf(d),0);
  const coll=won.reduce((s,d)=>s+collectedOf(d),0);
  const commSum=won.reduce((s,d)=>s+commissionLinesForDeal(d).reduce((s2,l)=>s2+l.netCommission,0),0);
  const upcomingPay=STATE.payments.filter(p=>won.some(d=>d.id===p.dealId)&&paymentStatus(p)!=="Collected").sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const nextRenewal=won.map(renewalDateOf).sort()[0];
  const daysToRenewal=nextRenewal?Math.round((new Date(nextRenewal+"T00:00:00")-new Date(todayStr()+"T00:00:00"))/86400000):null;
  const clientDocs=STATE.documents.filter(d=>d.clientId===clientId);

  document.getElementById("modalBody").innerHTML=`
    <h2>${c.name}</h2>
    <p class="hint">Client 360 — contacts, deals, payments, documents and commission.</p>

    <div class="kpi-row" style="margin:14px 0;">
      <div class="kpi"><div class="lbl">Total sales</div><div class="val" style="font-size:16px;">${fmtMoney(revenue)}</div></div>
      <div class="kpi"><div class="lbl">Collected</div><div class="val" style="font-size:16px;">${fmtMoney(coll)}</div></div>
      <div class="kpi"><div class="lbl">Outstanding</div><div class="val" style="font-size:16px;">${fmtMoney(revenue-coll)}</div></div>
      <div class="kpi"><div class="lbl">Commission</div><div class="val" style="font-size:16px;">${fmtMoney(commSum)}</div></div>
    </div>

    <!-- CONTACTS -->
    <div class="section-head"><h3>👥 Contacts</h3><button class="btn secondary small" onclick="showAddContactForm('${c.id}')">+ Add contact</button></div>
    <div class="contact-list" id="contactList_${c.id}">
      ${renderContactList(c)}
    </div>
    <div id="addContactFormSlot_${c.id}"></div>

    <!-- Company info -->
    <div class="divider"></div>
    <div class="form-grid" style="margin-bottom:6px;">
      <div class="field"><label>Company</label><input id="c_company" value="${c.company||""}"></div>
      <div class="field"><label>Notes</label><input id="c_notes" value="${c.notes||""}"></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="btn secondary small" onclick="saveClientInfo('${c.id}')">Save company info</button>
    </div>

    ${nextRenewal?`<div class="action-item"><div class="dot ${daysToRenewal<=30?"amber":"teal"}"></div><div class="txt">Next renewal <b>${fmtDateShort(nextRenewal)}</b> (${daysToRenewal}d)</div><div class="actions">${waBtn(primaryPhone(c),"renewal",{clientName:c.name,renewalDate:nextRenewal})}</div></div>`:""}

    <h3 style="margin:14px 0 6px;">Upcoming payments</h3>
    <div class="rlist">${upcomingPay.map(p=>`<div class="r">
      <div class="c1 clickable-name" onclick="closeModal();openDealDetail('${p.dealId}')">${p.dealId}</div>
      <div class="c2">due ${fmtDateShort(p.dueDate)}</div>
      <div class="c3">${fmtNum(Number(p.amountDue)-Number(p.amountPaid||0))} EGP</div>
      <div class="c4"><span class="badge ${paymentStatus(p)==="Overdue"?"overdue":"due"}">${paymentStatus(p)}</span></div>
      <div class="actions">${waBtn(primaryPhone(c),"payment",{clientName:c.name,amount:Number(p.amountDue)-Number(p.amountPaid||0),dueDate:p.dueDate})}</div>
    </div>`).join("")||'<div class="empty">Nothing pending.</div>'}</div>

    <h3 style="margin:14px 0 6px;">Deal history</h3>
    <div class="rlist">${deals.map(d=>`<div class="r" style="cursor:pointer;" onclick="closeModal();openDealDetail('${d.id}')">
      <div class="c1">${d.product} · ${d.dealType}</div>
      <div class="c2">${fmtDateShort(d.dealDate)}</div>
      <div class="c3">${d.stage==="Won"?fmtNum(invoiceTotalOf(d)):fmtNum(basePriceOf(d)||0)}</div>
      <div class="c4"><span class="badge ${d.stage==="Won"?({Collected:"paid",Overdue:"overdue",Due:"due",Partial:"partial"}[dealCollectionSummary(d)]||"stage"):"stage"}">${d.stage==="Won"?dealCollectionSummary(d):d.stage}</span></div>
    </div>`).join("")||'<div class="empty">No deals yet.</div>'}</div>

    <!-- Client-level documents -->
    <h3 style="margin:14px 0 6px;">📎 Client documents (${clientDocs.length})</h3>
    <div class="doc-drop-zone" style="margin-bottom:8px;"
      onclick="document.getElementById('clientDocInput_${c.id}').click()"
      ondragover="event.preventDefault();this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')"
      ondrop="event.preventDefault();this.classList.remove('drag-over');handleClientDocDrop(event,'${c.id}')">
      <div class="dz-icon">📁</div>
      <div class="dz-label">Drop client-level files here or click to browse</div>
    </div>
    <input type="file" id="clientDocInput_${c.id}" style="display:none" multiple onchange="handleClientDocFiles(this.files,'${c.id}')">
    <div class="doc-list" id="clientDocList_${c.id}">${clientDocs.map(renderDocItem).join("")}</div>

    <div class="modal-actions"><button class="btn secondary" onclick="closeModal()">Close</button></div>`;
  showModal();
}

function renderContactList(c) {
  if (!c.contacts||!c.contacts.length) return `<div class="empty">No contacts yet — add the first one.</div>`;
  return c.contacts.map(ct=>{
    const initials=(ct.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    return `<div class="contact-card" id="ctCard_${ct.id}">
      <div class="cc-avatar">${initials}</div>
      <div class="cc-info">
        <div class="cc-name">${ct.name||"—"}${ct.isPrimary?`<span class="contact-primary-badge">Primary</span>`:""}</div>
        <div class="cc-role">${ct.role||"—"}</div>
        ${ct.phone?`<div class="cc-phone">${ct.phone}</div>`:""}
      </div>
      <div class="cc-actions">
        ${ct.phone?callBtn(ct.phone):""}
        ${ct.phone?waBtn(ct.phone,"general",{clientName:ct.name}):""}
        ${!ct.isPrimary?`<button class="icon-btn" style="font-size:11px;" onclick="setContactPrimary('${c.id}','${ct.id}')">★ Primary</button>`:""}
        <button class="icon-btn" style="color:var(--red);border-color:rgba(241,99,107,.35);" onclick="deleteContact('${c.id}','${ct.id}')">✕</button>
      </div>
    </div>`;
  }).join("");
}

function showAddContactForm(clientId) {
  const slot=document.getElementById(`addContactFormSlot_${clientId}`);
  if (!slot) return;
  slot.innerHTML=`<div class="add-contact-form">
    <h4>New contact</h4>
    <div class="form-grid">
      <div class="field"><label>Full name</label><input id="nc_name" placeholder="Name"></div>
      <div class="field"><label>Role / Title</label><input id="nc_role" placeholder="e.g. CFO"></div>
      <div class="field"><label>Phone / WhatsApp</label><input id="nc_phone" placeholder="010xxxxxxxx"></div>
      <div class="field"><label>Email</label><input id="nc_email" placeholder="email@company.com"></div>
      <div class="field"><label>Make primary?</label><select id="nc_primary"><option value="no">No</option><option value="yes">Yes</option></select></div>
    </div>
    <div class="modal-actions" style="margin-top:10px;justify-content:flex-start;">
      <button class="btn small" onclick="saveNewContact('${clientId}')">Save contact</button>
      <button class="btn secondary small" onclick="document.getElementById('addContactFormSlot_${clientId}').innerHTML=''">Cancel</button>
    </div>
  </div>`;
}

function saveNewContact(clientId) {
  const c=STATE.clients.find(x=>x.id===clientId); if(!c) return;
  if (!c.contacts) c.contacts=[];
  const name=document.getElementById("nc_name").value.trim();
  if (!name) { toast("Contact name is required",true); return; }
  const isPrimary=document.getElementById("nc_primary").value==="yes";
  if (isPrimary) c.contacts.forEach(ct=>ct.isPrimary=false);
  const ct={
    id:`CT-${pad4(++STATE.counters.client)}`,
    name, role:document.getElementById("nc_role").value.trim(),
    phone:document.getElementById("nc_phone").value.trim(),
    email:document.getElementById("nc_email").value.trim(),
    isPrimary: isPrimary || c.contacts.length===0,
    notes:"",
  };
  c.contacts.push(ct); c.updatedAt=todayStr();
  save(); toast(`${name} added`);
  const listEl=document.getElementById(`contactList_${clientId}`);
  if (listEl) listEl.innerHTML=renderContactList(c);
  const slot=document.getElementById(`addContactFormSlot_${clientId}`);
  if (slot) slot.innerHTML="";
}

function setContactPrimary(clientId,contactId) {
  const c=STATE.clients.find(x=>x.id===clientId); if(!c||!c.contacts) return;
  c.contacts.forEach(ct=>ct.isPrimary=ct.id===contactId);
  c.updatedAt=todayStr(); save(); toast("Primary contact updated");
  const listEl=document.getElementById(`contactList_${clientId}`);
  if (listEl) listEl.innerHTML=renderContactList(c);
}

function deleteContact(clientId,contactId) {
  if (!confirm("Delete this contact?")) return;
  const c=STATE.clients.find(x=>x.id===clientId); if(!c||!c.contacts) return;
  c.contacts=c.contacts.filter(ct=>ct.id!==contactId);
  if (c.contacts.length&&!c.contacts.some(ct=>ct.isPrimary)) c.contacts[0].isPrimary=true;
  c.updatedAt=todayStr(); save(); toast("Contact deleted");
  const listEl=document.getElementById(`contactList_${clientId}`);
  if (listEl) listEl.innerHTML=renderContactList(c);
}

function saveClientInfo(id) {
  const c=STATE.clients.find(x=>x.id===id);
  c.company=document.getElementById("c_company").value;
  c.notes=document.getElementById("c_notes").value;
  c.updatedAt=todayStr(); save(); toast("Company info saved");
}

function handleClientDocDrop(event,clientId) { handleClientDocFiles(event.dataTransfer.files,clientId); }
function handleClientDocFiles(files,clientId) {
  let added=0;
  Array.from(files).forEach(file=>{
    if (file.size>MAX_DOC_SIZE) { toast(`${file.name} too large (max 2MB)`,true); return; }
    const reader=new FileReader();
    reader.onload=(e)=>{
      const doc={ id:nextId("doc"), dealId:null, clientId,
        name:file.name, mime:file.type, size:file.size,
        base64:e.target.result, uploadedAt:todayStr(), notes:"" };
      STATE.documents.push(doc); added++; save();
      const listEl=document.getElementById(`clientDocList_${clientId}`);
      if (listEl) listEl.innerHTML=STATE.documents.filter(d=>d.clientId===clientId&&!d.dealId).map(renderDocItem).join("");
      toast(`${file.name} uploaded`);
    };
    reader.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════════════════════
   COLLECTIONS
   ══════════════════════════════════════════════════════════ */
let collFilters = { status:"All", month:"All", client:"All" };
const STATUS_RANK = { Overdue:0, Due:1, "Partially Paid":2, Pending:3, Collected:4 };

function renderCollections() {
  const main=document.getElementById("main");
  const won=wonDeals();
  const totalDue=won.reduce((s,d)=>s+invoiceTotalOf(d),0);
  const totalColl=won.reduce((s,d)=>s+collectedOf(d),0);
  const totalOut=totalDue-totalColl;
  const collectedThisMonth=STATE.payments.filter(p=>p.paidDate&&inMonth(p.paidDate,currentYM())).reduce((s,p)=>s+Number(p.amountPaid||0),0);
  const overdueAmt=STATE.payments.filter(p=>paymentStatus(p)==="Overdue").reduce((s,p)=>s+(Number(p.amountDue)-Number(p.amountPaid||0)),0);
  const dueTodayAmt=STATE.payments.filter(p=>paymentStatus(p)==="Due").reduce((s,p)=>s+(Number(p.amountDue)-Number(p.amountPaid||0)),0);
  const partialAmt=STATE.payments.filter(p=>paymentStatus(p)==="Partially Paid").reduce((s,p)=>s+(Number(p.amountDue)-Number(p.amountPaid||0)),0);
  const rate=totalDue?totalColl/totalDue:0;
  const clientNamesForFilter=["All",...STATE.clients.filter(c=>STATE.deals.some(d=>d.clientId===c.id)).map(c=>c.name).sort()];
  main.innerHTML=`
    <div class="page-head"><div><h1>Collections</h1><p>Operational view — overdue first</p></div></div>
    <div class="kpi-row">
      <div class="kpi accent-red"><div class="lbl">Overdue</div><div class="val">${fmtMoney(overdueAmt)}</div></div>
      <div class="kpi accent-gold"><div class="lbl">Due today</div><div class="val">${fmtMoney(dueTodayAmt)}</div></div>
      <div class="kpi accent-teal"><div class="lbl">Partial</div><div class="val">${fmtMoney(partialAmt)}</div></div>
      <div class="kpi accent-green"><div class="lbl">Collected this month</div><div class="val">${fmtMoney(collectedThisMonth)}</div></div>
      <div class="kpi"><div class="lbl">Outstanding total</div><div class="val">${fmtMoney(totalOut)}</div></div>
      <div class="kpi"><div class="lbl">Collection rate</div><div class="val">${(rate*100).toFixed(1)}%</div></div>
    </div>
    <div class="panel">
      <h3>Payments</h3>
      <div class="filter-bar">
        <select id="collStatus">${["All","Pending","Due","Partially Paid","Overdue","Collected"].map(s=>`<option ${s===collFilters.status?"selected":""}>${s}</option>`).join("")}</select>
        <select id="collMonth">${["All",...lastNMonths(12).reverse()].map(m=>`<option value="${m}" ${m===collFilters.month?"selected":""}>${m==="All"?"All months":monthLabel(m)}</option>`).join("")}</select>
        <select id="collClient">${clientNamesForFilter.map(c=>`<option ${c===collFilters.client?"selected":""}>${c}</option>`).join("")}</select>
      </div>
      <div class="rlist" id="collList"></div>
    </div>`;
  document.getElementById("collStatus").onchange=(e)=>{collFilters.status=e.target.value;renderCollList();};
  document.getElementById("collMonth").onchange=(e)=>{collFilters.month=e.target.value;renderCollList();};
  document.getElementById("collClient").onchange=(e)=>{collFilters.client=e.target.value;renderCollList();};
  renderCollList();
}
function renderCollList() {
  let list=STATE.payments.slice();
  if (collFilters.status!=="All") list=list.filter(p=>paymentStatus(p)===collFilters.status);
  if (collFilters.month!=="All") list=list.filter(p=>inMonth(p.dueDate,collFilters.month));
  if (collFilters.client&&collFilters.client!=="All") list=list.filter(p=>{const d=STATE.deals.find(x=>x.id===p.dealId);return d&&d.client===collFilters.client;});
  list.sort((a,b)=>STATUS_RANK[paymentStatus(a)]-STATUS_RANK[paymentStatus(b)]||a.dueDate.localeCompare(b.dueDate));
  const el=document.getElementById("collList");
  el.innerHTML=list.map(p=>{
    const d=STATE.deals.find(x=>x.id===p.dealId);
    const cl=d?STATE.clients.find(c=>c.id===d.clientId):null;
    const st=paymentStatus(p);
    const cls={Collected:"paid",Overdue:"overdue",Due:"due","Partially Paid":"partial",Pending:"stage"}[st];
    const remaining=Number(p.amountDue)-Number(p.amountPaid||0);
    const overdueDays=st==="Overdue"?Math.round((new Date(todayStr())-new Date(p.dueDate))/86400000):0;
    const ph=primaryPhone(cl);
    return `<div class="r">
      <div class="c1 clickable-name" onclick="openDealDetail('${p.dealId}')">${d?d.client:"—"} <span style="color:var(--dim);font-weight:400;">· ${p.dealId}</span></div>
      <div class="c2">due ${fmtDateShort(p.dueDate)}${overdueDays?` <span style="color:var(--red);">(${overdueDays}d)</span>`:""}</div>
      <div class="c3">${fmtNum(remaining)} / ${fmtNum(p.amountDue)}</div>
      <div class="c4"><span class="badge ${cls}">${st}</span></div>
      <div class="actions">
        ${st!=="Collected"?`<button class="icon-btn" onclick="event.stopPropagation();markMilestonePaid('${p.id}');renderCollList();" title="Mark fully paid">✓ Paid</button>`:""}
        ${callBtn(ph)}${waBtn(ph,"payment",{clientName:d?d.client:"",amount:remaining,dueDate:p.dueDate})}
      </div>
    </div>`;
  }).join("")||'<div class="empty">Nothing matches this filter.</div>';
}

/* ══════════════════════════════════════════════════════════
   COMMISSION
   ══════════════════════════════════════════════════════════ */
let commFilters={status:"All",month:"All"};
function renderCommission() {
  const main=document.getElementById("main");
  const vault=commissionVault(), payout=nextPayoutInfo();
  main.innerHTML=`
    <div class="page-head"><div><h1>Commission</h1><p>Calculated on collected cash only · training fee deducted once per New Deal</p></div></div>
    <div class="vault-grid">
      <div class="vault-card locked"><div class="n">${fmtMoney(vault.locked)}</div><div class="l">Locked</div></div>
      <div class="vault-card available"><div class="n">${fmtMoney(vault.available)}</div><div class="l">Available</div></div>
      <div class="vault-card paid"><div class="n">${fmtMoney(vault.paid)}</div><div class="l">Paid</div></div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="lbl">Total earned</div><div class="val">${fmtMoney(vault.earned)}</div></div>
      <div class="kpi"><div class="lbl">Next payout date</div><div class="val" style="font-size:16px;">${payout?fmtDate(payout.date):"—"}</div></div>
      <div class="kpi"><div class="lbl">Next payout amount</div><div class="val" style="font-size:16px;">${payout?fmtMoney(payout.amount):"—"}</div></div>
    </div>
    <div class="panel">
      <h3>Commission ledger <small>one line per collected payment</small></h3>
      <div class="filter-bar">
        <select id="commStatus">${["All","LOCKED","AVAILABLE","PAID"].map(s=>`<option ${s===commFilters.status?"selected":""}>${s}</option>`).join("")}</select>
        <select id="commMonth">${["All",...lastNMonths(12).reverse()].map(m=>`<option value="${m}" ${m===commFilters.month?"selected":""}>${m==="All"?"All months":monthLabel(m)}</option>`).join("")}</select>
      </div>
      <div class="rlist" id="commList"></div>
    </div>`;
  document.getElementById("commStatus").onchange=(e)=>{commFilters.status=e.target.value;renderCommList();};
  document.getElementById("commMonth").onchange=(e)=>{commFilters.month=e.target.value;renderCommList();};
  renderCommList();
}
function renderCommList() {
  let lines=allCommissionLines().sort((a,b)=>b.earnedDate.localeCompare(a.earnedDate));
  if (commFilters.status!=="All") lines=lines.filter(l=>l.payoutStatus===commFilters.status);
  if (commFilters.month!=="All") lines=lines.filter(l=>inMonth(l.earnedDate,commFilters.month));
  document.getElementById("commList").innerHTML=lines.map(l=>`
    <div class="r">
      <div class="c1">${l.client} <span style="color:var(--dim);font-weight:400;">· ${l.dealId}</span></div>
      <div class="c2">earned ${fmtDateShort(l.earnedDate)} · payout ${fmtDateShort(l.expectedPayoutDate)}</div>
      <div class="c3">${fmtNum(l.netCommission)} EGP</div>
      <div class="c4"><span class="badge ${l.payoutStatus.toLowerCase()}" style="cursor:${l.payoutStatus!=="LOCKED"?"pointer":"default"};" onclick="${l.payoutStatus!=="LOCKED"?`toggleCommissionPaid('${l.paymentId}')`:""}">${l.payoutStatus}</span></div>
    </div>`).join("")||'<div class="empty">No commission lines match.</div>';
}
function toggleCommissionPaid(paymentId) {
  const p=STATE.payments.find(x=>x.id===paymentId);
  p.commissionPaid=!p.commissionPaid; p.commissionPaidDate=p.commissionPaid?todayStr():null;
  save(); renderCommList(); toast(p.commissionPaid?"Marked as paid":"Marked as available");
}

/* ══════════════════════════════════════════════════════════
   ACTIVITY
   ══════════════════════════════════════════════════════════ */
function renderActivity() {
  const main=document.getElementById("main");
  const today=getOrCreateActivity(todayStr());
  const req=requiredCallsFor(today.meetings), score=activityScore(today);
  const weekStart=addDays(todayStr(),-new Date().getDay());
  const weekMeetings=STATE.activity.filter(a=>a.date>=weekStart&&a.date<=todayStr()).reduce((s,a)=>s+a.meetings,0);
  const sorted=STATE.activity.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const days=[]; for(let i=13;i>=0;i--) days.push(addDays(todayStr(),-i));
  const callsSeries=days.map(d=>(activityOf(d)||{answeredCalls:0}).answeredCalls);
  const meetSeries=days.map(d=>(activityOf(d)||{meetings:0}).meetings);
  main.innerHTML=`
    <div class="page-head"><div><h1>Activity</h1><p>Answered calls and meetings tracked against target</p></div></div>
    <div class="kpi-row">
      <div class="kpi accent-gold"><div class="lbl">Today's calls</div><div class="val">${today.answeredCalls} <span style="font-size:12px;color:var(--muted);font-weight:400;">/ ${req}</span></div></div>
      <div class="kpi accent-teal"><div class="lbl">Today's meetings</div><div class="val">${today.meetings}</div></div>
      <div class="kpi accent-green"><div class="lbl">Activity score</div><div class="val">${score}%</div></div>
      <div class="kpi"><div class="lbl">This week's meetings</div><div class="val">${weekMeetings}</div></div>
    </div>
    <div class="panel">
      <h3>Quick log — today</h3>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button class="btn" onclick="quickAdd('calls',1)">+1 Call</button>
        <button class="btn secondary" onclick="quickAdd('calls',-1)">-1 Call</button>
        <button class="btn" onclick="quickAdd('meetings',1)">+1 Meeting</button>
        <button class="btn secondary" onclick="quickAdd('meetings',-1)">-1 Meeting</button>
        <span style="color:var(--muted);font-size:12px;">0 mtg→${STATE.settings.dailyRules.zero} calls · 1 mtg→${STATE.settings.dailyRules.one} calls · 2+ mtg→${STATE.settings.dailyRules.twoPlus} calls</span>
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field"><label>Date</label><input id="a_date" type="date" value="${todayStr()}"></div>
        <div class="field"><label>Answered calls</label><input id="a_calls" type="number" value="${today.answeredCalls}"></div>
        <div class="field"><label>Meetings</label><input id="a_meetings" type="number" value="${today.meetings}"></div>
        <button class="btn secondary" onclick="saveActivityForm()">Save entry</button>
      </div>
    </div>
    <div class="panel"><h3>Calls + meetings (14 days)</h3>${svgLineChart([{name:"Calls",values:callsSeries},{name:"Meetings",values:meetSeries}],days.map(d=>new Date(d+"T00:00:00").getDate()))}</div>
    <div class="panel"><h3>Daily log</h3>
      <div class="rlist">${sorted.slice(0,30).map(a=>`<div class="r"><div class="c1">${fmtDate(a.date)}</div><div class="c2">score ${activityScore(a)}%</div><div class="c3">${a.answeredCalls} calls</div><div class="c4">${a.meetings} meetings</div></div>`).join("")}</div>
    </div>`;
}
function quickAdd(field,delta) {
  const a=getOrCreateActivity(todayStr());
  const key=field==="calls"?"answeredCalls":"meetings";
  a[key]=Math.max(0,a[key]+delta);
  save(); renderActivity(); toast(`${field==="calls"?"Calls":"Meetings"} updated`);
}
function saveActivityForm() {
  const date=document.getElementById("a_date").value||todayStr();
  const a=getOrCreateActivity(date);
  a.answeredCalls=Math.max(0,Number(document.getElementById("a_calls").value)||0);
  a.meetings=Math.max(0,Number(document.getElementById("a_meetings").value)||0);
  save(); toast("Activity saved"); renderActivity();
}

/* ══════════════════════════════════════════════════════════
   GOALS & OKR TRACKER
   ══════════════════════════════════════════════════════════ */
function renderOKR() {
  const main=document.getElementById("main");
  const okrs=STATE.okrs||[];

  /* summary strip */
  const totalKRs=okrs.reduce((s,o)=>s+o.keyResults.length,0);
  const avgScore=okrs.length?Math.round(okrs.reduce((s,o)=>s+calcOKRScore(o),0)/okrs.length):0;
  const onTrack=okrs.filter(o=>calcOKRScore(o)>=70).length;
  const atRisk=okrs.filter(o=>calcOKRScore(o)<40).length;

  main.innerHTML=`
    <div class="page-head">
      <div><h1>Goals & OKR</h1><p>Objectives and key results · track what matters</p></div>
      <button class="btn" onclick="openOKRForm()">+ New Objective</button>
    </div>
    <div class="okr-strip">
      <div class="okr-strip-card"><div class="osc-val" style="color:var(--gold)">${avgScore}%</div><div class="osc-lbl">Avg score</div></div>
      <div class="okr-strip-card"><div class="osc-val">${okrs.length}</div><div class="osc-lbl">Objectives</div></div>
      <div class="okr-strip-card"><div class="osc-val">${totalKRs}</div><div class="osc-lbl">Key results</div></div>
      <div class="okr-strip-card"><div class="osc-val" style="color:var(--green)">${onTrack}</div><div class="osc-lbl">On track</div></div>
      <div class="okr-strip-card"><div class="osc-val" style="color:var(--red)">${atRisk}</div><div class="osc-lbl">At risk</div></div>
    </div>
    <div class="okr-page-grid" id="okrGrid">
      ${okrs.map(o=>renderOKRCard(o)).join("")}
      <button class="okr-add-btn" onclick="openOKRForm()">＋ Add Objective</button>
    </div>`;
}

function calcOKRScore(obj) {
  if (!obj.keyResults.length) return 0;
  return Math.round(obj.keyResults.reduce((s,kr)=>s+Math.min(kr.current/Math.max(kr.target,1),1)*100,0)/obj.keyResults.length);
}

function renderOKRCard(obj) {
  const score=calcOKRScore(obj);
  const scoreClass=score>=70?"great":score>=40?"good":"risk";
  return `<div class="okr-objective">
    <div class="okr-obj-header">
      <div>
        <div class="okr-obj-title">${obj.title}</div>
        <div class="okr-obj-period">${obj.period}</div>
      </div>
      <div class="okr-obj-score ${scoreClass}">${score}%</div>
    </div>
    <div class="kr-list">
      ${obj.keyResults.map(kr=>renderKRItem(obj.id,kr)).join("")}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button class="btn secondary small" onclick="openAddKRForm('${obj.id}')">+ Key Result</button>
      <button class="btn ghost small" onclick="deleteOKR('${obj.id}')">Delete objective</button>
    </div>
  </div>`;
}

function renderKRItem(objId,kr) {
  const pct=Math.min(Math.round((kr.current/Math.max(kr.target,1))*100),100);
  const barColor=pct>=70?"var(--green)":pct>=40?"var(--gold)":"var(--red)";
  return `<div class="kr-item" id="krItem_${kr.id}">
    <div class="kr-top">
      <div class="kr-title">${kr.title}</div>
      <div class="kr-pct" style="color:${barColor}">${pct}%</div>
    </div>
    <div class="kr-bar-wrap"><div class="kr-bar" style="width:${pct}%;background:${barColor};"></div></div>
    <div class="kr-meta">
      <span>${fmtNum(kr.current)} / ${fmtNum(kr.target)} ${kr.unit||""}</span>
      <span>Due ${fmtDateShort(kr.dueDate)}</span>
    </div>
    <div class="kr-actions">
      <input type="number" style="width:90px;background:var(--panel);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:6px;font-size:12px;" value="${kr.current}" id="krVal_${kr.id}" placeholder="Current">
      <button class="btn small" onclick="updateKRValue('${objId}','${kr.id}')">Update</button>
      <button class="btn ghost small" onclick="deleteKR('${objId}','${kr.id}')">✕</button>
    </div>
  </div>`;
}

function updateKRValue(objId,krId) {
  const obj=STATE.okrs.find(o=>o.id===objId); if(!obj) return;
  const kr=obj.keyResults.find(k=>k.id===krId); if(!kr) return;
  const newVal=Number(document.getElementById(`krVal_${krId}`).value)||0;
  kr.current=newVal; save(); toast("Key result updated"); renderOKR();
}
function deleteKR(objId,krId) {
  if (!confirm("Delete this key result?")) return;
  const obj=STATE.okrs.find(o=>o.id===objId); if(!obj) return;
  obj.keyResults=obj.keyResults.filter(k=>k.id!==krId); save(); renderOKR();
}
function deleteOKR(objId) {
  if (!confirm("Delete this objective and all its key results?")) return;
  STATE.okrs=STATE.okrs.filter(o=>o.id!==objId); save(); renderOKR();
}

function openOKRForm() {
  document.getElementById("modalBody").innerHTML=`
    <h2>New Objective</h2>
    <p class="hint">Define what you want to achieve. Add key results after saving.</p>
    <div class="form-grid">
      <div class="field full"><label>Objective title</label><input id="okr_title" placeholder="e.g. Grow Revenue & Market Share"></div>
      <div class="field"><label>Period</label><input id="okr_period" placeholder="e.g. Q3 2025" value="Q${Math.ceil((new Date().getMonth()+1)/3)} ${new Date().getFullYear()}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveNewOKR()">Save objective</button>
    </div>`;
  showModal();
}
function saveNewOKR() {
  const title=document.getElementById("okr_title").value.trim();
  if (!title) { toast("Title is required",true); return; }
  const obj={ id:nextId("okr"), title, period:document.getElementById("okr_period").value.trim()||currentYM(), keyResults:[] };
  if (!STATE.okrs) STATE.okrs=[];
  STATE.okrs.push(obj); save(); closeModal(); toast("Objective created"); renderOKR();
}
function openAddKRForm(objId) {
  document.getElementById("modalBody").innerHTML=`
    <h2>New Key Result</h2>
    <div class="form-grid">
      <div class="field full"><label>Title</label><input id="kr_title" placeholder="e.g. Hit monthly revenue target of 800K EGP"></div>
      <div class="field"><label>Current value</label><input id="kr_current" type="number" value="0"></div>
      <div class="field"><label>Target value</label><input id="kr_target" type="number" value="100"></div>
      <div class="field"><label>Unit</label><input id="kr_unit" placeholder="EGP, deals, %, calls/wk…"></div>
      <div class="field"><label>Due date</label><input id="kr_due" type="date" value="${addDays(todayStr(),30)}"></div>
    </div>
    <div class="modal-actions">
      <button class="btn secondary" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveNewKR('${objId}')">Add key result</button>
    </div>`;
  showModal();
}
function saveNewKR(objId) {
  const obj=STATE.okrs.find(o=>o.id===objId); if(!obj) return;
  const title=document.getElementById("kr_title").value.trim();
  if (!title) { toast("Title is required",true); return; }
  const kr={
    id:nextId("kr"), title,
    current:Number(document.getElementById("kr_current").value)||0,
    target:Number(document.getElementById("kr_target").value)||100,
    unit:document.getElementById("kr_unit").value.trim(),
    dueDate:document.getElementById("kr_due").value||addDays(todayStr(),30),
    notes:"",
  };
  obj.keyResults.push(kr); save(); closeModal(); toast("Key result added"); renderOKR();
}

/* ══════════════════════════════════════════════════════════
   COHORT ANALYSIS
   ══════════════════════════════════════════════════════════ */
let cohortMode = "revenue"; /* "revenue" | "deals" | "retention" */

function renderCohort() {
  const main=document.getElementById("main");
  const months=lastNMonths(12);

  /* build cohorts: group Won deals by the month client first appeared */
  const cohortMap={}; /* ym → { clients: Set, deals: [], revenue: 0 } */
  months.forEach(m=>{ cohortMap[m]={ clients:new Set(), deals:[], revenue:0 }; });

  wonDeals().forEach(d=>{
    const ym=ymOf(d.dealDate);
    if (!cohortMap[ym]) return;
    cohortMap[ym].clients.add(d.clientId);
    cohortMap[ym].deals.push(d);
    cohortMap[ym].revenue+=invoiceTotalOf(d);
  });

  /* retention: for each cohort month, how many clients also had a deal in subsequent months */
  const cohortMonths=months.slice(0,9); /* show 9 cohort rows max */
  const maxPeriods=6;

  /* KPIs */
  const totalRevenue=wonDeals().reduce((s,d)=>s+invoiceTotalOf(d),0);
  const avgDealVal=wonDeals().length?totalRevenue/wonDeals().length:0;
  const uniqueClients=new Set(wonDeals().map(d=>d.clientId)).size;
  const revenuePerClient=uniqueClients?totalRevenue/uniqueClients:0;

  /* heat-map helper */
  function heatColor(pct) {
    if (pct===null) return "var(--panel2)";
    if (pct>=80) return "rgba(52,211,153,.3)";
    if (pct>=60) return "rgba(52,211,153,.15)";
    if (pct>=40) return "rgba(251,191,36,.2)";
    if (pct>=20) return "rgba(251,191,36,.1)";
    return "rgba(241,99,107,.1)";
  }

  /* build table */
  const headerCells=`<th class="row-head">Cohort</th><th class="row-head">Size</th>${Array.from({length:maxPeriods},(_,i)=>`<th>M+${i}</th>`).join("")}`;
  const rows=cohortMonths.map(cohortYM=>{
    const cohortDeals=wonDeals().filter(d=>ymOf(d.dealDate)===cohortYM);
    const cohortClients=new Set(cohortDeals.map(d=>d.clientId));
    const cohortSize=cohortClients.size||cohortDeals.length;
    if (!cohortSize) return "";
    const cohortRevenue=cohortDeals.reduce((s,d)=>s+invoiceTotalOf(d),0);

    const periodCells=Array.from({length:maxPeriods},(_,period)=>{
      const targetYM=ymOf(addDays(`${cohortYM}-01`,period*30));
      if (targetYM>currentYM()) return `<td style="color:var(--dim);text-align:center;">—</td>`;
      const periodDeals=wonDeals().filter(d=>ymOf(d.dealDate)===targetYM&&cohortClients.has(d.clientId));
      if (cohortMode==="revenue") {
        const rev=period===0?cohortRevenue:periodDeals.reduce((s,d)=>s+invoiceTotalOf(d),0);
        const pct=cohortRevenue>0?Math.round((rev/cohortRevenue)*100):0;
        return `<td style="background:${heatColor(period===0?100:pct)};"><div class="cohort-cell"><span class="cc-pct">${period===0?"100%":pct+"%"}</span><span class="cc-val">${fmtNum(Math.round(rev/1000))}K</span></div></td>`;
      } else {
        const cnt=period===0?cohortSize:periodDeals.length;
        const pct=cohortSize>0?Math.round((cnt/cohortSize)*100):0;
        return `<td style="background:${heatColor(period===0?100:pct)};"><div class="cohort-cell"><span class="cc-pct">${period===0?"100%":pct+"%"}</span><span class="cc-val">${cnt}</span></div></td>`;
      }
    }).join("");
    return `<tr><td class="row-head">${monthLabel(cohortYM)}</td><td class="row-head" style="color:var(--muted);">${cohortSize}</td>${periodCells}</tr>`;
  }).filter(Boolean).join("");

  /* retention curve data */
  const retentionSeries=Array.from({length:maxPeriods},(_,period)=>{
    const vals=cohortMonths.map(cohortYM=>{
      const cohortDeals=wonDeals().filter(d=>ymOf(d.dealDate)===cohortYM);
      const cohortClients=new Set(cohortDeals.map(d=>d.clientId));
      const cohortSize=cohortClients.size||cohortDeals.length;
      if (!cohortSize) return 0;
      const targetYM=ymOf(addDays(`${cohortYM}-01`,period*30));
      if (targetYM>currentYM()) return null;
      const cnt=period===0?cohortSize:wonDeals().filter(d=>ymOf(d.dealDate)===targetYM&&cohortClients.has(d.clientId)).length;
      return Math.round((cnt/cohortSize)*100);
    }).filter(v=>v!==null);
    return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
  });

  main.innerHTML=`
    <div class="page-head">
      <div><h1>Cohort Analysis</h1><p>Revenue retention and deal activity by acquisition month</p></div>
    </div>
    <div class="cohort-kpi">
      <div class="cohort-kpi-card"><div class="ckc-val" style="color:var(--gold)">${fmtMoney(Math.round(totalRevenue))}</div><div class="ckc-lbl">Total revenue (Won)</div></div>
      <div class="cohort-kpi-card"><div class="ckc-val" style="color:var(--teal)">${fmtMoney(Math.round(avgDealVal))}</div><div class="ckc-lbl">Avg deal value</div></div>
      <div class="cohort-kpi-card"><div class="ckc-val">${uniqueClients}</div><div class="ckc-lbl">Unique clients (Won)</div></div>
      <div class="cohort-kpi-card"><div class="ckc-val" style="color:var(--green)">${fmtMoney(Math.round(revenuePerClient))}</div><div class="ckc-lbl">Revenue per client</div></div>
      <div class="cohort-kpi-card"><div class="ckc-val" style="color:var(--indigo)">${fmtMoney(Math.round(calcMRR()))}</div><div class="ckc-lbl">Current MRR</div></div>
      <div class="cohort-kpi-card"><div class="ckc-val" style="color:${calcNRR()>=100?"var(--green)":"var(--amber)"}">${calcNRR().toFixed(1)}%</div><div class="ckc-lbl">Net Revenue Retention</div></div>
    </div>
    <div class="panel">
      <div class="section-head">
        <h3>Cohort heat-map <small>rows = acquisition month · columns = subsequent months</small></h3>
        <div class="cohort-controls">
          <select onchange="cohortMode=this.value;renderCohort();">
            <option value="revenue" ${cohortMode==="revenue"?"selected":""}>Revenue retention</option>
            <option value="deals" ${cohortMode==="deals"?"selected":""}>Deal count retention</option>
          </select>
        </div>
      </div>
      <div class="cohort-table-wrap">
        <table class="cohort-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows||`<tr><td colspan="${maxPeriods+2}" style="text-align:center;padding:24px;color:var(--dim);">Not enough data yet — close more deals to see cohorts.</td></tr>`}</tbody></table>
      </div>
      <div class="cohort-legend">
        <span>Heat:</span>
        <div class="cohort-legend-bar">
          <span style="background:rgba(241,99,107,.15);"></span>
          <span style="background:rgba(251,191,36,.15);"></span>
          <span style="background:rgba(251,191,36,.25);"></span>
          <span style="background:rgba(52,211,153,.2);"></span>
          <span style="background:rgba(52,211,153,.35);"></span>
        </div>
        <span>Low → High retention</span>
      </div>
    </div>
    <div class="panel">
      <h3>Average retention curve <small>across all cohorts</small></h3>
      ${svgLineChart([{name:"Avg retention %",values:retentionSeries}],Array.from({length:maxPeriods},(_,i)=>`M+${i}`),{w:420,h:100})}
    </div>
    <div class="panel">
      <h3>Monthly revenue by cohort</h3>
      ${svgBarChart(
        cohortMonths.slice(0,6).map((m,i)=>({name:monthLabel(m),values:months.map(target=>wonDeals().filter(d=>ymOf(d.dealDate)===m&&ymOf(d.dealDate)===target).reduce((s,d)=>s+invoiceTotalOf(d),0))})),
        months.map(m=>monthLabel(m).split(" ")[0]),
        {w:380,h:110}
      )}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════════════════════ */
function renderSettings() {
  const main=document.getElementById("main");
  const s=STATE.settings;
  const thisMonthTarget=s.monthlyTargets[currentYM()]??"";
  const usedBytes=JSON.stringify(STATE).length;
  const usedMB=(usedBytes/1048576).toFixed(2);
  const docBytes=STATE.documents.reduce((s,d)=>s+d.size,0);
  main.innerHTML=`
    <div class="page-head"><div><h1>Settings</h1><p>Financial rules · pricing · data management</p></div></div>
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
        <div class="set-row"><label>Target for ${monthLabel(currentYM())}</label><input id="s_target_this" type="number" value="${thisMonthTarget}" placeholder="uses default"></div>
        <h3 style="margin-top:16px;">Daily activity rules</h3>
        <div class="set-row"><label>Calls required — 0 meetings</label><input id="s_rule0" type="number" value="${s.dailyRules.zero}"></div>
        <div class="set-row"><label>Calls required — 1 meeting</label><input id="s_rule1" type="number" value="${s.dailyRules.one}"></div>
        <div class="set-row"><label>Calls required — 2+ meetings</label><input id="s_rule2" type="number" value="${s.dailyRules.twoPlus}"></div>
      </div>
    </div>
    <div class="panel">
      <h3>Upgrade commission tiers</h3>
      <table class="pricing-table"><tr><th>Min added users</th><th>Max added users</th><th>Commission %</th></tr>
        ${s.tiers.map((t,i)=>`<tr><td><input data-tier="${i}" data-f="min" type="number" value="${t.min}"></td><td><input data-tier="${i}" data-f="max" type="number" value="${t.max}"></td><td><input data-tier="${i}" data-f="pct" type="number" step="0.01" value="${t.pct}"></td></tr>`).join("")}
      </table>
    </div>
    <div class="settings-grid">
      <div class="panel"><h3>Pricing — CRM</h3><table class="pricing-table"><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr>
        ${Object.keys(s.pricing.CRM).map(u=>`<tr><td>${u}</td>${[1,2,3].map(y=>`<td><input data-p="CRM" data-u="${u}" data-y="${y}" type="number" value="${s.pricing.CRM[u][y]||""}"></td>`).join("")}</tr>`).join("")}
      </table></div>
      <div class="panel"><h3>Pricing — Navi</h3><table class="pricing-table"><tr><th>Users</th><th>1yr</th></tr>
        ${Object.keys(s.pricing.Navi).map(u=>`<tr><td>${u}</td><td><input data-p="Navi" data-u="${u}" data-y="1" type="number" value="${s.pricing.Navi[u][1]||""}"></td></tr>`).join("")}
      </table></div>
    </div>
    <div class="panel">
      <h3>Pricing — HR <small>⚠ not confirmed — enter real prices</small></h3>
      <table class="pricing-table"><tr><th>Users</th><th>1yr</th><th>2yr</th><th>3yr</th></tr>
        ${[10,20,30,50,100].map(u=>`<tr><td>${u}</td>${[1,2,3].map(y=>`<td><input data-p="HR" data-u="${u}" data-y="${y}" type="number" value="${(s.pricing.HR[u]&&s.pricing.HR[u][y])||""}"></td>`).join("")}</tr>`).join("")}
      </table>
    </div>
    <div class="panel">
      <h3>Data &amp; Storage</h3>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px;">
        LocalStorage used: <b style="color:var(--text)">${usedMB} MB</b> ·
        Attachments: <b style="color:var(--text)">${fmtBytes(docBytes)}</b> (${STATE.documents.length} files) ·
        Max recommended: <b>4 MB</b>
        ${usedBytes>3*1024*1024?`<div class="doc-size-warn" style="margin-top:8px;">⚠ Storage is getting full. Consider exporting a backup and deleting old attachments.</div>`:""}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="btn secondary" onclick="exportBackup()">Export backup (.json)</button>
        <button class="btn secondary" onclick="document.getElementById('importFile').click()">Import backup</button>
        <input type="file" id="importFile" accept=".json" style="display:none" onchange="importBackup(this.files[0])">
        <button class="btn secondary" onclick="downloadSalesReport()">Download monthly report</button>
        <button class="btn danger" onclick="resetDemoData()">Reset demo data</button>
        <button class="btn danger" onclick="clearAllData()">Clear all data</button>
      </div>
    </div>
    <div class="modal-actions" style="justify-content:flex-start;"><button class="btn" onclick="saveSettings()">Save settings</button></div>`;
}

function saveSettings() {
  const s=STATE.settings;
  s.vatRate=Number(document.getElementById("s_vat").value);
  s.commissionNew=Number(document.getElementById("s_commnew").value);
  s.commissionRenewal=Number(document.getElementById("s_commren").value);
  s.trainingFee=Number(document.getElementById("s_training").value)||0;
  s.payoutDelayMonths=Number(document.getElementById("s_delay").value)||2;
  s.payoutDay=Number(document.getElementById("s_payoutday").value)||10;
  s.monthlyTargets.default=Number(document.getElementById("s_target_default").value)||s.monthlyTargets.default;
  const thisMonthVal=document.getElementById("s_target_this").value;
  if (thisMonthVal!=="") s.monthlyTargets[currentYM()]=Number(thisMonthVal); else delete s.monthlyTargets[currentYM()];
  s.dailyRules.zero=Number(document.getElementById("s_rule0").value)||0;
  s.dailyRules.one=Number(document.getElementById("s_rule1").value)||0;
  s.dailyRules.twoPlus=Number(document.getElementById("s_rule2").value)||0;
  document.querySelectorAll("[data-tier]").forEach(inp=>{ s.tiers[Number(inp.dataset.tier)][inp.dataset.f]=Number(inp.value); });
  document.querySelectorAll("[data-p]").forEach(inp=>{
    const p=inp.dataset.p,u=inp.dataset.u,y=inp.dataset.y;
    if (!s.pricing[p][u]) s.pricing[p][u]={};
    if (inp.value!=="") s.pricing[p][u][y]=Number(inp.value);
  });
  save(); toast("Settings saved");
}

/* ── Sales report ── */
function salesReportText(ymStr) {
  const won=wonDeals().filter(d=>inMonth(d.dealDate,ymStr));
  const sales=won.reduce((s,d)=>s+invoiceTotalOf(d),0);
  const collected=STATE.payments.filter(p=>p.paidDate&&inMonth(p.paidDate,ymStr)).reduce((s,p)=>s+Number(p.amountPaid||0),0);
  const outstanding=won.reduce((s,d)=>s+outstandingOf(d),0);
  const byType=t=>won.filter(d=>d.dealType===t).length;
  const act=STATE.activity.filter(a=>inMonth(a.date,ymStr));
  const calls=act.reduce((s,a)=>s+a.answeredCalls,0), meetings=act.reduce((s,a)=>s+a.meetings,0);
  const lines=allCommissionLines().filter(l=>inMonth(l.earnedDate,ymStr));
  const earned=lines.reduce((s,l)=>s+l.netCommission,0);
  const available=lines.filter(l=>l.payoutStatus!=="LOCKED").reduce((s,l)=>s+l.netCommission,0);
  const paid=lines.filter(l=>l.payoutStatus==="PAID").reduce((s,l)=>s+l.netCommission,0);
  return [`${monthLabel(ymStr)} — Sales Report`,""
    ,`Sales: ${fmtMoney(sales)}`,`Collected: ${fmtMoney(collected)}`,`Outstanding: ${fmtMoney(outstanding)}`
    ,``,`Deals: ${won.length}`,`New: ${byType("New Deal")}`,`Renewals: ${byType("Renewal")}`,`Upgrades: ${byType("Upgrade")}`
    ,``,`Answered Calls: ${calls}`,`Meetings: ${meetings}`
    ,``,`Commission Earned: ${fmtMoney(earned)}`,`Commission Available: ${fmtMoney(available)}`,`Commission Paid: ${fmtMoney(paid)}`
  ].join("\n");
}
function downloadSalesReport() {
  const blob=new Blob([salesReportText(currentYM())],{type:"text/plain"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`sales-report-${currentYM()}.txt`; a.click();
  URL.revokeObjectURL(url); toast("Report downloaded");
}

/* ══════════════════════════════════════════════════════════
   MODAL HELPERS
   ══════════════════════════════════════════════════════════ */
function showModal()  { document.getElementById("overlay").classList.add("show"); }
function closeModal() { document.getElementById("overlay").classList.remove("show"); }
document.getElementById("overlay").addEventListener("click",(e)=>{ if(e.target.id==="overlay") closeModal(); });
document.addEventListener("keydown",(e)=>{
  if (e.key==="Escape") { closeModal(); return; }
  if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
  if (document.getElementById("overlay").classList.contains("show")) return;
  const map={ h:"#/home",d:"#/deals",c:"#/clients",p:"#/collections",m:"#/commission",a:"#/activity",o:"#/okr",t:"#/cohort",s:"#/settings" };
  if (map[e.key]) { location.hash=map[e.key]; return; }
  if (e.key==="n") { openDealForm(); return; }
  if (e.key==="b") { toggleNotifDropdown(); return; }
  if (e.key==="k") { kanbanView=!kanbanView; if(currentRoute()==="deals") renderDeals(); toast(kanbanView?"Kanban view":"List view"); }
});

/* ══════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════ */
buildNav();
if (!location.hash) location.hash="#/home";
renderRoute();
setTimeout(initNotifBadge,150);
if (!localStorage.getItem("youssef_crm_v3_welcomed")) {
  setTimeout(()=>{
    toast("⌨ H D C P M A O T S = navigate · N = new deal · K = kanban · B = notifications");
    localStorage.setItem("youssef_crm_v3_welcomed","1");
  },2000);
}