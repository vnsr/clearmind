/* Clear Mind — private offline journal. All data stays in this browser (localStorage). */
(function () {
  "use strict";
  const C = window.CONTENT;
  const KEY = "clearmind.v1";
  const $ = (s, el = document) => el.querySelector(s);
  const main = $("#main");

  // ---------- utils ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date().toLocaleDateString("sv-SE");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmtDate = (iso, opts) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", opts || { weekday: "short", day: "numeric", month: "short" });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const r1 = (v) => (v == null ? "–" : (Math.round(v * 10) / 10).toString());

  // ---------- state ----------
  function defaults() {
    return { v: 1, created: today(), onboarded: false, currentDay: 1, entries: {}, who5: [], records: [], evidence: [], forms: {}, settings: { pinHash: null, theme: "auto", remind: "21:00" } };
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw) return defaults();
      const d = defaults();
      return Object.assign(d, raw, { settings: Object.assign(d.settings, raw.settings || {}) });
    } catch (e) { return defaults(); }
  }
  let S = load();
  let saveT = null;
  function save(quiet) {
    dirty = false; clearTimeout(debounceT);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { alertBox("Could not save — storage may be full. Export a backup from Tools."); }
    if (!quiet) { const el = $("#saved"); el.classList.add("on"); clearTimeout(saveT); saveT = setTimeout(() => el.classList.remove("on"), 900); }
  }
  let debounceT = null;
  let dirty = false;
  const saveSoon = () => { dirty = true; clearTimeout(debounceT); debounceT = setTimeout(() => save(), 450); };
  const flush = () => { if (dirty) save(true); };
  function alertBox(msg) { const n = document.createElement("div"); n.className = "note"; n.textContent = msg; main.prepend(n); }

  function applyTheme() {
    const t = S.settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  applyTheme();

  // ---------- entries ----------
  const hasContent = (e) => !!(e && ((e.free || "").trim() || (e.prompts || []).some((p) => (p || "").trim())));
  // If yesterday's (or the last) entry worked on the current day and has writing, move on even if "Finish" wasn't tapped.
  function suggestDay(date) {
    const prev = Object.values(S.entries).filter((x) => x.date < date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (prev && prev.day && prev.day >= S.currentDay && (prev.done || hasContent(prev))) S.currentDay = prev.day + 1;
    return S.currentDay <= 30 ? S.currentDay : null;
  }
  function getEntry(date, create) {
    let e = S.entries[date];
    if (!e && create) {
      e = S.entries[date] = { date, day: suggestDay(date), checkin: {}, prompts: [], free: "", good: ["", "", ""], traps: [], step: "", word: "", practiceDone: false, done: false, u: Date.now() };
    }
    return e;
  }
  function draftEntry(date) {
    return getEntry(date) || { date, day: suggestDay(date), checkin: {}, prompts: [], free: "", good: ["", "", ""], traps: [], step: "", word: "", practiceDone: false, done: false, draft: true };
  }
  const sortedEntries = () => Object.values(S.entries).sort((a, b) => (a.date < b.date ? -1 : 1));

  // maintenance mode after 30 days: rotate through the programme
  function dayContent(e) {
    if (e.day) return C.days[e.day - 1];
    const idx = (Math.floor(new Date(e.date + "T12:00:00").getTime() / 864e5)) % 30;
    return C.days[idx];
  }

  // ---------- language lens ----------
  const LEX = {
    abs: "absolutely all always complete completely constant constantly definitely entire entirely ever every everyone everybody everything forever full fully must never nothing nobody totally whole absolut alle alles immer komplett ständig definitiv ganz gesamte jemals jede jeder jedes jeden jedem nie niemals nichts niemand total völlig vollkommen muss müssen",
    should: "should shouldn't shouldnt must ought sollte sollten soll sollen müsste müssten muss müssen",
    hope: "yet maybe perhaps could might try trying tried learn learning learned possible possibly hope hopeful hoping vielleicht könnte könnten versuchen versuche versucht lernen lerne möglich hoffe hoffnung",
    self: "i me my myself mine i'm im i've i'll i'd ich mich mir mein meine meiner meinen meinem meines",
    neg: "sad sadness lost anxious anxiety worried worry worries afraid scared fear lonely alone tired exhausted hopeless worthless useless stuck empty angry anger frustrated guilty ashamed shame stressed stress overwhelmed down hurt fail failure failed failing bad awful terrible hate cry crying numb restless pointless miserable depressed traurig verloren ängstlich angst sorge sorgen einsam allein müde erschöpft hoffnungslos wertlos nutzlos leer wütend frustriert schuldig gestresst überfordert schlecht schrecklich versagt versagen",
    pos: "calm calmer happy glad grateful thankful proud confident hopeful peaceful relaxed joy joyful enjoyed enjoy love loved lovely good great excited energised energized content relieved strong clear laughed laugh fun curious interested steady better ruhig glücklich froh dankbar stolz zuversichtlich entspannt freude liebe gut toll begeistert zufrieden erleichtert stark klar neugierig besser",
  };
  const SETS = {};
  Object.keys(LEX).forEach((k) => (SETS[k] = new Set(LEX[k].split(/\s+/))));
  const STOP = new Set("the a an and or but if then so to of in on at for with from by as is are was were be been being it its it's this that these those there here what which who whom when where why how not no do does did done have has had having can will would just very really also too more most much many some any other than into about over after before again up down out off only own same such both each few all am i me my myself we our you your he him his she her they them their what's that's don't didn't doesn't can't won't i'm i've i'll i'd im ive get got going go feel felt like think thought know today day time one things thing something way make made even still bit lot ich und die der das ein eine zu ist nicht es sie wir mit auf für sich den dem des im in an als auch so wie was aber oder wenn noch nur sehr mal schon heute".split(" "));
  function lens(text) {
    const words = (text || "").toLowerCase().replace(/[’]/g, "'").match(/[a-zäöüß']+/g) || [];
    const n = words.length;
    const cnt = { abs: 0, should: 0, hope: 0, self: 0, neg: 0, pos: 0 };
    words.forEach((w) => { for (const k in cnt) if (SETS[k].has(w)) cnt[k]++; });
    const joined = " " + words.join(" ") + " ";
    cnt.should += (joined.match(/ (have|need) to /g) || []).length;
    cnt.hope += (joined.match(/ not yet | noch nicht /g) || []).length;
    const per = {};
    for (const k in cnt) per[k] = n ? (cnt[k] / n) * 100 : 0;
    return { n, cnt, per, words };
  }
  const entryText = (e) => [e.free, ...(e.prompts || []), ...(e.good || []), e.step].filter(Boolean).join("\n");

  // ---------- routing ----------
  let ui = { tab: "today", sub: null, date: null, seg: "entries" };
  function go(tab, sub, extra) {
    ui = Object.assign({ tab, sub: sub || null, date: null, seg: ui.seg }, extra || {});
    render();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  function render() {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === ui.tab ? "page" : "false"));
    if (!S.onboarded) return viewWelcome();
    ({ today: viewToday, journal: viewJournal, insights: viewInsights, tools: viewTools })[ui.tab]();
  }

  // ---------- binding (autosave) ----------
  // data-bind="entry:<date>:path" | "form:<id>:<key>"
  function setPath(obj, path, val) {
    const p = path.split(".");
    let o = obj;
    for (let i = 0; i < p.length - 1; i++) { const k = p[i]; if (o[k] == null) o[k] = /^\d+$/.test(p[i + 1]) ? [] : {}; o = o[k]; }
    o[p[p.length - 1]] = val;
  }
  main.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.tagName === "TEXTAREA") autosize(el);
    const b = el.dataset.bind;
    if (!b) return;
    const [kind, id, path] = b.split("|");
    let val = el.type === "checkbox" ? el.checked : el.type === "range" || el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value;
    if (kind === "entry") {
      const e = getEntry(id, true);
      setPath(e, path, val);
      e.u = Date.now();
      if (el.type === "range") { el.classList.remove("unset"); const o = el.parentElement.querySelector("output"); if (o) o.textContent = val; }
      if (path === "free") updateLens(el);
    } else if (kind === "form") {
      const f = (S.forms[id] = S.forms[id] || {});
      f[path] = val; f.u = Date.now();
    }
    saveSoon();
  });
  function autosize(t) { t.style.height = "auto"; t.style.height = Math.max(t.scrollHeight + 2, 92) + "px"; }
  function autosizeAll() { main.querySelectorAll("textarea").forEach(autosize); }
  function updateLens(el) {
    const out = el.parentElement.querySelector(".lens");
    if (!out) return;
    const L = lens(el.value);
    out.textContent = L.n < 20 ? (L.n ? L.n + " words" : "") : `${L.n} words · absolutist ${L.cnt.abs} · should/must ${L.cnt.should} · hopeful ${L.cnt.hope}`;
  }

  // ---------- views: welcome ----------
  function viewWelcome() {
    main.innerHTML = `
      <div style="text-align:center;margin-top:10px">${pacerMarkup(false)}</div>
      <h1 style="margin-top:14px">A calmer, clearer month starts with ten honest minutes a day.</h1>
      <div class="reading" style="margin-top:16px">
        <p>Clear Mind is a 30-day programme that combines mindfulness, cognitive behavioural therapy, acceptance and commitment therapy and practical mental models. Each day has a short reading, a practice, a check-in and space to write.</p>
        <p>As you write, the app charts your mood, your well-being score, the thinking traps you catch, and the language you use — so you can see how your thinking changes, not just guess.</p>
      </div>
      <div class="note small">Everything stays on this device. Nothing is uploaded. Export a backup from Tools now and then (for example to iCloud Drive).<br><br>This is structured self-help, not therapy. If you have felt low most days for two weeks or more, please also talk to your GP or a psychotherapist — “Calm now” at the top lists support lines.</div>
      <button class="btn block" id="begin" type="button">Begin day 1</button>`;
    $("#begin").onclick = () => { S.onboarded = true; S.created = S.created || today(); save(true); go("today"); };
  }

  // ---------- views: today ----------
  function viewToday() {
    const date = ui.date || today();
    const e = draftEntry(date);
    const d = dayContent(e);
    const isToday = date === today();
    const maint = !e.day;
    const ck = e.checkin || {};
    const bind = (p) => `data-bind="entry|${date}|${p}"`;
    const sliders = [["mood", "Mood", "low", "great"], ["calm", "Calm", "tense", "calm"], ["conf", "Confidence", "shaky", "steady"], ["energy", "Energy", "drained", "energised"]]
      .map(([k, l, lo, hi]) => `<div class="slider"><span class="l">${l}</span><input type="range" min="0" max="10" step="1" value="${ck[k] ?? 5}" class="${ck[k] == null ? "unset" : ""}" ${bind("checkin." + k)} aria-label="${l}, 0 to 10"><output>${ck[k] ?? "–"}</output><div class="ends"><span>${lo}</span><span>${hi}</span></div></div>`).join("");
    const special = { 11: ["thought", "Open the thought record"], 16: ["values", "Open the values compass"], 19: ["circles", "Open the three circles"], 23: ["evidence", "Open your evidence file"], 24: ["woop", "Open the WOOP planner"], 29: ["manual", "Open your operating manual"] }[e.day];
    const trapChips = C.traps.map((t) => `<button type="button" class="chip" data-trap="${t.id}" aria-pressed="${(e.traps || []).includes(t.id)}">${esc(t.name)}</button>`).join("");
    main.innerHTML = `
      ${!isToday ? `<button class="back" data-act="today" type="button">‹ Back to today</button>` : ""}
      <div class="daynav"><span>${fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}</span>
        ${maint ? `<span>Keep-going practice</span>` : `<span class="arrows"><button class="iconbtn" data-act="dayprev" aria-label="Previous programme day" ${e.day <= 1 ? "disabled" : ""} type="button">‹</button><button class="iconbtn" data-act="daynext" aria-label="Next programme day" ${e.day >= 30 ? "disabled" : ""} type="button">›</button></span>`}
      </div>
      <div class="dayhead"><div class="daynum">${maint ? "∞" : String(e.day).padStart(2, "0")}</div>
        <div><div class="meta">${maint ? "Revisiting · " : `Day ${e.day} of 30 · Week ${d.week}, ${esc(C.weeks[d.week - 1].name)} · `}${esc(d.model)}</div><h1>${esc(d.title)}</h1></div></div>
      ${e.day === 1 && !S.forms.intention ? `<div class="note small" style="margin-top:18px">Before you start: take two minutes for <button class="back" style="margin:0" data-tool="intention" type="button">your starting point</button>. You will compare with it on day 30.</div>` : ""}
      ${d.who5 && e.day ? `<div class="note small" style="margin-top:18px">Today includes the well-being check (WHO-5). It takes one minute. <button class="back" style="margin:0" data-tool="who5" type="button">Take it now</button></div>` : ""}
      <section class="block reading" aria-label="Reading">${d.reading.map((p) => `<p>${esc(p)}</p>`).join("")}<p class="science">The science: ${esc(d.science)}</p></section>
      <div class="practice"><h3>${esc(d.practice.name)} <span class="muted small" style="font-family:var(--sans);font-weight:400">· ${d.practice.minutes} min</span></h3>
        <ol>${d.practice.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        <div class="row"><button class="btn" data-act="practice" type="button">Start practice</button>
        <label class="check"><input type="checkbox" ${e.practiceDone ? "checked" : ""} ${bind("practiceDone")}>Done</label></div></div>
      ${special ? `<p style="margin-top:16px"><button class="btn ghost" data-tool="${special[0]}" type="button">${special[1]}</button></p>` : ""}
      <section class="block"><h2>Check-in</h2><p class="hint">Move each slider to where you are right now. Untouched sliders are not counted.</p>
        ${sliders}
        <div class="row" style="gap:14px;margin-top:6px;align-items:flex-end"><div class="field" style="flex:1;min-width:130px;margin:0"><label class="f" for="sl">Sleep (hours)</label><input id="sl" type="number" inputmode="decimal" step="0.5" min="0" max="14" value="${ck.sleep ?? ""}" ${bind("checkin.sleep")}></div>
        <div class="field" style="flex:2;min-width:160px;margin:0"><label class="f" for="wd">Today in one word</label><input id="wd" type="text" value="${esc(e.word)}" ${bind("word")} autocomplete="off"></div></div>
      </section>
      <section class="block"><h2>Reflect</h2>
        ${d.prompts.map((p, i) => `<div class="field"><p class="prompt"><span class="n">${i + 1}</span>${esc(p)}</p><textarea ${bind("prompts." + i)} aria-label="Answer ${i + 1}">${esc((e.prompts || [])[i] || "")}</textarea></div>`).join("")}
      </section>
      <section class="block"><h2>Free writing</h2><p class="hint">Write without stopping or editing. Whatever is here is welcome.</p>
        <div class="field"><textarea class="free" ${bind("free")} aria-label="Free writing">${esc(e.free)}</textarea><div class="lens"></div></div>
      </section>
      <section class="block"><h2>Three good things</h2><p class="hint">What went well — and why it happened.</p>
        ${[0, 1, 2].map((i) => `<div class="field"><input type="text" ${bind("good." + i)} value="${esc((e.good || [])[i] || "")}" aria-label="Good thing ${i + 1}" placeholder="${["Something small counts", "…because", "Who or what helped?"][i]}"></div>`).join("")}
      </section>
      <section class="block"><h2>Thinking traps I noticed <button class="back" style="margin:0;font-size:14px;font-family:var(--sans)" data-tool="traps" type="button">Field guide</button></h2>
        <p class="hint">Tap any you caught yourself in today. Catching them is the skill.</p><div class="chips" id="traps">${trapChips}</div></section>
      <section class="block"><div class="field"><label class="f" for="st">One small step for tomorrow</label><input id="st" type="text" value="${esc(e.step)}" ${bind("step")}></div></section>
      ${maint ? "" : `<hr class="soft"><button class="btn block" data-act="finish" type="button">${e.done ? `Day ${e.day} finished — well done` : `Finish day ${e.day}`}</button>
      <p class="small muted" style="text-align:center;margin-top:8px">${e.day < 30 ? "Tomorrow starts with day " + Math.min(e.day + 1, 30) + "." : "After day 30 the app keeps going with a rotating daily practice."}</p>`}`;
    autosizeAll();
    updateLens(main.querySelector("textarea.free"));
    main.querySelectorAll("[data-trap]").forEach((b) => b.addEventListener("click", () => {
      const en = getEntry(date, true); en.traps = en.traps || [];
      const id = b.dataset.trap; const i = en.traps.indexOf(id);
      if (i >= 0) en.traps.splice(i, 1); else en.traps.push(id);
      en.u = Date.now(); b.setAttribute("aria-pressed", i < 0); save();
    }));
    main.onclick = (ev) => {
      const t = ev.target.closest("[data-act],[data-tool]");
      if (!t) return;
      if (t.dataset.tool) return go("tools", t.dataset.tool, { from: date });
      const a = t.dataset.act;
      if (a === "today") return go("today");
      if (a === "dayprev" || a === "daynext") {
        const en = getEntry(date, true); en.day = clamp(en.day + (a === "daynext" ? 1 : -1), 1, 30); en.u = Date.now();
        if (date === today()) S.currentDay = en.day;
        save(true); ui.date = date; render(); return;
      }
      if (a === "practice") return openPractice(d.practice, date);
      if (a === "finish") {
        const en = getEntry(date, true); en.done = true; en.u = Date.now();
        if (date === today() || en.day >= S.currentDay) S.currentDay = Math.max(S.currentDay, en.day + 1);
        save(); ui.date = date; render();
      }
    };
  }

  // ---------- practice & pacer ----------
  function pacerMarkup(withWord) {
    return `<div class="pacer" aria-hidden="${withWord ? "false" : "true"}"><div class="ring"></div><div class="ring"></div><div class="ring"></div><div class="orb" id="orb"></div>${withWord ? `<div class="word" id="pword" aria-live="polite"></div>` : ""}</div>`;
  }
  let pacerTimer = null, clockTimer = null;
  function stopPacer() { clearTimeout(pacerTimer); clearInterval(clockTimer); pacerTimer = clockTimer = null; }
  function patternFor(name) {
    if (/sigh/i.test(name)) return [["Breathe in", 2.5, 1], ["A little more", 1, 1.12], ["Slowly out", 6, 0.6]];
    if (/breath|arriv|body scan|nidra|awareness|focused/i.test(name)) return [["Breathe in", 4, 1.1], ["Out, slowly", 6, 0.6]];
    return [["In", 4, 1], ["Out", 6, 0.7]];
  }
  function runPacer(pattern) {
    const orb = $("#orb"), word = $("#pword");
    let i = 0;
    const step = () => {
      const [w, sec, sc] = pattern[i % pattern.length];
      if (word) word.textContent = w;
      if (orb) { orb.style.transitionDuration = sec + "s"; orb.style.transform = `scale(${sc * 1.75})`; }
      i++; pacerTimer = setTimeout(step, sec * 1000);
    };
    step();
  }
  function openOverlay(html) { const o = $("#overlay"); $("#overlayInner").innerHTML = html; o.classList.add("on"); document.body.style.overflow = "hidden"; const c = o.querySelector(".close"); if (c) c.focus(); }
  function closeOverlay() { stopPacer(); $("#overlay").classList.remove("on"); document.body.style.overflow = ""; }
  $("#overlay").addEventListener("click", (ev) => { if (ev.target.closest(".close")) closeOverlay(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && $("#overlay").classList.contains("on")) closeOverlay(); });

  function openPractice(pr, date) {
    const total = pr.minutes * 60;
    openOverlay(`<button class="btn quiet close" type="button">Close</button>
      <h2 style="margin-top:6px">${esc(pr.name)}</h2><p class="muted small">${pr.minutes} minutes. Follow the circle, or close your eyes and follow the steps.</p>
      ${pacerMarkup(true)}<div class="clock" id="clock">${fmtClock(total)}</div>
      <ol style="max-width:52ch;margin:14px auto 0">${pr.steps.map((s) => `<li style="margin-bottom:6px">${esc(s)}</li>`).join("")}</ol>`);
    let left = total;
    runPacer(patternFor(pr.name));
    clockTimer = setInterval(() => {
      left--; $("#clock").textContent = fmtClock(Math.max(left, 0));
      if (left <= 0) {
        stopPacer(); $("#pword").textContent = "Done. Notice how you feel.";
        const e = getEntry(date, true); e.practiceDone = true; e.u = Date.now(); save();
        const cb = main.querySelector(`[data-bind="entry|${date}|practiceDone"]`); if (cb) cb.checked = true;
      }
    }, 1000);
  }
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  $("#calmNow").addEventListener("click", () => {
    openOverlay(`<button class="btn quiet close" type="button">Close</button>
      <h2 style="margin-top:6px">${esc(C.sos.title)}</h2><p class="muted small">This is a wave. Waves pass. Breathe with the circle first.</p>
      ${pacerMarkup(true)}
      <ol style="margin-top:26px">${C.sos.steps.map((s) => `<li style="margin-bottom:8px">${esc(s)}</li>`).join("")}</ol>
      <h3 style="margin-top:22px">Talk to someone now</h3>
      <ul class="list" style="margin-top:8px">
        <li><a class="item" style="display:block;padding:12px 2px;text-decoration:none" href="tel:08001110111"><div class="t">TelefonSeelsorge · 0800 111 0 111</div><div class="s">Free, anonymous, 24/7. Also 0800 111 0 222 and 116 123.</div></a></li>
        <li><a class="item" style="display:block;padding:12px 2px;text-decoration:none" href="https://online.telefonseelsorge.de" target="_blank" rel="noopener"><div class="t">Chat or email</div><div class="s">online.telefonseelsorge.de</div></a></li>
        <li><a class="item" style="display:block;padding:12px 2px;text-decoration:none" href="tel:116117"><div class="t">Psychotherapy appointment · 116 117</div><div class="s">Service for a first psychotherapeutic consultation (Sprechstunde), or ask your GP.</div></a></li>
        <li><a class="item" style="display:block;padding:12px 2px;text-decoration:none" href="tel:112"><div class="t">Emergency · 112</div><div class="s">If you are in danger or thinking about harming yourself.</div></a></li>
      </ul>
      ${S.forms.manual && S.forms.manual.helps ? `<h3 style="margin-top:22px">What helps me (from my operating manual)</h3><p class="quote">${esc(S.forms.manual.helps)}</p>` : ""}`);
    runPacer(patternFor("cyclic sigh"));
  });

  // ---------- views: journal ----------
  function viewJournal() {
    const segs = `<div class="seg" role="group"><button type="button" data-seg="entries" aria-pressed="${ui.seg === "entries"}">My entries</button><button type="button" data-seg="programme" aria-pressed="${ui.seg === "programme"}">The 30 days</button></div>`;
    if (ui.sub && ui.sub.startsWith("day")) return viewDayReading(Number(ui.sub.slice(3)));
    let body = "";
    if (ui.seg === "entries") {
      const list = sortedEntries().reverse();
      body = list.length ? `<ul class="list">${list.map((e) => {
        const d = dayContent(e); const ck = e.checkin || {};
        const nums = [["mood", "mood"], ["calm", "calm"], ["conf", "confidence"]].filter(([k]) => ck[k] != null).map(([k, l]) => `${l} ${ck[k]}`).join(" · ");
        return `<li><button class="item" type="button" data-date="${e.date}"><div class="small muted">${fmtDate(e.date)} · ${e.day ? "Day " + e.day : "Keep-going"}${nums ? " · " + nums : ""}</div><div class="t">${esc(e.word ? e.word + " — " : "")}${esc(d.title)}</div>${e.free ? `<div class="s">${esc(e.free.slice(0, 200))}</div>` : ""}</button></li>`;
      }).join("")}</ul>` : `<p class="muted">No entries yet. Your first one starts on the Today tab.</p><button class="btn" type="button" data-date="${today()}">Write today’s entry</button>`;
    } else {
      const doneDays = new Set(sortedEntries().filter((e) => e.done && e.day).map((e) => e.day));
      body = C.weeks.map((w) => `<p class="weekname">Week ${w.n} · ${esc(w.name)}</p><ul class="list">${C.days.filter((d) => d.week === w.n).map((d) => `<li><button class="item" type="button" data-day="${d.day}"><div class="t"><span class="${doneDays.has(d.day) ? "done-dot" : "todo-dot"}"></span>${d.day}. ${esc(d.title)}</div><div class="s">${esc(d.model)} · ${d.practice.name}, ${d.practice.minutes} min</div></button></li>`).join("")}</ul>`).join("");
    }
    main.innerHTML = `<h1 style="margin-bottom:14px">Journal</h1>${segs}${body}`;
    main.onclick = (ev) => {
      const s = ev.target.closest("[data-seg]"); if (s) { ui.seg = s.dataset.seg; return render(); }
      const dt = ev.target.closest("[data-date]"); if (dt) return go("today", null, { date: dt.dataset.date === today() ? null : dt.dataset.date });
      const dy = ev.target.closest("[data-day]"); if (dy) return go("journal", "day" + dy.dataset.day);
    };
  }
  function viewDayReading(n) {
    const d = C.days[n - 1];
    main.innerHTML = `<button class="back" type="button" data-back>‹ The 30 days</button>
      <div class="dayhead"><div class="daynum">${String(n).padStart(2, "0")}</div><div><div class="meta">Week ${d.week} · ${esc(d.model)}</div><h1>${esc(d.title)}</h1></div></div>
      <section class="block reading">${d.reading.map((p) => `<p>${esc(p)}</p>`).join("")}<p class="science">The science: ${esc(d.science)}</p></section>
      <div class="practice"><h3>${esc(d.practice.name)} · ${d.practice.minutes} min</h3><ol>${d.practice.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><button class="btn" type="button" data-prac>Start practice</button></div>
      <h3 style="margin-top:26px">Questions for this day</h3><ol>${d.prompts.map((p) => `<li style="margin-bottom:6px">${esc(p)}</li>`).join("")}</ol>
      <button class="btn ghost block" type="button" data-work style="margin-top:18px">Work on day ${n} today</button>`;
    main.onclick = (ev) => {
      if (ev.target.closest("[data-back]")) { ui.seg = "programme"; return go("journal"); }
      if (ev.target.closest("[data-prac]")) return openPractice(d.practice, today());
      if (ev.target.closest("[data-work]")) { const e = getEntry(today(), true); e.day = n; e.u = Date.now(); S.currentDay = n; save(); go("today"); }
    };
  }

  // ---------- views: insights ----------
  function viewInsights() {
    const ents = sortedEntries();
    const withCk = ents.filter((e) => e.checkin && ["mood", "calm", "conf"].some((k) => e.checkin[k] != null));
    const practised = ents.filter((e) => e.practiceDone).length;
    const lastWho = S.who5.length ? S.who5[S.who5.length - 1] : null;
    const firstWho = S.who5.length ? S.who5[0] : null;
    let html = `<h1>How my thinking is changing</h1><p class="muted" style="margin-top:6px">Patterns across your entries. Read trends, not single days.</p>
      <div class="stats"><div><b>${ents.length}</b><span>entries written</span></div><div><b>${practised}</b><span>practices done</span></div><div><b>${Math.min(S.currentDay, 30)}${S.currentDay > 30 ? "+" : ""}</b><span>programme day</span></div><div><b>${lastWho ? lastWho.pct : "–"}</b><span>latest well-being (WHO-5)</span></div></div>`;

    // support nudge
    const last14 = withCk.filter((e) => (Date.now() - new Date(e.date + "T12:00:00")) / 864e5 <= 14).map((e) => e.checkin.mood).filter((v) => v != null);
    const lowMood = last14.length >= 7 && avg(last14) <= 3;
    if ((lastWho && lastWho.pct < 50) || lowMood) {
      html += `<div class="note">${lastWho && lastWho.pct < 50 ? `Your latest well-being score is ${lastWho.pct} (below 50). ` : ""}${lowMood ? "Your mood has averaged 3 or less over the past two weeks. " : ""}That is a real signal, not a failure. Please consider talking to your GP or a psychotherapist alongside this journal — <b>116 117</b> arranges a first psychotherapy consultation, and TelefonSeelsorge (<b>0800 111 0 111</b>) is there 24/7.</div>`;
    }

    // 1. check-in trends
    html += `<section class="block"><h2>Check-in trends</h2>`;
    if (withCk.length < 2) html += `<p class="muted">After two check-ins, your mood, calm and confidence appear here.</p>`;
    else {
      const smooth = withCk.length >= 10;
      html += `<p class="hint">${smooth ? "Lines show a 5-entry rolling average; dots are single days." : "One point per entry. Tap the chart for details."}</p><div class="legend"><span><i style="background:var(--s-mood)"></i>Mood</span><span><i style="background:var(--s-calm)"></i>Calm</span><span><i style="background:var(--s-conf)"></i>Confidence</span></div><div class="chart" id="ckChart"></div>`;
      const firstW = withCk.slice(0, 7), lastW = withCk.slice(-7);
      if (withCk.length >= 10) {
        const row = (k, l) => { const a = avg(firstW.map((e) => e.checkin[k]).filter((v) => v != null)); const b = avg(lastW.map((e) => e.checkin[k]).filter((v) => v != null)); const dlt = a != null && b != null ? b - a : null; return `<tr><td>${l}</td><td>${r1(a)}</td><td>${r1(b)}</td><td class="${dlt == null ? "" : dlt >= 0.5 ? "better" : dlt <= -0.5 ? "worse" : ""}">${dlt == null ? "–" : (dlt > 0 ? "+" : "") + r1(dlt)}</td></tr>`; };
        html += `<table class="t" style="margin-top:12px"><tr><th></th><th>First 7 entries</th><th>Last 7 entries</th><th>Change</th></tr>${row("mood", "Mood")}${row("calm", "Calm")}${row("conf", "Confidence")}${row("energy", "Energy")}${row("sleep", "Sleep (h)")}</table>`;
      }
    }
    html += `</section>`;

    // 2. WHO-5
    html += `<section class="block"><h2>Well-being (WHO-5)</h2>`;
    if (!S.who5.length) html += `<p class="muted">Take the check on days 1, 14 and 30.</p><button class="btn ghost" type="button" data-tool="who5">Take the well-being check</button>`;
    else {
      html += `<div class="bars">${S.who5.map((w) => `<div class="b" style="height:${Math.max(w.pct, 2)}%" title="${w.pct}"><span>${w.pct}</span></div>`).join("")}<div class="ref" style="bottom:50%"><em>50</em></div></div><div class="barlabels">${S.who5.map((w) => `<span>${fmtDate(w.date, { day: "numeric", month: "short" })}</span>`).join("")}</div>`;
      if (S.who5.length > 1) {
        const dl = lastWho.pct - firstWho.pct;
        html += `<p style="margin-top:12px">${dl >= 10 ? `Up <b>${dl} points</b> since your first check — a meaningful improvement (10+ points).` : dl <= -10 ? `Down <b>${-dl} points</b> since your first check — a meaningful drop. Worth taking seriously and talking about with someone you trust or a professional.` : `Changed by ${dl > 0 ? "+" : ""}${dl} points since your first check — within the range of normal fluctuation (a meaningful change is 10+ points).`}</p>`;
      }
    }
    html += `</section>`;

    // 3. traps heat grid
    const trapEntries = ents.filter((e) => (e.traps || []).length);
    html += `<section class="block"><h2>Thinking traps</h2>`;
    if (!trapEntries.length) html += `<p class="muted">Tag the traps you notice in each entry. After a week, patterns appear here.</p>`;
    else {
      const start = new Date(ents[0].date + "T12:00:00");
      const wk = (e) => Math.floor((new Date(e.date + "T12:00:00") - start) / (7 * 864e5));
      const nW = Math.max(...ents.map(wk)) + 1;
      const showW = Math.min(nW, 6), off = nW - showW;
      const counts = {}; let max = 1; const tot = {};
      C.traps.forEach((t) => { counts[t.id] = Array(showW).fill(0); tot[t.id] = 0; });
      ents.forEach((e) => (e.traps || []).forEach((id) => { tot[id]++; const w = wk(e) - off; if (w >= 0 && counts[id]) { counts[id][w]++; max = Math.max(max, counts[id][w]); } }));
      const order = C.traps.slice().sort((a, b) => tot[b.id] - tot[a.id]).filter((t) => tot[t.id] > 0);
      const cell = (v) => { const a = v ? 0.14 + 0.76 * (v / max) : 0; return `<div class="c" style="background:${v ? `color-mix(in srgb,var(--lake) ${Math.round(a * 100)}%,var(--surface))` : "var(--tint)"};color:${a > 0.55 ? "var(--lake-ink)" : "var(--ink)"}">${v || ""}</div>`; };
      html += `<p class="hint">Entries tagged per week. Darker = more often.</p><div class="heat" style="grid-template-columns:minmax(110px,1.6fr) repeat(${showW},1fr)"><div></div>${Array.from({ length: showW }, (_, i) => `<div class="h">Wk ${i + 1 + off}</div>`).join("")}${order.map((t) => `<div class="n">${esc(t.name)}</div>${counts[t.id].map(cell).join("")}`).join("")}</div>`;
      const top = order[0];
      html += `<p style="margin-top:14px">Your most frequent trap is <b>${esc(top.name.toLowerCase())}</b>. Counter-question: <span class="quote" style="display:block;margin-top:6px">${esc(top.q)}</span></p><p class="small muted">A rising count early on usually means you are noticing more, not thinking worse. Later, look for your top trap appearing less often.</p>`;
    }
    html += `</section>`;

    // 4. language lens
    const L = ents.map((e) => ({ e, L: lens(entryText(e)) })).filter((x) => x.L.n >= 30);
    html += `<section class="block"><h2>The language lens</h2><p class="hint">How you write reflects how you think. People in low moods tend to use more absolutist words (always, never, nothing) — Al-Mosaiwi & Johnstone, 2018. Counted automatically in your writing, in English and German.</p>`;
    if (L.length < 3) html += `<p class="muted">Needs at least three entries with 30+ words.</p>`;
    else {
      html += `<div class="chart" id="absChart"></div><p class="small muted">Absolutist words per 100 words, per entry${L.length >= 10 ? " (line: 5-entry average)" : ""}.</p>`;
      const k = Math.min(5, Math.floor(L.length / 2));
      const A = L.slice(0, k), B = L.slice(-k);
      const m = (arr, key) => avg(arr.map((x) => x.L.per[key]));
      const rows = [["abs", "Absolutist words", -1], ["should", "Should / must / have to", -1], ["neg", "Painful-feeling words", -1], ["pos", "Positive-feeling words", 1], ["hope", "Open, hopeful words (yet, maybe, try)", 1], ["self", "Self-focus (I, me, my)", -1]];
      html += `<table class="t" style="margin-top:12px"><tr><th>Per 100 words</th><th>First ${k}</th><th>Last ${k}</th><th>Change</th></tr>${rows.map(([key, lab, dir]) => { const a = m(A, key), b = m(B, key), dl = b - a; const cls = Math.abs(dl) < 0.3 ? "" : dl * dir > 0 ? "better" : "worse"; return `<tr><td>${lab}</td><td>${r1(a)}</td><td>${r1(b)}</td><td class="${cls}">${dl > 0 ? "+" : ""}${r1(dl)}</td></tr>`; }).join("")}</table>
      <p class="small muted" style="margin-top:8px">Green = moving in the direction linked with better well-being. These are word counts, not a diagnosis — one long entry about a hard day will move them. Use them as a mirror, not a grade.</p>`;
      // recurring words
      const topWords = (arr) => { const f = {}; arr.forEach((x) => x.L.words.forEach((w) => { if (w.length > 3 && !STOP.has(w)) f[w] = (f[w] || 0) + 1; })); return Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]); };
      const third = Math.max(1, Math.floor(L.length / 3));
      const early = topWords(L.slice(0, third)), late = topWords(L.slice(-third));
      html += `<h3 style="margin-top:22px">What you write about</h3><table class="t"><tr><th style="text-align:left">Earlier entries</th><th style="text-align:left">Recent entries</th></tr>${Array.from({ length: Math.max(early.length, late.length) }, (_, i) => `<tr><td style="text-align:left">${esc(early[i] || "")}</td><td style="text-align:left">${esc(late[i] || "")}${late[i] && !early.includes(late[i]) ? ' <span class="small muted">new</span>' : ""}</td></tr>`).join("")}</table>`;
    }
    html += `</section>`;

    // 5. thought records
    const recs = S.records.filter((r) => r.beliefBefore != null && r.beliefAfter != null);
    html += `<section class="block"><h2>Thought records</h2>`;
    if (!recs.length) html += `<p class="muted">Each completed thought record shows how much your belief in a painful thought dropped.</p><button class="btn ghost" type="button" data-tool="thought">New thought record</button>`;
    else {
      const drop = avg(recs.map((r) => r.beliefBefore - r.beliefAfter));
      html += `<p>Average drop in belief: <b>${Math.round(drop)} points</b> across ${recs.length} record${recs.length > 1 ? "s" : ""}.</p><div class="legend"><span><i style="background:var(--dawn)"></i>Before</span><span><i style="background:var(--lake)"></i>After</span></div><div class="dumb">${recs.slice(-8).map((r) => { const a = r.beliefBefore, b = r.beliefAfter; return `<div class="r"><div>${esc((r.thought || "Untitled").slice(0, 70))} <span class="muted">· ${a}% → ${b}%</span></div><div class="track"><div class="seg2" style="left:${Math.min(a, b)}%;width:${Math.abs(a - b)}%"></div><div class="dot" style="left:${a}%;background:var(--dawn)"></div><div class="dot" style="left:${b}%;background:var(--lake)"></div></div></div>`; }).join("")}</div>`;
    }
    html += `</section>`;

    // 6. then & now
    const wr = ents.filter((e) => (e.free || "").trim().length > 40);
    if (wr.length >= 2) {
      const a = wr[0], b = wr[wr.length - 1];
      html += `<section class="block"><h2>Then and now</h2><p class="small muted">${fmtDate(a.date, { day: "numeric", month: "long" })}</p><p class="quote">${esc(a.free.slice(0, 320))}${a.free.length > 320 ? "…" : ""}</p><p class="small muted">${fmtDate(b.date, { day: "numeric", month: "long" })}</p><p class="quote">${esc(b.free.slice(0, 320))}${b.free.length > 320 ? "…" : ""}</p><p class="small muted">Notice tone, not just content: how do you speak to yourself in each?</p></section>`;
    }
    main.innerHTML = html;
    main.onclick = (ev) => { const t = ev.target.closest("[data-tool]"); if (t) go("tools", t.dataset.tool); };

    if (withCk.length >= 2) {
      const smooth = withCk.length >= 10;
      const labels = withCk.map((e) => fmtDate(e.date, { day: "numeric", month: "short" }));
      const ser = [["mood", "Mood", "--s-mood"], ["calm", "Calm", "--s-calm"], ["conf", "Confidence", "--s-conf"]].map(([k, n, c]) => ({ name: n, color: `var(${c})`, values: withCk.map((e) => e.checkin[k] ?? null) }));
      lineChart($("#ckChart"), { labels, series: ser, min: 0, max: 10, ticks: [0, 5, 10], smooth });
    }
    if (L.length >= 3) {
      lineChart($("#absChart"), { labels: L.map((x) => fmtDate(x.e.date, { day: "numeric", month: "short" })), series: [{ name: "Absolutist", color: "var(--lake)", values: L.map((x) => Math.round(x.L.per.abs * 10) / 10) }], min: 0, max: Math.max(5, Math.ceil(Math.max(...L.map((x) => x.L.per.abs)) / 5) * 5), smooth: L.length >= 10, height: 150, noEndLabels: true });
    }
  }

  // SVG line chart with tap/hover tooltip
  function rolling(vals, w) {
    return vals.map((_, i) => { const s = vals.slice(Math.max(0, i - w + 1), i + 1).filter((v) => v != null); return s.length ? avg(s) : null; });
  }
  function lineChart(el, o) {
    if (!el) return;
    const W = 340, Hh = o.height || 190, pl = 26, pr = o.noEndLabels ? 10 : 74, pt = 10, pb = 22;
    const n = o.labels.length;
    const x = (i) => pl + (n === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (n - 1));
    const y = (v) => pt + (1 - (v - o.min) / (o.max - o.min)) * (Hh - pt - pb);
    const ticks = o.ticks || [o.min, Math.round((o.min + o.max) / 2), o.max];
    let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(o.series.map((z) => z.name).join(", "))} over time">`;
    ticks.forEach((t) => { s += `<line x1="${pl}" x2="${W - pr + 4}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y(t) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)">${t}</text>`; });
    s += `<text x="${pl}" y="${Hh - 4}" font-size="10" fill="var(--muted)">${esc(o.labels[0])}</text><text x="${W - pr}" y="${Hh - 4}" font-size="10" fill="var(--muted)" text-anchor="end">${esc(o.labels[n - 1])}</text>`;
    const ends = [];
    o.series.forEach((sr) => {
      const line = o.smooth ? rolling(sr.values, 5) : sr.values;
      let d = "", pen = false;
      line.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      if (o.smooth) sr.values.forEach((v, i) => { if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="2.2" fill="${sr.color}" opacity=".35"/>`; });
      s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (!o.smooth) sr.values.forEach((v, i) => { if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${sr.color}" stroke="var(--surface)" stroke-width="2"/>`; });
      const li = line.map((v, i) => [v, i]).filter((p) => p[0] != null).pop();
      if (li) ends.push({ name: sr.name, y: y(li[0]), x: x(li[1]) });
    });
    if (!o.noEndLabels) {
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
      ends.forEach((e) => (s += `<text x="${W - pr + 8}" y="${e.y + 3.5}" font-size="10.5" fill="var(--ink)">${esc(e.name)}</text>`));
    }
    s += `<line id="xh" x1="0" x2="0" y1="${pt}" y2="${Hh - pb}" stroke="var(--muted)" stroke-dasharray="3 3" opacity="0"/><rect x="${pl}" y="0" width="${W - pl - pr}" height="${Hh}" fill="transparent" id="hit"/></svg><div class="tip"></div>`;
    el.innerHTML = s;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), xh = el.querySelector("#xh");
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = clamp(Math.round(((px - pl) / (W - pl - pr)) * (n - 1)), 0, n - 1);
      xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("opacity", ".6");
      tip.innerHTML = `<div style="font-weight:600;margin-bottom:3px">${esc(o.labels[i])}</div>` + o.series.map((sr) => `<div><span class="sw" style="background:${sr.color}"></span>${esc(sr.name)} <b>${sr.values[i] ?? "–"}</b></div>`).join("");
      tip.style.display = "block";
      const left = (x(i) / W) * r.width;
      tip.style.left = clamp(left + 10, 0, r.width - tip.offsetWidth) + "px";
      tip.style.top = "0px";
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", () => { tip.style.display = "none"; xh.setAttribute("opacity", "0"); });
  }

  // ---------- views: tools ----------
  const TOOLS = [
    ["thought", "Thought record", "Slow down a painful thought and find a more accurate one."],
    ["who5", "Well-being check (WHO-5)", "Five questions. Days 1, 14 and 30, or every two weeks."],
    ["evidence", "Evidence file", "A running list of what you have done well. Read it on hard days."],
    ["traps", "Thinking-trap field guide", "Ten patterns and the question that loosens each one."],
    ["breathe", "Breathing space", "Cyclic sighing with a visual pacer, any time."],
    ["intention", "My starting point", "Why you began — to compare with on day 30."],
    ["values", "Values compass", "Five directions, and one small action for each."],
    ["circles", "Control · influence · accept", "Sort worries by where your energy has leverage."],
    ["woop", "WOOP plan", "Wish, outcome, obstacle, plan — with if–then steps."],
    ["manual", "My operating manual", "Warning signs and what helps, written for a harder day."],
    ["settings", "Backup, reminder & privacy", "Export or import your data, calendar reminder, PIN, theme."],
  ];
  function viewTools() {
    if (ui.sub) return (TOOLVIEWS[ui.sub] || (() => go("tools")))();
    main.innerHTML = `<h1 style="margin-bottom:14px">Tools</h1><ul class="tools">${TOOLS.map(([id, t, s]) => `<li><button type="button" data-t="${id}"><div><div class="t">${t}</div><div class="s">${s}</div></div></button></li>`).join("")}</ul>`;
    main.onclick = (ev) => { const b = ev.target.closest("[data-t]"); if (b) go("tools", b.dataset.t); };
  }
  const backBtn = () => `<button class="back" type="button" data-back>‹ ${ui.from ? "Back to today’s entry" : "Tools"}</button>`;
  function wireBack() {
    const from = ui.from;
    main.onclick = (ev) => { if (ev.target.closest("[data-back]")) { if (from) go("today", null, { date: from === today() ? null : from }); else go("tools"); } };
  }
  function formView(id, title, intro, fields) {
    const f = S.forms[id] || {};
    main.innerHTML = `${backBtn()}<h1>${title}</h1><p class="muted" style="margin:6px 0 20px">${intro}</p>${fields.map(([k, lab, kind, ph]) => kind === "h" ? `<h3 style="margin:22px 0 10px">${lab}</h3>` : `<div class="field"><label class="f" for="f_${k}">${lab}</label>${kind === "input" ? `<input id="f_${k}" type="text" data-bind="form|${id}|${k}" value="${esc(f[k] || "")}" placeholder="${esc(ph || "")}">` : kind === "num" ? `<input id="f_${k}" type="number" inputmode="numeric" min="0" max="10" data-bind="form|${id}|${k}" value="${f[k] ?? ""}">` : `<textarea id="f_${k}" data-bind="form|${id}|${k}" placeholder="${esc(ph || "")}">${esc(f[k] || "")}</textarea>`}</div>`).join("")}`;
    autosizeAll(); wireBack();
  }
  const TOOLVIEWS = {
    intention: () => formView("intention", "My starting point", "Write this before day 1. You will return to it on day 30.", [["why", "Why I am starting this journal now", "ta"], ["more", "What I want to feel more of in 30 days", "ta"], ["less", "What I want to feel less of", "ta"], ["notice", "If this works, what would people around me notice?", "ta"], ["when", "When and where I will practise each day", "input", "e.g. 21:00, on the sofa after bedtime routine"]]),
    values: () => formView("values", "Values compass", "Values are directions you never finish. Rate how closely you lived each in the past month (0–10).", [1, 2, 3, 4, 5].flatMap((i) => [["", `Value ${i}`, "h"], ["v" + i, "Value", "input", i === 1 ? "e.g. being a present father" : ""], ["m" + i, "What it means to me", "ta"], ["r" + i, "Lived in the past month (0–10)", "num"], ["a" + i, "One small action this week", "input"]])),
    circles: () => formView("circles", "Control · influence · accept", "Anxiety lives in the gaps between the circles. Put each concern where it truly belongs.", [["control", "Control — what I do, say, choose, and how I respond", "ta"], ["cnext", "Next actions for what I control", "ta"], ["influence", "Influence — what I can affect but not decide", "ta"], ["accept", "Accept — what is outside both", "ta"], ["letbe", "My acceptance sentence", "input", "I can let this be."]]),
    woop: () => formView("woop", "WOOP plan", "Mental contrasting plus if–then plans (Oettingen; Gollwitzer & Sheeran).", [["wish", "Wish — challenging but feasible", "input"], ["outcome", "Outcome — the best result, vividly", "ta"], ["obstacle", "Obstacle — the inner obstacle most likely to stop me", "ta"], ["plan", "Plan — If [obstacle], then I will [action]", "ta"], ["plan2", "Another if–then plan", "input"], ["plan3", "And one more", "input"], ["first", "My first action in the next 48 hours", "input"]]),
    manual: () => formView("manual", "My operating manual", "Written on a good-enough day, for a harder day. “Calm now” shows what helps.", [["signs", "My early warning signs", "ta"], ["helps", "What helps me most (practices, people, places)", "ta"], ["worse", "What makes things worse", "ta"], ["minimum", "My daily minimum on hard days", "ta"], ["people", "People I will contact", "ta"], ["pro", "I will seek professional help when…", "ta"]]),
    traps: () => {
      main.innerHTML = `${backBtn()}<h1>Thinking-trap field guide</h1><p class="muted" style="margin:6px 0 10px">Ten shortcuts the stressed mind takes. Name the trap, then ask its question in writing. Aim for accuracy, not positivity.</p>${C.traps.map((t) => `<div class="trap"><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p><p class="q">${esc(t.q)}</p></div>`).join("")}<p class="science" style="margin-top:14px">Based on Beck (1979) and Burns (1980).</p>`;
      wireBack();
    },
    breathe: () => {
      main.innerHTML = `${backBtn()}<h1>Breathing space</h1><p class="muted" style="margin-top:6px">Cyclic sighing: a double inhale through the nose, then a long, slow exhale through the mouth. Five minutes a day improved mood more than the other techniques tested in a 2023 Stanford study.</p><div class="row" style="margin-top:18px"><button class="btn" data-m="1" type="button">1 minute</button><button class="btn ghost" data-m="3" type="button">3 minutes</button><button class="btn ghost" data-m="5" type="button">5 minutes</button></div>`;
      const from = ui.from;
      main.onclick = (ev) => { if (ev.target.closest("[data-back]")) return from ? go("today") : go("tools"); const b = ev.target.closest("[data-m]"); if (b) openPractice({ name: "Cyclic sighing", minutes: Number(b.dataset.m), steps: C.days[1].practice.steps }, today()); };
    },
    who5: viewWho5,
    thought: viewThought,
    evidence: viewEvidence,
    settings: viewSettings,
  };

  function viewWho5() {
    const ans = [null, null, null, null, null];
    const scale = C.who5_scale.slice().reverse(); // All of the time (5) … At no time (0)
    const hist = S.who5.slice().reverse();
    main.innerHTML = `${backBtn()}<h1>Well-being check</h1><p class="muted" style="margin:6px 0 20px">Over the last two weeks… choose what fits best for each statement.</p>
      ${C.who5.map((q, i) => `<div class="who" data-q="${i}"><p class="q">${esc(q)}</p><div class="opts">${scale.map((l, j) => `<button type="button" data-v="${5 - j}" aria-pressed="false" aria-label="${esc(l)}"><b>${5 - j}</b>${esc(l.replace("half the time", "½ the time"))}</button>`).join("")}</div></div>`).join("")}
      <button class="btn block" type="button" id="whoSave" disabled>Save score</button><div id="whoOut"></div>
      ${hist.length ? `<h3 style="margin-top:26px">Previous checks</h3><table class="t">${hist.map((w) => `<tr><td>${fmtDate(w.date, { day: "numeric", month: "long", year: "numeric" })}${w.day ? ` · day ${w.day}` : ""}</td><td><b>${w.pct}</b> / 100</td></tr>`).join("")}</table>` : ""}
      <p class="science" style="margin-top:16px">WHO-5 Well-Being Index (WHO, 1998). Score = sum × 4. Below 50 suggests low well-being and is worth discussing with a GP or psychotherapist; a change of 10+ points is meaningful. It is a screening measure, not a diagnosis.</p>`;
    const from = ui.from;
    main.onclick = (ev) => {
      if (ev.target.closest("[data-back]")) return from ? go("today", null, { date: from === today() ? null : from }) : go("tools");
      const b = ev.target.closest("[data-v]");
      if (b) {
        const q = Number(b.closest("[data-q]").dataset.q); ans[q] = Number(b.dataset.v);
        b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        $("#whoSave").disabled = ans.some((a) => a == null);
      }
      if (ev.target.id === "whoSave") {
        const raw = ans.reduce((a, c) => a + c, 0), pct = raw * 4;
        const e = S.entries[today()];
        S.who5.push({ id: uid(), date: today(), day: e && e.day ? e.day : Math.min(S.currentDay, 30), answers: ans.slice(), raw, pct, u: Date.now() });
        save();
        $("#whoOut").innerHTML = `<div class="note">Your score: <b>${pct}</b> / 100 (raw ${raw}/25). ${pct < 50 ? "This is below 50, which suggests low well-being right now. Please consider talking to your GP or a psychotherapist — you deserve proper support alongside this journal." : pct < 70 ? "Moderate well-being. Keep practising and compare in two weeks." : "Good well-being. Keep doing what helps."}</div>`;
        $("#whoSave").disabled = true;
      }
    };
  }

  function viewThought() {
    const id = ui.rid;
    if (!id) {
      const recs = S.records.slice().reverse();
      main.innerHTML = `${backBtn()}<h1>Thought records</h1><p class="muted" style="margin:6px 0 16px">Situation → feelings → hot thought → evidence → balanced thought. Aim for accuracy, not positivity.</p><button class="btn block" type="button" data-new>New thought record</button>
        ${recs.length ? `<ul class="list" style="margin-top:20px">${recs.map((r) => `<li><button class="item" type="button" data-rid="${r.id}"><div class="small muted">${fmtDate(r.date)}${r.beliefBefore != null && r.beliefAfter != null ? ` · belief ${r.beliefBefore}% → ${r.beliefAfter}%` : ""}</div><div class="t">${esc(r.thought || r.situation || "Untitled")}</div></button></li>`).join("")}</ul>` : ""}`;
      const from = ui.from;
      main.onclick = (ev) => {
        if (ev.target.closest("[data-back]")) return from ? go("today", null, { date: from === today() ? null : from }) : go("tools");
        if (ev.target.closest("[data-new]")) { const r = { id: uid(), date: today(), traps: [], u: Date.now() }; S.records.push(r); save(true); return go("tools", "thought", { rid: r.id, from }); }
        const it = ev.target.closest("[data-rid]"); if (it) go("tools", "thought", { rid: it.dataset.rid, from });
      };
      return;
    }
    const r = S.records.find((x) => x.id === id);
    if (!r) return go("tools", "thought");
    const fld = (k, lab, hint, kind) => `<div class="field"><label class="f" for="r_${k}">${lab}</label>${hint ? `<p class="hint" style="margin-top:-2px">${hint}</p>` : ""}${kind === "num" ? `<input id="r_${k}" type="number" inputmode="numeric" min="0" max="100" data-r="${k}" value="${r[k] ?? ""}">` : `<textarea id="r_${k}" data-r="${k}">${esc(r[k] || "")}</textarea>`}</div>`;
    main.innerHTML = `<button class="back" type="button" data-list>‹ All thought records</button><h1>Thought record</h1><p class="muted small" style="margin:4px 0 18px">${fmtDate(r.date, { weekday: "long", day: "numeric", month: "long" })}</p>
      ${fld("situation", "1 · Situation", "Just the facts — who, what, where, when.")}
      ${fld("feelings", "2 · Feelings", "Name each feeling and rate it 0–100.")}
      ${fld("thought", "3 · Hot thought", "What went through my mind? The one that stings most.")}
      ${fld("beliefBefore", "How much do I believe it? (0–100%)", "", "num")}
      ${fld("evFor", "4a · Evidence for", "Facts only, not feelings.")}
      ${fld("evAgainst", "4b · Evidence against", "What doesn’t fit? What would a friend point out?")}
      <div class="field"><label class="f">Thinking trap(s)</label><div class="chips">${C.traps.map((t) => `<button type="button" class="chip" data-rt="${t.id}" aria-pressed="${(r.traps || []).includes(t.id)}">${esc(t.name)}</button>`).join("")}</div></div>
      ${fld("balanced", "5 · Balanced thought", "A fair, accurate version that takes all the evidence into account.")}
      ${fld("beliefAfter", "Now, how much do I believe the hot thought? (0–100%)", "", "num")}
      ${fld("feelAfter", "How do the feelings rate now?", "")}
      <button class="btn danger" type="button" data-del style="margin-top:8px">Delete this record</button>`;
    autosizeAll();
    main.oninput = (ev) => { const k = ev.target.dataset.r; if (!k) return; r[k] = ev.target.type === "number" ? (ev.target.value === "" ? null : clamp(Number(ev.target.value), 0, 100)) : ev.target.value; r.u = Date.now(); saveSoon(); };
    const from = ui.from;
    main.onclick = (ev) => {
      if (ev.target.closest("[data-list]")) { main.oninput = null; return go("tools", "thought", { from }); }
      const t = ev.target.closest("[data-rt]");
      if (t) { r.traps = r.traps || []; const i = r.traps.indexOf(t.dataset.rt); if (i >= 0) r.traps.splice(i, 1); else r.traps.push(t.dataset.rt); t.setAttribute("aria-pressed", i < 0); r.u = Date.now(); save(); }
      if (ev.target.closest("[data-del]") && confirm("Delete this thought record?")) { S.records = S.records.filter((x) => x !== r); save(); main.oninput = null; go("tools", "thought", { from }); }
    };
  }

  function viewEvidence() {
    const list = S.evidence.slice().reverse();
    main.innerHTML = `${backBtn()}<h1>Evidence file</h1><p class="muted" style="margin:6px 0 16px">Low mood hides good memories (mood-congruent recall). This list doesn’t depend on your mood. Achievements, compliments, obstacles overcome, kind acts — small ones count.</p>
      <div class="row" style="flex-wrap:nowrap"><input type="text" id="evIn" placeholder="Add something you did well…" aria-label="New evidence"><button class="btn" type="button" id="evAdd">Add</button></div>
      <p class="small muted" style="margin-top:10px">${S.evidence.length} entr${S.evidence.length === 1 ? "y" : "ies"}</p>
      <ul class="list">${list.map((x) => `<li style="display:flex;gap:10px;align-items:flex-start;padding:12px 2px"><div style="flex:1"><div style="font-family:var(--serif);font-size:16.5px">${esc(x.text)}</div><div class="small muted">${fmtDate(x.date, { day: "numeric", month: "short", year: "numeric" })}</div></div><button class="iconbtn" type="button" data-del="${x.id}" aria-label="Remove">×</button></li>`).join("")}</ul>`;
    const add = () => { const v = $("#evIn").value.trim(); if (!v) return; S.evidence.push({ id: uid(), date: today(), text: v, u: Date.now() }); save(); viewEvidence(); $("#evIn").focus(); };
    $("#evAdd").onclick = add;
    $("#evIn").onkeydown = (e) => { if (e.key === "Enter") add(); };
    const from = ui.from;
    main.onclick = (ev) => {
      if (ev.target.closest("[data-back]")) return from ? go("today", null, { date: from === today() ? null : from }) : go("tools");
      const d = ev.target.closest("[data-del]"); if (d && confirm("Remove this entry?")) { S.evidence = S.evidence.filter((x) => x.id !== d.dataset.del); save(); viewEvidence(); }
    };
  }

  // ---------- settings / backup ----------
  async function sha(s) {
    if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("clearmind:" + s)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join(""); }
    let h = 0; for (const ch of "clearmind:" + s) h = (h * 31 + ch.charCodeAt(0)) | 0; return "f" + h;
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      navigator.share({ files: [file], title: name }).catch(() => {});
      return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function mergeIn(data) {
    if (!data || typeof data !== "object" || !data.entries) throw new Error("This file is not a Clear Mind backup.");
    let added = 0;
    Object.values(data.entries).forEach((e) => { const cur = S.entries[e.date]; if (!cur || (e.u || 0) > (cur.u || 0)) { S.entries[e.date] = e; added++; } });
    ["who5", "records", "evidence"].forEach((k) => (data[k] || []).forEach((x) => { const i = S[k].findIndex((y) => y.id === x.id); if (i < 0) { S[k].push(x); added++; } else if ((x.u || 0) > (S[k][i].u || 0)) S[k][i] = x; }));
    S.who5.sort((a, b) => (a.date < b.date ? -1 : 1));
    Object.entries(data.forms || {}).forEach(([k, f]) => { if (!S.forms[k] || (f.u || 0) > (S.forms[k].u || 0)) S.forms[k] = f; });
    S.currentDay = Math.max(S.currentDay, data.currentDay || 1);
    S.onboarded = true;
    save();
    return added;
  }
  function toMarkdown() {
    let md = `# Clear Mind journal\n\nExported ${today()}\n\n`;
    sortedEntries().forEach((e) => {
      const d = dayContent(e), ck = e.checkin || {};
      md += `## ${e.date} — ${e.day ? "Day " + e.day + ": " : ""}${d.title}\n\n`;
      md += `Mood ${ck.mood ?? "–"} · Calm ${ck.calm ?? "–"} · Confidence ${ck.conf ?? "–"} · Energy ${ck.energy ?? "–"} · Sleep ${ck.sleep ?? "–"} h${e.word ? " · “" + e.word + "”" : ""}\n\n`;
      d.prompts.forEach((p, i) => { if ((e.prompts || [])[i]) md += `**${p}**\n\n${e.prompts[i]}\n\n`; });
      if (e.free) md += `**Free writing**\n\n${e.free}\n\n`;
      const g = (e.good || []).filter(Boolean); if (g.length) md += `**Three good things**\n\n${g.map((x) => "- " + x).join("\n")}\n\n`;
      if ((e.traps || []).length) md += `Traps noticed: ${e.traps.map((id) => (C.traps.find((t) => t.id === id) || {}).name).join(", ")}\n\n`;
      if (e.step) md += `Tomorrow: ${e.step}\n\n`;
    });
    return md;
  }
  function ics(time) {
    const [h, m] = time.split(":");
    const d = today().replace(/-/g, "");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Clear Mind//EN", "BEGIN:VEVENT", `UID:clearmind-${uid()}@local`, `DTSTAMP:${d}T000000Z`, `DTSTART:${d}T${h}${m}00`, "DURATION:PT20M", "RRULE:FREQ=DAILY;COUNT=30", "SUMMARY:Clear Mind — 15 minutes for me", "DESCRIPTION:Read · practise · check in · write.", "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Clear Mind", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }
  function viewSettings() {
    const st = S.settings;
    main.innerHTML = `${backBtn()}<h1>Backup, reminder & privacy</h1>
      <section class="block" style="margin-top:20px"><h2>Backup</h2><p class="hint">Your journal lives only in this browser on this device. Export a backup regularly — for example to an iCloud Drive folder — and import it on a new phone.</p>
        <div class="row"><button class="btn" id="exp" type="button">Export backup</button><button class="btn ghost" id="impB" type="button">Import backup</button><input type="file" id="imp" accept="application/json,.json" hidden></div>
        <p style="margin-top:12px"><button class="btn quiet" id="md" type="button">Export journal as text (Markdown)</button></p><div id="impMsg"></div></section>
      <section class="block"><h2>Daily reminder</h2><p class="hint">Adds a daily 20-minute event for the next 30 days to your calendar.</p>
        <div class="row" style="flex-wrap:nowrap"><input type="time" id="rt" value="${st.remind}" style="max-width:140px" aria-label="Reminder time"><button class="btn ghost" id="rem" type="button">Add to calendar</button></div></section>
      <section class="block"><h2>Privacy screen</h2><p class="hint">A PIN keeps casual eyes out when someone picks up your phone. It is a screen, not encryption.</p>
        ${st.pinHash ? `<button class="btn ghost" id="pinOff" type="button">Remove PIN</button>` : `<div class="row" style="flex-wrap:nowrap"><input type="password" inputmode="numeric" id="pinNew" placeholder="4–8 digits" maxlength="8" aria-label="New PIN"><button class="btn ghost" id="pinSet" type="button">Set PIN</button></div>`}</section>
      <section class="block"><h2>Appearance</h2><div class="seg" role="group">${["auto", "light", "dark"].map((t) => `<button type="button" data-theme="${t}" aria-pressed="${st.theme === t}">${t === "auto" ? "Match phone" : t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div></section>
      <section class="block"><h2>Programme</h2><p class="hint">You are on day ${Math.min(S.currentDay, 30)}${S.currentDay > 30 ? " (programme complete — keep-going mode)" : ""}.</p><button class="btn quiet" id="restart" type="button">Restart the 30 days (keeps all entries)</button></section>
      <section class="block"><h2>Delete everything</h2><p class="hint">Removes all entries and settings from this device. Export a backup first if you want to keep them.</p><button class="btn danger" id="wipe" type="button">Delete all data</button></section>
      <p class="small muted" style="margin-top:28px">Clear Mind · works offline · no accounts, no tracking, no servers.</p>`;
    wireBack();
    const from = ui.from;
    const prev = main.onclick;
    main.onclick = async (ev) => {
      const id = ev.target.id;
      if (ev.target.closest("[data-back]")) return prev(ev);
      const th = ev.target.closest("[data-theme]"); if (th) { S.settings.theme = th.dataset.theme; save(true); applyTheme(); return viewSettings(); }
      if (id === "exp") download(`clear-mind-backup-${today()}.json`, JSON.stringify(S, null, 1), "application/json");
      if (id === "impB") $("#imp").click();
      if (id === "md") download(`clear-mind-journal-${today()}.md`, toMarkdown(), "text/markdown");
      if (id === "rem") { S.settings.remind = $("#rt").value || "21:00"; save(true); download("clear-mind-reminder.ics", ics(S.settings.remind), "text/calendar"); }
      if (id === "pinSet") { const v = $("#pinNew").value.trim(); if (!/^\d{4,8}$/.test(v)) { alert("Use 4 to 8 digits."); return; } S.settings.pinHash = await sha(v); save(); viewSettings(); }
      if (id === "pinOff") { S.settings.pinHash = null; save(); viewSettings(); }
      if (id === "restart" && confirm("Start again from day 1? Your entries stay in the journal.")) { S.currentDay = 1; save(); go("today"); }
      if (id === "wipe" && confirm("Delete all Clear Mind data on this device? This cannot be undone.") && confirm("Really delete everything?")) { localStorage.removeItem(KEY); S = defaults(); applyTheme(); go("today"); }
    };
    $("#imp").onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      try { const n = mergeIn(JSON.parse(await f.text())); $("#impMsg").innerHTML = `<div class="note">Backup imported — ${n} item${n === 1 ? "" : "s"} added or updated.</div>`; }
      catch (e) { $("#impMsg").innerHTML = `<div class="note">Import failed: ${esc(e.message)} Choose a file named like clear-mind-backup-….json.</div>`; }
      ev.target.value = "";
    };
    void from;
  }

  // ---------- lock ----------
  let hiddenAt = 0;
  function lockIfNeeded() {
    if (!S.settings.pinHash) return;
    $("#lock").classList.add("on"); $("#pinIn").value = ""; $("#pinMsg").textContent = ""; setTimeout(() => $("#pinIn").focus(), 50);
  }
  async function tryUnlock() {
    if ((await sha($("#pinIn").value.trim())) === S.settings.pinHash) $("#lock").classList.remove("on");
    else { $("#pinMsg").textContent = "That PIN didn’t match. Try again."; $("#pinIn").value = ""; }
  }
  $("#pinGo").onclick = tryUnlock;
  $("#pinIn").onkeydown = (e) => { if (e.key === "Enter") tryUnlock(); };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); flush(); }
    else if (hiddenAt && Date.now() - hiddenAt > 120000) lockIfNeeded();
  });
  window.addEventListener("pagehide", flush);

  // ---------- boot ----------
  // a new calendar day advances the default programme day for today's entry
  render();
  lockIfNeeded();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

  // test hook
  window.__CM = { lens, get S() { return S; }, mergeIn, toMarkdown };
})();
