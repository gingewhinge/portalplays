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
    d.innerHTML = html;
    return d.firstElementChild;
  };

  const parseUSD = v =>
    Number(String(v).replace(/[^0-9.]/g,""));

  const money = n =>
    `$${(n / 1_000_000).toFixed(1)}M`;

  /* ---------- PLAYER GRADING ---------- */
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

  const isPremium = r => r >= 87;

  /* ---------- PRESTIGE TAX TABLE ---------- */
  const prestigeTax = prestige => {
    if (prestige >= 5.0) return 0;
    if (prestige >= 4.5) return 5;
    if (prestige >= 4.0) return 10;
    if (prestige >= 3.5) return 20;
    if (prestige >= 3.0) return 35;
    if (prestige >= 2.5) return 55;
    if (prestige >= 2.0) return 80;
    if (prestige >= 1.5) return 110;
    return 150;
  };

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
        <h2>Pick your school</h2>
        <select id="school">
          ${state.colleges.map(c => `<option>${c.name}</option>`).join("")}
        </select>

        <h2>The AD asks: what’s the plan for next season?</h2>

        ${[
          "We expect to contend",
          "We need a step forward",
          "Stability is the goal",
          "Avoid a setback",
          "This is a rebuild"
        ].map(m => `
          <button class="btn-soft mandate-btn" data-m="${m}">
            ${m}
          </button>
        `).join("")}
      </div>
    `);

    el.querySelectorAll("button").forEach(b => {
      b.onclick = () => {
        state.mandate = b.dataset.m;
        state.school = state.colleges.find(
          c => c.name === el.querySelector("#school").value
        );

        let basePct = 0.35;
        let mod = 0;
        if (state.mandate === "We expect to contend") mod = 0.05;
        if (state.mandate === "This is a rebuild") mod = -0.05;

        state.portalFund = Math.round(state.school.nil * (basePct + mod));
        state.remaining = state.portalFund;

        state.screen = 2;
        render();
      };
    });

    root.appendChild(el);
  }

  /* ---------- SCREEN 2 ---------- */

  function renderScreen2() {
    const prestigeTaxPct = prestigeTax(state.school.prestige);

    const players = state.players
      .filter(p => state.activePos === "ALL" || p.position === state.activePos)
      .map(p => {
        const taxed =
          isPremium(p.rating)
            ? Math.round(p.basePrice * (1 + prestigeTaxPct / 100))
            : p.basePrice;
        return { ...p, price: taxed };
      })
      .sort((a,b) => b.price - a.price);

    const el = $(`
      <div class="card">
        <strong>${state.school.name}</strong><br>
        The AD has raised <strong>${money(state.portalFund)}</strong> from boosters.<br>
        Needs: ${state.school.needs.join(", ")}<br>
        <em>Add up to 5 transfer players.</em><br><br>

        <small>
          Because your school’s prestige is ${state.school.prestige},
          agents are signaling that top transfers will require above-market offers.
          Expect prices for B+ players and above to run approximately ${prestigeTaxPct}% higher.
        </small>

        <button class="action-btn" ${state.selected.length ? "" : "disabled"} id="continue">
          Continue
        </button>

        <div class="filter-row">
          <button class="btn-soft" data-pos="ALL">ALL</button>
          ${POSITIONS.map(p => `<button class="btn-soft" data-pos="${p}">${p}</button>`).join("")}
        </div>

        ${players.map(p => {
          const added = state.selected.some(s => s.id === p.id);
          const disabled =
            added ||
            state.selected.length >= MAX_PLAYERS ||
            state.remaining < p.price;

          return `
            <div class="player">
              <strong>${p.name}</strong> (${p.position})<br>
              ${p.from} | Grade: ${ratingTier(p.rating)}<br>
              ${money(p.price)}<br>
              <button class="add-btn" ${disabled ? "disabled" : ""} data-id="${p.id}">
                ${added ? "Added" : "Add"}
              </button>
            </div>
          `;
        }).join("")}
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
        const p = players.find(x => x.id === b.dataset.id);
        if (!p || state.remaining < p.price) return;
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
    const luck = Math.random() < 0.3 ? -1 : Math.random() > 0.8 ? 1 : 0;
    const winsAdded = Math.max(0, baseWins + luck);
    const finalWins = state.school.wins + winsAdded;

    let tier = "NONE";
    if (finalWins >= 12) tier = "NATIONAL";
    else if (finalWins >= 10) tier = "PLAYOFF";
    else if (finalWins >= 9 && state.school.prestige < 4) tier = "CONFERENCE";

    let execution, boosters, you;

    if (tier === "NATIONAL") {
      execution = "The roster came together perfectly and delivered a title run.";
      boosters = "Boosters are ecstatic and fully aligned behind your vision.";
      you = "Other ADs are scrambling for your number. You’re a rising star GM.";
    } else if (tier === "PLAYOFF") {
      execution = "The program took a major step forward on the national stage.";
      boosters = "Boosters are energized and ready to invest again.";
      you = "You’re firmly on the short list for top athletic departments.";
    } else if (tier === "CONFERENCE") {
      execution = "A breakthrough season that changed the trajectory of the program.";
      boosters = "Confidence in leadership is growing fast.";
      you = "You’re building a reputation as a program builder.";
    } else {
      execution = winsAdded >= 1
        ? "Progress was visible, even if results fell short of big goals."
        : "Results were uneven despite the investment.";

      boosters = winsAdded >= 1
        ? "Boosters remain cautiously optimistic."
        : "Booster confidence has softened.";

      you = winsAdded >= 1
        ? "You retain trust but know next year is pivotal."
        : "You decide to spend more time with your family and step away from the grind.";
    }

    root.appendChild($(`
      <div class="card">
        <h3>Players Added</h3>
        ${state.selected.map(p => `${p.name} (${p.position})`).join("<br>")}

        <h3>Total Spend</h3>
        ${money(spend)} committed via the transfer portal

        <h3>Season Outcome</h3>
        ${state.school.wins}-${state.school.losses}
        →
        ${finalWins}-${state.school.losses - winsAdded}<br>
        +${winsAdded} wins

        ${tier !== "NONE" ? `<h3>Outcome</h3>
          ${tier === "NATIONAL" ? "National Champion" :
            tier === "PLAYOFF" ? "Playoff Team" : "Conference Champion"}` : ""}

        <h3>Execution</h3>
        ${execution}

        <h3>Boosters</h3>
        ${boosters}

        <h3>Your Outlook</h3>
        ${you}

        <button class="action-btn" onclick="location.reload()">Run Again</button>
      </div>
    `));
  }
})();
