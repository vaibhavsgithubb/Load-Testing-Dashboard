async function fetchRuns(){
  const res = await fetch('/api/runs');
  return await res.json();
}

async function fetchSummary(runId){
  const res = await fetch(`/api/run/${runId}/summary`);
  return await res.json();
}

async function fetchRunData(runId){
  const res = await fetch(`/api/run/${runId}/data`);
  return await res.json();
}

async function fetchExec(runId){
  const res = await fetch(`/api/run/${runId}/exec_summary`);
  return await res.json();
}

async function excludeRun(runId){
  const res = await fetch(`/api/runs/${runId}/exclude`, { method: 'POST' });
  return await res.json();
}

async function includeRun(runId){
  const res = await fetch(`/api/runs/${runId}/include`, { method: 'POST' });
  return await res.json();
}

async function deleteRun(runId){
  const res = await fetch(`/api/runs/${runId}/delete`, { method: 'POST' });
  return await res.json();
}

async function setBaseline(runId){
  const res = await fetch(`/api/runs/${runId}/set_baseline`, { method: 'POST' });
  return await res.json();
}

function fmt(n){
  if (n === null || n === undefined) return '—';
  const x = Number(n);
  if (Number.isNaN(x)) return '—';
  return x.toFixed(0);
}

function badge(status){
  const s = (status || '').toUpperCase();
  if (s === 'RED') return '<span class="badge red">RED</span>';
  if (s === 'AMBER') return '<span class="badge amber">AMBER</span>';
  return '<span class="badge green">GREEN</span>';
}

let table;
let latencyChart;
let distChart;
let slaTable;
let runsCache = [];

function fillRuns(selectedId){
  const sel = document.getElementById('runSelect');
  if (!sel) return;

  sel.innerHTML = '';
  runsCache.forEach((r,i)=>{
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.is_baseline ? '⭐ ' : ''}${r.is_excluded ? '🚫 ' : ''}${r.run_name} • ${r.run_ts_display}`;

    if (selectedId && Number(selectedId) === r.id) opt.selected = true;
    else if (!selectedId && i === 0) opt.selected = true;

    sel.appendChild(opt);
  });
}


function setRunChip(text){
  const el = document.getElementById('runChip');
  if (!el) return;
  if (!text) { el.style.display='none'; return; }
  el.innerHTML = `<span class="label">Viewing:</span> ${text}`;
  el.style.display='inline-flex';
}


function renderDistributionChart(rows){
  const canvas = document.getElementById('distChart');
  if (!canvas) return;

  // overall avg of avg_ms, and overall max of max_ms
  let sum = 0, cnt = 0, maxMax = null;
  rows.forEach(r=>{
    const a = Number(r.avg_ms);
    const mx = Number(r.max_ms);
    if (Number.isFinite(a)) { sum += a; cnt += 1; }
    if (Number.isFinite(mx)) { maxMax = (maxMax === null) ? mx : Math.max(maxMax, mx); }
  });
  const overallAvg = cnt ? (sum / cnt) : null;

  if (distChart) distChart.destroy();
  distChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Avg', 'Max'],
      datasets: [{
        label: 'Milliseconds',
        data: [overallAvg, maxMax]
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { title: { display: true, text: 'Milliseconds' } }
      }
    }
  });
}

function initSlaTable(){
  const tbl = document.getElementById('slaTable');
  if (!tbl) return;

  if (slaTable) slaTable.destroy();

  slaTable = new DataTable('#slaTable', {
    paging: false,
    searching: true,
    info: false,
    columns: [
      { data: 'endpoint_name' },
      { data: 'users_load' },
      { data: 'avg_ms' },
      { data: 'max_ms' },
      { data: 'reason' },
    ]
  });
}

function renderSlaViolations(rows, exec){
  const okMsg = document.getElementById('slaOkMsg');
  if (!slaTable) initSlaTable();
  if (!slaTable) return;

  const slaAvg = exec?.sla_avg_ms;
  const slaMax = exec?.sla_max_ms;

  const violations = [];
  rows.forEach(r=>{
    const avg = Number(r.avg_ms);
    const mx  = Number(r.max_ms);
    const endpoint = r.endpoint_name;
    const load = r.users_load;

    const reasons = [];
    if (slaAvg !== null && slaAvg !== undefined && Number.isFinite(avg) && avg > slaAvg) {
      reasons.push(`Avg > SLA (${fmt(avg)} > ${fmt(slaAvg)})`);
    }
    if (slaMax !== null && slaMax !== undefined && Number.isFinite(mx) && mx > slaMax) {
      reasons.push(`Max > SLA (${fmt(mx)} > ${fmt(slaMax)})`);
    }
    if (reasons.length){
      violations.push({
        endpoint_name: endpoint,
        users_load: load,
        avg_ms: fmt(avg),
        max_ms: fmt(mx),
        reason: reasons.join(' • ')
      });
    }
  });

  slaTable.clear();
  slaTable.rows.add(violations);
  slaTable.draw();

  if (okMsg){
    if ((slaAvg === null || slaAvg === undefined) && (slaMax === null || slaMax === undefined)) {
      okMsg.style.display = 'block';
      okMsg.textContent = 'No SLA thresholds set for this run.';
    } else if (violations.length === 0) {
      okMsg.style.display = 'block';
      okMsg.textContent = 'All endpoints are within SLA thresholds.';
    } else {
      okMsg.style.display = 'none';
    }
  }
}

function renderLoadLatencyChart(rows){
  const canvas = document.getElementById('loadLatencyChart');
  if (!canvas) return;

  // group by users_load: avg of avg_ms across endpoints
  const byLoad = new Map();
  rows.forEach(r=>{
    const load = Number(r.users_load);
    const avg = Number(r.avg_ms);
    const mx  = Number(r.max_ms);
    if (!Number.isFinite(load) || !Number.isFinite(avg)) return;
    if (!byLoad.has(load)) byLoad.set(load, {sumAvg:0, cnt:0, maxOfMax: null});
    const obj = byLoad.get(load);
    obj.sumAvg += avg;
    obj.cnt += 1;
    if (Number.isFinite(mx)){
      obj.maxOfMax = obj.maxOfMax === null ? mx : Math.max(obj.maxOfMax, mx);
    }
  });

  const loads = Array.from(byLoad.keys()).sort((a,b)=>a-b);
  const avgSeries = loads.map(l => byLoad.get(l).sumAvg / byLoad.get(l).cnt);
  const maxSeries = loads.map(l => byLoad.get(l).maxOfMax);

  if (latencyChart) latencyChart.destroy();
  latencyChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: loads.map(String),
      datasets: [
        { label: 'Avg of endpoints (ms)', data: avgSeries },
        { label: 'Max (ms)', data: maxSeries }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        x: { title: { display: true, text: 'Users load' } },
        y: { title: { display: true, text: 'Milliseconds' } }
      }
    }
  });
}

async function init(){
  runsCache = await fetchRuns();
  const sel = document.getElementById('runSelect');
  sel.innerHTML = '';
  runsCache.forEach((r,i)=>{
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.is_baseline ? '⭐ ' : ''}${r.is_excluded ? '🚫 ' : ''}${r.run_name} • ${r.run_ts_display}`;
    if (i===0) opt.selected = true;
    sel.appendChild(opt);
  });

  document.getElementById('refreshBtn').onclick = async ()=> refresh(Number(sel.value));
  sel.onchange = async ()=> refresh(Number(sel.value));

  document.getElementById('excludeBtn').onclick = async ()=>{
    const id = Number(sel.value);
    const currentRun = runsCache.find(r=>r.id===id);
    if (currentRun?.is_baseline){
      alert('Cannot exclude the baseline run. Unset baseline first.');
      return;
    }
    const resp = await excludeRun(id);
    if (resp && resp.ok){
      runsCache = await fetchRuns();
      fillRuns(id);
      await refresh(Number(sel.value));
    } else {
      alert(resp?.message || 'Failed to exclude run.');
    }
  };

  document.getElementById('includeBtn').onclick = async ()=>{
    const id = Number(sel.value);
    const resp = await includeRun(id);
    if (resp && resp.ok){
      runsCache = await fetchRuns();
      fillRuns(id);
      await refresh(Number(sel.value));
    } else {
      alert(resp?.message || 'Failed to include run.');
    }
  };

  document.getElementById('deleteBtn').onclick = async ()=>{
    const id = Number(sel.value);
    const currentRun = runsCache.find(r=>r.id===id);
    if (currentRun?.is_baseline){
      alert('Cannot delete the baseline run. Unset baseline first.');
      return;
    }
    const name = currentRun?.run_name || '';
    const confirmText = prompt(`Type the run name to permanently delete:\n\n${name}`);
    if (confirmText !== name) return;
    const resp = await deleteRun(id);
    if (resp && resp.ok){
  runsCache = await fetchRuns();

  // rebuild dropdown immediately (so deleted run disappears without page refresh)
  fillRuns();

  // if no runs left, clear UI safely
  if (!runsCache.length || !sel.value){
    document.getElementById('runMeta').textContent = 'No runs found. Import an Excel file first.';
    document.getElementById('statusBadge').innerHTML = '';
    setRunChip(null);
    return;
  }

  await refresh(Number(sel.value));
} else {

      alert(resp?.message || 'Failed to delete run.');
    }
  };

  document.getElementById('setBaselineBtn').onclick = async ()=>{
    const id = Number(sel.value);
    await setBaseline(id);
    runsCache = await fetchRuns();
    sel.innerHTML = '';
    runsCache.forEach((r)=>{
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.is_baseline ? '⭐ ' : ''}${r.is_excluded ? '🚫 ' : ''}${r.run_name} • ${r.run_ts_display}`;
      if (r.id === id) opt.selected = true;
      sel.appendChild(opt);
    });
    await refresh(id);
  };

  table = new DataTable('#slowTable', {
    paging: false,
    searching: false,
    info: false,
    columns: [
      { data: 'endpoint_name' },
      { data: 'users_load' },
      { data: 'avg_ms' },
      { data: 'min_ms' },
      { data: 'max_ms' },
    ]
  });

  if (runsCache.length) await refresh(runsCache[0].id);
  else document.getElementById('runMeta').textContent = 'No runs found. Import an Excel file first.';
}

async function refresh(runId){
  const data = await fetchSummary(runId);
  const exec = await fetchExec(runId);
  const rowsAll = await fetchRunData(runId);

  const run = data.run;
  const metaParts = [
    `Run: ${run.is_baseline ? '⭐ ' : ''}${run.run_name}`,
    `${run.run_ts_display}`
  ];
  if (run.environment) metaParts.push(`Env: ${run.environment}`);
  if (run.release_name) metaParts.push(`Release: ${run.release_name}`);
  if (run.test_type) metaParts.push(`Type: ${run.test_type}`);
  if (run.commit_sha) metaParts.push(`Commit: ${run.commit_sha}`);
  if (run.source_file) metaParts.push(`Source: ${run.source_file}`);
  if (run.notes) metaParts.push(`Notes: ${run.notes}`);
  document.getElementById('runMeta').textContent = metaParts.join(' | ');

  const chipParts = [];
  chipParts.push(`${run.is_baseline ? '⭐ ' : ''}${run.is_excluded ? '🚫 ' : ''}${run.run_name}`);
  if (run.environment) chipParts.push(run.environment);
  if (run.release_name) chipParts.push(run.release_name);
  if (run.test_type) chipParts.push(run.test_type);
  if (run.commit_sha) chipParts.push(run.commit_sha);
  setRunChip(chipParts.join(' · '));

  const exBtn = document.getElementById('excludeBtn');
  const inBtn = document.getElementById('includeBtn');
  const delBtn = document.getElementById('deleteBtn');
  if (exBtn && inBtn){
    if (run.is_excluded){ exBtn.style.display='none'; inBtn.style.display='inline-block'; }
    else { exBtn.style.display='inline-block'; inBtn.style.display='none'; }
  }
  if (delBtn){
    delBtn.disabled = !!run.is_baseline;
  }
  if (exBtn){
    exBtn.disabled = !!run.is_baseline;
  }

  document.getElementById('kpiEndpoints').textContent = fmt(data.kpi.endpoints_count);
  document.getElementById('kpiLoads').textContent = fmt(data.kpi.loads_count);
  document.getElementById('kpiAvg').textContent = fmt(data.kpi.overall_avg_ms);

  document.getElementById('statusBadge').innerHTML = badge(exec.status);
  document.getElementById('slaFails').textContent = fmt(exec.sla_fail_count);
  document.getElementById('regCount').textContent = fmt(exec.regressions_count);

  const slaInfo = [];
  if (exec.sla_avg_ms !== null && exec.sla_avg_ms !== undefined) slaInfo.push(`avg SLA ≤ ${fmt(exec.sla_avg_ms)} ms`);
  if (exec.sla_max_ms !== null && exec.sla_max_ms !== undefined) slaInfo.push(`max SLA ≤ ${fmt(exec.sla_max_ms)} ms`);
  document.getElementById('slaInfo').textContent = slaInfo.length ? slaInfo.join(' • ') : 'No SLA thresholds set for this run.';

  document.getElementById('regInfo').textContent =
    exec.baseline_run_id ? `Threshold: ≥ ${fmt(exec.regression_threshold_pct)}% vs baseline` : 'No baseline set (set one to enable regression detection).';

  const list = document.getElementById('riskList');
  list.innerHTML = '';
  if (exec.top_risks && exec.top_risks.length){
    exec.top_risks.forEach(r=>{
      const li = document.createElement('li');
      li.textContent = `${r.endpoint} @ L${r.load}: +${r.pct}% (avg ${fmt(r.avg_ms)} ms vs baseline ${fmt(r.baseline_avg_ms)} ms)`;
      list.appendChild(li);
    });
  } else {
    const li = document.createElement('li');
    li.textContent = 'No major risks detected under current thresholds.';
    list.appendChild(li);
  }

  table.clear();
  table.rows.add(data.slowest.map(r=>({
    ...r,
    avg_ms: fmt(r.avg_ms),
    min_ms: fmt(r.min_ms),
    max_ms: fmt(r.max_ms),
  })));
  table.draw();

  renderLoadLatencyChart(rowsAll);
  renderDistributionChart(rowsAll);
  renderSlaViolations(rowsAll, exec);
}

init();
