// HGS Pipeline Analytics -- vanilla JS frontend, no build step.
// Talks to the FastAPI backend at /api/*. Adapted from the design mockup:
// same visual language, but reading live data instead of a static snapshot,
// and a real /api/ask call instead of a keyword matcher.

const state = {
  page: "exec",
  data: null,
  chatMessages: [],
  chatBusy: false,
  uploadBusy: false,
  uploadError: null,
  explorerSearch: "",
  explorerSortCol: "tcv",
  explorerSortDir: "desc",
  accountSearch: "",
  // Overview/Pipeline/Performance start collapsed so the nav fits without
  // scrolling; Data starts open since it's short. Navigating to a page
  // force-expands the group that contains it (see wireInteractions).
  navCollapsed: { Overview: true, Pipeline: true, Performance: true, Customers: true, Data: false },
  // Each filter is an array of selected values; an empty array means no
  // restriction ("All"). Multi-select: several values OR together within one
  // filter, filters AND together across dimensions.
  targetFilters: {
    region: [], quarter: [], forecast: [], dealType: [],
    owner: [], portfolio: [], serviceLine: [], partner: [], solutionAccelerator: [],
  },
  targetSortCol: "tcv",
  targetSortDir: "desc",
  // Exactly the same 9 filter dimensions as targetFilters (see dealFilterRow).
  explorerFilters: {
    region: [], quarter: [], forecast: [], dealType: [],
    owner: [], portfolio: [], serviceLine: [], partner: [], solutionAccelerator: [],
  },
  // Compound "group:key" id (e.g. "target:owner") of the one open filter
  // flyout, shared across pages since only one page is ever visible.
  openFlyout: null,
  dealDetail: null,
  detailBackTo: "exec",
  sellerDetail: null,
  sellerFilters: { region: [], role: [] },
  sellerSortCol: "fy27rev",
  sellerSortDir: "desc",
  sellerDealsSortCol: "tcv",
  sellerDealsSortDir: "desc",
  largeRegion: "All",
  largeSort: "tcv",
  riskFilter: "All",
  riskSort: "issues",
  lbRegion: "All",
  lbSort: "fy27rev",
  // Same 9 filter dimensions as targetFilters/explorerFilters (see dealFilterRow).
  closedFilters: {
    region: [], quarter: [], forecast: [], dealType: [],
    owner: [], portfolio: [], serviceLine: [], partner: [], solutionAccelerator: [],
  },
  closedSortCol: "closeDate",
  closedSortDir: "desc",
  closedOutcome: "All", // "All" | "Won" | "Lost" -- narrows the table only, not the KPI cards
  closedDealDetail: null,
  // Master Customer page: 8 filter dimensions (status is Current/Previous/
  // Current & Previous, the rest mirror the columns on the table) plus a
  // free-text company search.
  customerFilters: {
    status: [], country: [], industry: [], businessUnit: [],
    icpTier: [], accountSalesTier: [], owner: [], serviceLine: [],
  },
  customerSearch: "",
  customerSortCol: "totalRevenue",
  customerSortDir: "desc",
  customerDetail: null,
};

// HGS fiscal year ends Mar 31 -- FY27 Q1 starts Apr 1, 2026. A close date's
// fiscal label is the calendar year its Q1 (April) falls in, plus one.
function fiscalQuarterLabel(dateStr) {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return "Unknown";
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const fy = month >= 4 ? year + 1 : year;
  const q = month >= 4 ? Math.floor((month - 4) / 3) + 1 : 4;
  return `FY${String(fy).slice(-2)}Q${q}`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== undefined && v !== null && v !== ""))].sort();
}

// Filter dropdowns need a way to select "field is missing" -- surfacing that
// as its own option is how hygiene gaps (no owner, no partner, ...) get
// caught rather than silently excluded from every filter.
const BLANK_LABEL = "(Blank)";

function uniqueOptionsWithBlank(values) {
  const real = uniqueSorted(values);
  const hasBlank = values.some((v) => v === undefined || v === null || v === "");
  return hasBlank ? [...real, BLANK_LABEL] : real;
}

// Multi-select match: no selection means unfiltered; otherwise the row's
// value (or BLANK_LABEL, if empty) must be one of the selected options.
function matchesFilter(selected, rawValue) {
  if (!selected.length) return true;
  const v = (rawValue === undefined || rawValue === null || rawValue === "") ? BLANK_LABEL : rawValue;
  return selected.includes(v);
}

const NUMERIC_SORT_COLS = new Set([
  "tcv", "acv", "fy27rev", "q2rev", "q3rev", "q4rev",
  "annualQuota", "ytdAttainment", "committedAttainment", "deals", "ecnb", "ncnb",
  "totalAcv", "totalTcv", "h1Rev", "h2Rev", "weighted", "fy27DealsWon", "fy26DealsWon",
  "totalRevenue", "revenueFY27", "revenueFY28", "annualRevenue",
  "numOpenDeals", "numWonDeals", "numLostDeals", "numDeals", "numContacts",
]);

function sortRows(rows, col, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av = a[col], bv = b[col];
    if (col === "closeDate") {
      av = av ? new Date(av).getTime() : -Infinity;
      bv = bv ? new Date(bv).getTime() : -Infinity;
      return (av - bv) * mul;
    }
    if (typeof av === "string" || typeof bv === "string") {
      return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
    }
    return ((av || 0) - (bv || 0)) * mul;
  });
}

const NAV_GROUPS = [
  { title: "Overview", items: [
    { key: "exec", icon: "⌂", label: "Executive Summary" },
    { key: "coverage", icon: "◎", label: "Coverage vs. Quota" },
    { key: "trends", icon: "↗", label: "Pipeline Trends" },
  ]},
  { title: "Pipeline", items: [
    { key: "target", icon: "★", label: "Target Deals" },
    { key: "large", icon: "◆", label: "Large Deals (≥$10M)" },
    { key: "forecast", icon: "▤", label: "Forecast & Stage" },
    { key: "risk", icon: "⚠", label: "Deal Health & Risk" },
  ]},
  { title: "Performance", items: [
    { key: "regional", icon: "◉", label: "Regional Performance" },
    { key: "leaderboard", icon: "♠", label: "Seller Leaderboard" },
    { key: "sellerPerf", icon: "▦", label: "Seller Performance" },
    { key: "winloss", icon: "⚖", label: "Win / Loss" },
    { key: "closedDeals", icon: "✓", label: "Closed Deals" },
    { key: "accounts", icon: "⌘", label: "Account 360" },
  ]},
  { title: "Customers", items: [
    { key: "customers", icon: "◫", label: "Master Customer" },
  ]},
  { title: "Data", items: [
    { key: "explorer", icon: "≡", label: "Deal Explorer" },
    { key: "upload", icon: "↑", label: "Upload Spreadsheet" },
  ]},
];

const SUGGESTIONS = [
  "What's our win rate by region?",
  "Which deals are at risk?",
  "How does coverage compare to quota?",
  "Who are our top sellers?",
  "Show FY27 revenue trend",
];

function fmtM(n) {
  if (n === undefined || n === null) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(0) + "K";
  return sign + "$" + Math.round(abs);
}
function fmtNum(n) { return (n || 0).toLocaleString("en-US"); }
function fmtPct(x, digits) { return ((x || 0) * 100).toFixed(digits === undefined ? 1 : digits) + "%"; }
// Distinguishes "no quota assigned, attainment undefined" (null) from a genuine 0%.
function fmtPctOrDash(x, digits) { return x === null || x === undefined ? "—" : fmtPct(x, digits); }

// Bare (no $) abbreviated format for the Target Deals table + deal detail
// page: "5K", "115K", "1.261M", "12.342M" -- K rounds to an integer, M keeps
// 3 decimals.
function fmtNumAbbrev(n) {
  if (n === undefined || n === null) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(3) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(3) + "M";
  if (abs >= 1e3) return sign + Math.round(abs / 1e3).toLocaleString("en-US") + "K";
  return sign + Math.round(abs).toLocaleString("en-US");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function forecastBadge(cat) {
  const map = {
    "Committed": { bg: "#DCEEE0", color: "#2E7D4F" },
    "Upside": { bg: "#E4EEF7", color: "#26476B" },
    "Developing": { bg: "#FBEED9", color: "#A8762E" },
    "Pipeline": { bg: "#F1F3F8", color: "#5C6D72" },
  };
  const c = map[cat] || { bg: "#F1F3F8", color: "#5C6D72" };
  return `<span class="badge" style="background:${c.bg};color:${c.color}">${esc(cat || "—")}</span>`;
}

// ---- API ----

async function fetchCurrent() {
  const res = await fetch("/api/current");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load data");
  return res.json();
}

async function uploadWorkbook(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Upload failed");
  }
  return res.json();
}

async function fetchDeal(id) {
  const res = await fetch(`/api/deal/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Could not load this deal.");
  }
  return res.json();
}

async function fetchClosedDeal(id) {
  const res = await fetch(`/api/closed-deal/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Could not load this deal.");
  }
  return res.json();
}

async function fetchCustomer(id) {
  const res = await fetch(`/api/customer/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Could not load this customer.");
  }
  return res.json();
}

async function fetchSeller(id) {
  const res = await fetch(`/api/seller/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Could not load this seller.");
  }
  return res.json();
}

async function askQuestion(question) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Ask failed");
  }
  return res.json();
}

// ---- render ----

function render() {
  renderSidebarMeta();
  renderNav();
  document.getElementById("main").innerHTML = renderPage();
  wireInteractions();
}

function renderSidebarMeta() {
  const meta = state.data?.meta;
  document.getElementById("meta-refreshed").textContent = meta ? `Refreshed ${meta.refreshed}` : "No data yet";
}

function renderNav() {
  const html = NAV_GROUPS.map((grp) => {
    const collapsed = !!state.navCollapsed[grp.title];
    return `
    <div class="nav-group">
      <div class="nav-group-title" data-toggle-group="${esc(grp.title)}">
        <span>${esc(grp.title)}</span><span class="chevron">${collapsed ? "▸" : "▾"}</span>
      </div>
      ${collapsed ? "" : `<div class="nav-group-items">${grp.items.map((it) => `
        <div class="nav-item" data-page="${it.key}" style="color:${state.page === it.key ? "#ABCF02" : "#C9D6E3"};background:${state.page === it.key ? "#1E344A" : "transparent"}">
          <span class="icon">${it.icon}</span><span>${esc(it.label)}</span>
        </div>
      `).join("")}</div>`}
    </div>
  `;
  }).join("");
  document.getElementById("nav").innerHTML = html;
}

function expandGroupContaining(pageKey) {
  const grp = NAV_GROUPS.find((g) => g.items.some((it) => it.key === pageKey));
  if (grp) state.navCollapsed[grp.title] = false;
}

function renderPage() {
  if (state.page === "upload") return renderUpload();
  if (state.page === "ask") return renderAsk();
  if (state.page === "deal") return renderDealDetail();
  if (state.page === "closedDeal") return renderClosedDealDetail();
  if (state.page === "customerDetail") return renderCustomerDetail();
  if (state.page === "sellerDetail") return renderSellerDetail();

  if (!state.data) {
    return `<div id="app-loading">No spreadsheet uploaded yet. <a href="#" data-page="upload">Upload one</a> to get started.</div>`;
  }

  switch (state.page) {
    case "exec": return renderExec();
    case "coverage": return renderCoverage();
    case "trends": return renderTrends();
    case "target": return renderTargetDeals();
    case "large": return renderDealList("large", "Large Deals (≥$10M)", state.data.largeDeals, ["Service Line"]);
    case "forecast": return renderForecast();
    case "risk": return renderRisk();
    case "regional": return renderRegional();
    case "leaderboard": return renderLeaderboard();
    case "sellerPerf": return renderSellerPerformance();
    case "winloss": return renderWinloss();
    case "closedDeals": return renderClosedDeals();
    case "customers": return renderCustomers();
    case "accounts": return renderAccounts();
    case "explorer": return renderExplorer();
    default: return "";
  }
}

function pageHeader(eyebrow, title, sub) {
  return `<div style="margin-bottom:18px">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${esc(title)}</h1>
    <p class="page-sub">${sub}</p>
  </div>`;
}

function barRow(name, valueLabel, pct, color) {
  return `<div class="bar-row">
    <div class="bar-label"><span style="font-weight:500;color:#15283C">${esc(name)}</span><span style="color:#5C6D72">${valueLabel}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}

// ---- Executive Summary ----

function renderExec() {
  const d = state.data;
  const kpis = [
    { label: "Open Deals", value: fmtNum(d.kpis.openDeals) },
    { label: "Total TCV", value: fmtM(d.kpis.totalTCV) },
    { label: "FY27 Revenue", value: fmtM(d.kpis.fy27Revenue) },
    { label: "Weighted FY27", value: fmtM(d.kpis.weightedFY27) },
    { label: "Committed $", value: fmtM(d.kpis.committed) },
    { label: "Large Deals (≥$10M)", value: fmtNum(d.kpis.largeDeals) },
  ];
  const maxStageTcv = Math.max(...d.stages.map((s) => s.tcv), 1);
  const maxRegion = Math.max(...d.revenueByRegion.map((r) => r.value), 1);
  const maxDealType = Math.max(...d.revenueByDealType.map((r) => r.value), 1);
  const maxMonth = Math.max(...d.monthlyRevenue.map((m) => m.value), 1);

  return `
    ${pageHeader("Overview", "Executive Summary", `${fmtNum(d.kpis.openDeals)} open deals &bull; ${fmtNum(d.meta.closedFY27)} closed FY27 &bull; ${fmtNum(d.meta.lineItems)} line items &bull; Source: ${esc(d.meta.source)} &bull; Refreshed ${esc(d.meta.refreshed)}`)}
    <div class="grid" style="grid-template-columns:repeat(6,1fr);margin-bottom:22px">
      ${kpis.map((k) => `<div class="card" style="padding:16px 14px">
        <div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">${esc(k.label)}</div>
        <div style="font-weight:600;font-size:21px">${k.value}</div>
      </div>`).join("")}
    </div>
    <div class="grid" style="grid-template-columns:1.3fr 1fr;margin-bottom:16px">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:14px">Top-Line KPIs &mdash; Standard vs Large Deals</div>
        <div style="display:grid;grid-template-columns:1.3fr repeat(4,0.9fr);gap:8px 10px;font-size:12.5px">
          <div style="font-weight:600;color:#8393A0">Segment</div>
          <div class="num" style="font-weight:600;color:#8393A0"># Deals</div>
          <div class="num" style="font-weight:600;color:#8393A0">Total TCV</div>
          <div class="num" style="font-weight:600;color:#8393A0">FY27 Rev</div>
          <div class="num" style="font-weight:600;color:#8393A0">Weighted</div>
          ${d.segments.map((s) => `
            <div style="grid-column:1/-1;height:1px;background:#EEF1F5"></div>
            <div style="padding:7px 0;font-weight:${s.name === "TOTAL" ? 600 : 400}">${esc(s.name)}</div>
            <div class="num" style="padding:7px 0">${fmtNum(s.deals)}</div>
            <div class="num" style="padding:7px 0">${fmtM(s.tcv)}</div>
            <div class="num" style="padding:7px 0">${fmtM(s.fy27rev)}</div>
            <div class="num" style="padding:7px 0">${fmtM(s.weighted)}</div>
          `).join("")}
        </div>
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:14px">Pipeline by Stage</div>
        ${d.stages.map((s) => barRow(s.name, `${fmtNum(s.deals)} deals &bull; ${fmtM(s.fy27rev)}`, (s.tcv / maxStageTcv) * 100, "#356094")).join("")}
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="card" style="padding:20px 22px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:12px">FY27 Revenue by Region</div>
        ${d.revenueByRegion.map((r) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
          <span style="font-size:12px;color:#5C6D72;width:70px;flex-shrink:0">${esc(r.name)}</span>
          <div style="flex:1;height:8px;background:#EEF1F5;border-radius:4px;overflow:hidden"><div style="height:100%;width:${(r.value / maxRegion) * 100}%;background:#3D9B99;border-radius:4px"></div></div>
          <span style="font-size:12px;font-weight:500;width:56px;text-align:right;flex-shrink:0">${fmtM(r.value)}</span>
        </div>`).join("")}
      </div>
      <div class="card" style="padding:20px 22px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:12px">FY27 Revenue by Deal Type</div>
        ${d.revenueByDealType.map((r) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">
          <span style="font-size:12px;color:#5C6D72;width:70px;flex-shrink:0">${esc(r.name)}</span>
          <div style="flex:1;height:8px;background:#EEF1F5;border-radius:4px;overflow:hidden"><div style="height:100%;width:${(r.value / maxDealType) * 100}%;background:#ABCF02;border-radius:4px"></div></div>
          <span style="font-size:12px;font-weight:500;width:56px;text-align:right;flex-shrink:0">${fmtM(r.value)}</span>
        </div>`).join("")}
      </div>
      <div class="card" style="padding:20px 22px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:12px">Monthly FY27 Revenue (Std)</div>
        <div style="display:flex;align-items:flex-end;gap:8px;height:110px">
          ${d.monthlyRevenue.map((m) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
            <div style="width:100%;background:#356094;border-radius:4px 4px 0 0;height:${Math.max((m.value / maxMonth) * 100, m.value > 0 ? 4 : 0)}%;min-height:2px"></div>
            <div style="font-size:10.5px;color:#8393A0;margin-top:6px">${m.month}</div>
          </div>`).join("")}
        </div>
      </div>
    </div>`;
}

// ---- Coverage vs Quota ----

function renderCoverage() {
  const d = state.data;
  const pct = d.quotaTotals.coveragePct;
  const dash = Math.min(pct, 1) * 326.7;
  return `
    ${pageHeader("Overview", "Pipeline Coverage vs. Quota", "How much weighted pipeline exists against assigned quota &mdash; the question every leader asks before a QBR. Scoped to sellers with an assigned annual quota.")}
    <div class="grid" style="grid-template-columns:1fr 1.4fr;margin-bottom:16px">
      <div style="background:#15283C;border-radius:18px;padding:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <div style="position:relative;width:190px;height:190px">
          <svg viewBox="0 0 120 120" style="width:100%;height:100%;transform:rotate(-90deg)">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#233C56" stroke-width="14"></circle>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#ABCF02" stroke-width="14" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} 326.7"></circle>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div style="font-weight:600;font-size:30px;color:#FFFFFF">${fmtPct(pct, 0)}</div>
            <div style="font-size:11px;color:#8FA3B8">coverage</div>
          </div>
        </div>
        <div style="margin-top:18px;font-size:13px;color:#C9D6E3">${fmtM(d.quotaTotals.totalWeighted)} weighted vs ${fmtM(d.quotaTotals.totalQuota)} quota</div>
      </div>
      <div class="card" style="padding:24px 26px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:14px">Coverage by Region</div>
        ${d.quotaByRegion.map((c) => {
          const color = c.pct >= 1 ? "#3D9B99" : c.pct >= 0.5 ? "#D9A441" : "#C4593E";
          return `<div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
              <span style="font-weight:500">${esc(c.region)}</span>
              <span style="color:#5C6D72">${fmtM(c.weighted)} weighted &bull; ${fmtM(c.quota)} quota</span>
            </div>
            <div style="height:10px;background:#EEF1F5;border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.min(c.pct, 1) * 100}%;background:${color};border-radius:5px"></div></div>
          </div>`;
        }).join("")}
        <div style="margin-top:18px;padding-top:16px;border-top:1px solid #EEF1F5;font-size:12px;color:#8393A0;line-height:1.5">Quota is summed directly from each seller's assigned annual quota in the Seller Performance tab. Coverage below 100% signals the region needs more qualified pipeline to hit target; 300&ndash;400% is a commonly healthy range given typical win rates.</div>
      </div>
    </div>
    <div class="card" style="padding:20px 22px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:14px">Coverage Detail</div>
      <div style="display:grid;grid-template-columns:1.6fr repeat(4,1fr);gap:8px;font-size:12.5px">
        <div style="font-weight:600;color:#8393A0">Segment</div>
        <div class="num" style="font-weight:600;color:#8393A0">Weighted FY27</div>
        <div class="num" style="font-weight:600;color:#8393A0">Annual Quota</div>
        <div class="num" style="font-weight:600;color:#8393A0">Coverage</div>
        <div class="num" style="font-weight:600;color:#8393A0"># Reps w/ Quota</div>
        <div style="grid-column:1/-1;height:1px;background:#EEF1F5"></div>
        <div style="padding:6px 0;font-weight:500">All Sellers w/ Quota</div>
        <div class="num" style="padding:6px 0">${fmtM(d.quotaTotals.totalWeighted)}</div>
        <div class="num" style="padding:6px 0">${fmtM(d.quotaTotals.totalQuota)}</div>
        <div class="num" style="padding:6px 0;color:#C4593E;font-weight:600">${fmtPct(pct, 0)}</div>
        <div class="num" style="padding:6px 0">${d.quotaTotals.repsWithQuota}</div>
      </div>
    </div>`;
}

// ---- Trends ----

function renderTrends() {
  const d = state.data;
  const points = d.trendSnapshots;
  const maxTrend = Math.max(...points.map((t) => t.fy27rev), 1);
  const first = points[0], last = points[points.length - 1];
  const revDelta = last.fy27rev - first.fy27rev;
  const dealDelta = last.deals - first.deals;
  return `
    ${pageHeader("Overview", "Pipeline Trends", "Movement over time, not just a snapshot &mdash; one point per upload, seeded from the workbook's weekly/monthly archive tabs.")}
    <div class="card" style="padding:24px 26px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:20px">FY27 Revenue &amp; Open Deal Count Over Time</div>
      <div style="display:flex;align-items:flex-end;gap:36px;height:200px;padding:0 20px">
        ${points.map((t, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div style="font-weight:600;font-size:15px;margin-bottom:8px">${fmtM(t.fy27rev)}</div>
          <div style="width:64px;background:linear-gradient(180deg,#356094,#26476B);border-radius:8px 8px 0 0;height:${(t.fy27rev / maxTrend) * 100}%;min-height:6px"></div>
          <div style="font-size:12px;color:#5C6D72;margin-top:10px;text-align:center">${esc(t.label)}</div>
          <div style="font-size:11px;color:#8393A0">${fmtNum(t.deals)} open deals</div>
        </div>`).join("")}
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="card" style="padding:18px 20px">
        <div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">FY27 Revenue Change (${esc(first.label)} &rarr; ${esc(last.label)})</div>
        <div style="font-weight:600;font-size:20px;color:${revDelta >= 0 ? "#3D9B99" : "#C4593E"}">${revDelta >= 0 ? "+" : ""}${fmtM(revDelta)}</div>
      </div>
      <div class="card" style="padding:18px 20px">
        <div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Open Deal Count Change</div>
        <div style="font-weight:600;font-size:20px;color:${dealDelta >= 0 ? "#3D9B99" : "#C4593E"}">${dealDelta >= 0 ? "+" : ""}${dealDelta}</div>
      </div>
      <div style="background:#F1F3F8;border-radius:14px;padding:18px 20px;font-size:12.5px;color:#5C6D72;line-height:1.5">${points.length} snapshot${points.length === 1 ? "" : "s"} on file. Every new upload adds one more point here automatically.</div>
    </div>`;
}

// ---- Target Deals (quarter + forecast/deal-type filters, sortable columns) ----

// Multi-select filter dropdown. `selected` is an array of chosen values
// (empty = "All"). Clicking an option toggles it and leaves the menu open so
// several values can be picked in one go; only "Clear" or an outside click
// closes/resets it.
function filterFlyout(group, key, label, selected, options) {
  const flyoutId = `${group}:${key}`;
  const open = state.openFlyout === flyoutId;
  const summary = selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  return `<div class="filter-flyout">
    <div class="filter-btn ${selected.length ? "active" : ""}" data-flyout-toggle="${flyoutId}">
      <span>${esc(label)}: ${esc(summary)}</span><span class="caret">${open ? "▴" : "▾"}</span>
    </div>
    ${open ? `<div class="filter-menu">
      <div class="filter-menu-item filter-menu-clear" data-filter-clear="${group}:${key}">${selected.length ? `Clear (${selected.length})` : "All"}</div>
      ${options.map((opt) => `
        <div class="filter-menu-item filter-menu-check ${selected.includes(opt) ? "checked" : ""}" data-filter-group="${group}" data-filter-key="${key}" data-filter-value="${esc(opt)}">
          <span class="check-box">${selected.includes(opt) ? "✓" : ""}</span><span>${esc(opt)}</span>
        </div>
      `).join("")}
    </div>` : ""}
  </div>`;
}

function sortableHeader(group, col, label, currentCol, currentDir, numeric) {
  const active = currentCol === col;
  const arrow = active ? (currentDir === "asc" ? "▲" : "▼") : "";
  return `<th class="${numeric ? "num " : ""}sortable ${active ? "active" : ""}" data-sort-group="${group}" data-sort-col="${col}">${esc(label)}${arrow ? `<span class="sort-arrow">${arrow}</span>` : ""}</th>`;
}

// Shared by Target Deals and Deal Explorer -- both list all-columns-visible
// deal rows filtered by the same 9 dimensions, so the filter row, column
// header, and row markup live here once to guarantee they stay identical.

function dealFilterRow(group, filters, rows) {
  const opts = (field) => uniqueOptionsWithBlank(rows.map((r) => r[field]));
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
    ${filterFlyout(group, "region", "Region", filters.region, opts("region"))}
    ${filterFlyout(group, "quarter", "Quarter", filters.quarter, opts("quarter"))}
    ${filterFlyout(group, "forecast", "Forecast", filters.forecast, opts("forecastCat"))}
    ${filterFlyout(group, "dealType", "Deal Type", filters.dealType, opts("dealType"))}
    ${filterFlyout(group, "owner", "Owner", filters.owner, opts("owner"))}
    ${filterFlyout(group, "portfolio", "Portfolio", filters.portfolio, opts("portfolio"))}
    ${filterFlyout(group, "serviceLine", "Service Line", filters.serviceLine, opts("serviceLine"))}
    ${filterFlyout(group, "partner", "Partner", filters.partner, opts("partner"))}
    ${filterFlyout(group, "solutionAccelerator", "Solution Accelerator", filters.solutionAccelerator, opts("solutionAccelerator"))}
  </div>`;
}

function dealMatchesAllFilters(filters, r) {
  return matchesFilter(filters.region, r.region)
    && matchesFilter(filters.quarter, r.quarter)
    && matchesFilter(filters.forecast, r.forecastCat)
    && matchesFilter(filters.dealType, r.dealType)
    && matchesFilter(filters.owner, r.owner)
    && matchesFilter(filters.portfolio, r.portfolio)
    && matchesFilter(filters.serviceLine, r.serviceLine)
    && matchesFilter(filters.partner, r.partner)
    && matchesFilter(filters.solutionAccelerator, r.solutionAccelerator);
}

function dealTableHeader(group, sc, sd) {
  return `<tr>
    ${sortableHeader(group, "company", "Company / Deal", sc, sd)}
    ${sortableHeader(group, "owner", "Owner", sc, sd)}
    ${sortableHeader(group, "closeDate", "Close Date", sc, sd)}
    ${sortableHeader(group, "stage", "Stage", sc, sd)}
    ${sortableHeader(group, "dealType", "Deal Type", sc, sd)}
    ${sortableHeader(group, "forecastCat", "Forecast", sc, sd)}
    ${sortableHeader(group, "tcv", "TCV", sc, sd, true)}
    ${sortableHeader(group, "acv", "ACV", sc, sd, true)}
    ${sortableHeader(group, "fy27rev", "FY27 Rev", sc, sd, true)}
    ${sortableHeader(group, "q2rev", "Q2 Rev", sc, sd, true)}
    ${sortableHeader(group, "q3rev", "Q3 Rev", sc, sd, true)}
    ${sortableHeader(group, "q4rev", "Q4 Rev", sc, sd, true)}
  </tr>`;
}

function dealTableRow(r) {
  return `<tr class="row-link" data-deal-id="${r.id}">
    <td><div style="font-weight:500">${esc(r.company)}</div><div style="font-size:11.5px;color:#8393A0">${esc(r.deal)}</div></td>
    <td style="color:#5C6D72">${esc(r.owner)}</td>
    <td style="color:#5C6D72;white-space:nowrap">${fmtDate(r.closeDate)}</td>
    <td style="color:#5C6D72">${esc(r.stage)}</td>
    <td style="color:#5C6D72">${esc(r.dealType)}</td>
    <td>${forecastBadge(r.forecastCat)}</td>
    <td class="num" style="font-weight:500">${fmtNumAbbrev(r.tcv)}</td>
    <td class="num">${fmtNumAbbrev(r.acv)}</td>
    <td class="num">${fmtNumAbbrev(r.fy27rev)}</td>
    <td class="num">${fmtNumAbbrev(r.q2rev)}</td>
    <td class="num">${fmtNumAbbrev(r.q3rev)}</td>
    <td class="num">${fmtNumAbbrev(r.q4rev)}</td>
  </tr>`;
}

function outcomeBadge(outcome) {
  const won = outcome === "Won";
  return `<span class="badge" style="background:${won ? "#DCEEE0" : "#FBEAE5"};color:${won ? "#2E7D4F" : "#A8402B"}">${esc(outcome || "—")}</span>`;
}

// Closed Deals table -- same filter dimensions/row shape as Target Deals
// (see dealFilterRow/dealMatchesAllFilters, reused as-is) plus an Outcome
// column and no ACV-less/quarterly gaps since the HubSpot pull carries them
// for closed deals too (see normalize.normalize_closed_deals_hubspot).
function closedDealTableHeader(group, sc, sd) {
  return `<tr>
    ${sortableHeader(group, "company", "Company / Deal", sc, sd)}
    ${sortableHeader(group, "owner", "Owner", sc, sd)}
    ${sortableHeader(group, "closeDate", "Close Date", sc, sd)}
    ${sortableHeader(group, "stage", "Stage", sc, sd)}
    ${sortableHeader(group, "outcome", "Outcome", sc, sd)}
    ${sortableHeader(group, "forecastCat", "Forecast", sc, sd)}
    ${sortableHeader(group, "tcv", "TCV", sc, sd, true)}
    ${sortableHeader(group, "acv", "ACV", sc, sd, true)}
    ${sortableHeader(group, "fy27rev", "FY27 Rev", sc, sd, true)}
    ${sortableHeader(group, "q2rev", "Q2 Rev", sc, sd, true)}
    ${sortableHeader(group, "q3rev", "Q3 Rev", sc, sd, true)}
    ${sortableHeader(group, "q4rev", "Q4 Rev", sc, sd, true)}
  </tr>`;
}

function closedDealTableRow(r) {
  return `<tr class="row-link" data-closed-deal-id="${r.id}">
    <td><div style="font-weight:500">${esc(r.company)}</div><div style="font-size:11.5px;color:#8393A0">${esc(r.deal)}</div></td>
    <td style="color:#5C6D72">${esc(r.owner)}</td>
    <td style="color:#5C6D72;white-space:nowrap">${fmtDate(r.closeDate)}</td>
    <td style="color:#5C6D72">${esc(r.stage)}</td>
    <td>${outcomeBadge(r.outcome)}</td>
    <td>${forecastBadge(r.forecastCat)}</td>
    <td class="num" style="font-weight:500">${fmtNumAbbrev(r.tcv)}</td>
    <td class="num">${fmtNumAbbrev(r.acv)}</td>
    <td class="num">${fmtNumAbbrev(r.fy27rev)}</td>
    <td class="num">${fmtNumAbbrev(r.q2rev)}</td>
    <td class="num">${fmtNumAbbrev(r.q3rev)}</td>
    <td class="num">${fmtNumAbbrev(r.q4rev)}</td>
  </tr>`;
}

function renderTargetDeals() {
  const d = state.data;
  // Quarter stays a filter dimension even though the column now shows the
  // raw Close Date -- see fiscalQuarterLabel.
  const rows = d.targetDeals.map((r) => ({ ...r, quarter: fiscalQuarterLabel(r.closeDate) }));

  const f = state.targetFilters;
  let filtered = rows.filter((r) => dealMatchesAllFilters(f, r));
  filtered = sortRows(filtered, state.targetSortCol, state.targetSortDir);
  const shown = filtered.slice(0, 25);
  const sc = state.targetSortCol, sd = state.targetSortDir;

  return `
    ${pageHeader("Pipeline", "Target Deals", `${fmtNum(filtered.length)} deals matching filters &bull; showing top ${Math.min(25, filtered.length)} &bull; click a column header to sort, or a row for full detail`)}
    ${dealFilterRow("target", f, rows)}
    <div class="card" style="overflow:hidden">
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead>${dealTableHeader("target", sc, sd)}</thead>
        <tbody>${shown.map(dealTableRow).join("")}</tbody>
      </table>
      </div>
      ${shown.length === 0 ? `<div style="padding:40px 20px;text-align:center;color:#8393A0;font-size:13px">No deals match these filters.</div>` : ""}
    </div>`;
}

// ---- Large deal list (shared with the old chip-based pattern) ----

function renderDealList(kind, title, rows, extraCols) {
  const regionKey = kind + "Region", sortKey = kind + "Sort";
  const region = state[regionKey], sort = state[sortKey];
  let filtered = region === "All" ? rows : rows.filter((r) => r.region === region);
  filtered = [...filtered].sort((a, b) => {
    if (sort === "closeDate") return new Date(a.closeDate || 0) - new Date(b.closeDate || 0);
    return b[sort] - a[sort];
  });
  const shown = filtered.slice(0, 25);
  const regions = ["All", ...new Set(rows.map((r) => r.region))];
  const extraCol = extraCols[0];
  const extraField = extraCol === "Deal Type" ? "dealType" : "serviceLine";

  return `
    ${pageHeader("Pipeline", title, `${fmtNum(filtered.length)} deals matching filter &bull; showing top ${Math.min(25, filtered.length)} by ${sort === "fy27rev" ? "FY27 Rev" : sort === "closeDate" ? "close date" : "TCV"}`)}
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div style="display:flex;gap:6px">
        ${regions.map((r) => `<div class="chip ${region === r ? "active" : ""}" data-set="${regionKey}" data-value="${esc(r)}">${esc(r)}</div>`).join("")}
      </div>
      <div style="width:1px;height:20px;background:#E3E8EE"></div>
      <div style="display:flex;gap:6px">
        ${[["tcv", "TCV"], ["fy27rev", "FY27 Rev"], ["closeDate", "Close Date"]].map(([v, l]) => `<div class="chip ${sort === v ? "active" : ""}" data-set="${sortKey}" data-value="${v}">Sort: ${l}</div>`).join("")}
      </div>
    </div>
    <div class="card" style="overflow:hidden">
      <table class="data-table">
        <thead><tr><th>Company / Deal</th><th>Owner</th><th>Region</th><th>${extraCol}</th><th>Stage</th><th>Forecast</th><th class="num">TCV</th><th class="num">FY27 Rev</th></tr></thead>
        <tbody>
          ${shown.map((r) => `<tr class="row-link" data-deal-id="${r.id}">
            <td><div style="font-weight:500">${esc(r.company)}</div><div style="font-size:11.5px;color:#8393A0">${esc(r.deal)}</div></td>
            <td style="color:#5C6D72">${esc(r.owner)}</td>
            <td style="color:#5C6D72">${esc(r.region)}</td>
            <td style="color:#5C6D72">${esc(r[extraField])}</td>
            <td style="color:#5C6D72">${esc(r.stage)}</td>
            <td>${forecastBadge(r.forecastCat)}</td>
            <td class="num" style="font-weight:500">${fmtM(r.tcv)}</td>
            <td class="num">${fmtM(r.fy27rev)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ---- Forecast & Stage ----

function renderForecast() {
  const d = state.data;
  const maxFcTcv = Math.max(...d.forecastCategories.map((f) => f.tcv), 1);
  const maxStageTcv = Math.max(...d.stages.map((s) => s.tcv), 1);
  return `
    ${pageHeader("Pipeline", "Forecast Category & Stage", "Standard deals only")}
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:16px">By Forecast Category</div>
        ${d.forecastCategories.map((f) => barRow(f.name, `${fmtNum(f.deals)} deals &bull; ${fmtM(f.tcv)} TCV &bull; ${fmtM(f.weighted)} wtd`, (f.tcv / maxFcTcv) * 100, "#356094")).join("")}
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:16px">By Stage</div>
        ${d.stages.map((s) => barRow(s.name, `${fmtNum(s.deals)} deals &bull; ${fmtM(s.tcv)} TCV &bull; ${fmtM(s.weighted)} wtd`, (s.tcv / maxStageTcv) * 100, "#3D9B99")).join("")}
      </div>
    </div>`;
}

// ---- Deal Health & Risk ----

function renderRisk() {
  const d = state.data;
  const h = d.salesHygiene;
  let rows = h.flags;
  if (state.riskFilter === "Critical") rows = rows.filter((f) => f.issues >= 3);
  else if (state.riskFilter === "Minor") rows = rows.filter((f) => f.issues >= 1 && f.issues < 3);
  rows = [...rows].sort((a, b) => state.riskSort === "issues" ? b.issues - a.issues : (b.daysStale || 0) - (a.daysStale || 0));
  rows = rows.slice(0, 30);

  return `
    ${pageHeader("Pipeline", "Deal Health & Risk", "Surfaces the workbook's hygiene flags proactively so leaders catch stalled or ungoverned deals before QBR, not during it.")}
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Deals Evaluated</div><div style="font-weight:600;font-size:22px">${h.totalEvaluated}</div></div>
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Clean (0 Issues)</div><div style="font-weight:600;font-size:22px;color:#3D9B99">${h.clean}</div></div>
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Minor (1&ndash;2 Issues)</div><div style="font-weight:600;font-size:22px;color:#D9A441">${h.minor}</div></div>
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Critical (3+ Issues)</div><div style="font-weight:600;font-size:22px;color:#C4593E">${h.critical}</div></div>
    </div>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div style="display:flex;gap:6px">
        ${["All", "Critical", "Minor"].map((r) => `<div class="chip ${state.riskFilter === r ? "active" : ""}" data-set="riskFilter" data-value="${r}">${r}</div>`).join("")}
      </div>
      <div style="width:1px;height:20px;background:#E3E8EE"></div>
      <div style="display:flex;gap:6px">
        ${[["issues", "Issues"], ["daysStale", "Days Stale"]].map(([v, l]) => `<div class="chip ${state.riskSort === v ? "active" : ""}" data-set="riskSort" data-value="${v}">Sort: ${l}</div>`).join("")}
      </div>
    </div>
    <div class="card" style="overflow:hidden">
      <div style="padding:16px 22px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B">Worst Offenders</div>
      <table class="data-table">
        <thead><tr><th>Issues</th><th>Deal</th><th>Owner</th><th>Stage</th><th class="num">TCV</th><th class="num">Days Stale</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr ${r.dealId !== null && r.dealId !== undefined ? `class="row-link" data-deal-id="${r.dealId}"` : ""}>
            <td><span class="badge" style="background:${r.issues >= 3 ? "#C4593E" : r.issues >= 1 ? "#D9A441" : "#3D9B99"};color:#fff;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border-radius:7px;font-weight:600">${r.issues}</span></td>
            <td style="font-weight:500">${esc(r.deal)}</td>
            <td style="color:#5C6D72">${esc(r.owner)}</td>
            <td style="color:#5C6D72">${esc(r.stage)}</td>
            <td class="num">${fmtM(r.tcv)}</td>
            <td class="num" style="color:#5C6D72">${r.daysStale === null || r.daysStale === undefined ? "—" : r.daysStale + "d"}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ---- Regional Performance ----

function renderRegional() {
  const d = state.data;
  return `
    ${pageHeader("Performance", "Regional Performance", "Standard deals (&lt;$10M TCV) &bull; pipeline, coverage &amp; stage mix by region")}
    <div class="card" style="padding:22px 24px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:0.8fr repeat(5,1fr);gap:8px;font-size:12.5px">
        <div style="font-weight:600;color:#8393A0">Region</div>
        <div class="num" style="font-weight:600;color:#8393A0"># Deals</div>
        <div class="num" style="font-weight:600;color:#8393A0">Total TCV</div>
        <div class="num" style="font-weight:600;color:#8393A0">FY27 Revenue</div>
        <div class="num" style="font-weight:600;color:#8393A0">Weighted</div>
        <div class="num" style="font-weight:600;color:#8393A0">Wtd / FY27%</div>
        ${d.regionalPerformance.map((r) => `
          <div style="grid-column:1/-1;height:1px;background:#EEF1F5"></div>
          <div style="padding:9px 0;font-weight:500">${esc(r.region)}</div>
          <div class="num" style="padding:9px 0">${fmtNum(r.deals)}</div>
          <div class="num" style="padding:9px 0">${fmtM(r.tcv)}</div>
          <div class="num" style="padding:9px 0">${fmtM(r.fy27rev)}</div>
          <div class="num" style="padding:9px 0">${fmtM(r.weighted)}</div>
          <div class="num" style="padding:9px 0">${fmtPct(r.wtdPct, 1)}</div>
        `).join("")}
      </div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">
      ${d.regionalPerformance.filter((r) => r.region !== "Unspecified").map((r) => `<div class="card" style="padding:20px 22px">
        <div style="font-weight:600;font-size:17px;margin-bottom:4px">${esc(r.region)}</div>
        <div style="font-size:12px;color:#8393A0;margin-bottom:14px">${fmtNum(r.deals)} open deals</div>
        <div style="font-weight:600;font-size:24px;color:#26476B;margin-bottom:2px">${fmtM(r.fy27rev)}</div>
        <div style="font-size:11.5px;color:#5C6D72">FY27 Revenue</div>
      </div>`).join("")}
    </div>`;
}

// ---- Seller Leaderboard ----

function renderLeaderboard() {
  const d = state.data;
  const filtered = d.sellers.filter((s) => state.lbRegion === "All" || s.region === state.lbRegion);
  const sorted = [...filtered].sort((a, b) => b[state.lbSort] - a[state.lbSort]);
  const regions = ["All", ...new Set(d.sellers.map((s) => s.region))];

  return `
    ${pageHeader("Performance", "Seller Leaderboard", "Ranked by FY27 pipeline revenue &bull; from Seller Performance tab")}
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div style="display:flex;gap:6px">
        ${regions.map((r) => `<div class="chip ${state.lbRegion === r ? "active" : ""}" data-set="lbRegion" data-value="${esc(r)}">${esc(r)}</div>`).join("")}
      </div>
      <div style="width:1px;height:20px;background:#E3E8EE"></div>
      <div style="display:flex;gap:6px">
        ${[["fy27rev", "FY27 Rev"], ["weighted", "Weighted"], ["winRate", "Win Rate"]].map(([v, l]) => `<div class="chip ${state.lbSort === v ? "active" : ""}" data-set="lbSort" data-value="${v}">Sort: ${l}</div>`).join("")}
      </div>
    </div>
    <div class="card" style="overflow:hidden">
      <table class="data-table">
        <thead><tr><th>Rank</th><th>Seller</th><th>Role</th><th>Region</th><th class="num">FY27 Revenue</th><th class="num">Weighted</th><th class="num"># Deals</th><th class="num">Win Rate</th></tr></thead>
        <tbody>
          ${sorted.map((s, i) => `<tr class="row-link" data-seller-id="${s.id}">
            <td style="font-weight:600;color:${i === 0 ? "#ABCF02" : i < 3 ? "#356094" : "#8393A0"}">#${i + 1}</td>
            <td style="font-weight:500">${esc(s.name)}</td>
            <td style="color:#5C6D72">${esc(s.role)}</td>
            <td style="color:#5C6D72">${esc(s.region)}</td>
            <td class="num" style="font-weight:500">${fmtM(s.fy27rev)}</td>
            <td class="num" style="color:#5C6D72">${fmtM(s.weighted)}</td>
            <td class="num" style="color:#5C6D72">${fmtNum(s.deals)}</td>
            <td class="num" style="color:#5C6D72">${fmtPct(s.winRate, 0)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// ---- Seller Performance (full-column table) & Seller Detail ----

function sellerQuota(v) { return v === null || v === undefined ? "—" : fmtM(v); }

function renderSellerPerformance() {
  const d = state.data;
  const f = state.sellerFilters;
  const regionOpts = uniqueOptionsWithBlank(d.sellers.map((s) => s.region));
  const roleOpts = uniqueOptionsWithBlank(d.sellers.map((s) => s.role));

  let filtered = d.sellers.filter((s) => matchesFilter(f.region, s.region) && matchesFilter(f.role, s.role));
  filtered = sortRows(filtered, state.sellerSortCol, state.sellerSortDir);
  const sc = state.sellerSortCol, sd = state.sellerSortDir;

  return `
    ${pageHeader("Performance", "Seller Performance", `${fmtNum(filtered.length)} sellers &bull; every column from the Seller Performance tab &bull; click a column header to sort, or a row for full detail`)}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      ${filterFlyout("seller", "region", "Region", f.region, regionOpts)}
      ${filterFlyout("seller", "role", "Role", f.role, roleOpts)}
    </div>
    <div class="card" style="overflow:hidden">
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          ${sortableHeader("seller", "name", "Name", sc, sd)}
          ${sortableHeader("seller", "annualQuota", "Quota", sc, sd, true)}
          ${sortableHeader("seller", "ytdAttainment", "YTD Attain. %", sc, sd, true)}
          ${sortableHeader("seller", "committedAttainment", "Committed Attain. %", sc, sd, true)}
          ${sortableHeader("seller", "deals", "# Deals", sc, sd, true)}
          ${sortableHeader("seller", "ecnb", "ECNB", sc, sd, true)}
          ${sortableHeader("seller", "ncnb", "NCNB", sc, sd, true)}
          ${sortableHeader("seller", "totalAcv", "Total ACV", sc, sd, true)}
          ${sortableHeader("seller", "totalTcv", "Total TCV", sc, sd, true)}
          ${sortableHeader("seller", "fy27rev", "FY27 Revenue", sc, sd, true)}
          ${sortableHeader("seller", "h1Rev", "H1 Revenue", sc, sd, true)}
          ${sortableHeader("seller", "h2Rev", "H2 Revenue", sc, sd, true)}
          ${sortableHeader("seller", "weighted", "Weighted FY27", sc, sd, true)}
          ${sortableHeader("seller", "fy27DealsWon", "FY27 Deals Won", sc, sd, true)}
          ${sortableHeader("seller", "fy26DealsWon", "FY26 Deals Won", sc, sd, true)}
        </tr></thead>
        <tbody>
          ${filtered.map((s) => `<tr class="row-link" data-seller-id="${s.id}">
            <td style="font-weight:500">${esc(s.name)}</td>
            <td class="num">${sellerQuota(s.annualQuota)}</td>
            <td class="num">${fmtPctOrDash(s.ytdAttainment, 0)}</td>
            <td class="num">${fmtPctOrDash(s.committedAttainment, 0)}</td>
            <td class="num">${fmtNum(s.deals)}</td>
            <td class="num">${fmtNum(s.ecnb)}</td>
            <td class="num">${fmtNum(s.ncnb)}</td>
            <td class="num">${fmtM(s.totalAcv)}</td>
            <td class="num">${fmtM(s.totalTcv)}</td>
            <td class="num" style="font-weight:500">${fmtM(s.fy27rev)}</td>
            <td class="num">${fmtM(s.h1Rev)}</td>
            <td class="num">${fmtM(s.h2Rev)}</td>
            <td class="num">${fmtM(s.weighted)}</td>
            <td class="num">${fmtNum(s.fy27DealsWon)}</td>
            <td class="num">${fmtNum(s.fy26DealsWon)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      </div>
      ${filtered.length === 0 ? `<div style="padding:40px 20px;text-align:center;color:#8393A0;font-size:13px">No sellers match these filters.</div>` : ""}
    </div>`;
}

function statCard(label, value) {
  return `<div class="card" style="padding:16px 14px">
    <div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">${esc(label)}</div>
    <div style="font-weight:600;font-size:21px">${value}</div>
  </div>`;
}

function renderSellerDetail() {
  const link = backLink();
  const detail = state.sellerDetail;

  if (!detail) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">Loading seller&hellip;</div>`;
  }
  if (detail.error) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">${esc(detail.error)}</div>`;
  }

  const q = detail.quota, mix = detail.dealMix, rev = detail.revenue, wl = detail.winLoss;

  return `
    <div style="margin-bottom:14px">${link}</div>
    <div style="margin-bottom:18px">
      <div class="eyebrow">${esc(detail.role)} &bull; ${esc(detail.region)}</div>
      <h1>${esc(detail.name)}</h1>
    </div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      ${statCard("Quota", sellerQuota(q.annualQuota))}
      ${statCard("FY27 Revenue", fmtM(rev.fy27Revenue))}
      ${statCard("Weighted FY27", fmtM(rev.weightedFY27))}
      ${statCard("FY27 Win Rate", fmtPct(wl.fy27WinRate, 0))}
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Quota &amp; Attainment</div>
        ${overviewField("Annual Quota", sellerQuota(q.annualQuota))}
        ${overviewField("YTD Attainment", fmtPctOrDash(q.ytdAttainment, 0))}
        ${overviewField("Committed Attainment", fmtPctOrDash(q.committedAttainment, 0))}
        ${overviewField("Commit %", fmtPct(q.commitPct, 0))}
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin:20px 0 8px">Deal Mix</div>
        ${overviewField("# Deals", fmtNum(mix.deals))}
        ${overviewField("ECEB", fmtNum(mix.eceb))}
        ${overviewField("ECNB", fmtNum(mix.ecnb))}
        ${overviewField("NCNB", fmtNum(mix.ncnb))}
        ${overviewField("Large Deals (≥$10M)", fmtNum(mix.largeDeals))}
        ${overviewField("Large Deal FY27 $", fmtM(mix.largeFy27))}
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Revenue</div>
        ${overviewField("Total ACV", fmtM(rev.totalAcv))}
        ${overviewField("Total TCV", fmtM(rev.totalTcv))}
        ${overviewField("FY27 Revenue", fmtM(rev.fy27Revenue))}
        ${overviewField("H1 Revenue", fmtM(rev.h1Rev))}
        ${overviewField("H2 Revenue", fmtM(rev.h2Rev))}
        ${overviewField("Weighted FY27", fmtM(rev.weightedFY27))}
        ${overviewField("FY27 Carry-Forward", fmtM(rev.fy27CarryForward))}
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin:20px 0 8px">Win / Loss</div>
        ${overviewField("FY27 Deals Won", fmtNum(wl.fy27DealsWon))}
        ${overviewField("FY27 Win Rate", fmtPct(wl.fy27WinRate, 0))}
        ${overviewField("FY27 Won YTD", fmtM(wl.fy27WonYtd))}
        ${overviewField("FY26 Deals Won", fmtNum(wl.fy26DealsWon))}
        ${overviewField("FY26 Win Rate", fmtPct(wl.fy26WinRate, 0))}
        ${overviewField("FY26 Won (FY27 Rev)", fmtM(wl.fy26WonFy27Rev))}
      </div>
    </div>

    <div class="card" style="overflow:hidden">
      <div style="padding:16px 22px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B">Open Deals (${fmtNum(detail.deals.length)})</div>
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead>${dealTableHeader("sellerDeals", state.sellerDealsSortCol, state.sellerDealsSortDir)}</thead>
        <tbody>${sortRows(detail.deals, state.sellerDealsSortCol, state.sellerDealsSortDir).map(dealTableRow).join("")}</tbody>
      </table>
      </div>
      ${detail.deals.length === 0 ? `<div style="padding:40px 20px;text-align:center;color:#8393A0;font-size:13px">No open deals for this seller.</div>` : ""}
    </div>`;
}

// ---- Win / Loss ----

function renderWinloss() {
  const d = state.data;
  const c = d.closedFY27;
  const maxWinRate = Math.max(...c.byRegion.map((r) => r.winRate), 0.0001);
  return `
    ${pageHeader("Performance", "Win / Loss Analysis", `Closed FY27 &bull; ${c.won} won (${fmtM(c.wonTCV)} TCV) &bull; ${c.lost} lost (${fmtM(c.lostTCV)} TCV) &bull; win rate ${fmtPct(c.winRate, 1)}`)}
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px">
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Won</div><div style="font-weight:600;font-size:22px;color:#3D9B99">${c.won}</div></div>
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Lost</div><div style="font-weight:600;font-size:22px;color:#C4593E">${c.lost}</div></div>
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Win Rate</div><div style="font-weight:600;font-size:22px">${fmtPct(c.winRate, 1)}</div></div>
      <div class="card" style="padding:18px 20px"><div style="font-size:11px;color:#8393A0;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Won FY27 Revenue</div><div style="font-weight:600;font-size:22px;color:#26476B">${fmtM(c.wonFY27Revenue)}</div></div>
    </div>
    <div class="card" style="padding:22px 24px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:16px">Win Rate by Region</div>
      ${c.byRegion.map((w) => barRow(w.region, `${w.won} won &bull; ${w.lost} lost &bull; ${fmtPct(w.winRate, 0)} win rate`, (w.winRate / maxWinRate) * 100, "#3D9B99")).join("")}
    </div>`;
}

// ---- Closed Deals (Won vs. Lost, full 9-dimension filter row) ----

function renderClosedDeals() {
  const d = state.data;
  const allRows = d.closedDealExplorer.map((r) => ({ ...r, quarter: fiscalQuarterLabel(r.closeDate) }));

  // KPI cards always reflect the 9-dimension filters only -- the Won/Lost/All
  // chip below narrows just the table, so switching it doesn't make the win
  // rate card disappear (it's the point of the page).
  const f = state.closedFilters;
  const dimFiltered = allRows.filter((r) => dealMatchesAllFilters(f, r));
  const won = dimFiltered.filter((r) => r.won);
  const lost = dimFiltered.filter((r) => !r.won);
  const total = won.length + lost.length;
  const winRate = total ? won.length / total : 0;
  const wonTCV = won.reduce((s, r) => s + (r.tcv || 0), 0);
  const lostTCV = lost.reduce((s, r) => s + (r.tcv || 0), 0);

  let shownRows = state.closedOutcome === "All" ? dimFiltered : dimFiltered.filter((r) => r.outcome === state.closedOutcome);
  shownRows = sortRows(shownRows, state.closedSortCol, state.closedSortDir);
  const shown = shownRows.slice(0, 60);
  const sc = state.closedSortCol, sd = state.closedSortDir;

  return `
    ${pageHeader("Performance", "Closed Deals", `Closed FY27 &bull; ${fmtNum(total)} deals matching filters &bull; click a column header to sort, or a row for full detail`)}
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Won</div><div style="font-weight:600;font-size:21px;color:#3D9B99">${fmtNum(won.length)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Lost</div><div style="font-weight:600;font-size:21px;color:#C4593E">${fmtNum(lost.length)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Win Rate</div><div style="font-weight:600;font-size:21px">${fmtPct(winRate, 1)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Won TCV / Lost TCV</div><div style="font-weight:600;font-size:17px"><span style="color:#3D9B99">${fmtM(wonTCV)}</span> <span style="color:#8393A0;font-weight:400">/</span> <span style="color:#C4593E">${fmtM(lostTCV)}</span></div></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${["All", "Won", "Lost"].map((o) => `<div class="chip ${state.closedOutcome === o ? "active" : ""}" data-set="closedOutcome" data-value="${o}">${o}</div>`).join("")}
    </div>
    ${dealFilterRow("closed", f, allRows)}
    <div class="card" style="overflow:hidden">
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead>${closedDealTableHeader("closed", sc, sd)}</thead>
        <tbody>${shown.map(closedDealTableRow).join("")}</tbody>
      </table>
      </div>
      ${shown.length === 0 ? `<div style="padding:40px 20px;text-align:center;color:#8393A0;font-size:13px">No deals match these filters.</div>` : ""}
    </div>`;
}

// ---- Master Customer (current/previous customer companies pulled from HubSpot) ----

function customerStatusBadge(status) {
  const map = {
    "Current": { bg: "#DCEEE0", color: "#2E7D4F" },
    "Previous": { bg: "#F1F3F8", color: "#5C6D72" },
    "Current & Previous": { bg: "#E4EEF7", color: "#26476B" },
  };
  const c = map[status] || { bg: "#F1F3F8", color: "#5C6D72" };
  return `<span class="badge" style="background:${c.bg};color:${c.color}">${esc(status || "—")}</span>`;
}

// Service Lines is an array per customer (a company can span several), so it
// needs its own match rule rather than the scalar matchesFilter: no
// selection = unfiltered; otherwise at least one of the company's service
// lines (or BLANK_LABEL, if it has none) must be in the selected set.
function customerMatchesServiceLine(selected, serviceLines) {
  if (!selected.length) return true;
  if (!serviceLines || !serviceLines.length) return selected.includes(BLANK_LABEL);
  return serviceLines.some((sl) => selected.includes(sl));
}

function customerMatchesAllFilters(filters, r) {
  return matchesFilter(filters.status, r.status)
    && matchesFilter(filters.country, r.country)
    && matchesFilter(filters.industry, r.industry)
    && matchesFilter(filters.businessUnit, r.businessUnit)
    && matchesFilter(filters.icpTier, r.icpTier)
    && matchesFilter(filters.accountSalesTier, r.accountSalesTier)
    && matchesFilter(filters.owner, r.owner)
    && customerMatchesServiceLine(filters.serviceLine, r.serviceLines);
}

function customerFilterRow(filters, rows) {
  const opts = (field) => uniqueOptionsWithBlank(rows.map((r) => r[field]));
  const serviceLineOpts = uniqueOptionsWithBlank(
    rows.flatMap((r) => (r.serviceLines && r.serviceLines.length ? r.serviceLines : [null]))
  );
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
    ${filterFlyout("customer", "status", "Status", filters.status, opts("status"))}
    ${filterFlyout("customer", "country", "Country", filters.country, opts("country"))}
    ${filterFlyout("customer", "industry", "Industry", filters.industry, opts("industry"))}
    ${filterFlyout("customer", "businessUnit", "Business Unit", filters.businessUnit, opts("businessUnit"))}
    ${filterFlyout("customer", "icpTier", "ICP Tier", filters.icpTier, opts("icpTier"))}
    ${filterFlyout("customer", "accountSalesTier", "Account Tier", filters.accountSalesTier, opts("accountSalesTier"))}
    ${filterFlyout("customer", "owner", "Owner", filters.owner, opts("owner"))}
    ${filterFlyout("customer", "serviceLine", "Service Line", filters.serviceLine, serviceLineOpts)}
  </div>`;
}

function customerTableHeader(sc, sd) {
  return `<tr>
    ${sortableHeader("customer", "company", "Company", sc, sd)}
    ${sortableHeader("customer", "owner", "Owner", sc, sd)}
    ${sortableHeader("customer", "status", "Status", sc, sd)}
    ${sortableHeader("customer", "country", "Country", sc, sd)}
    ${sortableHeader("customer", "industry", "Industry", sc, sd)}
    ${sortableHeader("customer", "businessUnit", "Business Unit", sc, sd)}
    ${sortableHeader("customer", "icpTier", "ICP Tier", sc, sd)}
    ${sortableHeader("customer", "accountSalesTier", "Acct Tier", sc, sd)}
    ${sortableHeader("customer", "totalRevenue", "Total Rev", sc, sd, true)}
    ${sortableHeader("customer", "revenueFY27", "FY27 Rev", sc, sd, true)}
    ${sortableHeader("customer", "revenueFY28", "FY28 Rev", sc, sd, true)}
    ${sortableHeader("customer", "numOpenDeals", "Open", sc, sd, true)}
    ${sortableHeader("customer", "numWonDeals", "Won", sc, sd, true)}
    ${sortableHeader("customer", "numLostDeals", "Lost", sc, sd, true)}
    ${sortableHeader("customer", "numContacts", "Contacts", sc, sd, true)}
    <th>Service Lines</th>
  </tr>`;
}

function customerTableRow(r) {
  const sl = r.serviceLines && r.serviceLines.length ? r.serviceLines.join(", ") : "—";
  return `<tr class="row-link" data-customer-id="${r.id}">
    <td style="font-weight:500">${esc(r.company)}</td>
    <td style="color:#5C6D72">${esc(r.owner)}</td>
    <td>${customerStatusBadge(r.status)}</td>
    <td style="color:#5C6D72">${esc(r.country)}</td>
    <td style="color:#5C6D72">${esc(r.industry)}</td>
    <td style="color:#5C6D72">${esc(r.businessUnit)}</td>
    <td style="color:#5C6D72">${esc(r.icpTier)}</td>
    <td style="color:#5C6D72">${esc(r.accountSalesTier)}</td>
    <td class="num" style="font-weight:500">${fmtNumAbbrev(r.totalRevenue)}</td>
    <td class="num">${fmtNumAbbrev(r.revenueFY27)}</td>
    <td class="num">${fmtNumAbbrev(r.revenueFY28)}</td>
    <td class="num">${fmtNum(r.numOpenDeals)}</td>
    <td class="num">${fmtNum(r.numWonDeals)}</td>
    <td class="num">${fmtNum(r.numLostDeals)}</td>
    <td class="num">${r.numContacts === null || r.numContacts === undefined ? "—" : fmtNum(r.numContacts)}</td>
    <td style="font-size:11.5px;color:#8393A0;max-width:220px">${esc(sl)}</td>
  </tr>`;
}

function renderCustomers() {
  const d = state.data;
  const rows = d.customers;
  const search = state.customerSearch.toLowerCase();
  const f = state.customerFilters;
  let filtered = rows.filter((r) =>
    (!search || r.company.toLowerCase().includes(search)) && customerMatchesAllFilters(f, r)
  );

  // KPI cards reflect the filtered set so they narrow along with the table.
  const totalRev = filtered.reduce((s, r) => s + (r.totalRevenue || 0), 0);
  const fy27Rev = filtered.reduce((s, r) => s + (r.revenueFY27 || 0), 0);
  const current = filtered.filter((r) => r.isCurrent).length;
  const previous = filtered.filter((r) => r.isPrevious).length;

  filtered = sortRows(filtered, state.customerSortCol, state.customerSortDir);
  const shown = filtered.slice(0, 60);
  const sc = state.customerSortCol, sd = state.customerSortDir;

  return `
    ${pageHeader("Customers", "Master Customer", `${fmtNum(rows.length)} customers (current or previous, pulled from HubSpot) &bull; ${fmtNum(filtered.length)} matching filters &bull; click a column header to sort, or a row for full detail`)}
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Current</div><div style="font-weight:600;font-size:21px;color:#3D9B99">${fmtNum(current)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Previous</div><div style="font-weight:600;font-size:21px;color:#8393A0">${fmtNum(previous)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Total Revenue</div><div style="font-weight:600;font-size:21px;color:#26476B">${fmtM(totalRev)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">FY27 Revenue</div><div style="font-weight:600;font-size:21px;color:#3D9B99">${fmtM(fy27Rev)}</div></div>
    </div>
    <input class="text-input" type="text" id="customer-search" placeholder="Search company&hellip;" value="${esc(state.customerSearch)}" style="width:100%;max-width:360px;margin-bottom:14px">
    ${customerFilterRow(f, rows)}
    <div class="card" style="overflow:hidden">
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead>${customerTableHeader(sc, sd)}</thead>
        <tbody>${shown.map(customerTableRow).join("")}</tbody>
      </table>
      </div>
      ${shown.length === 0 ? `<div style="padding:40px 20px;text-align:center;color:#8393A0;font-size:13px">No customers match these filters.</div>` : ""}
    </div>`;
}

function renderCustomerDetail() {
  const link = backLink();
  const detail = state.customerDetail;

  if (!detail) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">Loading customer&hellip;</div>`;
  }
  if (detail.error) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">${esc(detail.error)}</div>`;
  }

  const o = detail.overview, rev = detail.revenue, da = detail.dealActivity, e = detail.engagement;

  return `
    <div style="margin-bottom:14px">${link}</div>
    <div style="margin-bottom:18px;display:flex;align-items:center;gap:10px">
      <div>
        <div class="eyebrow">Customer</div>
        <h1>${esc(detail.company)}</h1>
      </div>
      ${customerStatusBadge(o.status)}
    </div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Total Revenue</div><div style="font-weight:600;font-size:21px">${fmtM(rev.totalRevenue)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">FY27 Revenue</div><div style="font-weight:600;font-size:21px">${fmtM(rev.revenueFY27)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">FY28 Revenue</div><div style="font-weight:600;font-size:21px">${fmtM(rev.revenueFY28)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Annual Revenue (Est.)</div><div style="font-weight:600;font-size:21px">${rev.annualRevenue == null ? "—" : fmtM(rev.annualRevenue)}</div></div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Overview &amp; Classification</div>
        ${overviewField("Owner", o.owner)}
        ${overviewField("Country", o.country)}
        ${overviewField("Industry", o.industry)}
        ${overviewField("Business Unit", o.businessUnit)}
        ${overviewField("ICP Tier", o.icpTier)}
        ${overviewField("Account Sales Tier", o.accountSalesTier)}
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Deal Activity</div>
        ${overviewField("Open Opportunities", da.numOpenDeals)}
        ${overviewField("Closed Won (all-time)", da.numWonDeals)}
        ${overviewField("Closed Lost (all-time)", da.numLostDeals)}
        ${overviewField("Total Deals (all-time)", da.numDeals)}
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-top:16px;margin-bottom:8px">Engagement</div>
        ${overviewField("Associated Contacts", e.numContacts)}
      </div>
    </div>

    <div class="card" style="padding:20px 22px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:14px">Service Lines</div>
      ${detail.serviceLines.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${detail.serviceLines.map((sl) => `<span class="badge" style="background:#F1F3F8;color:#26476B">${esc(sl)}</span>`).join("")}</div>`
        : `<div style="color:#8393A0;font-size:13px">No service-line data in this pull's horizon (open + FY27 closed deals) &mdash; see hubspot-data/README.md.</div>`}
    </div>`;
}

// ---- Account 360 ----

function renderAccounts() {
  const d = state.data;
  const search = state.accountSearch.toLowerCase();
  const rows = d.accounts.filter((a) => a.company.toLowerCase().includes(search)).slice(0, 60);
  return `
    ${pageHeader("Performance", "Account 360", "Every open deal rolled up by account &mdash; one place to see full exposure to a single client before a renewal or QBR conversation.")}
    <input class="text-input" type="text" id="account-search" placeholder="Search accounts&hellip;" value="${esc(state.accountSearch)}" style="width:100%;max-width:360px;margin-bottom:18px">
    <div class="grid" style="grid-template-columns:repeat(2,1fr)">
      ${rows.map((a) => `<div class="card" style="padding:20px 22px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div style="font-weight:600;font-size:16px">${esc(a.company)}</div>
          <span class="badge" style="background:#F1F3F8;color:#26476B">${esc(a.dealType)}</span>
        </div>
        <div style="font-size:12.5px;color:#5C6D72;margin-bottom:14px">${esc(a.deals)}</div>
        <div style="display:flex;gap:22px">
          <div><div style="font-weight:600;font-size:17px;color:#26476B">${fmtM(a.tcv)}</div><div style="font-size:11px;color:#8393A0">Total TCV</div></div>
          <div><div style="font-weight:600;font-size:17px;color:#3D9B99">${fmtM(a.fy27rev)}</div><div style="font-size:11px;color:#8393A0">FY27 Revenue</div></div>
          <div><div style="font-weight:600;font-size:17px">${fmtPct(a.pctFY27, 0)}</div><div style="font-size:11px;color:#8393A0">% Realized FY27</div></div>
        </div>
        <div style="margin-top:12px;font-size:11.5px;color:#8393A0">${esc(a.serviceLine)}</div>
      </div>`).join("")}
    </div>`;
}

// ---- Deal Explorer ----

function renderExplorer() {
  const d = state.data;
  const search = state.explorerSearch.toLowerCase();
  // Same computed Quarter field and same 9-filter/11-column presentation as
  // Target Deals (see dealFilterRow/dealTableHeader/dealTableRow above) --
  // the only thing Explorer adds is the free-text company/deal search, and
  // the only thing it doesn't do is pre-filter to target_deal=yes.
  const rows = d.dealExplorer.map((r) => ({ ...r, quarter: fiscalQuarterLabel(r.closeDate) }));

  const ef = state.explorerFilters;
  let filtered = rows.filter((r) =>
    (!search || r.company.toLowerCase().includes(search) || r.deal.toLowerCase().includes(search)) &&
    dealMatchesAllFilters(ef, r)
  );
  filtered = sortRows(filtered, state.explorerSortCol, state.explorerSortDir);
  const shown = filtered.slice(0, 60);
  const sc = state.explorerSortCol, sd = state.explorerSortDir;

  return `
    ${pageHeader("Data", "Deal Explorer", `Every open deal, same columns &amp; filters as Target Deals but unfiltered by target flag (${fmtNum(d.meta.openDeals)} rows) &bull; click a column header to sort, or a row for full detail`)}
    <input class="text-input" type="text" id="explorer-search" placeholder="Search company or deal name&hellip;" value="${esc(state.explorerSearch)}" style="width:100%;max-width:400px;margin-bottom:14px">
    ${dealFilterRow("explorer", ef, rows)}
    <div class="card" style="overflow:hidden">
      <div style="overflow-x:auto">
      <table class="data-table">
        <thead>${dealTableHeader("explorer", sc, sd)}</thead>
        <tbody>${shown.map(dealTableRow).join("")}</tbody>
      </table>
      </div>
      ${shown.length === 0 ? `<div style="padding:40px 20px;text-align:center;color:#8393A0;font-size:13px">No deals match these filters.</div>` : ""}
    </div>`;
}

// ---- Deal Detail & Seller Detail (click-through from any listing page) ----

// Shared by both detail pages -- whichever page you clicked a row from, the
// "Back to X" link returns you there.
const DETAIL_BACK_LABELS = {
  exec: "Executive Summary", target: "Target Deals", large: "Large Deals",
  explorer: "Deal Explorer", risk: "Deal Health & Risk",
  leaderboard: "Seller Leaderboard", sellerPerf: "Seller Performance",
  sellerDetail: "Seller Detail", closedDeals: "Closed Deals",
  customers: "Master Customer",
};

function backLink() {
  const label = DETAIL_BACK_LABELS[state.detailBackTo] || "back";
  return `<a href="#" data-back-link="1" style="font-size:12.5px;color:#5C6D72">&larr; Back to ${esc(label)}</a>`;
}

function overviewField(label, value) {
  const display = value === undefined || value === null || value === "" ? "—" : value;
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid #F0F2F5;font-size:13px">
    <span style="color:#8393A0">${esc(label)}</span><span style="font-weight:500">${esc(display)}</span>
  </div>`;
}

// Shared by the open- and closed-deal detail pages -- 4 groups of HubSpot-only
// attributes (see aggregate._build_extra_groups). Every field is blank ("—")
// on a workbook-only snapshot (no HubSpot pull processed yet) since the
// backend sends None for all of them in that case, same as any other gap.
function extraGroupsHtml(detail) {
  const e = detail.engagement, wl = detail.winLoss, c = detail.contract, cx = detail.classificationExtra;
  const stalledLabel = e.isStalled === null || e.isStalled === undefined ? null : (e.isStalled ? "Yes" : "No");
  const winProbLabel = wl.winProbabilityPct === null || wl.winProbabilityPct === undefined ? null : `${wl.winProbabilityPct}%`;
  return `
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Engagement &amp; Activity</div>
        ${overviewField("Next Step", e.nextStep)}
        ${overviewField("Last Contacted", fmtDate(e.lastContacted))}
        ${overviewField("Last Activity", fmtDate(e.lastActivityDate))}
        ${overviewField("Next Activity", fmtDate(e.nextActivityDate))}
        ${overviewField("# Activities", e.numActivities)}
        ${overviewField("# Contacts Touched", e.numContactsTouched)}
        ${overviewField("Stalled?", stalledLabel)}
        ${overviewField("Deal Score", e.dealScore)}
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Win / Loss Detail</div>
        ${overviewField("Competitor", wl.competitor)}
        ${overviewField("Lost To", wl.lostToCompetitor)}
        ${overviewField("Win Remarks", wl.winRemarks)}
        ${overviewField("Win Probability", winProbLabel)}
        ${overviewField("Closed Lost Reason", wl.closedLostReason)}
      </div>
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Contract &amp; Approval</div>
        ${overviewField("Approval Tier", c.approvalTier)}
        ${overviewField("Contract Duration (mo)", c.contractDurationMonths)}
        ${overviewField("Contract Start", fmtDate(c.contractStartDate))}
        ${overviewField("Contract End", fmtDate(c.contractEndDate))}
        ${overviewField("First Invoice Date", fmtDate(c.firstInvoiceDate))}
        ${overviewField("Go-Live Date", fmtDate(c.goLiveDate))}
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Deal Classification</div>
        ${overviewField("Lead Source", cx.leadSource)}
        ${overviewField("Industry Vertical", cx.industryVertical)}
        ${overviewField("Solution Vertical", cx.solutionVertical)}
        ${overviewField("Functional Area", cx.functionalArea)}
        ${overviewField("Technology", cx.technology)}
      </div>
    </div>`;
}

function renderDealDetail() {
  const link = backLink();
  const detail = state.dealDetail;

  if (!detail) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">Loading deal&hellip;</div>`;
  }
  if (detail.error) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">${esc(detail.error)}</div>`;
  }

  const o = detail.overview, fin = detail.financials, cls = detail.classification;
  const maxMonth = Math.max(...detail.monthlyRevenue.map((m) => m.value), 1);

  return `
    <div style="margin-bottom:14px">${link}</div>
    <div style="margin-bottom:18px">
      <div class="eyebrow">${esc(o.segment || "")} Deal${o.targetDeal ? " &bull; Target Deal" : ""}</div>
      <h1>${esc(detail.company)}</h1>
      <p class="page-sub">${esc(detail.deal)}</p>
    </div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">TCV</div><div style="font-weight:600;font-size:21px">${fmtM(fin.tcv)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">ACV</div><div style="font-weight:600;font-size:21px">${fmtM(fin.acv)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">FY27 Revenue</div><div style="font-weight:600;font-size:21px">${fmtM(fin.fy27Revenue)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">Weighted FY27</div><div style="font-weight:600;font-size:21px">${fmtM(fin.weightedFY27)}</div></div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Overview</div>
        ${overviewField("Owner", o.owner)}
        ${overviewField("Region", o.region)}
        ${overviewField("OBU", o.obu)}
        ${overviewField("Deal Type", o.dealType)}
        ${overviewField("Stage", o.stage)}
        ${overviewField("Forecast Category", o.forecastCat)}
        ${overviewField("Probability", fmtPct(o.probability, 0))}
        ${overviewField("Close Date", fmtDate(o.closeDate))}
        ${overviewField("Target Deal", o.targetDeal ? "Yes" : "No")}
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:14px">Quarterly Breakdown</div>
        <div style="display:grid;grid-template-columns:1fr repeat(2,1fr);gap:8px;font-size:12.5px;margin-bottom:20px">
          <div style="font-weight:600;color:#8393A0">Quarter</div>
          <div class="num" style="font-weight:600;color:#8393A0">Revenue</div>
          <div class="num" style="font-weight:600;color:#8393A0">Weighted</div>
          ${detail.quarterly.map((q) => `
            <div style="grid-column:1/-1;height:1px;background:#EEF1F5"></div>
            <div style="padding:6px 0;font-weight:500">${esc(q.quarter)}</div>
            <div class="num" style="padding:6px 0">${fmtM(q.revenue)}</div>
            <div class="num" style="padding:6px 0;color:#5C6D72">${fmtM(q.weighted)}</div>
          `).join("")}
        </div>
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Classification</div>
        ${overviewField("Portfolio", cls.portfolio)}
        ${overviewField("Service Line", cls.serviceLine)}
        ${overviewField("Partner", cls.partner)}
        ${overviewField("Solution Accelerator", cls.solutionAccelerator)}
        ${overviewField("Delivery Org", cls.delOrg)}
        ${overviewField("Source", cls.source)}
      </div>
    </div>

    <div class="card" style="padding:20px 22px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:16px">Monthly FY27 Revenue</div>
      <div style="display:flex;align-items:flex-end;gap:8px;height:130px">
        ${detail.monthlyRevenue.map((m) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div style="font-size:10px;color:#8393A0;margin-bottom:4px">${m.value > 0 ? fmtNumAbbrev(m.value) : ""}</div>
          <div style="width:100%;background:#356094;border-radius:4px 4px 0 0;height:${Math.max((m.value / maxMonth) * 100, m.value > 0 ? 4 : 0)}%;min-height:2px"></div>
          <div style="font-size:10.5px;color:#8393A0;margin-top:6px">${m.month}</div>
        </div>`).join("")}
      </div>
    </div>
    ${extraGroupsHtml(detail)}`;
}

// Closed-deal counterpart of renderDealDetail -- same layout minus fields
// that don't apply to a closed deal (ACV, forecast/probability, target-deal
// flag, quarterly weighted revenue), plus an Outcome badge up top.
function renderClosedDealDetail() {
  const link = backLink();
  const detail = state.closedDealDetail;

  if (!detail) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">Loading deal&hellip;</div>`;
  }
  if (detail.error) {
    return `<div style="margin-bottom:18px">${link}</div><div id="app-loading">${esc(detail.error)}</div>`;
  }

  const o = detail.overview, fin = detail.financials, cls = detail.classification;
  const maxMonth = Math.max(...detail.monthlyRevenue.map((m) => m.value), 1);

  return `
    <div style="margin-bottom:14px">${link}</div>
    <div style="margin-bottom:18px">
      <div class="eyebrow">Closed Deal ${outcomeBadge(o.outcome)}</div>
      <h1>${esc(detail.company)}</h1>
      <p class="page-sub">${esc(detail.deal)}</p>
    </div>

    <div class="grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">TCV</div><div style="font-weight:600;font-size:21px">${fmtM(fin.tcv)}</div></div>
      <div class="card" style="padding:16px 14px"><div style="font-size:10.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8393A0;margin-bottom:8px">FY27 Revenue</div><div style="font-weight:600;font-size:21px">${fmtM(fin.fy27Revenue)}</div></div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:16px">
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Overview</div>
        ${overviewField("Owner", o.owner)}
        ${overviewField("Region", o.region)}
        ${overviewField("OBU", o.obu)}
        ${overviewField("Deal Type", o.dealType)}
        ${overviewField("Stage", o.stage)}
        ${overviewField("Close Date", fmtDate(o.closeDate))}
      </div>
      <div class="card" style="padding:22px 24px">
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:14px">Quarterly Revenue</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;margin-bottom:20px">
          <div style="font-weight:600;color:#8393A0">Quarter</div>
          <div class="num" style="font-weight:600;color:#8393A0">Revenue</div>
          ${detail.quarterly.map((q) => `
            <div style="grid-column:1/-1;height:1px;background:#EEF1F5"></div>
            <div style="padding:6px 0;font-weight:500">${esc(q.quarter)}</div>
            <div class="num" style="padding:6px 0">${fmtM(q.revenue)}</div>
          `).join("")}
        </div>
        <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:8px">Classification</div>
        ${overviewField("Portfolio", cls.portfolio)}
        ${overviewField("Service Line", cls.serviceLine)}
        ${overviewField("Partner", cls.partner)}
        ${overviewField("Solution Accelerator", cls.solutionAccelerator)}
        ${overviewField("Source", cls.source)}
      </div>
    </div>

    <div class="card" style="padding:20px 22px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#26476B;margin-bottom:16px">Monthly FY27 Revenue</div>
      <div style="display:flex;align-items:flex-end;gap:8px;height:130px">
        ${detail.monthlyRevenue.map((m) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div style="font-size:10px;color:#8393A0;margin-bottom:4px">${m.value > 0 ? fmtNumAbbrev(m.value) : ""}</div>
          <div style="width:100%;background:#356094;border-radius:4px 4px 0 0;height:${Math.max((m.value / maxMonth) * 100, m.value > 0 ? 4 : 0)}%;min-height:2px"></div>
          <div style="font-size:10.5px;color:#8393A0;margin-top:6px">${m.month}</div>
        </div>`).join("")}
      </div>
    </div>
    ${extraGroupsHtml(detail)}`;
}

// ---- Upload ----

function renderUpload() {
  return `
    ${pageHeader("Data", "Upload Spreadsheet", "Upload a new version of the FY27 Pipeline Dashboard workbook. Every dashboard view and the Ask feature switch to it immediately, and the Trends view gains one more data point.")}
    <div class="card" style="padding:28px;max-width:560px">
      <div style="margin-bottom:16px;font-size:13.5px;color:#5C6D72">Select the <code>.xlsx</code> export (same format as the HubSpot pipeline dashboard workbook).</div>
      <input type="file" id="upload-input" accept=".xlsx" ${state.uploadBusy ? "disabled" : ""}>
      ${state.uploadBusy ? `<div style="margin-top:14px;color:#5C6D72;font-size:13px">Processing workbook&hellip; this can take a few seconds for a large file.</div>` : ""}
      ${state.uploadError ? `<div style="margin-top:14px;color:#C4593E;font-size:13px">${esc(state.uploadError)}</div>` : ""}
      ${state.data ? `<div style="margin-top:18px;padding-top:16px;border-top:1px solid #EEF1F5;font-size:12.5px;color:#8393A0">Currently loaded: refreshed ${esc(state.data.meta.refreshed)}, ${fmtNum(state.data.meta.openDeals)} open deals.</div>` : ""}
    </div>`;
}

// ---- Ask a Question ----

function renderAsk() {
  const suggestionsHtml = SUGGESTIONS.map((s) => `<div class="chip" data-ask-suggestion="${esc(s)}" style="border:none;background:#F1F3F8;color:#26476B">${esc(s)}</div>`).join("");
  const messagesHtml = state.chatMessages.map((msg) => `
    <div style="margin-bottom:18px">
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
        <div style="background:#26476B;color:#FFFFFF;padding:11px 18px;border-radius:14px 14px 2px 14px;font-size:13.5px;max-width:70%">${esc(msg.question)}</div>
      </div>
      <div class="card" style="padding:20px 22px">
        <div style="font-size:13px;color:#5C6D72;margin-bottom:14px">${esc(msg.answer)}</div>
        ${msg.hasBars ? msg.bars.map((b) => barRow(b.name, esc(b.value), b.pct, b.color)).join("") : ""}
        ${msg.hasTable ? `
          <div style="display:grid;grid-template-columns:${msg.tableCols};gap:8px;font-size:12.5px">
            ${msg.tableHeader.map((h) => `<div style="font-weight:600;color:#8393A0;padding:6px 0">${esc(h)}</div>`).join("")}
            ${msg.tableRows.map((tr) => `
              <div style="grid-column:1/-1;height:1px;background:#EEF1F5"></div>
              ${tr.cells.map((cell) => `<div style="padding:6px 0">${esc(cell)}</div>`).join("")}
            `).join("")}
          </div>` : ""}
      </div>
    </div>`).join("");

  return `
    <div style="margin-bottom:18px">
      <div class="eyebrow" style="color:#ABCF02">&#10024; New</div>
      <h1>Ask a Question</h1>
      <p class="page-sub">Type an open-ended question about the pipeline &mdash; it turns into a chart or table below.</p>
    </div>
    <div class="card" style="padding:20px 22px;margin-bottom:18px">
      <div style="display:flex;gap:10px">
        <input class="text-input" type="text" id="chat-input" placeholder="e.g. Which deals are at risk of slipping?" style="flex:1" ${state.chatBusy ? "disabled" : ""}>
        <div id="chat-submit" style="padding:13px 24px;border-radius:12px;background:#15283C;color:#ABCF02;font-weight:500;font-size:13.5px;cursor:pointer;white-space:nowrap">${state.chatBusy ? "Thinking…" : "Ask &rarr;"}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${suggestionsHtml}</div>
    </div>
    ${messagesHtml}`;
}

// ---- interactions ----

function wireInteractions() {
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const key = el.getAttribute("data-page");
      state.page = key;
      expandGroupContaining(key);
      render();
    });
  });
  document.querySelectorAll("[data-set]").forEach((el) => {
    el.addEventListener("click", () => {
      state[el.getAttribute("data-set")] = el.getAttribute("data-value");
      render();
    });
  });
  document.querySelectorAll("[data-toggle-group]").forEach((el) => {
    el.addEventListener("click", () => {
      const g = el.getAttribute("data-toggle-group");
      state.navCollapsed[g] = !state.navCollapsed[g];
      render();
    });
  });
  document.querySelectorAll("[data-flyout-toggle]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const flyoutId = el.getAttribute("data-flyout-toggle");
      state.openFlyout = state.openFlyout === flyoutId ? null : flyoutId;
      render();
    });
  });
  function filtersForGroup(group) {
    if (group === "explorer") return state.explorerFilters;
    if (group === "seller") return state.sellerFilters;
    if (group === "closed") return state.closedFilters;
    if (group === "customer") return state.customerFilters;
    return state.targetFilters;
  }
  const SORT_KEYS_BY_GROUP = {
    explorer: ["explorerSortCol", "explorerSortDir"],
    target: ["targetSortCol", "targetSortDir"],
    seller: ["sellerSortCol", "sellerSortDir"],
    sellerDeals: ["sellerDealsSortCol", "sellerDealsSortDir"],
    closed: ["closedSortCol", "closedSortDir"],
    customer: ["customerSortCol", "customerSortDir"],
  };
  document.querySelectorAll("[data-filter-key]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const group = el.getAttribute("data-filter-group");
      const filters = filtersForGroup(group);
      const arr = filters[el.getAttribute("data-filter-key")];
      const value = el.getAttribute("data-filter-value");
      const idx = arr.indexOf(value);
      if (idx === -1) arr.push(value); else arr.splice(idx, 1);
      // Deliberately leave the flyout open -- multi-select means picking
      // several values in one go, so only "Clear" or an outside click closes it.
      render();
    });
  });
  document.querySelectorAll("[data-filter-clear]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const [group, key] = el.getAttribute("data-filter-clear").split(":");
      const filters = filtersForGroup(group);
      filters[key] = [];
      render();
    });
  });
  document.querySelectorAll("[data-sort-col]").forEach((el) => {
    el.addEventListener("click", () => {
      const group = el.getAttribute("data-sort-group");
      const [colKey, dirKey] = SORT_KEYS_BY_GROUP[group] || SORT_KEYS_BY_GROUP.target;
      const col = el.getAttribute("data-sort-col");
      if (state[colKey] === col) {
        state[dirKey] = state[dirKey] === "asc" ? "desc" : "asc";
      } else {
        state[colKey] = col;
        state[dirKey] = NUMERIC_SORT_COLS.has(col) ? "desc" : "asc";
      }
      render();
    });
  });
  document.querySelectorAll("[data-deal-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-deal-id");
      state.detailBackTo = state.page;
      state.page = "deal";
      state.dealDetail = null;
      render();
      try {
        state.dealDetail = await fetchDeal(id);
      } catch (err) {
        state.dealDetail = { error: err.message };
      }
      render();
    });
  });
  document.querySelectorAll("[data-closed-deal-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-closed-deal-id");
      state.detailBackTo = state.page;
      state.page = "closedDeal";
      state.closedDealDetail = null;
      render();
      try {
        state.closedDealDetail = await fetchClosedDeal(id);
      } catch (err) {
        state.closedDealDetail = { error: err.message };
      }
      render();
    });
  });
  document.querySelectorAll("[data-customer-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-customer-id");
      state.detailBackTo = state.page;
      state.page = "customerDetail";
      state.customerDetail = null;
      render();
      try {
        state.customerDetail = await fetchCustomer(id);
      } catch (err) {
        state.customerDetail = { error: err.message };
      }
      render();
    });
  });
  document.querySelectorAll("[data-seller-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-seller-id");
      state.detailBackTo = state.page;
      state.page = "sellerDetail";
      state.sellerDetail = null;
      render();
      try {
        state.sellerDetail = await fetchSeller(id);
      } catch (err) {
        state.sellerDetail = { error: err.message };
      }
      render();
    });
  });
  const backLinkEl = document.querySelector("[data-back-link]");
  if (backLinkEl) backLinkEl.addEventListener("click", (e) => {
    e.preventDefault();
    state.page = state.detailBackTo || "exec";
    render();
  });

  const explorerSearch = document.getElementById("explorer-search");
  if (explorerSearch) explorerSearch.addEventListener("input", (e) => { state.explorerSearch = e.target.value; render(); explorerSearch.focus(); explorerSearch.selectionStart = explorerSearch.selectionEnd = explorerSearch.value.length; });

  const accountSearch = document.getElementById("account-search");
  if (accountSearch) accountSearch.addEventListener("input", (e) => { state.accountSearch = e.target.value; render(); accountSearch.focus(); accountSearch.selectionStart = accountSearch.selectionEnd = accountSearch.value.length; });

  const customerSearch = document.getElementById("customer-search");
  if (customerSearch) customerSearch.addEventListener("input", (e) => { state.customerSearch = e.target.value; render(); customerSearch.focus(); customerSearch.selectionStart = customerSearch.selectionEnd = customerSearch.value.length; });

  const uploadInput = document.getElementById("upload-input");
  if (uploadInput) uploadInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.uploadBusy = true;
    state.uploadError = null;
    render();
    try {
      state.data = await uploadWorkbook(file);
    } catch (err) {
      state.uploadError = err.message;
    } finally {
      state.uploadBusy = false;
      render();
    }
  });

  const chatInput = document.getElementById("chat-input");
  const chatSubmit = document.getElementById("chat-submit");
  const submitChat = async (q) => {
    q = (q || (chatInput ? chatInput.value : "")).trim();
    if (!q || state.chatBusy) return;
    state.chatBusy = true;
    render();
    try {
      const msg = await askQuestion(q);
      state.chatMessages.push(msg);
    } catch (err) {
      state.chatMessages.push({ question: q, answer: `Error: ${err.message}`, hasBars: false, hasTable: false });
    } finally {
      state.chatBusy = false;
      render();
    }
  };
  if (chatSubmit) chatSubmit.addEventListener("click", () => submitChat());
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitChat(); });
    chatInput.focus();
  }
  document.querySelectorAll("[data-ask-suggestion]").forEach((el) => {
    el.addEventListener("click", () => submitChat(el.getAttribute("data-ask-suggestion")));
  });

  const askCta = document.getElementById("ask-cta");
  if (askCta) askCta.addEventListener("click", () => { state.page = "ask"; render(); });
}

// Closes an open filter flyout when clicking anywhere outside it. Filter
// buttons/menu items stopPropagation() so their own clicks never reach here.
document.addEventListener("click", () => {
  if (state.openFlyout) {
    state.openFlyout = null;
    render();
  }
});

// ---- boot ----

(async function init() {
  try {
    state.data = await fetchCurrent();
  } catch (err) {
    console.error(err);
  }
  if (!state.data) state.page = "upload";
  expandGroupContaining(state.page);
  render();
})();
