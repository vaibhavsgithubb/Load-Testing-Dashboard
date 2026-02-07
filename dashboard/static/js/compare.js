let chart, table;

function setRunChip(text){
  const el = document.getElementById('runChip');
  if (!el) return;
  if (!text) { el.style.display='none'; return; }
  el.innerHTML = `<span class="label">Comparing:</span> ${text}`;
  el.style.display='inline-flex';
}


async function fetchRuns(){
  const res = await fetch('/api/runs');
  return await res.json();
}

function fmt(n){
  if (n === null || n === undefined) return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  return x.toFixed(0);
}

function renderRunsChecklist(runs){
  const wrap = document.getElementById('runsChecklist');
  wrap.innerHTML = '';
  runs.forEach((r,i)=>{
    const div = document.createElement('div');
    div.style.flex = '1 1 260px';
    div.innerHTML = `
      <label class="small" style="display:flex; gap:8px; align-items:center;">
        <input type="checkbox" value="${r.id}" ${i<2 ? 'checked' : ''}>
        <span><b>${r.is_baseline ? '⭐ ' : ''}${r.is_excluded ? '🚫 ' : ''}${r.run_name}</b> • ${r.run_ts_display}</span>
      </label>
    `;
    wrap.appendChild(div);
  });
}

function selectedRuns(){
  const boxes = Array.from(document.querySelectorAll('#runsChecklist input[type=checkbox]'));
  return boxes.filter(b=>b.checked).map(b=>Number(b.value)).slice(0,4);
}

async function doCompare(){
  const runIds = selectedRuns();
  if (!runIds.length){
    alert('Select at least one run.');
    return;
  }
  const load = document.getElementById('loadInput').value.trim();
  const endpoint = document.getElementById('endpointInput').value.trim();

  const res = await fetch('/api/compare', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      run_ids: runIds,
      load: load || null,
      endpoint: endpoint || null
    })
  });
  const data = await res.json();

  renderChart(data);
  renderTable(data);
}

function renderChart(data){
  const labels = data.items.map(x=>`${x.endpoint_name} (L${x.users_load})`).slice(0,25);
  const runs = data.runs;

  const datasets = runs.map((r, idx)=>({
    label: `${r.run_name}`,
    data: data.items.slice(0,25).map(item=>{
      const v = item.by_run?.[r.id]?.avg_ms;
      return v === undefined ? null : v;
    })
  }));

  const ctx = document.getElementById('compareChart');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: { responsive:true, plugins:{ legend:{ display:true } }, scales:{ y:{ title:{ display:true, text:'Avg (ms)'} } } }
  });
}

function renderTable(data){
  const runs = data.runs;

  // Build columns
  const cols = [
    { title: 'Load' },
    { title: 'Endpoint' },
  ];
  runs.forEach(r=>{
    cols.push({ title: `Avg (${r.run_name})` });
    cols.push({ title: `Δ vs baseline` });
  });

  // Build rows (must match cols length exactly)
  const baselineId = runs[0].id;
  const rows = data.items.map(item=>{
    const row = [item.users_load, item.endpoint_name];

    runs.forEach(r=>{
      const v = item.by_run?.[r.id]?.avg_ms;
      row.push(v === undefined ? '—' : fmt(v));

      const base = item.by_run?.[baselineId]?.avg_ms;
      row.push((v === undefined || base === undefined) ? '—' : fmt(v - base));
    });

    return row;
  });

  // ✅ Hard reset DOM so DataTables doesn't reuse old header/structure
  const tbl = document.getElementById('compareTable');
  if (!tbl) return;

  if (table) { try { table.destroy(); } catch {} table = null; }

  tbl.innerHTML = `<thead><tr id="compareHeader"></tr></thead><tbody></tbody>`;

  const header = document.getElementById('compareHeader');
  cols.forEach(c=>{
    const th = document.createElement('th');
    th.textContent = c.title;
    header.appendChild(th);
  });

  table = new DataTable('#compareTable', {
    data: rows,
    pageLength: 25,
    ordering: true
  });
}


async function init(){
  const runsAll = await fetchRuns();
  const showExEl = document.getElementById('showExcludedCompare');

  function visibleRuns(){
    const showEx = showExEl && showExEl.checked;
    return showEx ? runsAll : runsAll.filter(r=>!r.is_excluded);
  }

  function rerender(){
    renderRunsChecklist(visibleRuns());
  }

  rerender();

  if (showExEl){
    showExEl.onchange = ()=> rerender();
  }

  document.getElementById('compareBtn').onclick = doCompare;
  if (visibleRuns().length) await doCompare();
  wireMaximizeTable();

  wireMaximizeTable();

wireFocusToggle('maximizeTableBtn', 'compareTableCard', ()=>{
  try { $('#compareTable').DataTable().columns.adjust().draw(false); } catch {}
});

wireFocusToggle('maximizeCompareChartBtn', 'compareChartCard', ()=>{
  try { compareChart && compareChart.resize(); } catch {}
});


}
function wireMaximizeTable(){
  const btn = document.getElementById('maximizeTableBtn');
  const card = document.getElementById('compareTableCard');
  if (!btn || !card) return;

  let placeholder = null;
  let isMax = false;

  btn.onclick = async ()=>{
    isMax = !isMax;

    if (isMax){
      // create placeholder so we can restore back exactly
      placeholder = document.createElement('div');
      placeholder.style.display = 'none';
      card.parentNode.insertBefore(placeholder, card);

      card.classList.add('focus-overlay');
      document.body.classList.add('focus-lock');
      btn.textContent = '✕';
      btn.title = 'Close';

      // DataTables needs a resize recalculation when container size changes
      setTimeout(()=> {
        try { table && table.columns.adjust().draw(false); } catch {}

      }, 50);

    } else {
      card.classList.remove('focus-overlay');
      document.body.classList.remove('focus-lock');
      btn.textContent = '⛶';
      btn.title = 'Maximize table';

      if (placeholder && placeholder.parentNode){
        placeholder.parentNode.insertBefore(card, placeholder);
        placeholder.remove();
        placeholder = null;
      }

      setTimeout(()=> {
        try { table && table.columns.adjust().draw(false); } catch {}
      }, 50);
    }
  };

  // ESC closes focus mode
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && isMax) btn.click();
  });
}

function wireFocusToggle(btnId, cardId, afterResize){
  const btn = document.getElementById(btnId);
  const card = document.getElementById(cardId);
  if (!btn || !card) return;

  let isMax = false;
  let placeholder = null;

  btn.onclick = ()=>{
    isMax = !isMax;

    if (isMax){
      placeholder = document.createElement('div');
      placeholder.style.display = 'none';
      card.parentNode.insertBefore(placeholder, card);

      card.classList.add('focus-overlay');
      document.body.classList.add('focus-lock');
      btn.textContent = '✕';
      btn.title = 'Close';
    } else {
      card.classList.remove('focus-overlay');
      document.body.classList.remove('focus-lock');
      btn.textContent = '⛶';
      btn.title = 'Maximize';

      if (placeholder){
        placeholder.parentNode.insertBefore(card, placeholder);
        placeholder.remove();
        placeholder = null;
      }
    }

    setTimeout(()=>{ try { afterResize && afterResize(); } catch {} }, 60);
  };

  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && isMax) btn.click();
  });
}

init();
