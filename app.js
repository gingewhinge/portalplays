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

  /* ---------------- UTIL ---------------- */

  const normalizePosition = p => {
    if (p === "DI") return "DL";
    if (p === "ED") return "EDGE";
    return p;
  };

  const POSITIONS = ["QB","RB","WR","TE","OT","IOL","C","DL","EDGE","LB","CB","S"];

  const $ = html => {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.firstElementChild;
  };

  const parseUSD = v =>
    Number(String(v).replace(/[^0-9.]/g,""));

  const money = n =>
    `$${(n / 1_000_000).toFixed(1)}M`;

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

  const isPremium = r => r >= 87;

  /* ---------- PRESTIGE TAX TABLE ---------- */
  const PRESTIGE_TAX = {
    5.0: 0.00,
    4.5: 0.05,
    4.0: 0.10,
    3.5: 0.20,
    3.0: 0.35,
    2.5: 0.55,
    2.0: 0.80,
    1.5: 1.10,
    1.0: 1.50
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
      <div style="padding:16px;font-family:system-ui;text-align:center">
        <h3>Pick your school</h3>

        <select id="school" style="width:100%;margin-bottom:16px;text-align:center;">
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
          <button style="width:100%;margin:6px 0" data-m="${m}">${m}</button>
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
    const taxRate = PRESTIGE_TAX[state.school.prestige] || 0;

    const players = state.players
      .filter(p => state.activePos === "ALL" || p.position === state.activePos)
      .map(p => {
        const adjusted = isPremium(p.rating)
          ? Math.round(p.basePrice * (1 + taxRate))
          : p.basePrice;
        return { ...p, price: adjusted };
      })
      .sort((a,b) => b.price - a.price);

    const el = $(`
      <div style="padding:16px;font-family:system-ui">
        <div style="position:sticky;top:0;background:#fff;padding-bottom:8px">
          <strong>${state.school.name}</strong><br>
          The AD has raised <strong>${money(state.portalFund)}</strong> from boosters
          to address your top transfer needs.<br>
          Needs: ${state.school.needs.join(", ")}<br>
          <em>Add up to 5 transfer players.</em><br>
          <small>
            Because your school’s prestige is ${state.school.prestige},
            agents are signaling that top transfers will require above-market offers.
            Expect prices for B+ players and above to run approximately ${Math.round(taxRate*100)}% higher.
          </small><br><br>

          <button ${state.selected.length ? "" : "disabled"} id="continue">Continue</button>

          <div style="margin-top:8px">
            <button data-pos="ALL">ALL</button>
            ${POSITIONS.map(p => `<button data-pos="${p}">${p}</button>`).join("")}
          </div>
        </div>

        ${players.map(p => {
          const added = state.selected.some(s => s.id === p.id);
          const disabled = added || state.selected.length >= MAX_PLAYERS || state.remaining < p.price;

          return `
            <div style="border-bottom:1px solid #ddd;padding:6px 0">
              <strong>${p.name}</strong> (${p.position})<br>
              ${p.from} | Grade: ${ratingTier(p.rating)}<br>
              ${money(p.price)}<br>
              <button ${disabled ? "disabled" : ""} data-id="${p.id}">
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
    const luck = Math.random() < 0.3 ? -1 : Math.random() > 0.8 ? 1 : 0;
    const winsAdded = Math.max(0, baseWins + luck);
    const finalWins = state.school.wins + winsAdded;

    let tier = "NONE";
    if (finalWins >= 12) tier = "NATIONAL";
    else if (finalWins >= 10) tier = "PLAYOFF";
    else if (finalWins >= 9 && state.school.prestige < 4) tier = "CONFERENCE";

    let execution, boosters, yourOutlook;

    if (tier === "NATIONAL") {
      execution = "The roster came together perfectly and delivered a title run.";
      boosters = "Boosters are ecstatic and fully aligned behind the program.";
      yourOutlook = "Other ADs are scrambling for your number. You are now viewed as elite.";
    } else {
      const highPrestige = state.school.prestige >= 4;

      execution =
        winsAdded >= 2
          ? "The additions largely worked as intended."
          : "Results were uneven despite the investment.";

      boosters =
        highPrestige
          ? "Boosters remain supportive but expect more next season."
          : "Boosters are cautiously encouraged by the direction.";

      yourOutlook =
        winsAdded >= 2
          ? "Your reputation is rising. You are seen as a smart portal operator."
          : winsAdded === 1
          ? "You are viewed as steady but unproven. Next season matters."
          : "You have decided to spend more time with your family.";
    }

    root.appendChild($(`
      <div style="padding:16px;font-family:system-ui">
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
        ${yourOutlook}

        <br><br>
        <button onclick="location.reload()">Run Again</button>
      </div>
    `));
  }
})();
