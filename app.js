const MLB_API = "https://statsapi.mlb.com/api/v1";
const MLB_SCHEDULE_URL = `${MLB_API}/schedule`;
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const TIME_ZONE = "America/Mazatlan";

const state = {
  games: [],
  filteredGames: [],
  parley: safelyLoadParley(),
  cache: new Map(),
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
  lastUpdated: document.querySelector("#lastUpdated"),
  template: document.querySelector("#gameCardTemplate"),
  dialog: document.querySelector("#gameDialog"),
  dialogContent: document.querySelector("#dialogContent"),
  parleyPicks: document.querySelector("#parleyPicks"),
  clearParleyBtn: document.querySelector("#clearParleyBtn"),
  stakeInput: document.querySelector("#stakeInput"),
  pickCount: document.querySelector("#pickCount"),
  combinedOdds: document.querySelector("#combinedOdds"),
  impliedProbability: document.querySelector("#impliedProbability"),
  potentialReturn: document.querySelector("#potentialReturn"),
};

document.addEventListener("DOMContentLoaded", init);

function init() {
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

    node.querySelector(".details-btn").addEventListener("click", () => showGameDetails(game));
    node.querySelector(".add-pick-btn").addEventListener("click", () => addManualPick(game));
    els.gamesGrid.appendChild(node);
  }
}

async function showGameDetails(game) {
  els.dialogContent.innerHTML = `
    <p class="eyebrow">PARTIDO ${game.id}</p>
    <h2>${escapeHtml(game.away)} @ ${escapeHtml(game.home)}</h2>
    <p class="muted">${formatDateTime(game.start)} · ${escapeHtml(game.detailedStatus)}</p>

    <div class="analysis-tabs" role="tablist">
      <button class="analysis-tab active" type="button" data-panel="summaryPanel">Resumen</button>
      <button class="analysis-tab" type="button" data-panel="pitchersPanel">Abridores</button>
      <button class="analysis-tab" type="button" data-panel="offensePanel">Ofensivas</button>
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

    <p class="fine-print analysis-disclaimer">
      Las estadísticas corresponden a la temporada seleccionada y dependen de la información disponible en MLB. No constituyen una recomendación de apuesta.
    </p>`;

  setupAnalysisTabs();
  els.dialog.showModal();

  const season = getSeasonFromDate(els.dateInput.value);
  await Promise.all([
    loadPitcherPanel(game, season),
    loadOffensePanel(game, season),
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
    button.addEventListener("click", () => {
      document.querySelectorAll(".analysis-tab").forEach(tab => tab.classList.remove("active"));
      document.querySelectorAll(".analysis-panel").forEach(panel => panel.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.panel)?.classList.add("active");
    });
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

  state.parley.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    gameId: game.id,
    matchup: `${game.away} @ ${game.home}`,
    selection: selection.trim(),
    american,
    decimal: americanToDecimal(american),
  });
  persistParley();
  renderParley();
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
          <div class="pick-subtitle">${escapeHtml(pick.matchup)}</div>
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

  els.pickCount.textContent = state.parley.length;
  els.combinedOdds.textContent = combined.toFixed(2);
  els.impliedProbability.textContent = `${implied.toFixed(1)}%`;
  els.potentialReturn.textContent = formatMoney(stake * combined);
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
    "Actualización 2.1: comparación de abridores y ofensivas oficiales de MLB. Las cuotas de Playdoit siguen capturándose manualmente.";
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
