const MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";
const MLB_VENUE_URL = "https://statsapi.mlb.com/api/v1/venues";
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const TIME_ZONE = "America/Mazatlan";

const state = {
  games: [],
  filteredGames: [],
  parley: JSON.parse(localStorage.getItem("parleylab_parley") || "[]"),
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
  els.refreshBtn.addEventListener("click", loadGames);
  els.clearParleyBtn.addEventListener("click", () => {
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
  try {
    const date = els.dateInput.value;
    const params = new URLSearchParams({
      sportId: "1",
      date,
      hydrate: "probablePitcher(note,stats(group=[pitching],type=[season])),team,venue(location)",
    });
    const response = await fetch(`${MLB_SCHEDULE_URL}?${params}`);
    if (!response.ok) throw new Error(`MLB respondió ${response.status}`);
    const data = await response.json();
    const rawGames = data.dates?.flatMap(d => d.games || []) || [];
    state.games = await Promise.all(rawGames.map(normalizeGame));
    applyFilters();
    els.lastUpdated.textContent = `Actualizado ${formatTime(new Date())}`;
  } catch (error) {
    console.error(error);
    state.games = [];
    state.filteredGames = [];
    renderGames();
    showNotice(`No se pudo descargar la jornada: ${error.message}. Revisa la conexión e intenta de nuevo.`, true);
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
    detailedStatus: game.status?.detailedState || "Programado",
    away: game.teams?.away?.team?.name || "Visitante",
    home: game.teams?.home?.team?.name || "Local",
    awayRecord: formatRecord(game.teams?.away?.leagueRecord),
    homeRecord: formatRecord(game.teams?.home?.leagueRecord),
    awayPitcher: game.teams?.away?.probablePitcher?.fullName || "Por confirmar",
    homePitcher: game.teams?.home?.probablePitcher?.fullName || "Por confirmar",
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
    const text = `${game.away} ${game.home} ${game.venue}`.toLowerCase();
    return statusMatches && (!query || text.includes(query));
  });
  renderGames();
}

function renderGames() {
  els.gamesGrid.innerHTML = "";
  const games = state.filteredGames;
  els.gamesCount.textContent = state.games.length;
  els.pitchersCount.textContent = state.games.filter(g => g.awayPitcher !== "Por confirmar" && g.homePitcher !== "Por confirmar").length;
  els.liveCount.textContent = state.games.filter(g => g.status === "live").length;

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

function showGameDetails(game) {
  els.dialogContent.innerHTML = `
    <p class="eyebrow">PARTIDO ${game.id}</p>
    <h2>${escapeHtml(game.away)} @ ${escapeHtml(game.home)}</h2>
    <p class="muted">${formatDateTime(game.start)} · ${escapeHtml(game.detailedStatus)}</p>
    <div class="dialog-grid">
      <div class="detail-box"><span>Pitcher visitante</span><strong>${escapeHtml(game.awayPitcher)}</strong></div>
      <div class="detail-box"><span>Pitcher local</span><strong>${escapeHtml(game.homePitcher)}</strong></div>
      <div class="detail-box"><span>Récord visitante</span><strong>${escapeHtml(game.awayRecord)}</strong></div>
      <div class="detail-box"><span>Récord local</span><strong>${escapeHtml(game.homeRecord)}</strong></div>
      <div class="detail-box"><span>Estadio</span><strong>${escapeHtml(game.venue)}</strong></div>
      <div class="detail-box"><span>Clima</span><strong>${escapeHtml(weatherText(game.weather))}</strong></div>
    </div>
    <p class="fine-print" style="margin-top:1rem">
      Esta ficha muestra información oficial disponible para la jornada. Las alineaciones, lesiones, bullpens y cuotas se añadirán en módulos posteriores.
    </p>`;
  els.dialog.showModal();
}

function addManualPick(game) {
  const selection = prompt(`Escribe tu selección para ${game.away} @ ${game.home}\nEjemplo: ${game.home} ML`);
  if (!selection?.trim()) return;

  const americanText = prompt("Escribe el momio americano, por ejemplo -135 o +120");
  const american = Number(americanText);
  if (!Number.isFinite(american) || american === 0 || Math.abs(american) < 100) {
    alert("Momio inválido. Usa formato americano, por ejemplo -135 o +120.");
    return;
  }

  state.parley.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
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
        if (Number.isFinite(next) && next !== 0 && Math.abs(next) >= 100) {
          pick.american = next;
          pick.decimal = americanToDecimal(next);
          persistParley();
          renderParley();
        } else {
          oddsInput.value = pick.american;
          alert("Momio inválido.");
        }
      });
      row.querySelector(".remove-pick").addEventListener("click", () => {
        state.parley = state.parley.filter(x => x.id !== pick.id);
        persistParley();
        renderParley();
      });
      els.parleyPicks.appendChild(row);
    }
  }

  const combined = state.parley.reduce((acc, pick) => acc * pick.decimal, 1);
  const stake = Math.max(0, Number(els.stakeInput.value) || 0);
  const implied = combined > 0 ? 100 / combined : 0;
  els.pickCount.textContent = state.parley.length;
  els.combinedOdds.textContent = combined.toFixed(2);
  els.impliedProbability.textContent = `${implied.toFixed(1)}%`;
  els.potentialReturn.textContent = formatMoney(stake * combined);
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

function extractCoordinates(venue) {
  const lat = Number(venue.location?.defaultCoordinates?.latitude);
  const lon = Number(venue.location?.defaultCoordinates?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
}

function weatherText(weather) {
  if (!weather) return "No disponible";
  const temp = Number(weather.temperature_2m);
  const wind = Number(weather.wind_speed_10m);
  const humidity = Number(weather.relative_humidity_2m);
  return `${Number.isFinite(temp) ? temp.toFixed(0) + "°C" : "—"} · viento ${Number.isFinite(wind) ? wind.toFixed(0) : "—"} km/h · humedad ${Number.isFinite(humidity) ? humidity.toFixed(0) : "—"}%`;
}

function classifyStatus(value) {
  if (value === "Live") return "live";
  if (value === "Final") return "final";
  return "scheduled";
}

function formatRecord(record) {
  if (!record || record.wins == null || record.losses == null) return "Récord no disponible";
  return `${record.wins}-${record.losses}`;
}

function americanToDecimal(american) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
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
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function setLoading(value) {
  els.loading.hidden = !value;
  if (value) {
    els.gamesGrid.hidden = true;
    els.emptyState.hidden = true;
  }
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
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
