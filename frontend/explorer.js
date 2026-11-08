/* explorer.js - interactive dashboard. Data comes from explorer-data.json (cleaned SQLite table).
   All filtering happens in the browser, so every slider/click updates the charts instantly. */
/* show any error on the page itself so problems are easy to see */
window.addEventListener("error", e => { const s = document.querySelector("#sub"); if (s) s.textContent = "Error: " + e.message; });
if (typeof Plotly === "undefined") document.querySelector("#sub").textContent = "Error: plotly.min.js not found in the frontend folder";
const $ = s => document.querySelector(s);
const money = v => "$" + Math.round(v).toLocaleString();
const short = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : "$" + Math.round(v / 1e3) + "K";
const NUM = {price:"Price", sqft_living:"Living area (sqft)", sqft_lot:"Lot size (sqft)", bedrooms:"Bedrooms", bathrooms:"Bathrooms",
  floors:"Floors", grade:"Grade", condition:"Condition", view:"View", yr_built:"Year built", house_age:"House age",
  sqft_above:"Sqft above", sqft_basement:"Sqft basement", price_per_sqft:"Price per sqft", lat:"Latitude", long:"Longitude"};
const CAT = {bedrooms:"Bedrooms", grade:"Grade", condition:"Condition", floors:"Floors", view:"View", waterfront:"Waterfront"};
const TABS = [["overview","Overview"],["explorer","Scatter explorer"],["dist","Distributions"],["map","Map"],["corr","Correlations"],["zip","Zipcodes"],["data","Data table"]];
let D, N, F, ZMED = {}, tab = "overview", ids = [], page = 0, sortKey = "price", sortDir = -1, DUAL = {};

/* ---------- helpers ---------- */
const median = a => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (a, q) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
function corr(x, y) { const n = x.length; let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n; let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; a += dx * dy; b += dx * dx; c += dy * dy; }
  return b && c ? a / Math.sqrt(b * c) : 0; }
const pick = (col, list) => list.map(i => D[col][i]);
function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("show"), 2200); }
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function layout(o = {}) {
  const ink = css("--ink"), grid = css("--line");
  const ax = { gridcolor: grid, zerolinecolor: grid, linecolor: grid, automargin: true };
  return Object.assign({ paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: ink, size: 12 },
    margin: { l: 55, r: 15, t: 10, b: 45 }, xaxis: ax, yaxis: Object.assign({}, ax), hoverlabel: { font: { size: 12 } } }, o);
}
const CFG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] };
function draw(id, traces, lay, onClick) {
  const el = document.getElementById(id);
  Plotly.react(el, traces, lay, CFG);
  if (el.removeAllListeners) el.removeAllListeners("plotly_click");
  if (onClick) el.on("plotly_click", onClick);
}

/* ---------- filters ---------- */
function initFilters() {
  const mm = c => [Math.min(...D[c]), Math.max(...D[c])];
  F = { price: mm("price"), sqft_living: mm("sqft_living"), yr_built: mm("yr_built"), grade: mm("grade"), beds: new Set(), water: "all", reno: "all", zip: "all" };
  F.bounds = { price: [...F.price], sqft_living: [...F.sqft_living], yr_built: [...F.yr_built], grade: [...F.grade] };
  const box = $("#duals"); box.innerHTML = "";
  [["price", "Price", 10000, money], ["sqft_living", "Living area", 10, v => v.toLocaleString() + " sqft"],
   ["yr_built", "Year built", 1, v => v], ["grade", "Grade", 1, v => v]].forEach(([k, label, step, f]) => dual(box, k, label, step, f));
  $("#beds").innerHTML = "";
  [1, 2, 3, 4, 5, 6, 7].forEach(b => { const c = document.createElement("button"); c.className = "chip"; c.textContent = b === 7 ? "7+" : b; c.dataset.b = b;
    c.onclick = () => { F.beds.has(b) ? F.beds.delete(b) : F.beds.add(b); syncBeds(); render(); }; $("#beds").append(c); });
  [["water", [["all", "All"], ["1", "Yes"], ["0", "No"]]], ["reno", [["all", "All"], ["1", "Yes"], ["0", "No"]]]].forEach(([k, opts]) => {
    const seg = $("#" + k); seg.innerHTML = "";
    opts.forEach(([v, t]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.dataset.v = v;
      b.onclick = () => { F[k] = v; syncSeg(); render(); }; seg.append(b); }); });
  const zs = [...new Set(D.zipcode)].sort();
  $("#zip").innerHTML = '<option value="all">All zipcodes</option>' + zs.map(z => `<option>${z}</option>`).join("");
  $("#zip").value = "all";
  syncBeds(); syncSeg();
}
function dual(box, key, label, step, f) {
  const [lo, hi] = F.bounds[key], w = document.createElement("div"); w.className = "field";
  w.innerHTML = `<label>${label}<span class="val"></span></label><div class="dual"><div class="fill"></div><input type="range"><input type="range"></div>`;
  const [a, b] = w.querySelectorAll("input"), val = w.querySelector(".val"), fill = w.querySelector(".fill");
  [a, b].forEach(i => { i.min = lo; i.max = hi; i.step = step; });
  const set = (x, y) => { F[key] = [x, y]; a.value = x; b.value = y; val.textContent = f(x) + " - " + f(y);
    const p = v => (v - lo) / (hi - lo || 1) * 100; fill.style.left = p(x) + "%"; fill.style.right = 100 - p(y) + "%"; };
  a.oninput = () => { if (+a.value > +b.value) a.value = b.value; set(+a.value, +b.value); render(); };
  b.oninput = () => { if (+b.value < +a.value) b.value = a.value; set(+a.value, +b.value); render(); };
  DUAL[key] = set; set(lo, hi); box.append(w);
}
const syncBeds = () => document.querySelectorAll("#beds .chip").forEach(c => c.classList.toggle("on", F.beds.has(+c.dataset.b)));
const syncSeg = () => ["water", "reno"].forEach(k => document.querySelectorAll(`#${k} button`).forEach(b => b.classList.toggle("on", b.dataset.v === F[k])));
function setRange(key, lo, hi) { DUAL[key](Math.max(F.bounds[key][0], lo), Math.min(F.bounds[key][1], hi)); render(); toast(`Filtered ${NUM[key] || key}`); }
function getIds() {
  const o = [], [p0, p1] = F.price, [s0, s1] = F.sqft_living, [y0, y1] = F.yr_built, [g0, g1] = F.grade;
  for (let i = 0; i < N; i++) {
    const p = D.price[i]; if (p < p0 || p > p1) continue;
    const s = D.sqft_living[i]; if (s < s0 || s > s1) continue;
    const y = D.yr_built[i]; if (y < y0 || y > y1) continue;
    const g = D.grade[i]; if (g < g0 || g > g1) continue;
    if (F.beds.size && !F.beds.has(Math.min(D.bedrooms[i], 7))) continue;
    if (F.water !== "all" && String(D.waterfront[i]) !== F.water) continue;
    if (F.reno !== "all" && String(D.yr_renovated[i] > 0 ? 1 : 0) !== F.reno) continue;
    if (F.zip !== "all" && String(D.zipcode[i]) !== F.zip) continue;
    o.push(i);
  }
  return o;
}

/* ---------- render ---------- */
let raf;
function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { ids = getIds(); page = 0; kpis(); view(); }); }
function kpis() {
  const pr = pick("price", ids), n = ids.length;
  const k = [["Houses", n.toLocaleString()], ["Median price", n ? short(median(pr)) : "-"], ["Average price", n ? short(pr.reduce((a, b) => a + b, 0) / n) : "-"],
    ["Median $/sqft", n ? "$" + Math.round(median(pick("price_per_sqft", ids))) : "-"], ["Median living area", n ? Math.round(median(pick("sqft_living", ids))).toLocaleString() + " sqft" : "-"]];
  $("#kpis").innerHTML = k.map(([a, b]) => `<div class="kpi"><span>${a}</span><b>${b}</b></div>`).join("");
  $("#sub").textContent = `${n.toLocaleString()} of ${N.toLocaleString()} houses match the filters`;
}
const VIEWS = { overview, explorer, dist, map, corr: corrTab, zip, data };
function view() { if (!ids.length) { toast("No houses match these filters"); } (VIEWS[tab] || overview)(); }

function hist(id, col, bins, color, onBar) {
  const v = pick(col, ids); if (!v.length) { Plotly.purge(id); return; }
  let lo = Math.min(...v), hi = Math.max(...v); if (lo === hi) hi = lo + 1;
  const w = (hi - lo) / bins, c = new Array(bins).fill(0);
  v.forEach(x => c[Math.min(bins - 1, Math.floor((x - lo) / w))]++);
  const xs = c.map((_, i) => lo + (i + .5) * w), isP = col.includes("price");
  draw(id, [{ type: "bar", x: xs, y: c, width: w * .95, marker: { color }, customdata: c.map((_, i) => [lo + i * w, lo + (i + 1) * w]),
    hovertemplate: (isP ? "%{customdata[0]:$,.0f}" : "%{customdata[0]:,.1f}") + " to " + (isP ? "%{customdata[1]:$,.0f}" : "%{customdata[1]:,.1f}") + "<br>%{y} houses<extra></extra>" }],
    layout({ xaxis: { title: NUM[col], gridcolor: css("--line") }, yaxis: { title: "Houses", gridcolor: css("--line") }, bargap: 0 }),
    e => onBar && onBar(e.points[0].customdata));
}
function groupMedian(col) { const m = new Map(); ids.forEach(i => { const k = D[col][i]; (m.get(k) || m.set(k, []).get(k)).push(D.price[i]); });
  return [...m.entries()].sort((a, b) => a[0] - b[0]); }

function overview() {
  hist("c-price", "price", 40, css("--accent"), r => setRange("price", r[0], r[1]));
  const m = new Map(); ids.forEach(i => { const k = D.sale_year[i] * 100 + D.sale_month[i]; (m.get(k) || m.set(k, []).get(k)).push(D.price[i]); });
  const ks = [...m.keys()].sort();
  draw("c-trend", [{ type: "scatter", mode: "lines+markers", x: ks.map(k => `${Math.floor(k / 100)}-${String(k % 100).padStart(2, "0")}`), y: ks.map(k => median(m.get(k))),
    line: { color: css("--accent2"), width: 3 }, hovertemplate: "%{x}<br>%{y:$,.0f}<extra></extra>" }],
    layout({ yaxis: { title: "Median price", tickprefix: "$", gridcolor: css("--line") } }));
  const g = groupMedian("grade");
  draw("c-grade", [{ type: "bar", x: g.map(a => a[0]), y: g.map(a => median(a[1])), marker: { color: css("--accent") }, customdata: g.map(a => a[1].length),
    hovertemplate: "Grade %{x}<br>%{y:$,.0f}<br>%{customdata} houses<extra></extra>" }],
    layout({ xaxis: { title: "Grade", dtick: 1 }, yaxis: { title: "Median price", tickprefix: "$", gridcolor: css("--line") } }),
    e => setRange("grade", e.points[0].x, e.points[0].x));
  const b = new Map(); ids.forEach(i => { const k = Math.min(D.bedrooms[i], 7); b.set(k, (b.get(k) || 0) + 1); });
  const bk = [...b.keys()].sort((x, y) => x - y);
  draw("c-beds", [{ type: "bar", x: bk.map(k => k === 7 ? "7+" : k), y: bk.map(k => b.get(k)), marker: { color: bk.map(k => F.beds.has(k) ? css("--accent2") : css("--accent")) },
    hovertemplate: "%{x} bedrooms<br>%{y} houses<extra></extra>" }],
    layout({ xaxis: { title: "Bedrooms", type: "category" }, yaxis: { title: "Houses", gridcolor: css("--line") } }),
    e => { const v = e.points[0].x === "7+" ? 7 : +e.points[0].x; F.beds.has(v) ? F.beds.delete(v) : F.beds.add(v); syncBeds(); render(); });
}

function sample(max) { const s = Math.max(1, Math.ceil(ids.length / max)), o = []; for (let i = 0; i < ids.length; i += s) o.push(ids[i]); return o; }
const CSCALE = [[0, "#1aa6a1"], [.5, "#f6c65b"], [1, "#d9463a"]];
function explorer() {
  const x = $("#sx").value, y = $("#sy").value, c = $("#sc").value, lg = $("#logy").checked, sm = sample(5000);
  const tr = [{ type: "scattergl", mode: "markers", x: pick(x, sm), y: pick(y, sm), customdata: sm,
    marker: { size: 6, opacity: .65, color: pick(c, sm), colorscale: CSCALE, cmax: quant(pick(c, ids), .98), cmin: quant(pick(c, ids), .02), showscale: true, colorbar: { title: NUM[c], thickness: 12 } },
    hovertemplate: sm.map(i => `${money(D.price[i])}<br>${D.bedrooms[i]} bd / ${D.bathrooms[i]} ba<br>${D.sqft_living[i]} sqft<br>zip ${D.zipcode[i]}`).map(t => t + "<extra></extra>") }];
  let note = `Showing ${sm.length.toLocaleString()} of ${ids.length.toLocaleString()} filtered houses. Click a dot for details.`;
  if (ids.length > 2 && $("#trend").checked) {
    const X = pick(x, ids), Y = pick(y, ids).map(v => lg ? Math.log10(Math.max(v, 1)) : v), n = X.length;
    const mx = X.reduce((a, b) => a + b, 0) / n, my = Y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0;
    X.forEach((v, i) => { sxy += (v - mx) * (Y[i] - my); sxx += (v - mx) ** 2; });
    const s = sxx ? sxy / sxx : 0, b0 = my - s * mx, x0 = Math.min(...X), x1 = Math.max(...X), f = v => lg ? 10 ** v : v;
    tr.push({ type: "scatter", mode: "lines", x: [x0, x1], y: [f(b0 + s * x0), f(b0 + s * x1)], line: { color: css("--ink"), width: 3, dash: "dash" }, name: "Trend", hoverinfo: "skip" });
    note += `  Correlation r = ${corr(X, Y).toFixed(2)}.`;
  }
  $("#scatter-note").textContent = note;
  draw("c-scatter", tr, layout({ showlegend: false, xaxis: { title: NUM[x], gridcolor: css("--line") }, yaxis: { title: NUM[y], type: lg ? "log" : "linear", gridcolor: css("--line") } }),
    e => { const p = e.points[0]; if (p.customdata !== undefined && p.curveNumber === 0) openDrawer(p.customdata); });
}
function dist() {
  hist("c-hist", $("#dv").value, +$("#bins").value, css("--accent2"), r => { const k = $("#dv").value; if (DUAL[k]) setRange(k, r[0], r[1]); else toast("Use the filters on the left for this variable"); });
  const b = $("#bv").value, g = groupMedian(b), traces = g.map(([k, v]) => ({ type: "box", y: v, name: String(k), boxpoints: false, marker: { color: css("--accent") } }));
  draw("c-box", traces, layout({ showlegend: false, xaxis: { title: CAT[b] }, yaxis: { title: "Price", tickprefix: "$", type: "log", gridcolor: css("--line") } }));
}
function map() {
  const sm = sample(8000), pr = pick("price", ids);
  draw("c-map", [{ type: "scattergl", mode: "markers", x: pick("long", sm), y: pick("lat", sm), customdata: sm,
    marker: { size: 5, opacity: .7, color: pick("price", sm), colorscale: CSCALE, cmin: quant(pr, .02), cmax: quant(pr, .98), showscale: true, colorbar: { title: "Price", thickness: 12, tickprefix: "$" } },
    hovertemplate: sm.map(i => `${money(D.price[i])}<br>zip ${D.zipcode[i]}`).map(t => t + "<extra></extra>") }],
    layout({ xaxis: { title: "Longitude", gridcolor: css("--line") }, yaxis: { title: "Latitude", scaleanchor: "x", scaleratio: 1.48, gridcolor: css("--line") }, margin: { l: 60, r: 10, t: 10, b: 45 } }),
    e => openDrawer(e.points[0].customdata));
}
const CK = ["price", "sqft_living", "bedrooms", "bathrooms", "grade", "view", "condition", "floors", "yr_built", "sqft_lot", "price_per_sqft", "sqft_basement"];
function corrTab() {
  if (ids.length < 3) return;
  const cols = CK.map(c => pick(c, ids)), M = cols.map(a => cols.map(b => corr(a, b)));
  draw("c-heat", [{ type: "heatmap", z: M, x: CK.map(c => NUM[c]), y: CK.map(c => NUM[c]), zmin: -1, zmax: 1, colorscale: "RdBu", reversescale: true,
    text: M.map(r => r.map(v => v.toFixed(2))), texttemplate: "%{text}", textfont: { size: 10 }, hovertemplate: "%{y} vs %{x}<br>r = %{z:.2f}<extra></extra>" }],
    layout({ margin: { l: 110, r: 10, t: 10, b: 110 }, yaxis: { autorange: "reversed" } }),
    e => { const p = e.points[0], x = CK[p.pointIndex[1]], y = CK[p.pointIndex[0]]; $("#sx").value = x; $("#sy").value = y; showTab("explorer"); });
  const pi = CK.indexOf("price"), o = CK.map((c, i) => [c, M[pi][i]]).filter(a => a[0] !== "price").sort((a, b) => a[1] - b[1]);
  draw("c-corr", [{ type: "bar", orientation: "h", x: o.map(a => a[1]), y: o.map(a => NUM[a[0]]), marker: { color: o.map(a => a[1] >= 0 ? css("--accent") : "#c0392b") }, hovertemplate: "%{y}<br>r = %{x:.2f}<extra></extra>" }],
    layout({ margin: { l: 130, r: 10, t: 10, b: 40 }, xaxis: { range: [-1, 1], title: "Pearson r with price", gridcolor: css("--line") } }));
}
function zip() {
  const m = $("#zm").value, n = +$("#zn").value, g = new Map();
  ids.forEach(i => { const k = D.zipcode[i]; (g.get(k) || g.set(k, []).get(k)).push(i); });
  let rows = [...g.entries()].map(([z, l]) => [z, m === "count" ? l.length : m === "ppsf" ? median(pick("price_per_sqft", l)) : median(pick("price", l)), l.length]);
  rows.sort((a, b) => b[1] - a[1]); rows = rows.slice(0, n).reverse();
  const f = v => m === "count" ? v.toLocaleString() : m === "ppsf" ? "$" + Math.round(v) : money(v);
  draw("c-zip", [{ type: "bar", orientation: "h", y: rows.map(r => "zip " + r[0]), x: rows.map(r => r[1]), customdata: rows.map(r => [r[0], f(r[1]), r[2]]), marker: { color: css("--accent") },
    hovertemplate: "%{customdata[0]}<br>%{customdata[1]}<br>%{customdata[2]} houses<extra></extra>" }],
    layout({ margin: { l: 80, r: 15, t: 10, b: 40 }, xaxis: { gridcolor: css("--line"), title: { median: "Median price", count: "Sales", ppsf: "Median $ per sqft" }[m] } }),
    e => { F.zip = String(e.points[0].customdata[0]); $("#zip").value = F.zip; render(); toast("Zipcode " + F.zip + " selected"); });
}
const TCOLS = ["id", "sale_date", "price", "bedrooms", "bathrooms", "sqft_living", "sqft_lot", "floors", "grade", "condition", "yr_built", "zipcode", "price_per_sqft"];
function data() {
  const q = $("#q").value.trim(); let l = q ? ids.filter(i => String(D.id[i]).includes(q) || String(D.zipcode[i]).includes(q)) : ids.slice();
  l.sort((a, b) => (D[sortKey][a] > D[sortKey][b] ? 1 : D[sortKey][a] < D[sortKey][b] ? -1 : 0) * sortDir);
  const per = 15, pages = Math.max(1, Math.ceil(l.length / per)); page = Math.min(page, pages - 1);
  $("#pg").textContent = `Page ${page + 1} / ${pages} (${l.length.toLocaleString()} rows)`;
  $("#tbl").innerHTML = "<thead><tr>" + TCOLS.map(c => `<th data-c="${c}">${c}${c === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr></thead><tbody>" +
    l.slice(page * per, page * per + per).map(i => `<tr data-i="${i}">` + TCOLS.map(c => `<td>${c === "price" ? money(D[c][i]) : D[c][i]}</td>`).join("") + "</tr>").join("") + "</tbody>";
  $("#tbl").querySelectorAll("th").forEach(t => t.onclick = () => { sortDir = sortKey === t.dataset.c ? -sortDir : -1; sortKey = t.dataset.c; data(); });
  $("#tbl").querySelectorAll("tbody tr").forEach(t => t.onclick = () => openDrawer(+t.dataset.i));
}

/* ---------- drawer, tabs, theme ---------- */
function openDrawer(i) {
  const z = ZMED[D.zipcode[i]], d = (D.price[i] / z - 1) * 100, o = (D.price[i] / ZMED.all - 1) * 100;
  const rows = [["Sale date", D.sale_date[i]], ["Bedrooms / bathrooms", `${D.bedrooms[i]} / ${D.bathrooms[i]}`], ["Living area", D.sqft_living[i].toLocaleString() + " sqft"], ["Lot", D.sqft_lot[i].toLocaleString() + " sqft"],
    ["Floors", D.floors[i]], ["Grade / condition", `${D.grade[i]} / ${D.condition[i]}`], ["View", D.view[i]], ["Waterfront", D.waterfront[i] ? "Yes" : "No"], ["Built / renovated", `${D.yr_built[i]} / ${D.yr_renovated[i] || "never"}`],
    ["Zipcode", D.zipcode[i]], ["Price per sqft", "$" + Math.round(D.price_per_sqft[i])]];
  const s = v => (v >= 0 ? "+" : "") + v.toFixed(0) + "%";
  $("#drawer").innerHTML = `<button class="btn ghost x" id="dx" type="button">Close</button><p class="note">House ${D.id[i]}</p><h3>${money(D.price[i])}</h3>
    <dl>${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join("")}</dl>
    <div class="delta">${s(d)} vs median of zip ${D.zipcode[i]} (${short(z)})</div><div class="delta">${s(o)} vs county median (${short(ZMED.all)})</div>
    <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${D.lat[i]},${D.long[i]}">Open in Google Maps</a>`;
  $("#drawer").hidden = false; $("#dx").onclick = () => $("#drawer").hidden = true;
}
function showTab(t) {
  tab = t; TABS.forEach(([k]) => { $("#p-" + k).hidden = k !== t; });
  document.querySelectorAll("#tabs button").forEach(b => { b.classList.toggle("on", b.dataset.t === t); b.setAttribute("aria-selected", b.dataset.t === t); });
  view(); setTimeout(() => window.dispatchEvent(new Event("resize")), 30);
}
function fillSelect(id, obj, val, keys) { $(id).innerHTML = (keys || Object.keys(obj)).map(k => `<option value="${k}">${obj[k]}</option>`).join(""); $(id).value = val; }

async function boot() {
  let r;
  try { r = await (await fetch("explorer-data.json")).json(); } catch (e) { r = { error: String(e) }; }
  if (r.error) { $("#sub").textContent = r.error; return; }
  D = r.data; N = r.n;
  const byZ = {}; for (let i = 0; i < N; i++) (byZ[D.zipcode[i]] = byZ[D.zipcode[i]] || []).push(D.price[i]);
  for (const z in byZ) ZMED[z] = median(byZ[z]); ZMED.all = median(D.price);
  $("#tabs").innerHTML = TABS.map(([k, t]) => `<button type="button" role="tab" data-t="${k}">${t}</button>`).join("");
  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => showTab(b.dataset.t));
  const nk = Object.keys(NUM).filter(k => k !== "lat" && k !== "long");
  fillSelect("#sx", NUM, "sqft_living", nk); fillSelect("#sy", NUM, "price", nk); fillSelect("#sc", NUM, "grade", nk);
  fillSelect("#dv", NUM, "price", nk); fillSelect("#bv", CAT, "grade");
  initFilters();
  ["#sx", "#sy", "#sc", "#logy", "#trend", "#dv", "#bv", "#zm"].forEach(s => $(s).onchange = view);
  $("#bins").oninput = () => { $("#bins-v").textContent = $("#bins").value; dist(); };
  $("#zn").oninput = () => { $("#zn-v").textContent = $("#zn").value; zip(); };
  $("#zip").onchange = () => { F.zip = $("#zip").value; render(); };
  $("#q").oninput = () => { page = 0; data(); };
  $("#pp").onclick = () => { page = Math.max(0, page - 1); data(); }; $("#pn").onclick = () => { page++; data(); };
  $("#reset").onclick = () => { initFilters(); render(); toast("Filters reset"); };
  $("#csv").onclick = () => { const h = TCOLS.concat(["lat", "long"]); const t = [h.join(",")].concat(ids.map(i => h.map(c => D[c][i]).join(","))).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv" })); a.download = "filtered_houses.csv"; a.click(); };
  const isDark = () => document.documentElement.dataset.theme === "dark";
  $("#theme").textContent = isDark() ? "Light mode" : "Dark mode";
  $("#theme").onclick = () => { document.documentElement.dataset.theme = isDark() ? "light" : "dark";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch (e) {}
    $("#theme").textContent = isDark() ? "Light mode" : "Dark mode"; view(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#drawer").hidden = true; });
  ids = getIds(); kpis(); showTab("overview");
}
boot();