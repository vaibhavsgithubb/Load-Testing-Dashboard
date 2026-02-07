let grid;
let chart1, chart2, table;
let runsAllCache = [];

function setRunChip(text){
  const el = document.getElementById('runChip');
  if (!el) return;
  if (!text) { el.style.display='none'; return; }
  el.innerHTML = `<span class="label">Viewing:</span> ${text}`;
  el.style.display='inline-flex';
}


function storageKey(){
  return 'load_dashboard_layout_v1';
}

async function fetchRuns(){
  const res = await fetch('/api/runs');
  return await res.json();
}

async function fetchRunData(runId, load, endpoint){
  const params = new URLSearchParams();
  if (load) params.set('load', load);
  if (endpoint) params.set('endpoint', endpoint);
  const res = await fetch(`/api/run/${runId}/data?${params.toString()}`);
  return await res.json();
}

function fmt(n){
  if (n === null || n === undefined) return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  return x.toFixed(0);
}

function widgetHtml(title, innerId){
  return `
    <div class="grid-stack-item-content card">
      <div class="card-head">
        <div style="font-weight:700;">${title}</div>
        <button class="icon-btn widget-max" title="Maximize" aria-label="Maximize">⛶</button>
      </div>
      <div class="widget-body" id="${innerId}"></div>
    </div>
  `;
}



function defaultLayout(){
  return [
    {id:'w1', x:0, y:0, w:6, h:4},
    {id:'w2', x:6, y:0, w:6, h:4},
    {id:'w3', x:0, y:4, w:12, h:5},
  ];
}

function buildGrid(layout){
  const el = document.getElementById('grid');
  el.innerHTML = '';

  // init gridstack (keep your options)
  grid = GridStack.init(
    { float: true, cellHeight: 90, margin: 16, disableResize: true, disableDrag: true },
    el
  );

  // use provided layout or default
  const items = layout && layout.length ? layout : defaultLayout();

  // compute dynamic y for bottom widget (w3) so it's placed just below
  // the tallest occupied grid row from the other widgets.
  // handle cases where layout came from saved localStorage (strings etc).
  const parsed = items.map(it => ({
    id: String(it.id),
    x: Number(it.x),
    y: Number(it.y),
    w: Number(it.w),
    h: Number(it.h)
  }));

  // find max row used by all widgets except w3
  const other = parsed.filter(it => it.id !== 'w3');
  let maxRow = 0;
  if (other.length){
    maxRow = other.reduce((mx, it) => {
      const bottom = (Number(it.y) || 0) + (Number(it.h) || 0);
      return Math.max(mx, bottom);
    }, 0);
  }

  // If w3 exists in the layout, set its y to maxRow (so it starts on the next free row)
  // Otherwise, keep whatever's defined for it (or default will place it)
  const itemsToAdd = parsed.map(it => {
    if (it.id === 'w3'){
      // place w3 after highest used row; +0 means it will start at that row,
      // but GridStack rows are integer-based so this effectively puts it below previous items
      return {...it, y: Math.max(it.y, maxRow) };
    }
    return it;
  });

  // Now add each item to the DOM and to grid
  itemsToAdd.forEach(it=>{
    const content = document.createElement('div');
    content.className = 'grid-stack-item';
    content.setAttribute('gs-x', it.x);
    content.setAttribute('gs-y', it.y);
    content.setAttribute('gs-w', it.w);
    content.setAttribute('gs-h', it.h);
    content.setAttribute('data-id', it.id);

    let title = 'Widget';
    let innerId = 'inner';
    if (it.id === 'w1'){ title='Avg by Endpoint'; innerId='avgChartWrap'; }
    if (it.id === 'w2'){ title='Max by Endpoint'; innerId='maxChartWrap'; }
    if (it.id === 'w3'){ title='All Results'; innerId='tableWrap'; }

    content.innerHTML = widgetHtml(title, innerId);
    grid.addWidget(content);
    // after adding all widgets:
    grid.compact();

  });


  // After adding, tell GridStack to reposition/compact so any small overlaps resolve
  try { grid.compact(); } catch (e) { /* ignore if not supported */ }
}


function getLayout(){
  return grid.save().map(x=>({id:x.el.getAttribute('data-id'), x:x.x, y:x.y, w:x.w, h:x.h}));
}

function saveLayout(){
  localStorage.setItem(storageKey(), JSON.stringify(getLayout()));
}

function loadLayout(){
  const raw = localStorage.getItem(storageKey());
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function resetLayout(){
  localStorage.removeItem(storageKey());
  buildGrid(defaultLayout());
  renderWidgets(lastData || []);
}

function getChartOptions(){
  const showLegend = document.getElementById('toggleLegend').checked;
  const anim = document.getElementById('toggleAnim').checked;
  const axisTitles = document.getElementById('toggleAxisTitles').checked;
  return {
    responsive: true,
    maintainAspectRatio: false,   // ✅ important
    animation: anim,
    plugins: { legend: { display: showLegend } },
    scales: {
      x: { title: { display: axisTitles, text: 'Endpoint' } },
      y: { title: { display: axisTitles, text: 'Milliseconds' } }
    }
  };
}


let lastData = null;

function renderCharts(data){
  const labels = data.map(r=>`${r.endpoint_name} (L${r.users_load})`);
  const avg = data.map(r=>r.avg_ms);
  const max = data.map(r=>r.max_ms);

  // Avg chart
  const wrap1 = document.getElementById('avgChartWrap');
  wrap1.innerHTML = '<canvas id="avgChart" style="width:100%;height:100%"></canvas>';
  const ctx1 = document.getElementById('avgChart');
  if (chart1) chart1.destroy();
  chart1 = new Chart(ctx1, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Avg (ms)', data: avg }] },
    options: getChartOptions()
  });

  // Max chart  ✅ FIXED
  const wrap2 = document.getElementById('maxChartWrap');
  wrap2.innerHTML = '<canvas id="maxChart" style="width:100%;height:100%"></canvas>';
  const ctx2 = document.getElementById('maxChart');
  if (chart2) chart2.destroy();
  chart2 = new Chart(ctx2, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Max (ms)', data: max }] },
    options: getChartOptions()
  });
}


function renderTable(data){
  const wrap = document.getElementById('tableWrap');
  wrap.innerHTML = `
    <div class="table-wrap">
      <table id="resultsTable" class="display" style="width:100%">
        <thead>
          <tr>
            <th>Load</th><th>Endpoint</th><th>Avg</th><th>Min</th><th>Max</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  table = new DataTable('#resultsTable', {
    pageLength: 25,
    columns: [
      { data: 'users_load' },
      { data: 'endpoint_name' },
      { data: 'avg_ms' },
      { data: 'min_ms' },
      { data: 'max_ms' },
    ]
  });
  table.rows.add(data.map(r=>({
    ...r,
    avg_ms: fmt(r.avg_ms),
    min_ms: fmt(r.min_ms),
    max_ms: fmt(r.max_ms),
  })));
  table.draw();
}

function renderWidgets(data){
  lastData = data;
  renderCharts(data);
  renderTable(data);
}

async function applyFilters(){
  const runId = Number(document.getElementById('runSelect').value);
  const r = (runsAllCache || []).find(x=>x.id===runId);
  if (r){
    const chipParts = [];
    chipParts.push(`${r.is_baseline ? '⭐ ' : ''}${r.is_excluded ? '🚫 ' : ''}${r.run_name}`);
    if (r.environment) chipParts.push(r.environment);
    if (r.release_name) chipParts.push(r.release_name);
    if (r.test_type) chipParts.push(r.test_type);
    if (r.commit_sha) chipParts.push(r.commit_sha);
    setRunChip(chipParts.join(' · '));
  } else {
    setRunChip(null);
  }

const load = document.getElementById('loadInput').value.trim();
  const endpoint = document.getElementById('endpointInput').value.trim();
  const data = await fetchRunData(runId, load || null, endpoint || null);
  renderWidgets(data);
}

async function init(){
  const runsAll = await fetchRuns();
  runsAllCache = runsAll;
  const showExEl = document.getElementById('showExcludedDashboard');
  const sel = document.getElementById('runSelect');

  function visibleRuns(){
    const showEx = showExEl && showExEl.checked;
    return showEx ? runsAll : runsAll.filter(r=>!r.is_excluded);
  }

  function fillRuns(selectedId){
    const runs = visibleRuns();
    sel.innerHTML = '';
    runs.forEach((r,i)=>{
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.is_baseline ? '⭐ ' : ''}${r.is_excluded ? '🚫 ' : ''}${r.run_name} • ${r.run_ts_display}`;
      if (selectedId && Number(selectedId) === r.id) opt.selected = true;
      else if (!selectedId && i===0) opt.selected = true;
      sel.appendChild(opt);
    });
  }

    fillRuns();

  if (showExEl){
    showExEl.onchange = async ()=>{
      const cur = Number(sel.value);
      fillRuns(cur);
      if (sel.value) await applyFilters();  // ✅ fix: was loadRun()
    };
  }

  const layout = loadLayout();
  buildGrid(layout || defaultLayout());

  document.getElementById('applyBtn').onclick = applyFilters;
  document.getElementById('saveLayoutBtn').onclick = ()=>{ saveLayout(); alert('Layout saved (this browser).'); };
  document.getElementById('resetLayoutBtn').onclick = resetLayout;

  ['toggleLegend','toggleAnim','toggleAxisTitles'].forEach(id=>{
    document.getElementById(id).onchange = ()=> renderWidgets(lastData || []);
  });
    // wire maximize buttons for dashboard widgets (enable once at init)
  wireDashboardMaximize();


  // ✅ fix: runs was undefined, so auto-load never happened
  const runsVisible = visibleRuns();
  if (runsVisible.length && sel.value) {
    await applyFilters();
  } else {
    document.getElementById('grid').innerHTML =
      '<div class="card">No runs found. Import an Excel file first.</div>';
    setRunChip(null);
  }

}
function wireDashboardMaximize(){
  const gridEl = document.getElementById('grid');
  if (!gridEl) return;

  gridEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.widget-max');
    if (!btn) return;

    const item = btn.closest('.grid-stack-item');
    if (!item) return;

    const isMax = item.classList.toggle('is-maximized');
    document.body.classList.toggle('focus-lock', isMax);

    btn.textContent = isMax ? '✕' : '⛶';
    btn.title = isMax ? 'Close' : 'Maximize';

    setTimeout(()=>{
      try { chart1 && chart1.resize(); } catch {}
      try { chart2 && chart2.resize(); } catch {}
      try { table && table.columns.adjust().draw(false); } catch {}
    }, 80);
  });

  document.addEventListener('keydown', (e)=>{
    if (e.key !== 'Escape') return;
    const maxItem = document.querySelector('.grid-stack-item.is-maximized');
    if (!maxItem) return;
    const btn = maxItem.querySelector('.widget-max');
    if (btn) btn.click();
  });
}
init();
