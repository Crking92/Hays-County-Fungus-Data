const $ = id => document.getElementById(id);
const safe = value => (value === null || value === undefined) ? '' : String(value);
const esc = value => safe(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const number = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const splitSources = value => safe(value).split(',').map(x => x.trim()).filter(Boolean);
const shortText = (value, max = 150) => { const s = safe(value); return s.length > max ? s.slice(0, max - 1) + '…' : s; };
const sourcePills = value => splitSources(value).map(s => `<span class="source-pill">${esc(s)}</span>`).join('');
const statusClass = record => {
  const score = number(record.Occurrence_Evidence_Score_0_5);
  const label = safe(record.Friendly_Evidence_Level).toLowerCase();
  if (score >= 4 || label.includes('strong')) return 'strong';
  if (score >= 2 || label.includes('candidate')) return 'mid';
  if (score <= 1 || label.includes('relationship')) return 'low';
  return 'neutral';
};
const groupIcon = key => ({
  leaf: '◐', slime: '◎', roots: '↯', lichen: '✣', wood: '▤', recycle: '↻', inside: '◌', mushroom: '◒', question: '?'
}[key] || '•');

let DATA = window.DASHBOARD_DATA || null;
let records = [];
let filtered = [];
let selectedId = null;
let page = 1;
let pageSize = 24;
let sortKey = 'Occurrence_Evidence_Score_0_5';
let sortDir = -1;
let currentView = 'cards';
const photoCache = new Map();
let observer;

async function bootstrap() {
  if (!DATA) {
    const inline = $('dashboard-data');
    if (inline) DATA = JSON.parse(inline.textContent);
  }
  if (!DATA) {
    const res = await fetch('data/dashboard-data.json');
    DATA = await res.json();
  }
  records = [...DATA.records];
  filtered = [...records];
  document.body.dataset.mode = 'beginner';
  currentView = 'cards';
  document.body.dataset.view = 'cards';
  buildStats();
  buildEvidenceLadder();
  buildJobCards();
  buildFilters();
  buildSources();
  buildGlossary();
  bindEvents();
  applyFilters();
  setupPhotoObserver();
}

function buildStats() {
  const stats = DATA.stats || {};
  const items = [
    ['Total taxa', stats.total_taxa || records.length, 'Cleaned names merged from all source layers'],
    ['Strong local evidence', stats.high_local || 0, 'Voucher/specimen or coordinate-supported records'],
    ['iNaturalist checklist taxa', stats.inat_listed || 0, 'Community checklist layer added as candidates'],
    ['With interactions/hosts', stats.with_interaction_state || stats.with_interaction_summary || 0, 'Taxa with merged host or interaction context']
  ];
  $('overview').innerHTML = items.map(([label, value, note]) => `
    <article class="card stat"><div class="stat-number">${Number(value).toLocaleString()}</div><div class="stat-label">${esc(label)}<br>${esc(note)}</div></article>`).join('');
}

function buildEvidenceLadder() {
  const defaultRules = [
    ['5', 'Collected specimen', 'Strongest: a preserved/checkable specimen or equivalent local evidence.'],
    ['4', 'Mapped local record', 'Coordinates or refined source information point to Hays County.'],
    ['3', 'Local candidate', 'Checklist/community record or useful Hays-area candidate.'],
    ['2', 'Regional candidate', 'Nearby/bounding-box record; exact county review still needed.'],
    ['1', 'Function only', 'Host, interaction, or guild evidence but no local occurrence proof.']
  ];
  const rules = (DATA.rules || []).filter(r => safe(r.Rule_Type).toLowerCase().includes('occurrence score'));
  const rows = rules.length ? rules.map(r => [r.Value, r.Public_Label, r.Meaning]) : defaultRules;
  $('evidenceLadder').innerHTML = rows.map(([score, label, meaning]) => `
    <article class="evidence-step"><div class="evidence-score">${esc(score)}</div><h3>${friendlyRuleLabel(label)}</h3><p>${esc(meaning)}</p></article>`).join('');
}
function friendlyRuleLabel(label) {
  const s = safe(label).toLowerCase();
  if (s.includes('voucher') || s.includes('specimen')) return 'Collected specimen';
  if (s.includes('coordinate')) return 'Mapped local record';
  if (s.includes('checklist')) return 'Community checklist';
  if (s.includes('gbif')) return 'Nearby candidate';
  if (s.includes('interaction') || s.includes('function')) return 'Relationship/function only';
  return safe(label);
}

function countBy(list, getter) {
  const m = new Map();
  list.forEach(r => {
    const raw = getter(r);
    const vals = Array.isArray(raw) ? raw : [raw];
    vals.map(x => safe(x).trim()).filter(Boolean).forEach(v => m.set(v, (m.get(v) || 0) + 1));
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function buildJobCards() {
  const groups = countBy(records, r => r.Public_Display_Group);
  const order = [
    'General decomposers / recyclers', 'Wood decomposers', 'Plant-root partners / mycorrhizal fungi',
    'Plant disease / host-associated fungi', 'Lichens', 'Visible mushrooms / fruiting bodies',
    'Endophytes / inside-plant associates', 'Fungus-like organisms / slime molds', 'Still being studied / unresolved'
  ];
  groups.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  $('jobGrid').innerHTML = groups.map(([group, count]) => {
    const sample = records.find(r => r.Public_Display_Group === group) || {};
    return `<article class="job-card" tabindex="0" data-group="${esc(group)}">
      <div class="job-title"><span class="icon-chip">${groupIcon(sample.Public_Group_Icon)}</span><span>${esc(group)}</span><span class="job-count">${count}</span></div>
      <p>${esc(sample.Public_Group_Description || '')}</p>
    </article>`;
  }).join('');
}

function unique(field) { return [...new Set(records.map(r => safe(r[field]).trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b)); }
function buildFilters() {
  const selects = [
    ['evidenceFilter', 'Friendly_Evidence_Level'], ['confidenceFilter', 'Public_Confidence'], ['groupFilter', 'Public_Display_Group'],
    ['sourceFilter', null], ['interactionFilter', 'Interaction_State']
  ];
  selects.forEach(([id, field]) => {
    const sel = $(id);
    if (field) unique(field).forEach(v => sel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));
  });
  countBy(records, r => splitSources(r.Source_Layers_Present)).map(x => x[0]).forEach(v => $('sourceFilter').insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`));
}

function buildSources() {
  $('sourcesList').innerHTML = (DATA.sources || []).map(s => `<article class="term">
    <strong>${esc(s.Source_Name)}</strong>
    <span>${esc(s.Primary_Use || '')}<br>${esc(s.Public_Citation_Text || '')}<br>${safe(s.URL) ? `<a href="${esc(s.URL)}" target="_blank" rel="noopener">Source website</a>` : ''}</span>
  </article>`).join('');
}
function buildGlossary() {
  const terms = [
    ['Voucher specimen', 'A real collected sample saved in a museum, herbarium, or fungarium so it can be checked later.'],
    ['Occurrence', 'A record saying an organism was found at a place and time.'],
    ['Host', 'A plant or organism that a fungus lives on, in, or with.'],
    ['Saprotroph', 'A decomposer that gets food from dead material.'],
    ['Pathogen', 'An organism that can cause disease in a host.'],
    ['Mycorrhizal', 'A fungus-root relationship that can help plants and fungi exchange resources.'],
    ['Lichenized fungus', 'A fungus living with algae or cyanobacteria as one shared body.'],
    ['Fungus-like organism', 'Something that looks or behaves fungus-like but is not a true fungus, such as many slime molds.']
  ];
  $('glossaryGrid').innerHTML = terms.map(([t, d]) => `<article class="term"><strong>${esc(t)}</strong><span>${esc(d)}</span></article>`).join('');
}

function bindEvents() {
  ['searchBox','evidenceFilter','confidenceFilter','groupFilter','sourceFilter','interactionFilter','inatOnly','highOnly'].forEach(id => $(id).addEventListener('input', applyFilters));
  $('resetBtn').addEventListener('click', resetFilters);
  $('downloadCsvBtn').addEventListener('click', downloadCSV);
  $('downloadJsonBtn').addEventListener('click', downloadJSON);
  $('prevPage').addEventListener('click', () => { if (page > 1) { page--; renderCurrentView(); scrollToExploreTop(false); } });
  $('nextPage').addEventListener('click', () => { const max = Math.ceil(filtered.length / pageSize); if (page < max) { page++; renderCurrentView(); scrollToExploreTop(false); } });
  document.querySelectorAll('[data-mode-target]').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.modeTarget)));
  document.querySelectorAll('[data-view-target]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.viewTarget)));
  $('jobGrid').addEventListener('click', e => {
    const card = e.target.closest('.job-card'); if (!card) return;
    $('groupFilter').value = card.dataset.group; applyFilters(); document.querySelector('#explore').scrollIntoView({behavior:'smooth', block:'start'});
  });
  $('jobGrid').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.job-card'); if (card) { e.preventDefault(); card.click(); }
  });
  $('cardGrid').addEventListener('click', e => {
    const card = e.target.closest('.taxon-card'); if (card) showDetailById(card.dataset.id, true);
  });
  $('cardGrid').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.taxon-card'); if (card) { e.preventDefault(); showDetailById(card.dataset.id, true); }
  });
  $('taxaTableBody').addEventListener('click', e => {
    if (e.target.closest('a, button')) return;
    const row = e.target.closest('tr[data-id]'); if (row) showDetailById(row.dataset.id, true);
  });
  $('taxaTableBody').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('tr[data-id]'); if (row) { e.preventDefault(); showDetailById(row.dataset.id, true); }
  });
  document.querySelectorAll('#taxaTable th[data-sort]').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.sort; if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'Occurrence_Evidence_Score_0_5' ? -1 : 1; }
    sortFiltered(); page = 1; renderCurrentView();
  }));
}
function setMode(mode) {
  document.body.dataset.mode = mode;
  document.querySelectorAll('[data-mode-target]').forEach(b => b.classList.toggle('active', b.dataset.modeTarget === mode));
}
function setView(view) {
  if (view !== 'cards' && view !== 'table') view = 'cards';
  currentView = view;
  document.body.dataset.view = view;
  document.querySelectorAll('[data-view-target]').forEach(b => b.classList.toggle('active', b.dataset.viewTarget === view));
  updateViewVisibility();
  renderCurrentView();
}
function updateViewVisibility() {
  const cardView = document.querySelector('.card-view');
  const tableView = document.querySelector('.table-view');
  if (cardView) cardView.hidden = currentView !== 'cards';
  if (tableView) tableView.hidden = currentView !== 'table';
  document.body.dataset.view = currentView;
  document.querySelectorAll('[data-view-target]').forEach(b => b.classList.toggle('active', b.dataset.viewTarget === currentView));
}
function resetFilters() {
  ['searchBox','evidenceFilter','confidenceFilter','groupFilter','sourceFilter','interactionFilter'].forEach(id => $(id).value = '');
  ['inatOnly','highOnly'].forEach(id => $(id).checked = false);
  document.querySelectorAll('.job-card').forEach(c => c.classList.remove('active'));
  applyFilters();
}
function applyFilters() {
  const q = safe($('searchBox').value).toLowerCase().trim();
  const evidence = $('evidenceFilter').value;
  const conf = $('confidenceFilter').value;
  const group = $('groupFilter').value;
  const source = $('sourceFilter').value;
  const interaction = $('interactionFilter').value;
  const inatOnly = $('inatOnly').checked;
  const highOnly = $('highOnly').checked;
  filtered = records.filter(r => {
    const hay = [r.Clean_Scientific_Name, r.Display_Common_Name, r.Common_Names, r.Family, r.Genus, r.Public_Display_Group, r.Public_Function_Summary, r.Interaction_Summary, r.Source_Layers_Present, r.Beginner_Role_Sentence].map(safe).join(' | ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (evidence && safe(r.Friendly_Evidence_Level) !== evidence) return false;
    if (conf && safe(r.Public_Confidence) !== conf) return false;
    if (group && safe(r.Public_Display_Group) !== group) return false;
    if (source && !splitSources(r.Source_Layers_Present).includes(source)) return false;
    if (interaction && safe(r.Interaction_State) !== interaction) return false;
    if (inatOnly && safe(r.iNaturalist_Checklist_Listed).toLowerCase() !== 'yes') return false;
    if (highOnly && number(r.Occurrence_Evidence_Score_0_5) < 4) return false;
    return true;
  });
  page = 1; sortFiltered(); renderCurrentView(); updateCharts(); highlightJobCards();
}
function highlightJobCards() {
  const group = $('groupFilter').value;
  document.querySelectorAll('.job-card').forEach(c => c.classList.toggle('active', c.dataset.group === group));
}
function sortFiltered() {
  filtered.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (sortKey === 'Occurrence_Evidence_Score_0_5') return ((number(av) - number(bv)) * sortDir) || safe(a.Clean_Scientific_Name).localeCompare(safe(b.Clean_Scientific_Name));
    return safe(av).localeCompare(safe(bv)) * sortDir;
  });
}
function renderCurrentView() {
  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (page > maxPage) page = maxPage;
  $('resultCount').innerHTML = `<strong>${filtered.length.toLocaleString()}</strong> taxa shown`;
  $('pageInfo').textContent = `Page ${page} of ${maxPage}`;
  $('prevPage').disabled = page <= 1; $('nextPage').disabled = page >= maxPage;
  renderCards(); renderTable(); updateViewVisibility(); queueVisiblePhotos();
}
function pageRows() { const start = (page - 1) * pageSize; return filtered.slice(start, start + pageSize); }
function renderCards() {
  $('cardGrid').innerHTML = pageRows().map(r => `
    <article class="taxon-card ${selectedId === r.Taxon_ID ? 'selected' : ''}" tabindex="0" role="button" aria-label="Open scorecard for ${esc(r.Clean_Scientific_Name)}" data-id="${esc(r.Taxon_ID)}">
      <div class="card-photo photo-slot" data-id="${esc(r.Taxon_ID)}"><span>photo lookup</span></div>
      <div class="card-content">
        <div><div class="taxon-name">${esc(r.Clean_Scientific_Name)}</div><div class="common-name">${esc(r.Display_Common_Name || r.Family || 'No common name in merged data')}</div></div>
        <div class="badges"><span class="badge ${statusClass(r)}">${esc(r.Friendly_Evidence_Level)}</span><span class="badge group">${esc(shortGroup(r.Public_Display_Group))}</span></div>
        <p class="card-role">${esc(r.Beginner_Role_Sentence)}</p>
        <div class="card-footer"><span>score ${esc(r.Occurrence_Evidence_Score_0_5 || 0)}/5</span><span>${esc(r.Interaction_State === 'Has merged interactions / hosts' ? 'has interactions' : 'no interactions')}</span></div>
      </div>
    </article>`).join('');
}
function shortGroup(group) {
  return safe(group).replace(' / host-associated fungi','').replace(' / mycorrhizal fungi','').replace(' / fruiting bodies','').replace(' / recyclers','');
}
function interactionText(r) {
  const summary = safe(r.Interaction_Summary).trim();
  const has = safe(r.Interaction_State) === 'Has merged interactions / hosts' || number(r.Interaction_Rows) > 0;
  if (has && summary && !summary.toLowerCase().startsWith('no host/interaction')) return summary;
  if (has) return 'Merged interaction record present, but a specific host/partner pair was not available in the public summary build.';
  return 'No host/interaction record in merged layers.';
}
function renderTable() {
  $('taxaTableBody').innerHTML = pageRows().map(r => {
    const interaction = interactionText(r);
    return `<tr class="clickable ${selectedId === r.Taxon_ID ? 'selected' : ''}" tabindex="0" data-id="${esc(r.Taxon_ID)}">
      <td><div class="taxon-name">${esc(r.Clean_Scientific_Name)}</div><div class="common-name">${esc(r.Display_Common_Name || r.Family || '')}</div></td>
      <td><span class="badge ${statusClass(r)}">${esc(r.Friendly_Evidence_Level)}</span><div class="common-name">${esc(r.Friendly_Evidence_Label)}</div></td>
      <td><strong>${esc(r.Occurrence_Evidence_Score_0_5 || 0)}</strong>/5</td>
      <td><span class="badge group">${esc(shortGroup(r.Public_Display_Group))}</span></td>
      <td>${esc(shortText(r.Beginner_Role_Sentence, 125))}</td>
      <td>${esc(shortText(interaction, 125))}</td>
      <td>${sourcePills(r.Source_Layers_Present)}</td>
    </tr>`;
  }).join('');
}
function showDetailById(id, scroll = true) {
  const r = records.find(x => x.Taxon_ID === id) || filtered.find(x => x.Taxon_ID === id);
  if (!r) return;
  selectedId = id;
  const interaction = interactionText(r);
  const sourceUrl = safe(r.Public_Source_URL || r.Primary_URL || r.iNaturalist_Checklist_URL);
  $('detailCard').classList.add('visible');
  $('detailCard').innerHTML = `
    <div class="detail-hero">
      <div>
        <div class="detail-photo photo-slot detail-photo-slot" data-id="${esc(r.Taxon_ID)}"><span>loading iNaturalist photo…</span></div>
        <div id="detailPhotoCredit" class="photo-credit"></div>
      </div>
      <div class="detail-title">
        <h3><span class="taxon-name">${esc(r.Clean_Scientific_Name)}</span></h3>
        <div class="detail-sub">${esc(r.Display_Common_Name || r.Family || 'No common name in merged data')}</div>
        <div class="badges"><span class="badge ${statusClass(r)}">${esc(r.Friendly_Evidence_Level)}</span><span class="badge group">${esc(r.Public_Display_Group)}</span><span class="badge neutral">${esc(r.Interaction_State)}</span></div>
        <div class="score-meter"><strong>Local evidence score: ${esc(r.Occurrence_Evidence_Score_0_5 || 0)}/5</strong><div class="score-track">${[1,2,3,4,5].map(i => `<span class="score-cell ${i <= number(r.Occurrence_Evidence_Score_0_5) ? 'on' : ''}"></span>`).join('')}</div><div class="score-label">${esc(r.Friendly_Evidence_Explanation)}</div></div>
      </div>
    </div>
    <div class="detail-body">
      <div class="info-box"><h4>What it does</h4><p>${esc(r.Beginner_Role_Sentence)}</p></div>
      <div class="info-box"><h4>Why not simply native/not native?</h4><p>Fungi often lack county-level nativity lists. This record is shown by evidence strength: ${esc(r.Friendly_Evidence_Label.toLowerCase())}. That tells visitors how strong the local clue is without overstating origin.</p></div>
      <div class="info-box full"><h4>Interactions / hosts</h4><p>${esc(interaction)}</p></div>
      <div class="info-box"><h4>Source layers</h4><p class="source-pills">${sourcePills(r.Source_Layers_Present)}</p></div>
      <div class="info-box"><h4>Record counts</h4><p>MyCoPortal: ${esc(r.MyCoPortal_Records || 0)}<br>GBIF bounding-box: ${esc(r.GBIF_BBox_Records || 0)}<br>USDA refined: ${esc(r.USDA_Refined_Records || 0)}<br>Interaction rows: ${esc(r.Interaction_Rows || 0)}</p></div>
      <div class="info-box full"><h4>Sources / citation note</h4><p>${esc(r.Citation_Note || 'No row-level citation note available.')} ${sourceUrl ? `<br><a href="${esc(sourceUrl)}" target="_blank" rel="noopener">Open primary source link</a>` : ''}</p></div>
    </div>`;
  renderCurrentView();
  queueVisiblePhotos();
  loadPhotoForRecord(r, $('detailCard').querySelector('.detail-photo-slot'), $('detailPhotoCredit'));
  if (scroll) scrollToExploreTop(true);
}
function scrollToExploreTop(includeDetail) {
  const target = includeDetail && $('detailCard').classList.contains('visible') ? $('detailCard') : $('explore');
  target.scrollIntoView({behavior:'smooth', block:'start'});
}
function updateCharts() {
  drawBarChart('evidenceChart', countBy(filtered, r => r.Friendly_Evidence_Level).slice(0, 7));
  drawBarChart('groupChart', countBy(filtered, r => r.Public_Display_Group).slice(0, 8));
  drawBarChart('interactionChart', countBy(filtered, r => r.Interaction_State).slice(0, 4));
}
function drawBarChart(id, rows) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  $(id).innerHTML = rows.map(([label, count]) => `<div class="bar-row"><div class="bar-label" title="${esc(label)}">${esc(label)}</div><div class="bar"><span style="width:${Math.max(4, count/max*100)}%"></span></div><div class="bar-count">${count}</div></div>`).join('');
}
function setupPhotoObserver() {
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { const el = entry.target; observer.unobserve(el); const r = records.find(x => x.Taxon_ID === el.dataset.id); if (r) loadPhotoForRecord(r, el); } });
  }, {rootMargin: '250px'});
}
function queueVisiblePhotos() {
  document.querySelectorAll('.photo-slot').forEach(el => {
    if (!el.dataset.id || el.dataset.loadingQueued) return;
    el.dataset.loadingQueued = 'true';
    if (observer) observer.observe(el);
    else { const r = records.find(x => x.Taxon_ID === el.dataset.id); if (r) loadPhotoForRecord(r, el); }
  });
}
function placeholder(el, text = 'no iNat photo found') { el.innerHTML = `<span>${esc(text)}</span>`; }
async function loadPhotoForRecord(r, el, creditEl) {
  if (!el) return;
  const id = r.Taxon_ID;
  if (photoCache.has(id)) return applyPhoto(el, photoCache.get(id), creditEl);
  placeholder(el, 'looking for iNat photo…');
  try {
    const photo = await fetchINatPhoto(r);
    photoCache.set(id, photo);
    applyPhoto(el, photo, creditEl);
  } catch (err) {
    photoCache.set(id, null); placeholder(el, 'no iNat photo found'); if (creditEl) creditEl.textContent = 'No iNaturalist photo returned for this name.';
  }
}
function applyPhoto(el, photo, creditEl) {
  if (!photo || !photo.url) { placeholder(el); if (creditEl) creditEl.textContent = 'No iNaturalist photo returned for this name.'; return; }
  el.innerHTML = `<img src="${esc(photo.url)}" alt="Representative iNaturalist photo for ${esc(photo.name || 'taxon')}">`;
  if (creditEl) creditEl.innerHTML = `Photo source: <a href="${esc(photo.link || 'https://www.inaturalist.org')}" target="_blank" rel="noopener">iNaturalist</a>${photo.user ? ` · ${esc(photo.user)}` : ''}${photo.license ? ` · ${esc(photo.license)}` : ''}. Photo is a display aid, not occurrence proof.`;
}
async function fetchINatPhoto(r) {
  const name = safe(r.iNaturalist_Search_Name || r.Clean_Scientific_Name).trim();
  if (!name) return null;
  const box = DATA.hays_bbox || {swlat:29.70,swlng:-98.40,nelat:30.35,nelng:-97.65};
  // First try a local-ish observation photo, then a broad taxon representative photo.
  const obsUrl = `https://api.inaturalist.org/v1/observations?taxon_name=${encodeURIComponent(name)}&iconic_taxa=Fungi&photos=true&quality_grade=research&swlat=${box.swlat}&swlng=${box.swlng}&nelat=${box.nelat}&nelng=${box.nelng}&per_page=1&order=desc&order_by=observed_on`;
  let res = await fetch(obsUrl);
  if (res.ok) {
    const j = await res.json();
    const obs = j.results && j.results[0];
    const p = obs && obs.photos && obs.photos[0];
    if (p && p.url) return {url: photoSize(p.url), link: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`, user: obs.user && obs.user.login, license: p.license_code || obs.license_code || '', name};
  }
  const taxUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&iconic_taxa=Fungi&per_page=6`;
  res = await fetch(taxUrl);
  if (res.ok) {
    const j = await res.json();
    const exact = (j.results || []).find(t => safe(t.name).toLowerCase() === name.toLowerCase() && t.default_photo) || (j.results || []).find(t => t.default_photo);
    if (exact && exact.default_photo) return {url: photoSize(exact.default_photo.medium_url || exact.default_photo.url), link: `https://www.inaturalist.org/taxa/${exact.id}`, user: exact.default_photo.attribution || '', license: exact.default_photo.license_code || '', name: exact.name};
  }
  return null;
}
function photoSize(url) { return safe(url).replace('/square.', '/medium.').replace('/small.', '/medium.'); }
function downloadCSV() {
  const cols = ['Clean_Scientific_Name','Display_Common_Name','Family','Public_Display_Group','Friendly_Evidence_Level','Public_Evidence_Status','Occurrence_Evidence_Score_0_5','Beginner_Role_Sentence','Interaction_State','Interaction_Summary','Source_Layers_Present','Primary_URL','iNaturalist_Checklist_URL','Citation_Note'];
  const lines = [cols.join(',')].concat(filtered.map(r => cols.map(c => '"' + safe(r[c]).replace(/"/g,'""') + '"').join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'}); triggerDownload(blob, 'filtered_hays_fungi_taxa.csv');
}
function downloadJSON() { triggerDownload(new Blob([JSON.stringify(filtered, null, 2)], {type:'application/json'}), 'filtered_hays_fungi_taxa.json'); }
function triggerDownload(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast(`Downloaded ${filename}`); }
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('visible'); setTimeout(() => el.classList.remove('visible'), 1900); }

bootstrap().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<div class="warning">The dashboard could not load its data. Check that the data file or embedded JSON is present.</div>`);
});
