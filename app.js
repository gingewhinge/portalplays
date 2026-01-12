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

  const normalizePosition = (p) => {
    if (!p) return "";
    const s = String(p).trim().toUpperCase();
    if (s === "DI") return "DL";
    if (s === "ED") return "EDGE";
    return s;
  };

  // HARD-SET ORDER (no randomness, no K/P/LS surprises)
  const POS_ORDER = ["ALL", "QB", "RB", "WR", "TE", "OT", "IOL", "C", "DL", "EDGE", "LB", "CB", "S"];

  const $ = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  };

  const parseUSD = (v) => {
    const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const money = (n) => `$${(n / 1_000_000).toFixed(1)}M`;

  /* ---------- PLAYER GRADING ---------- */
  // N/A behaves like C
  const ratingTier = (r) => {
    if (r === null || r === undefined || r === "") return "C";
    const n = Number(r);
    if (!Number.isFinite(n)) return "C";
    if (n >= 97) return "A+";
    if (n >= 93) return "A";
    if (n >= 90) return "A-";
    if (n >= 87) return "B+";
    if (n >= 83) return "B";
    if (n >= 80) return "B-";
    return "C";
  };

  const isPremium = (r) => {
    const n = Number(r);
    return Number.isFinite(n) && n >= 87; // B+ and above
  };

  /* ---------- PRESTIGE TAX TABLE ---------- */
  // Returns percent, e.g. 35 = +35%
  const prestigeTax = (prestige) => {
    const p = Number(prestige);
    if (p >= 5.0) return 0;
    if (p >= 4.5) return 5;
    if (p >= 4.0) return 10;
    if (p >= 3.5) return 20;
    if (p >= 3.0) return 35;
    if (p >= 2.5) return 55;
    if (p >= 2.0) return 80;
    if (p >= 1.5) return 110;
    return 150;
  };

  /* ---------- DATA LOAD ---------- */

  Promise.all([
    fetch(COLLEGES_URL).then((r) => r.json()),
    fetch(PLAYERS_URL).then((r) => r.json())
  ])
    .then(([cRaw, pRaw]) => {
      state.colleges = cRaw.map((r) => ({
        name: r.name,
        prestige: Number(r.prestige),
        nil: parseUSD(r.nil_budget),
        wins: Number(r.wins),
        losses: Number(r.losses),
        needs: String(r.needs || "")
          .split(",")
          .map((n) => normalizePosition(n.trim()))
          .filter(Boolean)
      }));

      state.players = pRaw.map((r) => ({
        id: String(r.id),
        name: r.name,
        from: r.from_school,
        position: normalizePosition(r.position),
        rating: r.rating ? Number(r.rating) : null,
        basePrice: parseUSD(r.base_nil)
      }));

      render();
    })
    .catch((err) => {
      console.error(err);
      root.innerHTML = `
        <div class="card">
          <div class="h2 center">Portal mock failed to load.</div>
          <div class="muted">Check your sheet publish + opensheet URL.</div>
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
        <div class="h2 center">Pick your school</div>

        <div class="select-wrap">
          <select id="school" class="select">
            ${state.colleges.map((c) => `<option>${c.name}</option>`).join("")}
          </select>
        </div>

        <div class="h2 center">The AD asks: what’s the plan for next season?</div>

        <div class="mandate-grid">
          ${[
            "We expect to contend",
            "We need a step forward",
            "Stability is the goal",
            "Avoid a setback",
            "This is a rebuild"
          ]
            .map(
              (m) => `<button class="btn btn-soft btn-wide mandate-btn" data-m="${m}">${m}</button>`
            )
            .join("")}
        </div>
      </div>
    `);

    el.querySelectorAll(".mandate-btn").forEach((b) => {
      b.onclick = () => {
        state.mandate = b.dataset.m;
        state.school = state.colleges.find((c) => c.name === el.querySelector("#school").value);

        // Portal fund framing
        let basePct = 0.35;
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
    const taxPct = prestigeTax(state.school.prestige);

    const players = state.players
      .filter((p) => state.activePos === "ALL" || p.position === state.activePos)
      .map((p) => {
        const price = isPremium(p.rating)
          ? Math.round(p.basePrice * (1 + taxPct / 100))
          : p.basePrice;
        return { ...p, price };
      })
      .sort((a, b) => b.price - a.price);

    const taxSentence = `Because your school’s prestige is ${state.school.prestige.toFixed(
      1
    )}, agents are signaling that top transfers will require above-market offers. Expect prices for B+ players and above to run approximately ${taxPct}% higher.`;

    const el = $(`
      <div class="screen2">
        <div class="screen2-top">
          <div class="school-row">
            <div class="school-name">${state.school.name}</div>
          </div>

          <div class="meta">
            <div>
              The AD has raised <span class="em">${money(state.portalFund)}</span> from boosters to address your top transfer needs.
            </div>

            <div class="meta-row meta-row-2col">
              <div><span class="label">Remaining NIL</span> <span class="em">${money(state.remaining)}</span></div>
              <div><span class="label">Needs</span> ${state.school.needs.join(", ") || "—"}</div>
            </div>

            <div class="meta-row">
              <div><span class="label">Limit</span> Add up to 5 transfer players.</div>
            </div>

            <div class="note">${taxSentence}</div>
          </div>

          <div class="actions-row">
            <button class="btn btn-primary" id="continue" ${state.selected.length ? "" : "disabled"}>
              Continue
            </button>
          </div>

          <div class="pos-tabs">
            <div class="pos-row">
              ${POS_ORDER.map((p) => {
                const active = state.activePos === p ? "active" : "";
                return `<button class="btn btn-soft pos-btn ${active}" data-pos="${p}">${p}</button>`;
              }).join("")}
            </div>
          </div>
        </div>

        <div class="players-list">
          ${players
            .map((p) => {
              const added = state.selected.some((s) => s.id === p.id);
              const atLimit = state.selected.length >= MAX_PLAYERS;
              const affordable = state.remaining >= p.price;
              const disabled = added || atLimit || !affordable;

              return `
                <div class="player-row">
                  <div class="p-left">
                    <div class="p-name">
                      ${p.name}
                      <span class="p-pos">${p.position}</span>
                    </div>
                    <div class="p-sub">
                      ${p.from || "—"} • Grade: ${ratingTier(p.rating)}
                    </div>
                  </div>

                  <div class="p-right">
                    <div class="p-price">${money(p.price)}</div>
                    <button class="btn ${added ? "btn-added" : "btn-ghost"} add-btn"
                      data-id="${p.id}"
                      ${disabled ? "disabled" : ""}>
                      ${added ? "Added" : "Add"}
                    </button>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `);

    // Position tabs
    el.querySelectorAll(".pos-btn").forEach((b) => {
      b.onclick = () => {
        state.activePos = b.dataset.pos;
        render();
      };
    });

    // Add buttons
    el.querySelectorAll(".add-btn").forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.id;
        const p = players.find((x) => x.id === id);
        if (!p) return;
        if (state.selected.some((s) => s.id === id)) return;
        if (state.selected.length >= MAX_PLAYERS) return;
        if (state.remaining < p.price) return;

        state.selected.push(p);
        state.remaining -= p.price;
        render();
      };
    });

    // Continue
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

    const outcomeLabel =
      tier === "NATIONAL"
        ? "National Champion"
        : tier === "PLAYOFF"
        ? "Playoff Team"
        : tier === "CONFERENCE"
        ? "Conference Champion"
        : null;

    const highPrestige = state.school.prestige >= 4.0;

    let execution = "";
    let boosters = "";
    let you = "";

    if (tier === "NATIONAL") {
      execution = "The roster came together perfectly and delivered a title run.";
      boosters = "Boosters are ecstatic and fully aligned behind your vision.";
      you = "Other ADs are scrambling for your number. You’re a rising star GM.";
    } else if (tier === "PLAYOFF") {
      execution = "The program took a major step forward on the national stage.";
      boosters = "Boosters are energized and ready to invest again.";
      you = "Your stock is way up. You’re in demand across the sport.";
    } else if (tier === "CONFERENCE") {
      execution = "A breakthrough season that changed the trajectory of the program.";
      boosters = "Confidence is building fast and NIL support is trending up.";
      you = "You’ve earned real credibility as a program builder.";
    } else {
      if (highPrestige) {
        execution =
          winsAdded >= 2
            ? "You improved the roster, but the season still fell short of the standard."
            : "The portal class didn’t translate into enough wins on the field.";
        boosters =
          winsAdded >= 1
            ? "Boosters are supportive, but impatience is showing behind the scenes."
            : "Donor confidence is shaky, and the AD is hearing it from all sides.";
        you =
          winsAdded >= 1
            ? "You survive the cycle, but next year becomes a high-pressure mandate."
            : "The pressure ramps quickly. You’re now coaching-to-keep-the-job.";
      } else {
        execution =
          winsAdded >= 1
            ? "Progress was visible, even if results fell short of big goals."
            : "Results were uneven despite the investment.";
        boosters =
          winsAdded >= 1
            ? "Boosters remain cautiously optimistic heading into next season."
            : "Booster confidence has softened, and fundraising gets harder.";
        you =
          winsAdded >= 1
            ? "You retain trust, but you know next year is pivotal."
            : "You decide to spend more time with your family and step away from the grind.";
      }
    }

    const el = $(`
      <div class="card">
        <div class="h2 center">${state.school.name}</div>

        <div class="stack">
          <div class="panel">
            <div class="panel-title">Players Added</div>
            <div class="panel-body">
              ${
                state.selected.length
                  ? state.selected
                      .map((p) => `<div class="line">${p.name} <span class="dim">(${p.position})</span></div>`)
                      .join("")
                  : `<div class="dim">No transfers added.</div>`
              }
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">Total Spend</div>
            <div class="panel-body">
              <div class="big">${money(spend)}</div>
              <div class="dim">${money(state.portalFund)} available • ${money(state.remaining)} remaining</div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">Season Outcome</div>
            <div class="panel-body">
              <div class="big">
                ${state.school.wins}-${state.school.losses}
                <span class="dim">→</span>
                ${finalWins}-${Math.max(0, state.school.losses - winsAdded)}
              </div>
              <div class="dim">+${winsAdded} wins from the portal class</div>
              ${outcomeLabel ? `<div class="badge">${outcomeLabel}</div>` : ""}
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">Execution</div>
            <div class="panel-body">${execution}</div>
          </div>

          <div class="panel">
            <div class="panel-title">Boosters</div>
            <div class="panel-body">${boosters}</div>
          </div>

          <div class="panel">
            <div class="panel-title">Your Outlook</div>
            <div class="panel-body">${you}</div>
          </div>

          <button class="btn btn-primary btn-wide" onclick="location.reload()">Run Again</button>
        </div>
      </div>
    `);

    root.appendChild(el);
  }
})();
