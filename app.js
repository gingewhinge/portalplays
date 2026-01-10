(() => {
  const root = document.getElementById("portal-mock-root");
  if (!root) return;

  const SHEET_ID = "1_S0UnO30HuTNqvdNm9kIIZTYdpCFI-3qpkrr_aDgc4I";
  const COLLEGES_URL = `https://opensheet.elk.sh/${SHEET_ID}/colleges`;
  const PLAYERS_URL = `https://opensheet.elk.sh/${SHEET_ID}/players`;

  const MAX_PLAYERS = 5;

  const state = {
    screen: 1,
    school: null,
    mandate: null,
    portalFund: 0,
    remaining: 0,
    selected: [],
    players: [],
    colleges: [],
    activePos: "ALL"
  };

  /* ---------- UTIL ---------- */

  const normalizePosition = p => {
    if (p === "DI") return "DL";
    if (p === "ED") return "EDGE";
    return p;
  };

  const POSITIONS = [
    "QB","RB","WR","TE","OT","IOL","C",
    "DL","EDGE","LB","CB","S"
  ];

  const $ = html => {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  };

  const parseUSD = v => Number(String(v).replace(/[^0-9.]/g,""));

  const money = n => `$${(n / 1_000_000).toFixed(1)}M`;

  const clamp = (n,min,max) => Math.max(min, Math.min(max, n));

  /* ---------- FIXED PLAYER GRADING ---------- */
  const ratingTier = r => {
    if (!r) return "C";
    if (r >= 97) return "A+";
    if (r >= 93) return "A";
    if (r >= 90) return "A-";
    if (r >= 87) return "B+";
    if (r >= 83) return "B";
    if (r >= 80) return "B-";
    return "C";
  };

  const isPremium = r => (r ?? 0) >= 87;

  /* ---------- DATA LOAD ---------- */

  Promise.all([
    fetch(COLLEGES_URL).then(r => r.json()),
    fetch(PLAYERS_URL).then(r => r.json())
  ]).then(([cRaw, pRaw]) => {
    state.colleges = cRaw.map(r => ({
      name: r.name,
      prestige: Number(r.prestige),
      nil: parseUSD(r.nil_budget),
      wins: Number(r.wins),
      losses: Number(r.losses),
      needs: r.needs.split(",").map(n => normalizePosition(n.trim()))
    }));

    state.players = pRaw.map(r => ({
      id: r.id,
      name: r.name,
      from: r.from_school,
      position: normalizePosition(r.position),
      rating: r.rating ? Number(r.rating) : null,
      basePrice: parseUSD(r.base_nil)
    }));

    render();
  }).catch(() => {
    root.innerHTML = `
      <div class="card">
        <div class="h1">Couldn’t load data</div>
        <div class="small">Check your sheet URLs or try again.</div>
      </div>
    `;
  });

  function render() {
    root.innerHTML = "";
    if (state.screen === 1) renderScreen1();
    if (state.screen === 2) renderScreen2();
    if (state.screen === 3) renderScreen3();
  }

  /* ---------- SCREEN 1 ---------- */

  function renderScreen1() {
    const el = $(`
      <div class="card">
        <div class="h1">Pick your school</div>
        <div class="kicker">Select the program you’re building for</div>

        <div style="margin-top:10px">
          <select id="school" class="select">
            ${state.colleges.map(c => `<option>${c.name}</option>`).join("")}
          </select>
        </div>

        <hr class="sep" />

        <div class="h2">The AD asks</div>
        <div class="kicker">What’s the plan for next season?</div>

        <div style="margin-top:10px" class="stack">
          ${[
            "We expect to contend",
            "We need a step forward",
            "Stability is the goal",
            "Avoid a setback",
            "This is a rebuild"
          ].map(m => `
            <button class="btn primary" data-m="${m}">${m}</button>
          `).join("")}
        </div>
      </div>
    `);

    el.querySelectorAll("button[data-m]").forEach(b => {
      b.onclick = () => {
        state.mandate = b.dataset.m;
        state.school = state.colleges.find(
          c => c.name === el.querySelector("#school").value
        );

        // Portal fund: Base 35% +/- 5% by mandate (contend = +5, rebuild = -5)
        const basePct = 0.35;
        let mod = 0;
        if (state.mandate === "We expect to contend") mod = 0.05;
        if (state.mandate === "This is a rebuild") mod = -0.05;

        state.portalFund = Math.round(state.school.nil * (basePct + mod));
        state.remaining = state.portalFund;
        state.selected = [];
        state.activePos = "ALL";

        state.screen = 2;
        render();
      };
    });

    root.appendChild(el);
  }

  /* ---------- SCREEN 2 ---------- */

  function renderScreen2() {
    // Prestige tax: +5% per prestige step below 5, capped at 20%
    // Shown to user as a % and applied ONLY to B+ and above.
    const prestigeTaxPct = clamp(Math.round((5 - state.school.prestige) * 5), 0, 20);

    const filtered = state.players
      .filter(p => state.activePos === "ALL" || p.position === state.activePos)
      .map(p => {
        const taxed = isPremium(p.rating)
          ? Math.round(p.basePrice * (1 + prestigeTaxPct / 100))
          : p.basePrice;
        return { ...p, price: taxed };
      })
      .sort((a,b) => b.price - a.price);

    const el = $(`
      <div class="card">
        <div class="row" style="justify-content:space-between; gap:12px;">
          <div>
            <div class="h1">${state.school.name}</div>
            <div class="kicker">Needs: ${state.school.needs.join(", ")}</div>
          </div>
          <div class="badge good">
            Portal Fund: ${money(state.portalFund)}
          </div>
        </div>

        <div class="notice">
          The AD has raised <strong>${money(state.portalFund)}</strong> from boosters to address your top transfer needs.
          Add up to <strong>${MAX_PLAYERS}</strong> transfer players.
          <br><br>
          Because your school’s prestige is <strong>${state.school.prestige}</strong>, agents are signaling that top transfers will require above-market offers.
          Expect prices for <strong>B+ players and above</strong> to run approximately <strong>${prestigeTaxPct}%</strong> higher.
        </div>

        <div class="row" style="margin-top:12px;">
          <button id="continue" class="btn primary" ${state.selected.length ? "" : "disabled"}>
            Continue
          </button>

          <div class="badge">
            Remaining: ${money(state.remaining)}
          </div>
          <div class="badge">
            Added: ${state.selected.length}/${MAX_PLAYERS}
          </div>
        </div>

        <div class="pillbar">
          <button class="pill ${state.activePos==="ALL" ? "active" : ""}" data-pos="ALL">ALL</button>
          ${POSITIONS.map(p => `<button class="pill ${state.activePos===p ? "active" : ""}" data-pos="${p}">${p}</button>`).join("")}
        </div>

        <div class="grid">
          ${filtered.map(p => {
            const added = state.selected.some(s => s.id === p.id);
            const disabled =
              added ||
              state.selected.length >= MAX_PLAYERS ||
              state.remaining < p.price;

            return `
              <div class="player">
                <div>
                  <div class="name">${p.name} (${p.position})</div>
                  <div class="meta">${p.from} · Grade: ${ratingTier(p.rating)}</div>
                  <div class="price">${money(p.price)}</div>
                </div>
                <div style="min-width:120px;">
                  <button class="btn ${added ? "" : "primary"}" ${disabled ? "disabled" : ""} data-id="${p.id}">
                    ${added ? "Added" : "Add"}
                  </button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `);

    el.querySelectorAll("button[data-pos]").forEach(b => {
      b.onclick = () => {
        state.activePos = b.dataset.pos;
        render();
      };
    });

    el.querySelectorAll("button[data-id]").forEach(b => {
      b.onclick = () => {
        const p = filtered.find(x => x.id === b.dataset.id);
        if (!p) return;
        if (state.remaining < p.price) return;

        state.selected.push(p);
        state.remaining -= p.price;
        render();
      };
    });

    el.querySelector("#continue").onclick = () => {
      state.screen = 3;
      render();
    };

    root.appendChild(el);
  }

  /* ---------- SCREEN 3 ---------- */

  function renderScreen3() {
    const spend = state.portalFund - state.remaining;

    const baseWins = Math.min(3, Math.floor(spend / 3_000_000));
    const luck = Math.random() < 0.30 ? -1 : (Math.random() > 0.80 ? 1 : 0);
    const winsAdded = Math.max(0, baseWins + luck);

    const finalWins = state.school.wins + winsAdded;
    const finalLosses = Math.max(0, state.school.losses - winsAdded);

    // Outcome funnel
    let tier = "NONE";
    if (finalWins >= 12) tier = "NATIONAL";
    else if (finalWins >= 10) tier = "PLAYOFF";
    else if (finalWins >= 9 && state.school.prestige < 4) tier = "CONFERENCE";

    let outcomeLabel = "";
    if (tier === "NATIONAL") outcomeLabel = "National Champion";
    else if (tier === "PLAYOFF") outcomeLabel = "Playoff Team";
    else if (tier === "CONFERENCE") outcomeLabel = "Conference Champion";

    // Narrative rules:
    // - If National Champion: NEVER negative boosters/coach/execution
    // - If prestige >= 4, you can still have “antsy” boosters if you don't win it all
    let execution, boosters, coach;

    if (tier === "NATIONAL") {
      execution = "The roster came together perfectly and delivered a title run.";
      boosters = "Boosters are ecstatic and fully aligned behind the program.";
      coach = "The coach enters next season with total security and extension talks.";
    } else {
      const highPrestige = state.school.prestige >= 4;

      execution =
        winsAdded >= 2
          ? "The additions largely worked as intended."
          : winsAdded === 1
          ? "Results were mixed, with a few clear hits and a few misses."
          : "Fit issues limited the impact of the portal class.";

      boosters =
        highPrestige
          ? (tier === "NONE"
              ? "Boosters are supportive, but restless. At this level, anything short of hardware raises questions."
              : "Boosters are supportive, but expectations remain high heading into next year.")
          : (winsAdded >= 1
              ? "Boosters are cautiously encouraged by the direction."
              : "Boosters are patient, but want a clearer plan for next season.");

      coach =
        winsAdded >= 2
          ? "The staff is viewed as stable heading into next season."
          : highPrestige
          ? "There is pressure to show more next year."
          : "The coach is given time to continue building.";
    }

    const el = $(`
      <div class="card">
        <div class="h2">Players Added</div>
        <div class="small">
          ${state.selected.length
            ? state.selected.map(p => `${p.name} (${p.position})`).join("<br>")
            : "No transfers added."
          }
        </div>

        <hr class="sep" />

        <div class="h2">Total Spend</div>
        <div class="small">${money(spend)} committed via the transfer portal</div>

        <hr class="sep" />

        <div class="h2">Season Outcome</div>
        <div class="small">
          ${state.school.wins}-${state.school.losses} → ${finalWins}-${finalLosses}<br>
          +${winsAdded} wins
        </div>

        ${tier !== "NONE" ? `
          <hr class="sep" />
          <div class="h2">Outcome</div>
          <div class="badge good">${outcomeLabel}</div>
        ` : ""}

        <hr class="sep" />

        <div class="h2">Execution</div>
        <div class="small">${execution}</div>

        <div class="h2">Boosters</div>
        <div class="small">${boosters}</div>

        <div class="h2">Coach Outlook</div>
        <div class="small">${coach}</div>

        <div style="margin-top:14px;">
          <button class="btn primary" onclick="location.reload()">Run Again</button>
        </div>
      </div>
    `);

    root.appendChild(el);
  }
})();
