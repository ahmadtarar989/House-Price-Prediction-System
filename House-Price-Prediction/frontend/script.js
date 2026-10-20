// script.js - loads results from the Flask API (or a saved snapshot on GitHub Pages) and draws the dashboard.

// If you deploy the Flask app (Render, PythonAnywhere...), put its URL here, e.g.
// const API_BASE = "https://house-price-api.onrender.com";
// Leave empty for local use or for the static GitHub Pages snapshot.
const API_BASE = "";

const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const STATIC = !API_BASE && !IS_LOCAL;   // true on GitHub Pages without a backend

const $ = (selector) => document.querySelector(selector);
const fmt = (n, d = 0) => (n === null || n === undefined) ? "-" :
  Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Could not load ${url} (not JSON). Check the file exists and the path is correct.`);
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const STATIC_FILES = {
  "/api/etl": "data/etl.json",
  "/api/eda": "data/eda.json",
  "/api/rejected": "data/rejected.json",
};
let previewCache = null;

async function getJSON(url, options) {
  if (!STATIC) return fetchJSON(API_BASE + url, options);

  if (options && options.method === "POST") {
    previewCache = null;                       // force a fresh read of the saved files
    return { status: "reloaded" };
  }
  const [path, query = ""] = url.split("?");
  if (path === "/api/preview") {
    previewCache = previewCache || await fetchJSON("data/preview.json");
    const q = new URLSearchParams(query);
    const limit = +q.get("limit"), offset = +q.get("offset");
    return {
      columns: previewCache.columns,
      rows: previewCache.rows.slice(offset, offset + limit),
      total: previewCache.rows.length,
    };
  }
  return fetchJSON(STATIC_FILES[path] + "?t=" + Date.now());   // avoid cached copies
}

const vizUrl = (file) => (STATIC ? "../visualizations/" : API_BASE + "/visualizations/") + file;

// Build a table. `rows` is an array of arrays; text goes in with textContent (safe).
function renderTable(table, headers, rows, numericFrom = 1) {
  table.innerHTML = "";
  const head = table.createTHead().insertRow();
  headers.forEach((h, i) => {
    const th = document.createElement("th");
    th.textContent = h;
    if (i >= numericFrom) th.className = "num";
    head.appendChild(th);
  });
  const body = table.createTBody();
  rows.forEach((row) => {
    const tr = body.insertRow();
    row.forEach((value, i) => {
      const td = tr.insertCell();
      td.textContent = value;
      if (i >= numericFrom) td.className = "num";
    });
  });
}

function showMessage(text) {
  const box = $("#message");
  box.textContent = text;
  box.hidden = !text;
}

// ---------- sections ----------
function renderCards(eda, etl) {
  const o = eda.overview;
  const cards = [
    ["Total rows", fmt(o.rows), `${fmt(etl.extract.rows)} in raw file`],
    ["Total columns", fmt(o.columns), `${fmt(etl.extract.columns)} in raw file`],
    ["Missing values", fmt(o.missing_values), "in the cleaned data"],
    ["Duplicate rows", fmt(o.duplicate_rows), `${fmt(eda.duplicates.repeated_ids)} repeat sales (same id)`],
  ];
  $("#cards").innerHTML = "";
  cards.forEach(([label, value, sub]) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = '<div class="value"></div><div class="label"></div><div class="sub"></div>';
    div.children[0].textContent = value;
    div.children[1].textContent = label;
    div.children[2].textContent = sub;
    $("#cards").appendChild(div);
  });
}

function renderPipeline(etl) {
  const steps = [
    ["Extract", fmt(etl.extract.rows) + " rows", `${etl.extract.columns} columns read from ${etl.extract.source_file}`],
    ["Transform", fmt(etl.transform.rows_out) + " rows", `${etl.transform.columns_out} columns after cleaning and new features`],
    ["Validate", fmt(etl.validate.passed) + " valid", `${fmt(etl.validate.failed)} rejected by Pydantic`],
    ["Load", fmt(etl.load.rows_loaded) + " loaded", `CSV and SQLite table '${etl.load.table}'`],
  ];
  $("#steps").innerHTML = "";
  steps.forEach(([name, big, small]) => {
    const li = document.createElement("li");
    li.innerHTML = "<b></b><div class='big'></div><span></span>";
    li.children[0].textContent = name;
    li.children[1].textContent = big;
    li.children[2].textContent = small;
    $("#steps").appendChild(li);
  });

  renderTable($("#transform-log"), ["Step", "What was done", "Why", "Rows affected"],
    etl.transform.log.map((l) => [l.step, l.action, l.reason, fmt(l.rows_affected)]), 3);
  document.querySelectorAll("#transform-log td:nth-child(2), #transform-log td:nth-child(3)")
    .forEach((td) => td.classList.add("wrap-text"));

  $("#rules").innerHTML = "";
  etl.validate.rules.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    $("#rules").appendChild(li);
  });
}

async function renderRejected(etl) {
  const fields = Object.entries(etl.validate.errors_by_field)
    .map(([k, v]) => `${k}: ${v}`).join(", ");
  $("#rejected-note").textContent = etl.validate.failed
    ? `${etl.validate.failed} records failed validation and were kept out of the database. Failed rules by field: ${fields}.`
    : "No records failed validation.";
  const data = await getJSON("/api/rejected");
  renderTable($("#rejected"), ["id", "price", "bedrooms", "bathrooms", "sqft_living", "Reason"],
    data.rows.map((r) => [r[0], fmt(r[1]), r[2], r[3], fmt(r[4]), r[5]]), 1);
  document.querySelectorAll("#rejected td:last-child").forEach((td) => {
    td.className = "wrap-text";
  });
}

// data preview with paging
const page = { offset: 0, size: 10 };
async function loadPreview() {
  const d = await getJSON(`/api/preview?limit=${page.size}&offset=${page.offset}`);
  renderTable($("#preview-table"), d.columns, d.rows, 0);
  const from = page.offset + 1, to = Math.min(page.offset + page.size, d.total);
  $("#page-label").textContent = `Rows ${fmt(from)} to ${fmt(to)} of ${fmt(d.total)}`;
  $("#prev").disabled = page.offset === 0;
  $("#next").disabled = page.offset + page.size >= d.total;
}

function renderInfo(eda) {
  renderTable($("#columns-table"), ["Column", "Data type", "Non-null", "Unique"],
    eda.columns.map((c) => [c.column, c.dtype, fmt(c.non_null), fmt(c.unique)]), 2);
  renderTable($("#stats-table"), ["Column", "Mean", "Median", "Std", "Min", "Max"],
    eda.statistics.map((s) => [s.column, fmt(s.mean, 2), fmt(s.median, 2), fmt(s.std, 2), fmt(s.min, 2), fmt(s.max, 2)]));
}

function renderQuality(eda) {
  const total = eda.missing.reduce((a, m) => a + m.missing, 0);
  $("#missing-note").textContent = total === 0
    ? "No missing values in any column of the cleaned dataset."
    : `${fmt(total)} missing cells found.`;
  renderTable($("#missing-table"), ["Column", "Missing", "Percent", "Significant (>5%)"],
    eda.missing.map((m) => [m.column, fmt(m.missing), m.percent + "%", m.significant ? "Yes" : "No"]));
  const d = eda.duplicates;
  renderTable($("#dup-table"), ["Check", "Count", "Percent"], [
    ["Identical rows", fmt(d.full_row_duplicates), d.full_row_percent + "%"],
    ["Repeated house id (resales)", fmt(d.repeated_ids), d.repeated_ids_percent + "%"],
  ]);
  renderTable($("#cat-table"), ["Column", "Unique values", "Most common", "Count", "Share"],
    eda.categorical.map((c) => [c.column, c.unique, c.most_common, fmt(c.count), c.percent + "%"]), 1);
}

const SECTION_TITLES = {
  quality: "Missing values", distribution: "Distributions", categorical: "Category frequencies",
  correlation: "Correlation analysis", outliers: "Outlier box plots", relationships: "Price relationships",
};
const WIDE = new Set(["distributions.png", "category_counts.png", "correlation_heatmap.png", "boxplots.png"]);

function renderCharts(eda) {
  const holder = $("#charts");
  holder.innerHTML = "";
  Object.keys(SECTION_TITLES).forEach((key) => {
    const group = eda.charts.filter((c) => c.section === key);
    if (!group.length) return;
    const h = document.createElement("h3");
    h.textContent = SECTION_TITLES[key];
    const grid = document.createElement("div");
    grid.className = "chart-group";
    group.forEach((c) => {
      const fig = document.createElement("figure");
      if (WIDE.has(c.file)) fig.className = "wide";
      const link = document.createElement("a");
      link.href = vizUrl(c.file);
      link.target = "_blank";
      const img = document.createElement("img");
      img.src = vizUrl(c.file);
      img.alt = c.title;
      img.loading = "lazy";
      link.appendChild(img);
      const cap = document.createElement("figcaption");
      const b = document.createElement("b");
      b.textContent = c.title;
      cap.appendChild(b);
      cap.appendChild(document.createTextNode(c.caption));
      fig.append(link, cap);
      grid.appendChild(fig);
    });
    holder.append(h, grid);
  });
}

function renderOutliers(eda) {
  renderTable($("#outlier-table"), ["Column", "Lower limit", "Upper limit", "Outliers", "Percent", "Max value"],
    eda.outliers.map((o) => [o.column, fmt(o.lower, 1), fmt(o.upper, 1), fmt(o.count), o.percent + "%", fmt(o.max)]));
}

function renderFindings(eda) {
  $("#findings-list").innerHTML = "";
  eda.findings.forEach((f) => {
    const li = document.createElement("li");
    li.textContent = f;
    $("#findings-list").appendChild(li);
  });
}

// ---------- start ----------
async function loadDashboard() {
  try {
    const [etl, eda] = await Promise.all([getJSON("/api/etl"), getJSON("/api/eda")]);
    showMessage("");
    renderCards(eda, etl);
    renderPipeline(etl);
    renderInfo(eda);
    renderQuality(eda);
    renderCharts(eda);
    renderOutliers(eda);
    renderFindings(eda);
    await Promise.all([renderRejected(etl), loadPreview()]);
  } catch (err) {
    showMessage(err.message);
  }
}

$("#page-size").addEventListener("change", (e) => { page.size = +e.target.value; page.offset = 0; loadPreview(); });
$("#prev").addEventListener("click", () => { page.offset = Math.max(0, page.offset - page.size); loadPreview(); });
$("#next").addEventListener("click", () => { page.offset += page.size; loadPreview(); });

$("#run-btn").addEventListener("click", async () => {
  const btn = $("#run-btn");
  btn.disabled = true;
  $("#run-status").textContent = STATIC ? "Reloading saved results..." : "Running ETL and EDA...";
  try {
    await getJSON("/api/run", { method: "POST" });
    $("#run-status").textContent = STATIC ? "Saved results loaded" : "Finished";
    page.offset = 0;
    await loadDashboard();
  } catch (err) {
    $("#run-status").textContent = "Failed: " + err.message;
  }
  btn.disabled = false;
});

if (STATIC) {
  $("#run-btn").textContent = "Reload saved results";
  $("#run-status").textContent = "Static demo (saved results)";
}

loadDashboard();
