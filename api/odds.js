const ODDS_URL =
  "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "ODDS_API_KEY is not configured in Vercel",
    });
  }

  try {
    const params = new URLSearchParams({
      apiKey,
      regions: "us",
      markets: "h2h,spreads,totals",
      oddsFormat: "american",
      dateFormat: "iso",
    });

    const response = await fetch(`${ODDS_URL}?${params}`);
    const remaining = response.headers.get("x-requests-remaining");
    const used = response.headers.get("x-requests-used");

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({
        error: "The Odds API request failed",
        details: body.slice(0, 500),
      });
    }

    const raw = await response.json();
    const events = raw.map(normalizeEvent).filter(Boolean);

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    return res.status(200).json({
      events,
      quota: { remaining, used },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load odds",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

function normalizeEvent(event) {
  const bookmaker = chooseBookmaker(event.bookmakers || []);
  if (!bookmaker) return null;

  const h2h = bookmaker.markets?.find(market => market.key === "h2h");
  const spreads = bookmaker.markets?.find(market => market.key === "spreads");
  const totals = bookmaker.markets?.find(market => market.key === "totals");

  const awayMoneyline = h2h?.outcomes?.find(
    outcome => outcome.name === event.away_team
  )?.price;
  const homeMoneyline = h2h?.outcomes?.find(
    outcome => outcome.name === event.home_team
  )?.price;

  const awaySpread = spreads?.outcomes?.find(
    outcome => outcome.name === event.away_team
  );
  const homeSpread = spreads?.outcomes?.find(
    outcome => outcome.name === event.home_team
  );

  const over = totals?.outcomes?.find(outcome => outcome.name === "Over");
  const under = totals?.outcomes?.find(outcome => outcome.name === "Under");

  return {
    id: event.id,
    commenceTime: event.commence_time,
    awayTeam: event.away_team,
    homeTeam: event.home_team,
    bookmaker: bookmaker.title,
    lastUpdate: bookmaker.last_update,
    moneyline: {
      away: validPrice(awayMoneyline),
      home: validPrice(homeMoneyline),
    },
    spread: {
      away: normalizeOutcome(awaySpread),
      home: normalizeOutcome(homeSpread),
    },
    total: {
      point: validPoint(over?.point ?? under?.point),
      over: validPrice(over?.price),
      under: validPrice(under?.price),
    },
  };
}

function chooseBookmaker(bookmakers) {
  const preferred = ["pinnacle", "draftkings", "fanduel", "betmgm"];
  for (const key of preferred) {
    const match = bookmakers.find(bookmaker => bookmaker.key === key);
    if (match) return match;
  }
  return bookmakers[0] || null;
}

function normalizeOutcome(outcome) {
  if (!outcome) return null;
  return {
    point: validPoint(outcome.point),
    price: validPrice(outcome.price),
  };
}

function validPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number : null;
}

function validPoint(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
