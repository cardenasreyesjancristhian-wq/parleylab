const MLB_API = "https://statsapi.mlb.com/api/v1";
const MLB_SCHEDULE_URL = `${MLB_API}/schedule`;
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const TIME_ZONE = "America/Mazatlan";

const state = {
  games: [],
  filteredGames: [],
  parley: safelyLoadParley(),
  cache: new Map(),
  odds: [],
  oddsAvailable: false,
};

const els = {
  dateInput: document.querySelector("#dateInput"),
  statusFilter: document.querySelector("#statusFilter"),
  searchInput: document.querySelector("#searchInput"),
  refreshBtn: document.querySelector("#refreshBtn"),
  gamesGrid: document.querySelector("#gamesGrid"),
  loading: document.querySelector("#loading"),
  emptyState: document.querySelector("#emptyState"),
  gamesCount: document.querySelector("#gamesCount"),
  pitchersCount: document.querySelector("#pitchersCount"),
  liveCount: document.querySelector("#liveCount"),
  marketStatus: document.querySelector("#marketStatus"),
  modelStatus: document.querySelector("#modelStatus"),
  lastUpdated: document.querySelector("#lastUpdated"),
  template: document.querySelector("#gameCardTemplate"),
  dialog: document.querySelector("#gameDialog"),
  dialogContent: document.querySelector("#dialogContent"),
  parleyPicks: document.querySelector("#parleyPicks"),
  clearParleyBtn: document.querySelector("#clearParleyBtn"),
  stakeInput: document.querySelector("#stakeInput"),
  pickCount: document.querySelector("#pickCount"),
  combinedOdds: document.querySelector("#combinedOdds"),
  combinedAmerican: document.querySelector("#combinedAmerican"),
  impliedProbability: document.querySelector("#impliedProbability"),
  potentialProfit: document.querySelector("#potentialProfit"),
  potentialReturn: document.querySelector("#potentialReturn"),
  parleyWarning: document.querySelector("#parleyWarning"),
  navPickCount: document.querySelector("#navPickCount"),
  toast: document.querySelector("#toast"),
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

let appInitialized = false;

function init() {
  if (appInitialized) return;
  appInitialized = true;
  els.dateInput.value = getLocalDateISO();
  els.dateInput.addEventListener("change", loadGames);
  els.statusFilter.addEventListener("change", applyFilters);
  els.searchInput.addEventListener("input", applyFilters);
  els.refreshBtn.addEventListener("click", () => {
    state.cache.clear();
    loadGames();
  });
  els.clearParleyBtn.addEventListener("click", () => {
    if (state.parley.length && !confirm("¿Eliminar todas las selecciones?")) return;
    state.parley = [];
    persistParley();
    renderParley();
  });
  els.stakeInput.addEventListener("input", renderParley);
  renderParley();
  loadGames();
}

async function loadGames() {
  setLoading(true);
  restoreNotice();
  try {
    const date = els.dateInput.value;
    const params = new URLSearchParams({
      sportId: "1",
      date,
      hydrate: "probablePitcher,team,venue(location)",
    });
    const data = await fetchJson(`${MLB_SCHEDULE_URL}?${params}`);
    const rawGames = data.dates?.flatMap(day => day.games || []) || [];
    state.games = await Promise.all(rawGames.map(normalizeGame));
    await loadOdds();
    applyFilters();
    els.lastUpdated.textContent = `Actualizado ${formatTime(new Date())}`;
  } catch (error) {
    console.error(error);
    state.games = [];
    state.filteredGames = [];
    renderGames();
    showNotice(`No se pudo descargar la jornada: ${error.message}.`, true);
  } finally {
    setLoading(false);
  }
}

async function normalizeGame(game) {
  const venue = game.venue || {};
  const coords = extractCoordinates(venue);
  let weather = null;

  if (coords && els.dateInput.value === getLocalDateISO()) {
    weather = await getWeather(coords.latitude, coords.longitude);
  }

  return {
    id: game.gamePk,
    start: game.gameDate,
    status: classifyStatus(game.status?.abstractGameState),
    detailedStatus: translateStatus(game.status?.detailedState || "Scheduled"),
    away: game.teams?.away?.team?.name || "Visitante",
    home: game.teams?.home?.team?.name || "Local",
    awayTeamId: game.teams?.away?.team?.id || null,
    homeTeamId: game.teams?.home?.team?.id || null,
    awayRecord: formatRecord(game.teams?.away?.leagueRecord),
    homeRecord: formatRecord(game.teams?.home?.leagueRecord),
    awayPitcher: game.teams?.away?.probablePitcher?.fullName || "Por confirmar",
    homePitcher: game.teams?.home?.probablePitcher?.fullName || "Por confirmar",
    awayPitcherId: game.teams?.away?.probablePitcher?.id || null,
    homePitcherId: game.teams?.home?.probablePitcher?.id || null,
    awayScore: game.teams?.away?.score ?? null,
    homeScore: game.teams?.home?.score ?? null,
    venue: venue.name || "Por confirmar",
    city: venue.location?.city || "",
    weather,
  };
}

function applyFilters() {
  const status = els.statusFilter.value;
  const query = els.searchInput.value.trim().toLowerCase();

  state.filteredGames = state.games.filter(game => {
    const statusMatches = status === "all" || game.status === status;
    const text = [
      game.away, game.home, game.venue, game.city,
      game.awayPitcher, game.homePitcher,
    ].join(" ").toLowerCase();
    return statusMatches && (!query || text.includes(query));
  });

  renderGames();
}

function renderGames() {
  els.gamesGrid.innerHTML = "";
  const games = state.filteredGames;

  els.gamesCount.textContent = state.games.length;
  els.pitchersCount.textContent = state.games.filter(game =>
    game.awayPitcherId && game.homePitcherId
  ).length;
  els.liveCount.textContent = state.games.filter(game => game.status === "live").length;

  els.emptyState.hidden = games.length > 0;
  els.gamesGrid.hidden = games.length === 0;

  for (const game of games) {
    const node = els.template.content.cloneNode(true);
    node.querySelector(".status-pill").textContent = game.detailedStatus;
    node.querySelector(".game-time").textContent = formatTime(game.start);
    node.querySelector(".away .team-name").textContent = game.away;
    node.querySelector(".home .team-name").textContent = game.home;
    node.querySelector(".away .team-record").textContent = game.awayRecord;
    node.querySelector(".home .team-record").textContent = game.homeRecord;
    node.querySelector(".pitchers").textContent = `${game.awayPitcher} vs ${game.homePitcher}`;
    node.querySelector(".venue").textContent = [game.venue, game.city].filter(Boolean).join(" · ");
    node.querySelector(".weather").textContent = weatherText(game.weather);
    const matchedOdds = findOddsForGame(game);
    if (matchedOdds) {
      const marketSummary = document.createElement("div");
      marketSummary.className = "market-preview";
      marketSummary.innerHTML = renderMarketPreview(matchedOdds, game);
      node.querySelector(".meta-list").appendChild(marketSummary);
    }

    const modelPreview = document.createElement("div");
    modelPreview.className = "model-preview";
    modelPreview.innerHTML = `
      <span>Índice PL</span>
      <strong>Abre “Ver análisis” para calcular</strong>`;
    node.querySelector(".meta-list").appendChild(modelPreview);

    node.querySelector(".details-btn").addEventListener("click", () => showGameDetails(game));
    node.querySelector(".add-pick-btn").addEventListener("click", () => showGameDetails(game, "oddsPanel"));
    els.gamesGrid.appendChild(node);
  }
}

async function showGameDetails(game, initialPanel = "summaryPanel") {
  els.dialogContent.innerHTML = `
    <p class="eyebrow">PARTIDO ${game.id}</p>
    <h2>${escapeHtml(game.away)} @ ${escapeHtml(game.home)}</h2>
    <p class="muted">${formatDateTime(game.start)} · ${escapeHtml(game.detailedStatus)}</p>

    <div class="analysis-tabs" role="tablist">
      <button class="analysis-tab active" type="button" data-panel="summaryPanel">Resumen</button>
      <button class="analysis-tab" type="button" data-panel="pitchersPanel">Abridores</button>
      <button class="analysis-tab" type="button" data-panel="offensePanel">Ofensivas</button>
      <button class="analysis-tab" type="button" data-panel="bullpenPanel">Bullpen</button>
      <button class="analysis-tab" type="button" data-panel="formPanel">Forma reciente</button>
      <button class="analysis-tab" type="button" data-panel="oddsPanel">Cuotas</button>
      <button class="analysis-tab" type="button" data-panel="modelPanel">Índice PL</button>
    </div>

    <section id="summaryPanel" class="analysis-panel active">
      ${renderSummaryPanel(game)}
    </section>

    <section id="pitchersPanel" class="analysis-panel">
      <div class="analysis-loading">Cargando estadísticas oficiales de los abridores…</div>
    </section>

    <section id="offensePanel" class="analysis-panel">
      <div class="analysis-loading">Cargando estadísticas ofensivas de los equipos…</div>
    </section>

    <section id="bullpenPanel" class="analysis-panel">
      <div class="analysis-loading">Cargando estadísticas del bullpen…</div>
    </section>

    <section id="formPanel" class="analysis-panel">
      <div class="analysis-loading">Cargando forma reciente y últimas aperturas…</div>
    </section>

    <section id="oddsPanel" class="analysis-panel">
      <div class="analysis-loading">Cargando moneyline, run line y totales…</div>
    </section>

    <section id="modelPanel" class="analysis-panel">
      <div class="analysis-loading">Calculando Índice ParleyLab…</div>
    </section>

    <p class="fine-print analysis-disclaimer">
      Las estadísticas corresponden a la temporada seleccionada y dependen de la información disponible en MLB. No constituyen una recomendación de apuesta.
    </p>`;

  setupAnalysisTabs();
  activateAnalysisPanel(initialPanel);
  els.dialog.showModal();

  const season = getSeasonFromDate(els.dateInput.value);
  await Promise.all([
    loadPitcherPanel(game, season),
    loadOffensePanel(game, season),
    loadBullpenPanel(game, season),
    loadFormPanel(game, season),
    loadOddsPanel(game),
    loadModelPanel(game, season),
  ]);
}

function renderSummaryPanel(game) {
  const score = game.awayScore != null && game.homeScore != null
    ? `${game.awayScore} - ${game.homeScore}`
    : "Aún sin marcador";

  return `
    <div class="dialog-grid">
      <div class="detail-box"><span>Abridor visitante</span><strong>${escapeHtml(game.awayPitcher)}</strong></div>
      <div class="detail-box"><span>Abridor local</span><strong>${escapeHtml(game.homePitcher)}</strong></div>
      <div class="detail-box"><span>Récord visitante</span><strong>${escapeHtml(game.awayRecord)}</strong></div>
      <div class="detail-box"><span>Récord local</span><strong>${escapeHtml(game.homeRecord)}</strong></div>
      <div class="detail-box"><span>Estadio</span><strong>${escapeHtml([game.venue, game.city].filter(Boolean).join(" · "))}</strong></div>
      <div class="detail-box"><span>Clima</span><strong>${escapeHtml(weatherText(game.weather))}</strong></div>
      <div class="detail-box"><span>Estado</span><strong>${escapeHtml(game.detailedStatus)}</strong></div>
      <div class="detail-box"><span>Marcador</span><strong>${escapeHtml(score)}</strong></div>
    </div>`;
}

function setupAnalysisTabs() {
  document.querySelectorAll(".analysis-tab").forEach(button => {
    button.addEventListener("click", () => activateAnalysisPanel(button.dataset.panel));
  });
}

function activateAnalysisPanel(panelId) {
  document.querySelectorAll(".analysis-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.panel === panelId);
  });
  document.querySelectorAll(".analysis-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

async function loadPitcherPanel(game, season) {
  const panel = document.getElementById("pitchersPanel");
  if (!panel) return;

  const [awayStats, homeStats] = await Promise.all([
    getPitcherStats(game.awayPitcherId, season),
    getPitcherStats(game.homePitcherId, season),
  ]);

  panel.innerHTML = `
    <div class="comparison-grid">
      ${renderPitcherCard("Visitante", game.awayPitcher, awayStats)}
      ${renderPitcherCard("Local", game.homePitcher, homeStats)}
    </div>
    ${renderPitcherComparison(awayStats, homeStats, game.away, game.home)}`;
}

function renderPitcherCard(side, name, stats) {
  if (!stats) {
    return `
      <article class="stat-card">
        <p class="stat-kicker">${side}</p>
        <h3>${escapeHtml(name)}</h3>
        <p class="unavailable">Estadísticas no disponibles.</p>
      </article>`;
  }

  return `
    <article class="stat-card">
      <p class="stat-kicker">${side}</p>
      <h3>${escapeHtml(name)}</h3>
      <div class="stat-grid">
        ${statItem("ERA", stats.era)}
        ${statItem("WHIP", stats.whip)}
        ${statItem("IP", stats.inningsPitched)}
        ${statItem("K", stats.strikeOuts)}
        ${statItem("BB", stats.baseOnBalls)}
        ${statItem("W-L", `${stats.wins ?? "—"}-${stats.losses ?? "—"}`)}
      </div>
    </article>`;
}

function renderPitcherComparison(away, home, awayTeam, homeTeam) {
  if (!away || !home) {
    return `<div class="analysis-note">No hay información suficiente para comparar ambos abridores.</div>`;
  }

  const rows = [
    ["ERA", away.era, home.era, "lower"],
    ["WHIP", away.whip, home.whip, "lower"],
    ["Ponches", away.strikeOuts, home.strikeOuts, "higher"],
    ["BB", away.baseOnBalls, home.baseOnBalls, "lower"],
  ];

  return `
    <div class="comparison-table">
      <div class="comparison-head">
        <strong>${escapeHtml(awayTeam)}</strong>
        <span>Métrica</span>
        <strong>${escapeHtml(homeTeam)}</strong>
      </div>
      ${rows.map(([label, left, right, direction]) =>
        comparisonRow(label, left, right, direction)
      ).join("")}
    </div>
    <p class="fine-print">La ventaja resaltada compara solamente la cifra mostrada; no determina por sí sola cuál equipo ganará.</p>`;
}

function comparisonRow(label, left, right, direction) {
  const leftNum = parseStatNumber(left);
  const rightNum = parseStatNumber(right);
  let leftClass = "";
  let rightClass = "";

  if (leftNum != null && rightNum != null && leftNum !== rightNum) {
    const leftBetter = direction === "lower" ? leftNum < rightNum : leftNum > rightNum;
    leftClass = leftBetter ? "better" : "";
    rightClass = leftBetter ? "" : "better";
  }

  return `
    <div class="comparison-row">
      <span class="${leftClass}">${formatStat(left)}</span>
      <strong>${label}</strong>
      <span class="${rightClass}">${formatStat(right)}</span>
    </div>`;
}

async function loadOffensePanel(game, season) {
  const panel = document.getElementById("offensePanel");
  if (!panel) return;

  const [awayStats, homeStats] = await Promise.all([
    getTeamHittingStats(game.awayTeamId, season),
    getTeamHittingStats(game.homeTeamId, season),
  ]);

  panel.innerHTML = `
    <div class="comparison-grid">
      ${renderOffenseCard("Visitante", game.away, awayStats)}
      ${renderOffenseCard("Local", game.home, homeStats)}
    </div>
    ${renderOffenseComparison(awayStats, homeStats, game.away, game.home)}`;
}

function renderOffenseCard(side, team, stats) {
  if (!stats) {
    return `
      <article class="stat-card">
        <p class="stat-kicker">${side}</p>
        <h3>${escapeHtml(team)}</h3>
        <p class="unavailable">Estadísticas no disponibles.</p>
      </article>`;
  }

  return `
    <article class="stat-card">
      <p class="stat-kicker">${side}</p>
      <h3>${escapeHtml(team)}</h3>
      <div class="stat-grid">
        ${statItem("AVG", stats.avg)}
        ${statItem("OBP", stats.obp)}
        ${statItem("SLG", stats.slg)}
        ${statItem("OPS", stats.ops)}
        ${statItem("HR", stats.homeRuns)}
        ${statItem("R", stats.runs)}
      </div>
    </article>`;
}

function renderOffenseComparison(away, home, awayTeam, homeTeam) {
  if (!away || !home) {
    return `<div class="analysis-note">No hay información suficiente para comparar ambas ofensivas.</div>`;
  }

  const rows = [
    ["AVG", away.avg, home.avg, "higher"],
    ["OBP", away.obp, home.obp, "higher"],
    ["SLG", away.slg, home.slg, "higher"],
    ["OPS", away.ops, home.ops, "higher"],
    ["HR", away.homeRuns, home.homeRuns, "higher"],
    ["Carreras", away.runs, home.runs, "higher"],
  ];

  return `
    <div class="comparison-table">
      <div class="comparison-head">
        <strong>${escapeHtml(awayTeam)}</strong>
        <span>Métrica</span>
        <strong>${escapeHtml(homeTeam)}</strong>
      </div>
      ${rows.map(([label, left, right, direction]) =>
        comparisonRow(label, left, right, direction)
      ).join("")}
    </div>`;
}

function statItem(label, value) {
  return `<div><span>${label}</span><strong>${formatStat(value)}</strong></div>`;
}

async function getPitcherStats(personId, season) {
  if (!personId) return null;
  const key = `pitcher:${personId}:${season}`;
  if (state.cache.has(key)) return state.cache.get(key);

  try {
    const params = new URLSearchParams({
      stats: "season",
      group: "pitching",
      season: String(season),
    });
    const data = await fetchJson(`${MLB_API}/people/${personId}/stats?${params}`);
    const stat = data.stats?.[0]?.splits?.[0]?.stat || null;
    state.cache.set(key, stat);
    return stat;
  } catch (error) {
    console.warn("Pitcher stats unavailable", personId, error);
    state.cache.set(key, null);
    return null;
  }
}

async function getTeamHittingStats(teamId, season) {
  if (!teamId) return null;
  const key = `hitting:${teamId}:${season}`;
  if (state.cache.has(key)) return state.cache.get(key);

  try {
    const params = new URLSearchParams({
      stats: "season",
      group: "hitting",
      season: String(season),
    });
    const data = await fetchJson(`${MLB_API}/teams/${teamId}/stats?${params}`);
    const stat = data.stats?.[0]?.splits?.[0]?.stat || null;
    state.cache.set(key, stat);
    return stat;
  } catch (error) {
    console.warn("Team stats unavailable", teamId, error);
    state.cache.set(key, null);
    return null;
  }
}


async function loadBullpenPanel(game, season) {
  const panel = document.getElementById("bullpenPanel");
  if (!panel) return;

  const [awayStats, homeStats] = await Promise.all([
    getTeamPitchingStats(game.awayTeamId, season),
    getTeamPitchingStats(game.homeTeamId, season),
  ]);

  panel.innerHTML = `
    <div class="comparison-grid">
      ${renderBullpenCard("Visitante", game.away, awayStats)}
      ${renderBullpenCard("Local", game.home, homeStats)}
    </div>
    ${renderBullpenComparison(awayStats, homeStats, game.away, game.home)}
    <div class="analysis-note" style="margin-top:.8rem">
      Estas cifras corresponden al pitcheo total del equipo. MLB no siempre ofrece un bloque público separado y completo para bullpen.
    </div>`;
}

function renderBullpenCard(side, team, stats) {
  if (!stats) {
    return `
      <article class="stat-card">
        <p class="stat-kicker">${side}</p>
        <h3>${escapeHtml(team)}</h3>
        <p class="unavailable">Estadísticas no disponibles.</p>
      </article>`;
  }

  return `
    <article class="stat-card">
      <p class="stat-kicker">${side}</p>
      <h3>${escapeHtml(team)}</h3>
      <div class="stat-grid">
        ${statItem("ERA", stats.era)}
        ${statItem("WHIP", stats.whip)}
        ${statItem("IP", stats.inningsPitched)}
        ${statItem("K", stats.strikeOuts)}
        ${statItem("BB", stats.baseOnBalls)}
        ${statItem("HR", stats.homeRuns)}
      </div>
    </article>`;
}

function renderBullpenComparison(away, home, awayTeam, homeTeam) {
  if (!away || !home) {
    return `<div class="analysis-note">No hay información suficiente para comparar el pitcheo de ambos equipos.</div>`;
  }

  const rows = [
    ["ERA", away.era, home.era, "lower"],
    ["WHIP", away.whip, home.whip, "lower"],
    ["Ponches", away.strikeOuts, home.strikeOuts, "higher"],
    ["BB", away.baseOnBalls, home.baseOnBalls, "lower"],
    ["HR permitidos", away.homeRuns, home.homeRuns, "lower"],
  ];

  return `
    <div class="comparison-table">
      <div class="comparison-head">
        <strong>${escapeHtml(awayTeam)}</strong>
        <span>Métrica</span>
        <strong>${escapeHtml(homeTeam)}</strong>
      </div>
      ${rows.map(([label, left, right, direction]) =>
        comparisonRow(label, left, right, direction)
      ).join("")}
    </div>`;
}

async function loadFormPanel(game) {
  const panel = document.getElementById("formPanel");
  if (!panel) return;

  const [awayRecent, homeRecent, awayStarts, homeStarts] = await Promise.all([
    getRecentTeamGames(game.awayTeamId, game.start, 10),
    getRecentTeamGames(game.homeTeamId, game.start, 10),
    getRecentPitcherStarts(game.awayPitcherId, game.start, 5),
    getRecentPitcherStarts(game.homePitcherId, game.start, 5),
  ]);

  panel.innerHTML = `
    <h3 class="subsection-title">Últimos 10 juegos</h3>
    <div class="comparison-grid">
      ${renderRecentTeamCard("Visitante", game.away, awayRecent)}
      ${renderRecentTeamCard("Local", game.home, homeRecent)}
    </div>

    <h3 class="subsection-title">Últimas aperturas</h3>
    <div class="comparison-grid">
      ${renderRecentStartsCard("Visitante", game.awayPitcher, awayStarts)}
      ${renderRecentStartsCard("Local", game.homePitcher, homeStarts)}
    </div>`;
}

function renderRecentTeamCard(side, team, recent) {
  if (!recent?.games?.length) {
    return `
      <article class="stat-card">
        <p class="stat-kicker">${side}</p>
        <h3>${escapeHtml(team)}</h3>
        <p class="unavailable">Sin juegos recientes disponibles.</p>
      </article>`;
  }

  const wins = recent.games.filter(game => game.result === "W").length;
  const losses = recent.games.filter(game => game.result === "L").length;
  const runsFor = recent.games.reduce((sum, game) => sum + Number(game.runsFor || 0), 0);
  const runsAgainst = recent.games.reduce((sum, game) => sum + Number(game.runsAgainst || 0), 0);

  return `
    <article class="stat-card">
      <p class="stat-kicker">${side}</p>
      <h3>${escapeHtml(team)}</h3>
      <div class="stat-grid">
        ${statItem("Récord", `${wins}-${losses}`)}
        ${statItem("Carreras", runsFor)}
        ${statItem("Permitidas", runsAgainst)}
      </div>
      <div class="form-strip">
        ${recent.games.map(game => `<span class="${game.result === "W" ? "win" : "loss"}">${game.result}</span>`).join("")}
      </div>
    </article>`;
}

function renderRecentStartsCard(side, pitcher, starts) {
  if (!starts?.length) {
    return `
      <article class="stat-card">
        <p class="stat-kicker">${side}</p>
        <h3>${escapeHtml(pitcher)}</h3>
        <p class="unavailable">Sin aperturas recientes disponibles.</p>
      </article>`;
  }

  const innings = starts.reduce((sum, start) => sum + parseInnings(start.inningsPitched), 0);
  const earnedRuns = starts.reduce((sum, start) => sum + Number(start.earnedRuns || 0), 0);
  const strikeouts = starts.reduce((sum, start) => sum + Number(start.strikeOuts || 0), 0);
  const walks = starts.reduce((sum, start) => sum + Number(start.baseOnBalls || 0), 0);
  const era = innings > 0 ? ((earnedRuns * 9) / innings).toFixed(2) : "—";

  return `
    <article class="stat-card">
      <p class="stat-kicker">${side}</p>
      <h3>${escapeHtml(pitcher)}</h3>
      <div class="stat-grid">
        ${statItem("Aperturas", starts.length)}
        ${statItem("ERA", era)}
        ${statItem("IP", innings.toFixed(1))}
        ${statItem("K", strikeouts)}
        ${statItem("BB", walks)}
        ${statItem("ER", earnedRuns)}
      </div>
      <div class="recent-list">
        ${starts.map(start => `
          <div>
            <span>${escapeHtml(start.date || "—")}</span>
            <strong>${formatStat(start.inningsPitched)} IP · ${formatStat(start.earnedRuns)} ER · ${formatStat(start.strikeOuts)} K</strong>
          </div>`).join("")}
      </div>
    </article>`;
}

async function getTeamPitchingStats(teamId, season) {
  if (!teamId) return null;
  const key = `teamPitching:${teamId}:${season}`;
  if (state.cache.has(key)) return state.cache.get(key);

  try {
    const params = new URLSearchParams({
      stats: "season",
      group: "pitching",
      season: String(season),
    });
    const data = await fetchJson(`${MLB_API}/teams/${teamId}/stats?${params}`);
    const stat = data.stats?.[0]?.splits?.[0]?.stat || null;
    state.cache.set(key, stat);
    return stat;
  } catch {
    state.cache.set(key, null);
    return null;
  }
}

async function getRecentTeamGames(teamId, gameDate, limit = 10) {
  if (!teamId) return null;
  const endDate = shiftDate(gameDate, -1);
  const startDate = shiftDate(gameDate, -35);
  const key = `recentTeam:${teamId}:${endDate}:${limit}`;
  if (state.cache.has(key)) return state.cache.get(key);

  try {
    const params = new URLSearchParams({
      sportId: "1",
      teamId: String(teamId),
      startDate,
      endDate,
    });
    const data = await fetchJson(`${MLB_SCHEDULE_URL}?${params}`);
    const games = (data.dates?.flatMap(day => day.games || []) || [])
      .filter(game => game.status?.abstractGameState === "Final")
      .slice(-limit)
      .reverse()
      .map(game => normalizeRecentTeamGame(game, teamId));

    const result = { games };
    state.cache.set(key, result);
    return result;
  } catch {
    state.cache.set(key, null);
    return null;
  }
}

function normalizeRecentTeamGame(game, teamId) {
  const isAway = game.teams?.away?.team?.id === teamId;
  const team = isAway ? game.teams?.away : game.teams?.home;
  const opponent = isAway ? game.teams?.home : game.teams?.away;
  const runsFor = team?.score ?? null;
  const runsAgainst = opponent?.score ?? null;
  const result = runsFor != null && runsAgainst != null && runsFor > runsAgainst ? "W" : "L";
  return { result, runsFor, runsAgainst };
}

async function getRecentPitcherStarts(personId, gameDate, limit = 5) {
  if (!personId) return [];
  const endDate = shiftDate(gameDate, -1);
  const startDate = shiftDate(gameDate, -75);
  const key = `recentPitcher:${personId}:${endDate}:${limit}`;
  if (state.cache.has(key)) return state.cache.get(key);

  try {
    const params = new URLSearchParams({
      stats: "byDateRange",
      group: "pitching",
      startDate,
      endDate,
    });
    const data = await fetchJson(`${MLB_API}/people/${personId}/stats?${params}`);
    const starts = (data.stats?.[0]?.splits || [])
      .filter(split => Number(split.stat?.gamesStarted || 0) > 0)
      .slice(-limit)
      .reverse()
      .map(split => ({
        date: split.date || "—",
        inningsPitched: split.stat?.inningsPitched ?? "—",
        earnedRuns: split.stat?.earnedRuns ?? "—",
        strikeOuts: split.stat?.strikeOuts ?? "—",
        baseOnBalls: split.stat?.baseOnBalls ?? "—",
      }));

    state.cache.set(key, starts);
    return starts;
  } catch {
    state.cache.set(key, []);
    return [];
  }
}

function parseInnings(value) {
  if (value == null || value === "—") return 0;
  const [whole, fraction] = String(value).split(".");
  const outs = fraction === "1" ? 1 : fraction === "2" ? 2 : 0;
  return Number(whole || 0) + outs / 3;
}

function shiftDate(value, days) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}


async function loadOdds() {
  try {
    const data = await fetchJson("/api/odds");
    state.odds = Array.isArray(data.events) ? data.events : [];
    state.oddsAvailable = true;
    if (els.marketStatus) els.marketStatus.textContent = state.odds.length ? "Activo" : "Sin juegos";
  } catch (error) {
    console.warn("Odds unavailable", error);
    state.odds = [];
    state.oddsAvailable = false;
    if (els.marketStatus) els.marketStatus.textContent = "Manual";
  }
}

function findOddsForGame(game) {
  if (!state.odds.length) return null;

  return state.odds
    .map(event => ({
      event,
      score: teamMatchScore(game.away, event.awayTeam) +
             teamMatchScore(game.home, event.homeTeam) +
             timeMatchScore(game.start, event.commenceTime),
    }))
    .filter(item => item.score >= 2.4)
    .sort((a, b) => b.score - a.score)[0]?.event || null;
}

function teamMatchScore(left, right) {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return .8;

  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const overlap = [...aTokens].filter(token => bTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function timeMatchScore(left, right) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const hours = Math.abs(a - b) / 3600000;
  if (hours <= 1) return 1;
  if (hours <= 3) return .6;
  return 0;
}

function normalizeTeamName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadOddsPanel(game) {
  const panel = document.getElementById("oddsPanel");
  if (!panel) return;

  const odds = findOddsForGame(game);
  if (!state.oddsAvailable) {
    panel.innerHTML = renderOddsUnavailable(game);
    setupManualMarketButtons(panel, game);
    return;
  }

  if (!odds) {
    panel.innerHTML = `
      <div class="analysis-note">
        No se encontró un evento equivalente en The Odds API. Puedes registrar manualmente los momios de Playdoit.
      </div>
      ${renderManualMarkets(game)}`;
    setupManualMarketButtons(panel, game);
    return;
  }

  panel.innerHTML = `
    <div class="market-source">
      <div>
        <span>Casa utilizada</span>
        <strong>${escapeHtml(odds.bookmaker || "Disponible")}</strong>
      </div>
      <div>
        <span>Actualización</span>
        <strong>${escapeHtml(formatDateTime(odds.lastUpdate || odds.commenceTime))}</strong>
      </div>
    </div>

    ${renderMoneylineMarket(odds, game)}
    ${renderSpreadMarket(odds, game)}
    ${renderTotalMarket(odds, game)}

    <h3 class="subsection-title">Captura manual de Playdoit</h3>
    ${renderManualMarkets(game)}

    <p class="fine-print">
      La probabilidad mostrada es implícita en el momio. No es una probabilidad calculada por ParleyLab ni representa valor esperado.
    </p>`;

  setupMarketButtons(panel, game);
  setupManualMarketButtons(panel, game);
}

function renderOddsUnavailable(game) {
  return `
    <div class="analysis-note">
      La función segura de cuotas todavía no está configurada. Agrega <strong>ODDS_API_KEY</strong> en Vercel y vuelve a desplegar.
    </div>
    ${renderManualMarkets(game)}`;
}

function renderMarketPreview(odds, game) {
  const away = odds.moneyline?.away;
  const home = odds.moneyline?.home;
  const total = odds.total?.point;
  return `
    <span>Mercado</span>
    <strong>${away != null ? formatAmerican(away) : "—"} / ${home != null ? formatAmerican(home) : "—"} · Total ${total ?? "—"}</strong>`;
}

function renderMoneylineMarket(odds, game) {
  const away = odds.moneyline?.away;
  const home = odds.moneyline?.home;
  if (!isValidAmericanOdds(Number(away)) || !isValidAmericanOdds(Number(home))) {
    return marketEmpty("Moneyline");
  }

  const awayProb = americanImpliedProbability(away);
  const homeProb = americanImpliedProbability(home);
  const noVig = removeTwoWayVig(awayProb, homeProb);

  return `
    <section class="market-block">
      <div class="market-heading"><h3>Moneyline</h3><span>Ganador</span></div>
      <div class="market-options">
        ${marketButton(game.away, away, "moneyline", game.away, noVig.away)}
        ${marketButton(game.home, home, "moneyline", game.home, noVig.home)}
      </div>
    </section>`;
}

function renderSpreadMarket(odds, game) {
  const away = odds.spread?.away;
  const home = odds.spread?.home;
  if (!away || !home || !isValidAmericanOdds(Number(away.price)) || !isValidAmericanOdds(Number(home.price))) {
    return marketEmpty("Run Line");
  }

  return `
    <section class="market-block">
      <div class="market-heading"><h3>Run Line</h3><span>Hándicap</span></div>
      <div class="market-options">
        ${marketButton(`${game.away} ${formatPoint(away.point)}`, away.price, "spread", `${game.away} ${formatPoint(away.point)}`)}
        ${marketButton(`${game.home} ${formatPoint(home.point)}`, home.price, "spread", `${game.home} ${formatPoint(home.point)}`)}
      </div>
    </section>`;
}

function renderTotalMarket(odds, game) {
  const over = odds.total?.over;
  const under = odds.total?.under;
  const point = odds.total?.point;
  if (point == null || !isValidAmericanOdds(Number(over)) || !isValidAmericanOdds(Number(under))) {
    return marketEmpty("Total");
  }

  return `
    <section class="market-block">
      <div class="market-heading"><h3>Total ${point}</h3><span>Over / Under</span></div>
      <div class="market-options">
        ${marketButton(`Over ${point}`, over, "total", `Over ${point}`)}
        ${marketButton(`Under ${point}`, under, "total", `Under ${point}`)}
      </div>
    </section>`;
}

function marketButton(label, price, market, selection, noVigProbability = null) {
  const implied = americanImpliedProbability(price);
  return `
    <button class="market-option" type="button"
      data-market="${escapeHtml(market)}"
      data-selection="${escapeHtml(selection)}"
      data-price="${Number(price)}">
      <span>${escapeHtml(label)}</span>
      <strong>${formatAmerican(price)}</strong>
      <small>Implícita ${(implied * 100).toFixed(1)}%${noVigProbability != null ? ` · Sin vig ${(noVigProbability * 100).toFixed(1)}%` : ""}</small>
    </button>`;
}

function marketEmpty(title) {
  return `
    <section class="market-block">
      <div class="market-heading"><h3>${title}</h3><span>No disponible</span></div>
      <div class="market-empty">La casa seleccionada no publicó este mercado.</div>
    </section>`;
}

function renderManualMarkets(game) {
  return `
    <div class="manual-market-grid">
      <button class="manual-market-button" type="button" data-manual-selection="${escapeHtml(game.away)} ML">Visitante ML</button>
      <button class="manual-market-button" type="button" data-manual-selection="${escapeHtml(game.home)} ML">Local ML</button>
      <button class="manual-market-button" type="button" data-manual-selection="Over">Over</button>
      <button class="manual-market-button" type="button" data-manual-selection="Under">Under</button>
      <button class="manual-market-button" type="button" data-manual-selection="${escapeHtml(game.away)} Run Line">Visitante RL</button>
      <button class="manual-market-button" type="button" data-manual-selection="${escapeHtml(game.home)} Run Line">Local RL</button>
    </div>`;
}

function setupMarketButtons(panel, game) {
  panel.querySelectorAll(".market-option").forEach(button => {
    button.addEventListener("click", () => {
      addPickToParley({
        game,
        selection: button.dataset.selection,
        american: Number(button.dataset.price),
        source: "The Odds API",
        market: button.dataset.market,
      });
    });
  });
}

function setupManualMarketButtons(panel, game) {
  panel.querySelectorAll(".manual-market-button").forEach(button => {
    button.addEventListener("click", () => {
      const baseSelection = button.dataset.manualSelection || "";
      const line = (baseSelection === "Over" || baseSelection === "Under")
        ? prompt(`Escribe la línea para ${baseSelection}, por ejemplo 8.5`)
        : null;
      const selection = line ? `${baseSelection} ${line}` : baseSelection;
      const price = Number(prompt(`Escribe el momio americano de Playdoit para ${selection}`));

      if (!selection.trim() || !isValidAmericanOdds(price)) {
        alert("Selección o momio inválido.");
        return;
      }

      addPickToParley({
        game,
        selection,
        american: price,
        source: "Playdoit manual",
        market: "manual",
      });
    });
  });
}

function addPickToParley({ game, selection, american, source, market }) {
  if (!isValidAmericanOdds(Number(american))) {
    alert("Momio inválido.");
    return;
  }

  const duplicate = state.parley.some(item =>
    item.gameId === game.id && item.selection === selection
  );
  if (duplicate) {
    alert("Esta selección ya está en tu parley.");
    return;
  }

  state.parley.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    gameId: game.id,
    matchup: `${game.away} @ ${game.home}`,
    selection,
    american: Number(american),
    decimal: americanToDecimal(Number(american)),
    source,
    market,
  });
  persistParley();
  renderParley();
  showToast(`${selection} se agregó al parley.`);
}

function americanImpliedProbability(american) {
  const value = Number(american);
  if (!isValidAmericanOdds(value)) return 0;
  return value > 0
    ? 100 / (value + 100)
    : Math.abs(value) / (Math.abs(value) + 100);
}

function removeTwoWayVig(away, home) {
  const total = away + home;
  if (!total) return { away: 0, home: 0 };
  return { away: away / total, home: home / total };
}

function formatAmerican(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number > 0 ? `+${number}` : String(number);
}

function formatPoint(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number > 0 ? `+${number}` : String(number);
}



async function loadModelPanel(game, season) {
  const panel = document.getElementById("modelPanel");
  if (!panel) return;

  const odds = findOddsForGame(game);

  const [
    awayPitcher,
    homePitcher,
    awayHitting,
    homeHitting,
    awayPitching,
    homePitching,
    awayRecent,
    homeRecent,
  ] = await Promise.all([
    getPitcherStats(game.awayPitcherId, season),
    getPitcherStats(game.homePitcherId, season),
    getTeamHittingStats(game.awayTeamId, season),
    getTeamHittingStats(game.homeTeamId, season),
    getTeamPitchingStats(game.awayTeamId, season),
    getTeamPitchingStats(game.homeTeamId, season),
    getRecentTeamGames(game.awayTeamId, game.start, 10),
    getRecentTeamGames(game.homeTeamId, game.start, 10),
  ]);

  const model = buildParleyLabModel({
    game,
    odds,
    awayPitcher,
    homePitcher,
    awayHitting,
    homeHitting,
    awayPitching,
    homePitching,
    awayRecent,
    homeRecent,
  });

  panel.innerHTML = renderModelPanel(model, game, odds);
}

function buildParleyLabModel(input) {
  const {
    game, odds,
    awayPitcher, homePitcher,
    awayHitting, homeHitting,
    awayPitching, homePitching,
    awayRecent, homeRecent,
  } = input;

  const components = [];

  components.push(compareComponent(
    "Abridor",
    normalizeLower(awayPitcher?.era, 2.5, 6.5),
    normalizeLower(homePitcher?.era, 2.5, 6.5),
    game.away,
    game.home
  ));

  components.push(compareComponent(
    "WHIP abridor",
    normalizeLower(awayPitcher?.whip, 0.9, 1.7),
    normalizeLower(homePitcher?.whip, 0.9, 1.7),
    game.away,
    game.home
  ));

  components.push(compareComponent(
    "Ofensiva OPS",
    normalizeHigher(awayHitting?.ops, 0.62, 0.85),
    normalizeHigher(homeHitting?.ops, 0.62, 0.85),
    game.away,
    game.home
  ));

  components.push(compareComponent(
    "Pitcheo de equipo",
    normalizeLower(awayPitching?.era, 3.0, 6.0),
    normalizeLower(homePitching?.era, 3.0, 6.0),
    game.away,
    game.home
  ));

  const awayForm = recentWinRate(awayRecent);
  const homeForm = recentWinRate(homeRecent);
  components.push(compareComponent(
    "Forma últimos 10",
    awayForm,
    homeForm,
    game.away,
    game.home
  ));

  const awayHomeBoost = 0;
  const homeHomeBoost = 0.06;
  components.push(compareComponent(
    "Localía",
    0.5 + awayHomeBoost,
    0.5 + homeHomeBoost,
    game.away,
    game.home
  ));

  const valid = components.filter(component => component.available);
  const awayRaw = valid.reduce((sum, component) => sum + component.awayScore * component.weight, 0);
  const homeRaw = valid.reduce((sum, component) => sum + component.homeScore * component.weight, 0);
  const totalWeight = valid.reduce((sum, component) => sum + component.weight, 0) || 1;

  const awayScore = clamp(Math.round((awayRaw / totalWeight) * 100), 1, 99);
  const homeScore = clamp(Math.round((homeRaw / totalWeight) * 100), 1, 99);

  const favorite = awayScore === homeScore
    ? null
    : awayScore > homeScore
      ? { team: game.away, side: "away", score: awayScore }
      : { team: game.home, side: "home", score: homeScore };

  const moneyline = odds?.moneyline || {};
  const marketPrice = favorite
    ? Number(favorite.side === "away" ? moneyline.away : moneyline.home)
    : null;
  const implied = isValidAmericanOdds(marketPrice)
    ? americanImpliedProbability(marketPrice)
    : null;

  const completeness = Math.round((valid.length / components.length) * 100);
  const modelShare = favorite ? favorite.score / (awayScore + homeScore) : 0.5;
  const edge = implied != null ? modelShare - implied : null;

  const classification = classifyModel({
    score: favorite?.score ?? 50,
    completeness,
    edge,
  });

  const totalSignal = buildTotalSignal({
    game,
    odds,
    awayHitting,
    homeHitting,
    awayPitching,
    homePitching,
    awayPitcher,
    homePitcher,
  });

  return {
    awayScore,
    homeScore,
    favorite,
    components,
    completeness,
    marketPrice,
    implied,
    modelShare,
    edge,
    classification,
    totalSignal,
  };
}

function compareComponent(label, awayScore, homeScore, awayName, homeName) {
  const available = awayScore != null && homeScore != null;
  const weightMap = {
    "Abridor": 1.35,
    "WHIP abridor": 1.0,
    "Ofensiva OPS": 1.2,
    "Pitcheo de equipo": 1.1,
    "Forma últimos 10": 0.9,
    "Localía": 0.55,
  };
  const weight = weightMap[label] || 1;

  if (!available) {
    return {
      label, available: false, weight,
      awayScore: 0.5, homeScore: 0.5,
      winner: null, detail: "Dato no disponible",
    };
  }

  const total = awayScore + homeScore || 1;
  const awayNorm = awayScore / total;
  const homeNorm = homeScore / total;
  const winner = Math.abs(awayNorm - homeNorm) < 0.03
    ? null
    : awayNorm > homeNorm ? awayName : homeName;

  return {
    label,
    available: true,
    weight,
    awayScore: awayNorm,
    homeScore: homeNorm,
    winner,
    detail: winner ? `Ventaja ${winner}` : "Equilibrado",
  };
}

function buildTotalSignal(data) {
  const {
    game, odds,
    awayHitting, homeHitting,
    awayPitching, homePitching,
    awayPitcher, homePitcher,
  } = data;

  const marketTotal = Number(odds?.total?.point);
  if (!Number.isFinite(marketTotal)) {
    return {
      available: false,
      label: "Sin total de mercado",
      score: 50,
      side: null,
      reasons: ["The Odds API no publicó una línea total para este juego."],
    };
  }

  const reasons = [];
  let overPoints = 0;
  let underPoints = 0;
  let inputs = 0;

  const awayOps = parseStatNumber(awayHitting?.ops);
  const homeOps = parseStatNumber(homeHitting?.ops);
  if (awayOps != null && homeOps != null) {
    inputs += 1;
    const avgOps = (awayOps + homeOps) / 2;
    if (avgOps >= 0.74) {
      overPoints += 1;
      reasons.push("OPS combinado por encima del rango medio.");
    } else if (avgOps <= 0.69) {
      underPoints += 1;
      reasons.push("OPS combinado por debajo del rango medio.");
    }
  }

  const awayEra = parseStatNumber(awayPitching?.era);
  const homeEra = parseStatNumber(homePitching?.era);
  if (awayEra != null && homeEra != null) {
    inputs += 1;
    const avgEra = (awayEra + homeEra) / 2;
    if (avgEra >= 4.6) {
      overPoints += 1;
      reasons.push("Pitcheo de equipo con ERA elevada.");
    } else if (avgEra <= 3.8) {
      underPoints += 1;
      reasons.push("Pitcheo de equipo con ERA sólida.");
    }
  }

  const awayStarterEra = parseStatNumber(awayPitcher?.era);
  const homeStarterEra = parseStatNumber(homePitcher?.era);
  if (awayStarterEra != null && homeStarterEra != null) {
    inputs += 1;
    const avgStarterEra = (awayStarterEra + homeStarterEra) / 2;
    if (avgStarterEra >= 4.7) {
      overPoints += 1;
      reasons.push("Abridores con ERA combinada alta.");
    } else if (avgStarterEra <= 3.6) {
      underPoints += 1;
      reasons.push("Abridores con ERA combinada baja.");
    }
  }

  const temp = parseStatNumber(game.weather?.temperature_2m);
  const wind = parseStatNumber(game.weather?.wind_speed_10m);
  if (temp != null || wind != null) {
    inputs += 1;
    if ((temp != null && temp >= 27) || (wind != null && wind >= 18)) {
      overPoints += 0.6;
      reasons.push("Clima potencialmente favorable a la ofensiva.");
    }
  }

  if (!inputs) {
    return {
      available: false,
      label: `Total ${marketTotal}`,
      score: 50,
      side: null,
      reasons: ["No hay suficientes datos para evaluar el total."],
    };
  }

  const diff = overPoints - underPoints;
  const side = Math.abs(diff) < 0.6 ? null : diff > 0 ? "Over" : "Under";
  const strength = clamp(Math.round(50 + Math.abs(diff) * 12), 50, 86);

  return {
    available: true,
    label: `Total ${marketTotal}`,
    score: strength,
    side,
    reasons: reasons.length ? reasons : ["Señales mixtas."],
  };
}

function renderModelPanel(model, game, odds) {
  const favoriteText = model.favorite
    ? model.favorite.team
    : "Sin ventaja clara";

  const edgeText = model.edge == null
    ? "Sin comparación de mercado"
    : `${model.edge >= 0 ? "+" : ""}${(model.edge * 100).toFixed(1)} pts`;

  return `
    <div class="model-hero ${model.classification.className}">
      <div>
        <span>Índice ParleyLab</span>
        <strong>${model.favorite?.score ?? 50}/100</strong>
        <small>${escapeHtml(model.classification.label)}</small>
      </div>
      <div>
        <span>Ventaja principal</span>
        <strong>${escapeHtml(favoriteText)}</strong>
        <small>Completitud ${model.completeness}%</small>
      </div>
    </div>

    <div class="model-scoreboard">
      <div>
        <span>${escapeHtml(game.away)}</span>
        <strong>${model.awayScore}</strong>
      </div>
      <div class="model-divider">vs</div>
      <div>
        <span>${escapeHtml(game.home)}</span>
        <strong>${model.homeScore}</strong>
      </div>
    </div>

    <div class="model-market">
      <div><span>Cuota</span><strong>${model.marketPrice != null ? formatAmerican(model.marketPrice) : "—"}</strong></div>
      <div><span>Implícita</span><strong>${model.implied != null ? (model.implied * 100).toFixed(1) + "%" : "—"}</strong></div>
      <div><span>Participación índice</span><strong>${(model.modelShare * 100).toFixed(1)}%</strong></div>
      <div><span>Diferencia</span><strong class="${model.edge != null && model.edge > 0 ? "positive" : ""}">${edgeText}</strong></div>
    </div>

    <h3 class="subsection-title">Señales del modelo</h3>
    <div class="signal-list">
      ${model.components.map(component => `
        <div class="signal-row ${component.available ? "" : "muted-signal"}">
          <span>${escapeHtml(component.label)}</span>
          <strong>${escapeHtml(component.detail)}</strong>
        </div>
      `).join("")}
    </div>

    <h3 class="subsection-title">Señal de total</h3>
    <div class="total-signal">
      <div>
        <span>${escapeHtml(model.totalSignal.label)}</span>
        <strong>${model.totalSignal.side ? `${model.totalSignal.side} · ${model.totalSignal.score}/100` : "Sin señal clara"}</strong>
      </div>
      <ul>
        ${model.totalSignal.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
    </div>

    <div class="model-warning">
      <strong>Importante</strong>
      <p>Este índice es una evaluación heurística de señales disponibles. No es una probabilidad validada de victoria ni garantiza valor esperado.</p>
    </div>`;
}

function classifyModel({ score, completeness, edge }) {
  if (completeness < 55) {
    return { label: "Datos insuficientes", className: "model-low" };
  }
  if (score >= 72 && edge != null && edge >= 0.05) {
    return { label: "Señal fuerte con posible valor", className: "model-strong" };
  }
  if (score >= 65) {
    return { label: "Ventaja moderada", className: "model-medium" };
  }
  return { label: "Partido equilibrado", className: "model-neutral" };
}

function normalizeHigher(value, min, max) {
  const number = parseStatNumber(value);
  if (number == null) return null;
  return clamp((number - min) / (max - min), 0.01, 0.99);
}

function normalizeLower(value, min, max) {
  const normalized = normalizeHigher(value, min, max);
  return normalized == null ? null : 1 - normalized;
}

function recentWinRate(recent) {
  const games = recent?.games || [];
  if (!games.length) return null;
  const wins = games.filter(game => game.result === "W").length;
  return clamp(wins / games.length, 0.01, 0.99);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


function addManualPick(game) {
  const selection = prompt(
    `Escribe tu selección para ${game.away} @ ${game.home}\nEjemplo: ${game.home} ML`
  );
  if (!selection?.trim()) return;

  const americanText = prompt("Escribe el momio americano, por ejemplo -135 o +120");
  const american = Number(americanText);

  if (!isValidAmericanOdds(american)) {
    alert("Momio inválido. Usa formato americano, por ejemplo -135 o +120.");
    return;
  }

  addPickToParley({
    game,
    selection: selection.trim(),
    american,
    source: "Manual",
    market: "manual",
  });
}

function renderParley() {
  els.parleyPicks.innerHTML = "";

  if (!state.parley.length) {
    els.parleyPicks.innerHTML = '<p class="muted">Agrega selecciones manualmente desde cada juego.</p>';
  } else {
    for (const pick of state.parley) {
      const row = document.createElement("div");
      row.className = "pick-row";
      row.innerHTML = `
        <div>
          <div class="pick-title">${escapeHtml(pick.selection)}</div>
          <div class="pick-subtitle">${escapeHtml(pick.matchup)}${pick.source ? ` · ${escapeHtml(pick.source)}` : ""}</div>
        </div>
        <input class="pick-odds" type="number" value="${pick.american}" aria-label="Momio americano" />
        <button class="remove-pick" type="button" aria-label="Eliminar">×</button>`;

      const oddsInput = row.querySelector(".pick-odds");
      oddsInput.addEventListener("change", () => {
        const next = Number(oddsInput.value);
        if (!isValidAmericanOdds(next)) {
          oddsInput.value = pick.american;
          alert("Momio inválido.");
          return;
        }
        pick.american = next;
        pick.decimal = americanToDecimal(next);
        persistParley();
        renderParley();
      });

      row.querySelector(".remove-pick").addEventListener("click", () => {
        state.parley = state.parley.filter(item => item.id !== pick.id);
        persistParley();
        renderParley();
      });

      els.parleyPicks.appendChild(row);
    }
  }

  const combined = state.parley.reduce((acc, pick) => {
    const decimal = Number(pick.decimal);
    return Number.isFinite(decimal) && decimal > 1 ? acc * decimal : acc;
  }, 1);

  const stake = Math.max(0, Number(els.stakeInput.value) || 0);
  const implied = combined > 0 ? 100 / combined : 0;

  const returnAmount = stake * combined;
  const profit = Math.max(0, returnAmount - stake);
  const combinedAmerican = decimalToAmerican(combined);
  const warnings = getParleyWarnings(state.parley);

  els.pickCount.textContent = state.parley.length;
  els.combinedOdds.textContent = combined.toFixed(2);
  els.combinedAmerican.textContent = state.parley.length ? formatAmerican(combinedAmerican) : "—";
  els.impliedProbability.textContent = `${implied.toFixed(1)}%`;
  els.potentialProfit.textContent = formatMoney(profit);
  els.potentialReturn.textContent = formatMoney(returnAmount);

  els.navPickCount.textContent = state.parley.length;
  els.navPickCount.hidden = state.parley.length === 0;

  els.parleyWarning.hidden = warnings.length === 0;
  els.parleyWarning.innerHTML = warnings.map(warning => `<p>${escapeHtml(warning)}</p>`).join("");
}

function decimalToAmerican(decimal) {
  const value = Number(decimal);
  if (!Number.isFinite(value) || value <= 1) return null;
  return value >= 2
    ? Math.round((value - 1) * 100)
    : Math.round(-100 / (value - 1));
}

function getParleyWarnings(picks) {
  const warnings = [];
  const counts = new Map();
  for (const pick of picks) {
    counts.set(pick.gameId, (counts.get(pick.gameId) || 0) + 1);
  }
  if ([...counts.values()].some(count => count > 1)) {
    warnings.push("Tienes dos o más selecciones del mismo partido. Pueden estar correlacionadas y algunas casas no permiten combinarlas.");
  }
  if (picks.length >= 6) {
    warnings.push("Un parley largo reduce rápidamente la probabilidad implícita. Revisa cada selección antes de apostar.");
  }
  return warnings;
}

let toastTimer;
function showToast(message) {
  if (!els.toast) return;
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("show"));
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
    setTimeout(() => { els.toast.hidden = true; }, 180);
  }, 2200);
}

function safelyLoadParley() {
  try {
    const value = JSON.parse(localStorage.getItem("parleylab_parley") || "[]");
    return Array.isArray(value)
      ? value.filter(item => item && isValidAmericanOdds(Number(item.american)))
      : [];
  } catch {
    return [];
  }
}

function persistParley() {
  localStorage.setItem("parleylab_parley", JSON.stringify(state.parley));
}

async function getWeather(latitude, longitude) {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
      timezone: TIME_ZONE,
    });
    const response = await fetch(`${OPEN_METEO_URL}?${params}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.current || null;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function extractCoordinates(venue) {
  const latitude = Number(venue.location?.defaultCoordinates?.latitude);
  const longitude = Number(venue.location?.defaultCoordinates?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function weatherText(weather) {
  if (els.dateInput.value !== getLocalDateISO()) return "Clima actual solo para hoy";
  if (!weather) return "No disponible";

  const temp = Number(weather.temperature_2m);
  const wind = Number(weather.wind_speed_10m);
  const humidity = Number(weather.relative_humidity_2m);

  return `${Number.isFinite(temp) ? temp.toFixed(0) + "°C" : "—"} · viento ${
    Number.isFinite(wind) ? wind.toFixed(0) : "—"
  } km/h · humedad ${Number.isFinite(humidity) ? humidity.toFixed(0) : "—"}%`;
}

function classifyStatus(value) {
  if (value === "Live") return "live";
  if (value === "Final") return "final";
  return "scheduled";
}

function translateStatus(value) {
  const status = String(value).toLowerCase();
  if (status.includes("final")) return "Finalizado";
  if (status.includes("progress") || status.includes("live")) return "En vivo";
  if (status.includes("delay")) return "Retrasado";
  if (status.includes("postpon")) return "Pospuesto";
  if (status.includes("cancel")) return "Cancelado";
  return "Programado";
}

function formatRecord(record) {
  if (!record || record.wins == null || record.losses == null) return "Récord no disponible";
  return `${record.wins}-${record.losses}`;
}

function parseStatNumber(value) {
  if (value == null || value === "" || value === "—") return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatStat(value) {
  if (value == null || value === "") return "—";
  return String(value);
}

function isValidAmericanOdds(value) {
  return Number.isFinite(value) && value !== 0 && Math.abs(value) >= 100;
}

function americanToDecimal(american) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function getSeasonFromDate(dateString) {
  const year = Number(String(dateString).slice(0, 4));
  return Number.isInteger(year) ? year : new Date().getFullYear();
}

function formatTime(value) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value);
}

function getLocalDateISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function setLoading(value) {
  els.loading.hidden = !value;
  if (value) {
    els.gamesGrid.hidden = true;
    els.emptyState.hidden = true;
  }
}

function restoreNotice() {
  const notice = document.querySelector("#notice");
  notice.textContent =
    "Actualización 2.5: selector completo de mercados y constructor de parley mejorado.";
  notice.style.borderColor = "";
  notice.style.background = "";
  notice.style.color = "";
}

function showNotice(message, error = false) {
  const notice = document.querySelector("#notice");
  notice.textContent = message;

  if (error) {
    notice.style.borderColor = "rgba(251,113,133,.35)";
    notice.style.background = "rgba(251,113,133,.09)";
    notice.style.color = "#fecdd3";
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}
