/* ═══════════════════════════════════════════════════
   BGU Indoor League Stats — app.js
═══════════════════════════════════════════════════ */

// ── LEAGUE ALIASES ───────────────────────────────────
const LEAGUE_ALIASES = {
  '2024 Indoor League':                 '2024 — Indoor Session 1',
  'Indoor Session 2 - The Eras League': '2024 — Indoor Session 2',
  'Indoor League 2025 Session 1':       '2025 — Indoor Session 1',
  'Indoor League 2':                    '2025 — Indoor Session 2',
  '2026 Indoor Session 1':              '2026 — Indoor Session 1',
  '2026 Indoor Session 2':              '2026 — Indoor Session 2',
};
const LEAGUE_URL_SLUGS = {
  '2024 Indoor League':                 '2024-indoor-league',
  'Indoor Session 2 - The Eras League': 'indoor-session-2-the-eras-league',
  'Indoor League 2025 Session 1':       'indoor-league-2025-session-1',
  'Indoor League 2':                    'indoor-league-2',
  '2026 Indoor Session 1':              '2026-indoor-session-1',
  '2026 Indoor Session 2':              '2026-indoor-session-2',
};
function leagueAlias(raw) { return LEAGUE_ALIASES[raw] || raw; }
function leagueSlug(raw)  { return LEAGUE_URL_SLUGS[raw] || raw.toLowerCase().replace(/\s+/g, '-'); }

// ── CSV PARSER ──────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; continue; }
      if (line[i] === ',' && !inQ) { fields.push(cur.trim()); cur = ''; continue; }
      cur += line[i];
    }
    fields.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = (fields[i] || '').replace(/^"|"$/g, '').trim());
    return obj;
  });
}

// ── DATA STORE ──────────────────────────────────────
const DATA = {
  rosters: [],
  results: [],
  leagues: [],
  teams: {},   // "league||team" → team object
  players: {}, // playerName → { appearances: [{league, team, roles}] }
};

// ── INIT ─────────────────────────────────────────────
function init() {
  Promise.all([
    fetch('league_rosters.csv').then(r => { if (!r.ok) throw new Error(); return r.text(); }),
    fetch('league_results.csv').then(r => { if (!r.ok) throw new Error(); return r.text(); }),
  ]).then(([rosterText, resultsText]) => {
    DATA.rosters = parseCSV(rosterText);
    DATA.results = parseCSV(resultsText);
    buildDataModel();
    hideLoading();
    renderHome();
  }).catch(() => {
    hideLoading();
    renderFileUpload();
  });
}

// ── FILE UPLOAD SCREEN ────────────────────────────────
function renderFileUpload() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="upload-screen">
      <div class="upload-hero">
        <div class="upload-disc">⬤</div>
        <h2>Load League Data</h2>
        <p>Select both CSV files exported from the scraper to get started.</p>
      </div>
      <div class="upload-grid">
        <label class="upload-card" id="label-rosters">
          <div class="upload-icon">📋</div>
          <div class="upload-card-title">league_rosters.csv</div>
          <div class="upload-card-sub" id="roster-status">No file selected</div>
          <input type="file" accept=".csv" id="input-rosters" hidden />
        </label>
        <label class="upload-card" id="label-results">
          <div class="upload-icon">🏆</div>
          <div class="upload-card-title">league_results.csv</div>
          <div class="upload-card-sub" id="results-status">No file selected</div>
          <input type="file" accept=".csv" id="input-results" hidden />
        </label>
      </div>
      <button id="load-btn" class="load-btn" disabled>Load Stats</button>
      <p class="upload-hint">Files are read locally — nothing is uploaded to any server.</p>
    </div>
  `;
  const style = document.createElement('style');
  style.textContent = `
    #upload-screen{display:flex;flex-direction:column;align-items:center;gap:2rem;padding:4rem 1rem;text-align:center;}
    .upload-hero{display:flex;flex-direction:column;align-items:center;gap:.75rem;}
    .upload-disc{font-size:3rem;color:var(--green-lime);filter:drop-shadow(0 0 14px var(--green-lime));}
    .upload-hero h2{font-family:var(--font-display);font-weight:900;font-size:2.5rem;text-transform:uppercase;letter-spacing:.04em;color:var(--white);}
    .upload-hero p{color:var(--gray-light);font-size:1rem;}
    .upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;width:100%;max-width:560px;}
    @media(max-width:500px){.upload-grid{grid-template-columns:1fr;}}
    .upload-card{display:flex;flex-direction:column;align-items:center;gap:.6rem;padding:2rem 1.5rem;background:var(--green-mid);border:2px dashed var(--green-turf);border-radius:6px;cursor:pointer;transition:all .2s;}
    .upload-card:hover{background:var(--green-field);border-color:var(--green-lime);}
    .upload-card.loaded{border-style:solid;border-color:var(--green-lime);}
    .upload-icon{font-size:2rem;line-height:1;}
    .upload-card-title{font-family:var(--font-display);font-weight:700;font-size:1rem;letter-spacing:.06em;color:var(--white);text-transform:uppercase;}
    .upload-card-sub{font-size:1rem;color:var(--gray-light);}
    .upload-card.loaded .upload-card-sub{color:var(--green-lime);}
    .load-btn{font-family:var(--font-display);font-weight:800;font-size:1.1rem;letter-spacing:.12em;text-transform:uppercase;padding:.8rem 3rem;border:none;border-radius:4px;background:var(--green-lime);color:var(--green-deep);cursor:pointer;transition:all .2s;}
    .load-btn:hover:not(:disabled){background:var(--white);transform:translateY(-2px);box-shadow:0 6px 20px rgba(142,207,99,.3);}
    .load-btn:disabled{opacity:.35;cursor:not-allowed;}
    .upload-hint{font-size:1rem;color:var(--gray-light);letter-spacing:.04em;}
  `;
  document.head.appendChild(style);
  const files = { rosters: null, results: null };
  function checkReady() { document.getElementById('load-btn').disabled = !(files.rosters && files.results); }
  function readFile(file, key, statusId, labelId) {
    const reader = new FileReader();
    reader.onload = e => {
      files[key] = e.target.result;
      document.getElementById(statusId).textContent = `✓ ${file.name}`;
      document.getElementById(labelId).classList.add('loaded');
      checkReady();
    };
    reader.readAsText(file);
  }
  document.getElementById('input-rosters').addEventListener('change', e => {
    if (e.target.files[0]) readFile(e.target.files[0], 'rosters', 'roster-status', 'label-rosters');
  });
  document.getElementById('input-results').addEventListener('change', e => {
    if (e.target.files[0]) readFile(e.target.files[0], 'results', 'results-status', 'label-results');
  });
  document.getElementById('load-btn').addEventListener('click', () => {
    DATA.rosters = parseCSV(files.rosters);
    DATA.results = parseCSV(files.results);
    buildDataModel();
    app.innerHTML = '';
    ['view-home','view-team','view-player'].forEach(id => {
      const s = document.createElement('section');
      s.id = id; s.className = 'view hidden';
      app.appendChild(s);
    });
    rebuildViewScaffold();
    renderHome();
  });
}

// ── BUILD DATA MODEL ────────────────────────────────
function buildDataModel() {
  const leagueSeen = new Set();
  DATA.rosters.forEach(row => {
    if (row.league && !leagueSeen.has(row.league)) {
      leagueSeen.add(row.league);
      DATA.leagues.push(row.league);
    }
  });
  DATA.rosters.forEach(row => {
    const tkey = teamKey(row.league, row.team);
    if (!DATA.teams[tkey]) {
      DATA.teams[tkey] = { league: row.league, team: row.team, players: [],
        wins: 0, losses: 0, ties: 0, unreported: 0, pf: 0, pa: 0, games: [] };
    }
    if (!DATA.teams[tkey].players.find(p => p.name === row.player_name))
      DATA.teams[tkey].players.push({ name: row.player_name, roles: row.roles || '' });
    if (row.player_name) {
      if (!DATA.players[row.player_name]) DATA.players[row.player_name] = { appearances: [] };
      const alreadyIn = DATA.players[row.player_name].appearances.some(
        a => a.league === row.league && a.team === row.team);
      if (!alreadyIn)
        DATA.players[row.player_name].appearances.push(
          { league: row.league, team: row.team, roles: row.roles || '' });
    }
  });
  DATA.results.forEach(row => {
    const homeKey = teamKey(row.league, row.home_team);
    const awayKey = teamKey(row.league, row.away_team);
    const homeScore  = parseInt(row.home_score) || 0;
    const awayScore  = parseInt(row.away_score) || 0;
    const homeResult = (row.home_result || '').toLowerCase();
    const awayResult = (row.away_result || '').toLowerCase();
    const dateTime   = row.date_time || '';
    const isUnrep    = homeResult === 'unreported';
    if (DATA.teams[homeKey]) {
      if (isUnrep) { DATA.teams[homeKey].unreported++; }
      else {
        if (homeResult === 'win')       DATA.teams[homeKey].wins++;
        else if (homeResult === 'loss') DATA.teams[homeKey].losses++;
        else if (homeResult === 'tie')  DATA.teams[homeKey].ties++;
        DATA.teams[homeKey].pf += homeScore;
        DATA.teams[homeKey].pa += awayScore;
      }
      DATA.teams[homeKey].games.push({ date_time: dateTime, opponent: row.away_team,
        team_score: homeScore, opp_score: awayScore, result: homeResult });
    }
    if (DATA.teams[awayKey]) {
      if (isUnrep) { DATA.teams[awayKey].unreported++; }
      else {
        if (awayResult === 'win')       DATA.teams[awayKey].wins++;
        else if (awayResult === 'loss') DATA.teams[awayKey].losses++;
        else if (awayResult === 'tie')  DATA.teams[awayKey].ties++;
        DATA.teams[awayKey].pf += awayScore;
        DATA.teams[awayKey].pa += homeScore;
      }
      DATA.teams[awayKey].games.push({ date_time: dateTime, opponent: row.home_team,
        team_score: awayScore, opp_score: homeScore, result: awayResult });
    }
  });
}

function teamKey(league, team) { return `${league}||${team}`; }
function winPct(wins, losses, ties) {
  const gp = wins + losses + ties;
  return gp === 0 ? null : (wins + ties * 0.5) / gp;
}
function fmtPct(p)          { return p === null ? '—' : (p * 100).toFixed(1) + '%'; }
function fmtDiff(n, hasGames) { return !hasGames ? '—' : n > 0 ? '+' + n : String(n); }

// ── ROUTING / STATE ──────────────────────────────────
const state = { view: 'home', team: null, player: null };
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${name}`).classList.remove('hidden');
}
function hideLoading() {
  const el = document.getElementById('loading-screen');
  if (el) el.style.display = 'none';
}

// ── SCAFFOLD ──────────────────────────────────────────
function homeScaffoldHTML() {
  return `
    <div class="view-hero">
      <h1 class="hero-title">Home</h1>
      <p class="hero-sub">Data sourced from <a href="https://bluegrassultimate.org" target="_blank" rel="noopener" class="hero-link">bluegrassultimate.org</a>.</p>
    </div>
    <div class="section-label">PLAYERS</div>
    <div id="players-list-wrapper">
      <div id="players-alpha-list" class="alpha-player-list"></div>
    </div>
    <div class="section-label" style="margin-top:3rem">TEAMS</div>
    <div id="teams-table-wrapper" style="overflow-x:auto;border:1px solid var(--green-turf);border-radius:var(--radius)">
      <table id="teams-table" class="stats-table">
        <thead><tr id="teams-thead-row"></tr></thead>
        <tbody id="teams-tbody"></tbody>
      </table>
    </div>
  `;
}

function rebuildViewScaffold() {
  document.getElementById('view-home').innerHTML = homeScaffoldHTML();
  document.getElementById('view-team').innerHTML = `
    <div class="view-hero">
      <div class="team-hero-text">
        <h1 id="team-hero-name" class="hero-title"></h1>
        <p id="team-hero-league" class="hero-sub"></p>
      </div>
    </div>
    <div class="team-stat-strip" id="team-stat-strip"></div>
    <div class="two-col-layout">
      <div class="col-left">
        <div class="section-label">ROSTER</div>
        <ul id="team-roster-list" class="roster-list"></ul>
      </div>
      <div class="col-right">
        <div class="section-label">GAME LOG</div>
        <div id="team-game-log" class="game-log"></div>
        <div id="team-source-link"></div>
      </div>
    </div>
  `;
  document.getElementById('view-player').innerHTML = `
    <div class="view-hero" style="flex-wrap:wrap;gap:1rem">
      <div>
        <h1 id="player-hero-name" class="hero-title"></h1>
        <p id="player-hero-sub" class="hero-sub"></p>
      </div>
      <div class="compare-wrap">
        <label class="compare-label" for="compare-select">Compare with</label>
        <select id="compare-select" class="compare-select">
          <option value="">— select player —</option>
        </select>
      </div>
    </div>
    <div id="player-content"></div>
  `;
}

// ── BREADCRUMB ───────────────────────────────────────
function renderBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = '';
  const parts = [{ label: 'Home', action: () => renderHome() }];
  if (state.view === 'team' && state.team)
    parts.push({ label: state.team.team, action: null });
  else if (state.view === 'player' && state.player)
    parts.push({ label: state.player, action: null });
  parts.forEach((p, i) => {
    const span = document.createElement('span');
    span.className = i < parts.length - 1 ? 'crumb' : 'crumb-current';
    span.textContent = p.label;
    if (p.action) span.addEventListener('click', p.action);
    bc.appendChild(span);
    if (i < parts.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'sep'; sep.textContent = '›';
      bc.appendChild(sep);
    }
  });
}

// ══════════════════════════════════════════════════════
//  HOME VIEW
// ══════════════════════════════════════════════════════
function renderHome() {
  state.view = 'home'; state.team = null; state.player = null;
  showView('home');
  renderBreadcrumb();
  renderPlayersAlpha();
  renderTeamsTable();
}

// ── TEAMS TABLE (sortable) ────────────────────────────
const teamSort = { col: 'league', dir: 1 };

const TEAM_COLS = [
  { key: 'team',       label: 'Team',          numeric: false },
  { key: 'league',     label: 'Season',        numeric: false },
  { key: 'wins',       label: 'Wins',          numeric: true  },
  { key: 'losses',     label: 'Losses',        numeric: true  },
  { key: 'ties',       label: 'Ties',          numeric: true  },
  { key: 'unreported', label: 'Unreported',    numeric: true  },
  { key: 'wp',         label: 'Win %',         numeric: true  },
  { key: 'diff',       label: '+/−',           numeric: true  },
  { key: 'pf',         label: 'Points For',    numeric: true  },
  { key: 'pa',         label: 'Points Against',numeric: true  },
];

function renderTeamsTable() {
  // Build header
  const headerRow = document.getElementById('teams-thead-row');
  headerRow.innerHTML = '';
  TEAM_COLS.forEach(col => {
    const th = document.createElement('th');
    th.className = (col.numeric ? 'col-stat' : 'col-name') + ' sortable-th';
    th.dataset.col = col.key;
    th.style.cursor = 'pointer'; th.style.userSelect = 'none';
    const isActive = teamSort.col === col.key;
    const arrow = isActive ? (teamSort.dir === 1 ? ' ↑' : ' ↓') : ' ↕';
    th.innerHTML = `${col.label}<span class="sort-arrow${isActive ? ' sort-active' : ''}">${arrow}</span>`;
    th.addEventListener('click', () => {
      if (teamSort.col === col.key) teamSort.dir *= -1;
      else { teamSort.col = col.key; teamSort.dir = col.numeric ? -1 : 1; }
      renderTeamsTable();
    });
    headerRow.appendChild(th);
  });

  const tbody = document.getElementById('teams-tbody');
  tbody.innerHTML = '';

  let teams = Object.values(DATA.teams).map(t => {
    const gp = t.wins + t.losses + t.ties;
    return { ...t, gp, wp: winPct(t.wins, t.losses, t.ties), diff: t.pf - t.pa };
  });

  teams.sort((a, b) => {
    const col = teamSort.col;
    const dir = teamSort.dir;
    if (col === 'team')   return dir * a.team.localeCompare(b.team);
    if (col === 'league') {
      const la = DATA.leagues.indexOf(a.league);
      const lb = DATA.leagues.indexOf(b.league);
      return dir * (la - lb);
    }
    if (col === 'wp') {
      return dir * ((a.wp === null ? -1 : a.wp) - (b.wp === null ? -1 : b.wp));
    }
    return dir * ((a[col] || 0) - (b[col] || 0));
  });

  if (teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No teams found</td></tr>`;
    return;
  }

  teams.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-name"><div class="team-name-cell">${esc(t.team)}</div></td>
      <td><span class="league-pill" title="${esc(leagueAlias(t.league))}">${esc(leagueAlias(t.league))}</span></td>
      <td class="col-stat stat-win">${t.wins}</td>
      <td class="col-stat" style="color:var(--red)">${t.losses}</td>
      <td class="col-stat" style="color:var(--blue-tie)">${t.ties}</td>
      <td class="col-stat" style="color:var(--gray-light)">${t.unreported || 0}</td>
      <td class="col-stat ${t.wp === null ? 'stat-neu' : t.wp >= 0.5 ? 'stat-pos' : 'stat-neg'}">${fmtPct(t.wp)}</td>
      <td class="col-stat ${t.diff > 0 ? 'stat-pos' : t.diff < 0 ? 'stat-neg' : 'stat-neu'}">${fmtDiff(t.diff, t.gp > 0)}</td>
      <td class="col-stat">${t.pf}</td>
      <td class="col-stat" style="color:var(--gray-light)">${t.pa}</td>
    `;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => renderTeam(t));
    tr.addEventListener('mouseenter', () => tr.style.background = 'var(--green-field)');
    tr.addEventListener('mouseleave', () => tr.style.background = '');
    tbody.appendChild(tr);
  });
}

// ── PLAYERS TABLE (sortable) ──────────────────────────
const playerSort = { col: 'name', dir: 1 };

function buildPlayerRows() {
  return Object.keys(DATA.players).map(name => {
    const pData = DATA.players[name];
    let wins = 0, losses = 0, ties = 0, pf = 0, pa = 0;
    const seasons = new Set();
    pData.appearances.forEach(a => {
      const tObj = DATA.teams[teamKey(a.league, a.team)];
      if (tObj) {
        wins += tObj.wins; losses += tObj.losses; ties += tObj.ties;
        pf   += tObj.pf;  pa     += tObj.pa;
        seasons.add(a.league);
      }
    });
    const gp = wins + losses + ties;
    return { name, wins, losses, ties, gp, wp: winPct(wins, losses, ties),
             diff: pf - pa, pf, pa, seasons: seasons.size };
  });
}

const PLAYER_COLS = [
  { key: 'name',    label: 'Player',          numeric: false },
  { key: 'record',  label: 'Record',          numeric: false },
  { key: 'wp',      label: 'Win %',           numeric: true  },
  { key: 'diff',    label: 'Point Diff',      numeric: true  },
  { key: 'pf',      label: 'Points For',      numeric: true  },
  { key: 'pa',      label: 'Points Against',  numeric: true  },
  { key: 'seasons', label: 'Seasons Played',  numeric: true  },
];

function renderPlayersAlpha() {
  const container = document.getElementById('players-alpha-list');
  container.innerHTML = '';
  const rows = buildPlayerRows();
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state">No players found</div>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'overflow-x:auto;border:1px solid var(--green-turf);border-radius:var(--radius)';
  const table = document.createElement('table');
  table.className = 'stats-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  PLAYER_COLS.forEach(col => {
    const th = document.createElement('th');
    th.className = (col.numeric ? 'col-stat' : 'col-name') + ' sortable-th';
    th.style.cursor = 'pointer'; th.style.userSelect = 'none';
    const isActive = playerSort.col === col.key;
    const arrow = isActive ? (playerSort.dir === 1 ? ' ↑' : ' ↓') : ' ↕';
    th.innerHTML = `${col.label}<span class="sort-arrow${isActive ? ' sort-active' : ''}">${arrow}</span>`;
    th.addEventListener('click', () => {
      if (playerSort.col === col.key) playerSort.dir *= -1;
      else { playerSort.col = col.key; playerSort.dir = col.numeric ? -1 : 1; }
      renderPlayersAlpha();
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Sort
  rows.sort((a, b) => {
    const col = playerSort.col, dir = playerSort.dir;
    if (col === 'name')   return dir * a.name.localeCompare(b.name);
    if (col === 'record') return dir * ((a.wins * 1000 + a.ties) - (b.wins * 1000 + b.ties));
    if (col === 'wp')     return dir * ((a.wp === null ? -1 : a.wp) - (b.wp === null ? -1 : b.wp));
    return dir * ((a[col] || 0) - (b[col] || 0));
  });

  // Body
  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td class="col-name" style="font-family:var(--font-display);font-weight:700">${esc(r.name)}</td>
      <td class="col-stat">${r.wins}–${r.losses}–${r.ties}</td>
      <td class="col-stat ${r.wp === null ? 'stat-neu' : r.wp >= 0.5 ? 'stat-pos' : 'stat-neg'}">${fmtPct(r.wp)}</td>
      <td class="col-stat ${r.diff > 0 ? 'stat-pos' : r.diff < 0 ? 'stat-neg' : 'stat-neu'}">${fmtDiff(r.diff, r.gp > 0)}</td>
      <td class="col-stat">${r.pf}</td>
      <td class="col-stat" style="color:var(--gray-light)">${r.pa}</td>
      <td class="col-stat">${r.seasons}</td>
    `;
    tr.addEventListener('click', () => renderPlayer(r.name));
    tr.addEventListener('mouseenter', () => tr.style.background = 'var(--green-field)');
    tr.addEventListener('mouseleave', () => tr.style.background = '');
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

// ══════════════════════════════════════════════════════
//  TEAM VIEW
// ══════════════════════════════════════════════════════
function renderTeam(teamObj) {
  state.view = 'team'; state.team = teamObj; state.player = null;
  showView('team');
  renderBreadcrumb();

  document.getElementById('team-hero-name').textContent = teamObj.team;
  document.getElementById('team-hero-league').textContent = leagueAlias(teamObj.league);

  const gp = teamObj.wins + teamObj.losses + teamObj.ties;
  const wp = winPct(teamObj.wins, teamObj.losses, teamObj.ties);
  const diff = teamObj.pf - teamObj.pa;

  const strip = document.getElementById('team-stat-strip');
  strip.innerHTML = '';
  [
    { label: 'Record',         value: `${teamObj.wins}–${teamObj.losses}–${teamObj.ties}`, cls: '' },
    { label: 'Win %',          value: fmtPct(wp), cls: wp === null ? '' : wp >= 0.5 ? 'good' : 'bad' },
    { label: 'Point Diff',     value: fmtDiff(diff, gp > 0), cls: diff > 0 ? 'good' : diff < 0 ? 'bad' : '' },
    { label: 'Points For',     value: teamObj.pf, cls: '' },
    { label: 'Points Against', value: teamObj.pa, cls: '' },
    { label: 'Games Played',   value: gp, cls: '' },
  ].forEach(s => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-card-label">${s.label}</div><div class="stat-card-value ${s.cls}">${s.value}</div>`;
    strip.appendChild(card);
  });

  // Roster
  const rosterList = document.getElementById('team-roster-list');
  rosterList.innerHTML = '';
  [...teamObj.players].sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    const li = document.createElement('li');
    const isCaptain = p.roles.toLowerCase().includes('captain');
    li.innerHTML = `<span class="player-name">${esc(p.name)}</span>
      <span class="player-role ${isCaptain ? 'captain' : ''}">${esc(shortRole(p.roles))}</span>`;
    li.addEventListener('click', () => renderPlayer(p.name));
    rosterList.appendChild(li);
  });

  // Game log
  const gameLog = document.getElementById('team-game-log');
  gameLog.innerHTML = '';
  if (teamObj.games.length === 0) {
    gameLog.innerHTML = '<div class="empty-state">No games recorded</div>';
  } else {
    teamObj.games.forEach(g => {
      const card = document.createElement('div');
      card.className = `game-card ${g.result || 'unreported'}`;
      const isUnrep = g.result === 'unreported';
      const scoreHtml = isUnrep
        ? `<span style="color:var(--gray-light);font-family:var(--font-display);letter-spacing:.1em;font-size:1rem">NOT REPORTED</span>`
        : `<div class="game-score"><span class="s-team">${g.team_score}</span><span class="s-dash">–</span><span class="s-opp">${g.opp_score}</span></div>`;
      card.innerHTML = `
        <div class="game-date">${esc(g.date_time)}</div>
        <div class="game-matchup"><span class="game-vs">vs</span> <span class="game-opponent">${esc(g.opponent)}</span></div>
        <div style="display:flex;align-items:center;gap:.75rem">
          ${scoreHtml}
          <span class="result-badge ${g.result || 'unreported'}">${(g.result || 'N/A').toUpperCase()}</span>
        </div>
      `;
      gameLog.appendChild(card);
    });
  }

  const slug = leagueSlug(teamObj.league);
  const scheduleUrl = `https://bluegrassultimate.org/e/${slug}/schedule`;
  document.getElementById('team-source-link').innerHTML = `
    <div class="source-link-block">
      <span class="source-label">Data sourced from</span>
      <a href="${scheduleUrl}" target="_blank" rel="noopener" class="source-url">${scheduleUrl}</a>
    </div>`;
}

// ══════════════════════════════════════════════════════
//  PLAYER CAREER STATS HELPER
// ══════════════════════════════════════════════════════
function computeCareer(playerName) {
  const pData = DATA.players[playerName];
  if (!pData) return null;
  let wins = 0, losses = 0, ties = 0, pf = 0, pa = 0;
  const seasons = new Set();
  pData.appearances.forEach(a => {
    const tObj = DATA.teams[teamKey(a.league, a.team)];
    if (tObj) {
      wins += tObj.wins; losses += tObj.losses; ties += tObj.ties;
      pf   += tObj.pf;  pa     += tObj.pa;
      seasons.add(a.league);
    }
  });
  return { wins, losses, ties, gp: wins + losses + ties,
           wp: winPct(wins, losses, ties), diff: pf - pa, pf, pa,
           seasons: seasons.size, appearances: pData.appearances };
}

// ── Shared games between two players ─────────────────
function computeSharedGames(nameA, nameB) {
  // For each game in results, check if A and B were both present (same or opposite teams)
  const together = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: [] };
  const against  = { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: [] };

  // Build lookup: for each league+team combo A and B played on
  const teamsA = new Set((DATA.players[nameA]?.appearances || []).map(a => teamKey(a.league, a.team)));
  const teamsB = new Set((DATA.players[nameB]?.appearances || []).map(a => teamKey(a.league, a.team)));

  DATA.results.forEach(row => {
    if ((row.home_result || '').toLowerCase() === 'unreported') return;
    const hk = teamKey(row.league, row.home_team);
    const ak = teamKey(row.league, row.away_team);

    const aOnHome = teamsA.has(hk), aOnAway = teamsA.has(ak);
    const bOnHome = teamsB.has(hk), bOnAway = teamsB.has(ak);

    const aPlayed = aOnHome || aOnAway;
    const bPlayed = bOnHome || bOnAway;
    if (!aPlayed || !bPlayed) return;

    const homeScore = parseInt(row.home_score) || 0;
    const awayScore = parseInt(row.away_score) || 0;
    const homeResult = (row.home_result || '').toLowerCase();

    // Together: both on same team
    if ((aOnHome && bOnHome) || (aOnAway && bOnAway)) {
      const aIsHome = aOnHome;
      const teamScore = aIsHome ? homeScore : awayScore;
      const oppScore  = aIsHome ? awayScore : homeScore;
      const result    = aIsHome ? homeResult : (row.away_result || '').toLowerCase();
      if (result === 'win')       { together.wins++;   together.pf += teamScore; together.pa += oppScore; }
      else if (result === 'loss') { together.losses++;  together.pf += teamScore; together.pa += oppScore; }
      else if (result === 'tie')  { together.ties++;   together.pf += teamScore; together.pa += oppScore; }
      together.games.push({ date: row.date_time, league: row.league,
        teamA: aIsHome ? row.home_team : row.away_team,
        opponent: aIsHome ? row.away_team : row.home_team,
        score: `${teamScore}–${oppScore}`, result });
    }
    // Against: on opposite teams
    else if ((aOnHome && bOnAway) || (aOnAway && bOnHome)) {
      const aIsHome = aOnHome;
      const aScore = aIsHome ? homeScore : awayScore;
      const bScore = aIsHome ? awayScore : homeScore;
      const aResult = aIsHome ? homeResult : (row.away_result || '').toLowerCase();
      if (aResult === 'win')       { against.wins++;   against.pf += aScore; against.pa += bScore; }
      else if (aResult === 'loss') { against.losses++;  against.pf += aScore; against.pa += bScore; }
      else if (aResult === 'tie')  { against.ties++;   against.pf += aScore; against.pa += bScore; }
      against.games.push({ date: row.date_time, league: row.league,
        teamA: aIsHome ? row.home_team : row.away_team,
        teamB: aIsHome ? row.away_team : row.home_team,
        score: `${aScore}–${bScore}`, result: aResult });
    }
  });

  together.wp = winPct(together.wins, together.losses, together.ties);
  against.wp  = winPct(against.wins,  against.losses,  against.ties);
  return { together, against };
}

// ══════════════════════════════════════════════════════
//  PLAYER VIEW
// ══════════════════════════════════════════════════════
function renderPlayer(playerName, compareWith) {
  state.view = 'player'; state.player = playerName;
  showView('player');
  renderBreadcrumb();

  document.getElementById('player-hero-name').textContent = playerName;
  document.getElementById('player-hero-sub').textContent = '';

  // Populate compare dropdown
  const sel = document.getElementById('compare-select');
  sel.innerHTML = '<option value="">— select player —</option>';
  Object.keys(DATA.players).sort((a, b) => a.localeCompare(b)).forEach(name => {
    if (name === playerName) return;
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    if (name === compareWith) opt.selected = true;
    sel.appendChild(opt);
  });
  // Remove old listener and attach fresh one
  const newSel = sel.cloneNode(true);
  sel.parentNode.replaceChild(newSel, sel);
  newSel.addEventListener('change', e => {
    renderPlayer(playerName, e.target.value || undefined);
  });

  const content = document.getElementById('player-content');
  content.innerHTML = '';

  const career = computeCareer(playerName);
  if (!career) {
    content.innerHTML = '<div class="empty-state">No records found</div>';
    return;
  }

  const totalSeasons = career.seasons;
  const totalTeams   = career.appearances.length;
  document.getElementById('player-hero-sub').textContent =
    `${totalTeams} team appearance${totalTeams !== 1 ? 's' : ''} across ${totalSeasons} season${totalSeasons !== 1 ? 's' : ''}`;

  if (compareWith && DATA.players[compareWith]) {
    // ── COMPARE MODE ──────────────────────────────────
    renderCompareMode(content, playerName, compareWith, career);
  } else {
    // ── SOLO MODE ─────────────────────────────────────
    renderSoloMode(content, playerName, career);
  }
}

// ── Render stat strip helper ──────────────────────────
function makeStatStrip(stats) {
  const strip = document.createElement('div');
  strip.className = 'team-stat-strip';
  strip.style.marginBottom = '2rem';
  stats.forEach(s => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-card-label">${s.label}</div><div class="stat-card-value ${s.cls || ''}">${s.value}</div>`;
    strip.appendChild(card);
  });
  return strip;
}

// ── Solo player page ──────────────────────────────────
function renderSoloMode(container, playerName, career) {
  const { wins, losses, ties, gp, wp, diff, pf, pa, seasons, appearances } = career;

  container.appendChild(makeStatStrip([
    { label: 'Record',          value: `${wins}–${losses}–${ties}`, cls: '' },
    { label: 'Win %',           value: fmtPct(wp), cls: wp === null ? '' : wp >= 0.5 ? 'good' : 'bad' },
    { label: 'Point Diff',      value: fmtDiff(diff, gp > 0), cls: diff > 0 ? 'good' : diff < 0 ? 'bad' : '' },
    { label: 'Points For',      value: pf, cls: '' },
    { label: 'Points Against',  value: pa, cls: '' },
    { label: 'Seasons Played',  value: seasons, cls: '' },
  ]));

  const teamsList = document.createElement('div');
  teamsList.className = 'player-teams';
  appearances.forEach(a => {
    const tObj = DATA.teams[teamKey(a.league, a.team)];
    const block = document.createElement('div');
    block.className = 'player-team-block';
    const tGp   = tObj ? tObj.wins + tObj.losses + tObj.ties : 0;
    const tWp   = tObj ? winPct(tObj.wins, tObj.losses, tObj.ties) : null;
    const tDiff = tObj ? tObj.pf - tObj.pa : 0;
    const isCap = (a.roles || '').toLowerCase().includes('captain');
    block.innerHTML = `
      <div class="team-league">${esc(leagueAlias(a.league))}</div>
      <h3 class="player-team-name">${esc(a.team)}</h3>
      ${isCap ? `<div class="team-role">Captain</div>` : ''}
      ${tObj && tGp > 0 ? `
        <div class="player-team-stats">
          <div class="pts-item"><span class="pts-label">Record</span><strong class="pts-value">${tObj.wins}–${tObj.losses}–${tObj.ties}</strong></div>
          <div class="pts-item"><span class="pts-label">Win %</span><strong class="pts-value" style="color:${tWp >= 0.5 ? 'var(--green-lime)' : 'var(--red)'}">${fmtPct(tWp)}</strong></div>
          <div class="pts-item"><span class="pts-label">Point Diff</span><strong class="pts-value" style="color:${tDiff > 0 ? 'var(--green-lime)' : tDiff < 0 ? 'var(--red)' : 'var(--gray-light)'}">${fmtDiff(tDiff, true)}</strong></div>
          <div class="pts-item"><span class="pts-label">Points For</span><strong class="pts-value">${tObj.pf}</strong></div>
          <div class="pts-item"><span class="pts-label">Points Against</span><strong class="pts-value" style="color:var(--gray-light)">${tObj.pa}</strong></div>
        </div>` : tObj ? `<div style="color:var(--gray-light);margin-top:.5rem">No completed games recorded</div>` : ''}
    `;
    block.querySelector('.player-team-name').addEventListener('click', () => { if (tObj) renderTeam(tObj); });
    teamsList.appendChild(block);
  });
  container.appendChild(teamsList);
}

// ── Compare two players ────────────────────────────────
function renderCompareMode(container, nameA, nameB, careerA) {
  const careerB = computeCareer(nameB);
  const { together, against } = computeSharedGames(nameA, nameB);

  // ── Side-by-side career comparison ──
  const compareGrid = document.createElement('div');
  compareGrid.className = 'compare-grid';
  compareGrid.innerHTML = `
    <div class="compare-col">
      <div class="compare-player-name">${esc(nameA)}</div>
      ${careerStatCards(careerA)}
    </div>
    <div class="compare-divider"></div>
    <div class="compare-col">
      <div class="compare-player-name">${esc(nameB)}</div>
      ${careerStatCards(careerB)}
    </div>
  `;
  container.appendChild(compareGrid);

  // ── Together section ──
  const togetherGP = together.wins + together.losses + together.ties;
  if (togetherGP > 0) {
    const togetherSection = document.createElement('div');
    togetherSection.style.marginTop = '2rem';
    togetherSection.innerHTML = `<div class="section-label">PLAYED TOGETHER (${togetherGP} game${togetherGP !== 1 ? 's' : ''})</div>`;
    const togetherDiff = together.pf - together.pa;
    togetherSection.appendChild(makeStatStrip([
      { label: 'Record',         value: `${together.wins}–${together.losses}–${together.ties}`, cls: '' },
      { label: 'Win %',          value: fmtPct(together.wp), cls: together.wp === null ? '' : together.wp >= 0.5 ? 'good' : 'bad' },
      { label: 'Point Diff',     value: fmtDiff(togetherDiff, true), cls: togetherDiff > 0 ? 'good' : togetherDiff < 0 ? 'bad' : '' },
      { label: 'Points For',     value: together.pf, cls: '' },
      { label: 'Points Against', value: together.pa, cls: '' },
    ]));
    // Game log
    const log = document.createElement('div');
    log.className = 'game-log';
    together.games.forEach(g => {
      const card = document.createElement('div');
      card.className = `game-card ${g.result || 'unreported'}`;
      card.innerHTML = `
        <div class="game-date">${esc(g.date)} · ${esc(leagueAlias(g.league))}</div>
        <div class="game-matchup"><span style="color:var(--gray-light)">${esc(g.teamA)}</span> <span class="game-vs">vs</span> <span class="game-opponent">${esc(g.opponent)}</span></div>
        <div style="display:flex;align-items:center;gap:.75rem">
          <div class="game-score"><span class="s-team">${g.score.split('–')[0]}</span><span class="s-dash">–</span><span class="s-opp">${g.score.split('–')[1]}</span></div>
          <span class="result-badge ${g.result}">${g.result.toUpperCase()}</span>
        </div>
      `;
      log.appendChild(card);
    });
    togetherSection.appendChild(log);
    container.appendChild(togetherSection);
  } else {
    const none = document.createElement('div');
    none.style.marginTop = '2rem';
    none.innerHTML = `<div class="section-label">PLAYED TOGETHER</div><div class="empty-state">No games found where both players were on the same team</div>`;
    container.appendChild(none);
  }

  // ── Against section ──
  const againstGP = against.wins + against.losses + against.ties;
  const againstSection = document.createElement('div');
  againstSection.style.marginTop = '2rem';
  againstSection.innerHTML = `<div class="section-label">PLAYED AGAINST EACH OTHER (${againstGP} game${againstGP !== 1 ? 's' : ''})</div>`;
  if (againstGP > 0) {
    const againstDiff = against.pf - against.pa;
    againstSection.appendChild(makeStatStrip([
      { label: `${nameA.split(' ')[0]}'s Record`, value: `${against.wins}–${against.losses}–${against.ties}`, cls: '' },
      { label: `${nameA.split(' ')[0]}'s Win %`,  value: fmtPct(against.wp), cls: against.wp === null ? '' : against.wp >= 0.5 ? 'good' : 'bad' },
      { label: `${nameA.split(' ')[0]}'s Diff`,   value: fmtDiff(againstDiff, true), cls: againstDiff > 0 ? 'good' : againstDiff < 0 ? 'bad' : '' },
      { label: 'Pts For (A)',     value: against.pf, cls: '' },
      { label: 'Pts Against (A)', value: against.pa, cls: '' },
    ]));
    const log = document.createElement('div');
    log.className = 'game-log';
    against.games.forEach(g => {
      const card = document.createElement('div');
      card.className = `game-card ${g.result || 'unreported'}`;
      card.innerHTML = `
        <div class="game-date">${esc(g.date)} · ${esc(leagueAlias(g.league))}</div>
        <div class="game-matchup">
          <span style="color:var(--green-lime)">${esc(g.teamA)}</span>
          <span class="game-vs">vs</span>
          <span style="color:var(--red)">${esc(g.teamB)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.75rem">
          <div class="game-score"><span class="s-team">${g.score.split('–')[0]}</span><span class="s-dash">–</span><span class="s-opp">${g.score.split('–')[1]}</span></div>
          <span class="result-badge ${g.result}">${g.result.toUpperCase()} (${nameA.split(' ')[0]})</span>
        </div>
      `;
      log.appendChild(card);
    });
    againstSection.appendChild(log);
  } else {
    againstSection.innerHTML += `<div class="empty-state">No games found where these players faced each other</div>`;
  }
  container.appendChild(againstSection);
}

function careerStatCards(career) {
  const { wins, losses, ties, gp, wp, diff, pf, pa, seasons } = career;
  const stats = [
    { label: 'Record',         value: `${wins}–${losses}–${ties}`, cls: '' },
    { label: 'Win %',          value: fmtPct(wp), cls: wp === null ? '' : wp >= 0.5 ? 'good' : 'bad' },
    { label: 'Point Diff',     value: fmtDiff(diff, gp > 0), cls: diff > 0 ? 'good' : diff < 0 ? 'bad' : '' },
    { label: 'Points For',     value: pf, cls: '' },
    { label: 'Points Against', value: pa, cls: '' },
    { label: 'Seasons Played', value: seasons, cls: '' },
  ];
  return stats.map(s =>
    `<div class="compare-stat-row">
      <span class="compare-stat-label">${s.label}</span>
      <span class="compare-stat-value ${s.cls}">${s.value}</span>
    </div>`
  ).join('');
}

// ── UTILITIES ────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function shortRole(roles) {
  if (!roles) return 'player';
  const r = roles.toLowerCase();
  if (r.includes('captain') && r.includes('spirit')) return 'captain / spirit';
  if (r.includes('captain'))   return 'captain';
  if (r.includes('admin'))     return 'admin';
  if (r.includes('volunteer')) return 'volunteer';
  return 'player';
}

document.getElementById('home-link').addEventListener('click', () => renderHome());
init();
