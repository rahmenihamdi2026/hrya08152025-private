/* =====================================================================
   Hamdi & Yossr 💍 — Stories (v36)
   ---------------------------------------------------------------------
   Like Instagram, just for the two of us:
   • photo or text story, fonts, colours, stickers, drawing, music
     (pick the exact part of the song), visible 24 hours;
   • a ring around the avatar at the top when a story is waiting;
   • "Seen": the author sees when the other one watched it;
   • reactions with emojis (as many taps as you want) that rain down
     when the author opens the story;
   • notifications for a new story, a view and reactions;
   • edit or delete a story that is already posted.
   Firestore:
     stories/{id}        the picture (+ music, + layers to edit it later)
     storyActivity/{id}  small doc: vues {who: time}, reac {who: {emoji: n}}
   Loaded by index.html (window.HY = the bridge to the main app).
   ===================================================================== */
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, query, where, increment }
    from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

function hysStart() {
    if (window.__hysStarted) return;
    window.__hysStarted = true;
    const HY = window.HY;
    const db = HY.db;
    const $ = id => document.getElementById(id);
    const me = () => HY.me();
    const other = who => (who === "yossr" ? "hamdi" : "yossr");
    const NAME = k => HY.name(k);
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
    const toast = msg => { try { HY.toast(msg); } catch (e) {} };
    const DAY = 864e5, STORY_MS = 6000, LIFE = 24 * 3600 * 1000;
    const REACTIONS = [["like", "👍", "Like"], ["love", "❤️", "Love"], ["care", "🥰", "Care"], ["haha", "😂", "Haha"],
                       ["wow", "😮", "Wow"], ["sad", "😢", "Sad"], ["kiss", "😘", "Kiss"]];
    const emo = k => (REACTIONS.find(r => r[0] === k) || [])[1] || "";

    /* ------------------------------------------------------------------
       DOM
       ------------------------------------------------------------------ */
    const html = `
<div id="hys-chooser" aria-hidden="true"><div class="hys-ch-sheet" onclick="event.stopPropagation()">
  <div class="hys-ch-grab"></div><div class="hys-ch-title">New story</div>
  <div class="hys-ch-grid">
    <button type="button" class="hys-ch-b" onclick="hysNewPhoto()"><span class="hys-ch-ic">📷</span>Photo<small>From your gallery or camera</small></button>
    <button type="button" class="hys-ch-b txt" onclick="hysNewText()"><span class="hys-ch-ic">Aa</span>Text<small>A message on a colourful background</small></button>
  </div>
  <div class="hys-ch-rows" id="hys-ch-rows"></div>
</div></div>
<input type="file" id="hys-file" accept="image/*" style="display:none">

<div id="hys-viewer" aria-hidden="true"><div class="sv-stage" id="hys-stage">
  <img class="sv-blur" id="hys-blur" alt="" draggable="false">
  <img class="sv-img" id="hys-img" alt="" draggable="false">
  <div class="sv-bars" id="hys-bars"></div>
  <div class="sv-head">
    <div class="sv-av"><img id="hys-head-av" alt=""></div>
    <div class="sv-who"><div class="sv-name" id="hys-head-name"></div><div class="sv-time" id="hys-time"></div><div class="sv-music" id="hys-music-t" style="display:none"></div></div>
    <button type="button" class="sv-x" id="hys-sound" onclick="hysToggleSound()" aria-label="Sound" style="display:none">🔊</button>
    <button type="button" class="sv-x" onclick="hysCloseViewer()" aria-label="Close">✕</button>
  </div>
  <div class="sv-seenpill" id="hys-seenpill" onclick="hysOpenViews()"></div>
  <div class="sv-owner">
    <button type="button" class="sv-btn" onclick="hysOpenViews()" title="Seen &amp; reactions" aria-label="Seen and reactions">👁</button>
    <button type="button" class="sv-btn" onclick="hysEditCurrent()" title="Edit" aria-label="Edit">✏️</button>
    <button type="button" class="sv-btn" onclick="hysDeleteCurrent()" title="Delete" aria-label="Delete">🗑️</button>
    <button type="button" class="sv-btn" onclick="hysCloseViewer();hysPick()" title="New story" aria-label="New story">＋</button>
  </div>
  <div class="sv-reac" id="hys-reac"></div>
  <div class="sv-vues" id="hys-vues">
    <div class="sv-vues-h"><span>👁 Seen &amp; reactions</span><button type="button" class="sv-x" onclick="hysCloseViews()" aria-label="Close">✕</button></div>
    <div id="hys-vues-list"></div>
  </div>
</div></div>

<div id="hys-editor" aria-hidden="true"><div class="se-stage" id="hys-se-stage">
  <canvas id="hys-canvas"></canvas>
  <div class="se-top">
    <button type="button" class="se-ic" onclick="HysEd.close()" aria-label="Close">✕</button>
    <div class="se-tools">
      <button type="button" class="se-ic" style="font-size:20px" onclick="HysEd.addText()" title="Text">Aa</button>
      <button type="button" class="se-ic" onclick="HysEd.openStickers()" title="Stickers">😊</button>
      <button type="button" class="se-ic" id="hys-b-music" onclick="HysEd.pickMusic()" title="Music">♪</button>
      <button type="button" class="se-ic" onclick="HysEd.drawMode(true)" title="Draw">✏️</button>
      <button type="button" class="se-ic" onclick="HysEd.nextBackground()" title="Background">🎨</button>
      <button type="button" class="se-ic" onclick="HysEd.pickPhoto()" title="Photo">🖼️</button>
    </div>
  </div>
  <div class="se-mu-chip" id="hys-mu-chip"><span id="hys-mu-chip-t" dir="auto" onclick="HysEd.tuneMusic()"></span><button type="button" onclick="HysEd.removeMusic()" aria-label="Remove the music" title="Remove the music">✕</button></div>
  <div class="se-drawbar">
    <div class="se-drawrow">
      <button type="button" class="se-ic" onclick="HysEd.undoStroke()" title="Undo">↶</button>
      <div class="se-larg" id="hys-larg">
        <button type="button" data-l="8" onclick="HysEd.width(8)"><i style="width:6px;height:6px"></i></button>
        <button type="button" data-l="14" onclick="HysEd.width(14)"><i style="width:10px;height:10px"></i></button>
        <button type="button" data-l="28" onclick="HysEd.width(28)"><i style="width:16px;height:16px"></i></button>
      </div>
      <button type="button" class="se-ok" onclick="HysEd.drawMode(false)">Done</button>
    </div>
    <div class="se-cols" id="hys-draw-cols"></div>
  </div>
  <div class="se-zoom"><span>−</span><input type="range" id="hys-zoom" min="30" max="400" value="100" aria-label="Zoom"><span>+</span>
    <button type="button" onclick="HysEd.recenter()" title="Recenter">⟲</button></div>
  <div class="se-trash" id="hys-trash">🗑️</div>
  <div class="se-bottom"><button type="button" class="se-publish" id="hys-pub" onclick="HysEd.publish()">Share story ›</button></div>
</div></div>
<div class="hys-textedit" id="hys-textedit">
  <div class="se-te-bar">
    <button type="button" class="se-te-ic" id="hys-align" onclick="HysEd.align()" title="Alignment">≡</button>
    <button type="button" class="se-te-ic" id="hys-bgtxt" onclick="HysEd.textBg()" title="Text background"><b>A</b></button>
    <button type="button" class="se-ok" onclick="HysEd.finishText()">Done</button>
  </div>
  <div class="se-fonts" id="hys-fonts"></div>
  <div class="se-cols" id="hys-cols"></div>
  <div class="se-te-size"><span>A</span><input type="range" id="hys-size" min="40" max="190" value="84" aria-label="Text size"><span style="font-size:22px">A</span></div>
  <div class="se-te-zone" onclick="if(event.target===this) HysEd.finishText()">
    <textarea id="hys-ta" rows="1" placeholder="Type something sweet…" dir="auto" spellcheck="false"></textarea>
  </div>
</div>
<div class="hys-panel" id="hys-stickers">
  <div class="se-pan-head"><span>Stickers</span><button type="button" class="se-ok" onclick="HysEd.closePanel('hys-stickers')">Close</button></div>
  <div class="se-chips" id="hys-chips"></div>
  <div class="se-st-grid" id="hys-st-grid"></div>
</div>
<div class="hys-panel" id="hys-music">
  <div class="se-pan-head"><span>♪ Music</span><button type="button" class="se-ok" onclick="HysEd.closePanel('hys-music')">Cancel</button></div>
  <div id="hys-mu-body"></div>
</div>
<input type="file" id="hys-photo-in" accept="image/*" style="display:none">
<input type="file" id="hys-audio-in" accept="audio/*" style="display:none">`;
    const holder = document.createElement("div");
    holder.id = "hys-root";
    holder.innerHTML = html;
    document.body.appendChild(holder);

    const lockBody = on => {
        document.body.classList.toggle("hys-lock", !!on);
        document.body.style.overflow = on ? "hidden" : "";
    };
    const anyOpen = () => ["hys-viewer", "hys-editor"].some(id => $(id).classList.contains("open"));

    /* ------------------------------------------------------------------
       DATA (live)
       ------------------------------------------------------------------ */
    const S = { stories: [], act: {}, loaded: false };
    const active = who => {
        const now = Date.now();
        return S.stories.filter(s => s && s.img && s.by === who && +s.expiresAt > now)
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    };
    const vueOf = (s, who) => { const a = S.act[s.id]; return a && a.vues ? +a.vues[who] || 0 : 0; };
    const seenBy = (s, who) => { const v = vueOf(s, who); return v > 0 && v >= (+s.updatedAt || +s.createdAt || 0); };
    const reacOf = (s, who) => { const a = S.act[s.id]; return (a && a.reac && a.reac[who]) || {}; };

    onSnapshot(query(collection(db, "stories"), where("expiresAt", ">", Date.now())), snap => {
        S.stories = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
        S.loaded = true;
        decorate(); refreshViewer(); planCleanup();
    }, e => console.warn("Stories:", e && (e.code || e.message)));
    onSnapshot(collection(db, "storyActivity"), snap => {
        const m = {}; snap.forEach(d => { m[d.id] = d.data(); });
        S.act = m;
        decorate(); onActivity();
    }, e => console.warn("Story activity:", e && (e.code || e.message)));

    /* ------------------------------------------------------------------
       RINGS at the top: my avatar (+ to add) and the other one's avatar
       ------------------------------------------------------------------ */
    let partnerKey = null;
    function decorate() {
        const who = me();
        const ring = $("hys-me-ring");
        const mine = who ? active(who) : [];
        if (ring) {
            ring.classList.toggle("hys-has", mine.length > 0);
            ring.title = mine.length ? "My story" : "";
        }
        const pb = $("hys-partner");
        if (!pb) return;
        if (!who) { pb.classList.remove("on"); document.body.classList.remove("hys-p-on"); return; }
        const p = other(who);
        if (partnerKey !== p) { pb.innerHTML = `<span class="hys-ringwrap" id="hys-p-ring">${HY.av(p)}</span>`; partnerKey = p; }
        const list = active(p);
        const unseen = list.some(s => !seenBy(s, who));
        const pr = $("hys-p-ring");
        pb.classList.toggle("on", list.length > 0);
        document.body.classList.toggle("hys-p-on", list.length > 0);
        if (pr) { pr.classList.toggle("hys-new", list.length > 0 && unseen); pr.classList.toggle("hys-seen", list.length > 0 && !unseen); }
        pb.title = list.length ? `${NAME(p)}'s story` : "";
    }
    window.hysDecorate = decorate;

    /* ------------------------------------------------------------------
       CHOOSER (＋)
       ------------------------------------------------------------------ */
    function openChooser() {
        const who = me(); if (!who) return;
        const rows = [];
        if (active(who).length) rows.push(`<button type="button" class="hys-ch-row" onclick="hysCloseChooser();hysOpenMine()">${HY.av(who)} View my story</button>`);
        if (active(other(who)).length) rows.push(`<button type="button" class="hys-ch-row" onclick="hysCloseChooser();hysOpenPartner()">${HY.av(other(who))} View ${esc(NAME(other(who)))}'s story</button>`);
        rows.push(`<button type="button" class="hys-ch-row" onclick="hysCloseChooser();HY.openProfile()">👤 My profile</button>`);
        $("hys-ch-rows").innerHTML = rows.join("");
        $("hys-chooser").classList.add("open");
    }
    function closeChooser() { $("hys-chooser").classList.remove("open"); }
    $("hys-chooser").addEventListener("click", closeChooser);
    window.hysPick = openChooser;
    window.hysCloseChooser = closeChooser;
    window.hysAvatarTap = function() {
        const who = me();
        if (!who) return HY.openProfile();
        if (active(who).length) return openViewer(who);
        openChooser();
    };
    window.hysNewPhoto = function() { closeChooser(); const f = $("hys-file"); f.value = ""; f.click(); };
    window.hysNewText = function() { closeChooser(); HysEd.open({ text: true }); };
    $("hys-file").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) HysEd.open({ file: f }); });
    window.hysOpenMine = () => openViewer(me());
    window.hysOpenPartner = () => openViewer(other(me()));

    /* ------------------------------------------------------------------
       VIEWER
       ------------------------------------------------------------------ */
    let V = null, svAudio = null, bound = false;
    const agoText = ts => {
        const min = Math.max(1, Math.round((Date.now() - ts) / 60000));
        if (min < 60) return min + "m ago";
        return Math.round(min / 60) + "h ago";
    };
    const leftText = ts => {
        const min = Math.max(1, Math.round((ts - Date.now()) / 60000));
        if (min < 60) return min + "m left";
        return Math.round(min / 60) + "h left";
    };
    function openViewer(who, startId) {
        const list = active(who);
        if (!list.length) { toast(who === me() ? "You have no story right now" : `${NAME(who)} has no story right now`); return; }
        let i = startId ? list.findIndex(s => s.id === startId) : (who === me() ? 0 : list.findIndex(s => !seenBy(s, me())));
        if (i < 0) i = 0;
        V = { who, list, i, start: 0, elapsed: 0, paused: false, raf: 0, rained: {} };
        const v = $("hys-viewer");
        v.classList.add("open"); v.setAttribute("aria-hidden", "false");
        lockBody(true);
        bind();
        show();
    }
    function closeViewer() {
        flushReac();
        closeViews(true);
        if (V && V.raf) cancelAnimationFrame(V.raf);
        V = null; stopAudio();
        const v = $("hys-viewer");
        v.classList.remove("open"); v.setAttribute("aria-hidden", "true");
        if (!anyOpen()) lockBody(false);
        decorate();
    }
    window.hysCloseViewer = closeViewer;
    function show() {
        if (!V) return;
        const s = V.list[V.i]; if (!s) return closeViewer();
        const owner = s.by === me();
        $("hys-bars").innerHTML = V.list.map((x, k) => `<div class="sv-bar"><i style="width:${k < V.i ? 100 : 0}%"></i></div>`).join("");
        $("hys-img").src = s.img; $("hys-blur").src = s.img;
        $("hys-head-av").src = HY.avatarUrl(s.by);
        $("hys-head-name").textContent = NAME(s.by);
        $("hys-time").textContent = agoText(+s.createdAt || Date.now()) + (owner ? " · " + leftText(+s.expiresAt) : "");
        $("hys-stage").classList.toggle("is-owner", owner);
        flushReac();
        if (owner) {
            // all the reactions received fall down, then the new ones live
            V.counts = Object.assign({}, reacOf(s, other(me())));
            if (!V.rained[s.id]) { V.rained[s.id] = true; rain(countsToList(V.counts)); }
            updateSeenPill(s); renderViews();
        } else {
            markSeen(s);
            buildReacBar();
        }
        // music
        stopAudio();
        const mu = $("hys-music-t"), so = $("hys-sound");
        if (s.audio) {
            const a = new Audio(s.audio); a.loop = true; a.muted = muted(); svAudio = a;
            a.play().catch(() => {});
            mu.textContent = "♪ " + (s.audioTitle || "Music"); mu.style.display = "";
            so.style.display = ""; so.textContent = a.muted ? "🔇" : "🔊";
        } else { mu.style.display = "none"; so.style.display = "none"; }
        const dur = s.audio ? Math.min(30000, Math.max(5000, +s.dur || 15000)) : STORY_MS;
        if (V.raf) cancelAnimationFrame(V.raf);
        V.elapsed = 0; V.start = performance.now(); V.paused = !!($("hys-vues").classList.contains("open"));
        const bars = $("hys-bars"), cur = V;
        const tick = t => {
            if (V !== cur) return;
            if (!cur.paused) {
                const p = Math.min(1, (cur.elapsed + t - cur.start) / dur);
                const bar = bars.children[cur.i] && bars.children[cur.i].firstChild;
                if (bar) bar.style.width = (p * 100) + "%";
                if (p >= 1) return step(1);
            }
            cur.raf = requestAnimationFrame(tick);
        };
        cur.raf = requestAnimationFrame(tick);
    }
    function step(d) {
        if (!V) return;
        const n = V.i + d;
        if (n >= V.list.length) return closeViewer();
        V.i = Math.max(0, n); show();
    }
    function pause(on) {
        if (!V || V.paused === on) return;
        const now = performance.now();
        if (on) { V.elapsed += now - V.start; V.paused = true; if (svAudio) svAudio.pause(); }
        else { V.start = now; V.paused = false; if (svAudio) svAudio.play().catch(() => {}); }
    }
    function stopAudio() { if (svAudio) { try { svAudio.pause(); svAudio.src = ""; } catch (e) {} svAudio = null; } }
    function muted() { try { return localStorage.getItem("hys-mute") === "1"; } catch (e) { return false; } }
    window.hysToggleSound = function() {
        const m = !muted();
        try { localStorage.setItem("hys-mute", m ? "1" : "0"); } catch (e) {}
        if (svAudio) { svAudio.muted = m; if (!m) svAudio.play().catch(() => {}); }
        $("hys-sound").textContent = m ? "🔇" : "🔊";
    };
    // tap right = next, left = back, hold = pause, swipe down = close
    function bind() {
        if (bound) return; bound = true;
        const st = $("hys-stage");
        let x0 = 0, y0 = 0, t0 = 0, on = false;
        st.addEventListener("pointerdown", e => {
            if (e.target.closest("button, .sv-reac, .sv-vues, .sv-seenpill")) return;
            on = true; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); pause(true);
        });
        const end = e => {
            if (!on) return; on = false;
            const dx = e.clientX - x0, dy = e.clientY - y0, dt = Date.now() - t0;
            if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return closeViewer();
            pause(false);
            if (dt < 300 && Math.abs(dx) < 25 && Math.abs(dy) < 25) {
                const r = st.getBoundingClientRect();
                step((e.clientX - r.left) < r.width * 0.33 ? -1 : 1);
            } else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
        };
        st.addEventListener("pointerup", end);
        st.addEventListener("pointercancel", () => { on = false; pause(false); });
        document.addEventListener("visibilitychange", () => { if (V) pause(document.hidden); });
        document.addEventListener("keydown", e => {
            if (!V) return;
            if (e.key === "Escape") closeViewer();
            else if (e.key === "ArrowRight") step(1);
            else if (e.key === "ArrowLeft") step(-1);
        });
    }
    // the stories changed while the viewer is open
    function refreshViewer() {
        if (!V) return;
        const cur = V.list[V.i], list = active(V.who);
        if (!list.length) return closeViewer();
        const k = cur ? list.findIndex(s => s.id === cur.id) : -1;
        V.list = list;
        if (k >= 0) {
            V.i = k;
            $("hys-bars").innerHTML = list.map((x, j) => `<div class="sv-bar"><i style="width:${j < k ? 100 : 0}%"></i></div>`).join("");
            if (list[k].img !== cur.img) show();
        } else { V.i = Math.min(V.i, list.length - 1); show(); }
    }

    /* ---------- "Seen" ---------- */
    function markSeen(s) {
        const who = me(); if (!who || s.by === who) return;
        const before = vueOf(s, who), ref = +s.updatedAt || +s.createdAt || 0;
        if (before && before >= ref) return;
        const now = Date.now();
        const a = S.act[s.id] = Object.assign({}, S.act[s.id]);
        a.vues = Object.assign({}, a.vues, { [who]: now });
        setDoc(doc(db, "storyActivity", s.id), { by: s.by, exp: +s.expiresAt || now + LIFE, vues: { [who]: now } }, { merge: true })
            .catch(e => console.warn("Story seen:", e && (e.code || e.message)));
        if (!before) HY.notify("story_seen", `👀 ${NAME(who)} saw your story`, s.by, "home", s.id, "story");
        decorate();
    }
    function updateSeenPill(s) {
        const p = other(me()), pill = $("hys-seenpill"), v = vueOf(s, p);
        if (!pill) return;
        pill.classList.toggle("on", true);
        pill.innerHTML = v ? `<img src="${HY.avatarUrl(p)}" alt=""> Seen by ${esc(NAME(p))}` : `👁 Not seen yet`;
    }

    /* ---------- reactions (the other one) ---------- */
    function buildReacBar() {
        const bar = $("hys-reac");
        if (bar.childNodes.length) return;
        bar.innerHTML = REACTIONS.map(r => `<button type="button" class="sv-r" data-k="${r[0]}" title="${r[2]}" aria-label="${r[2]}">${r[1]}</button>`).join("");
        bar.addEventListener("click", e => { const b = e.target.closest(".sv-r"); if (b) react(b.dataset.k, b); });
    }
    let pend = null, pendT = 0;
    const lastNotif = {};
    function react(k, btn) {
        if (!V) return;
        const s = V.list[V.i]; if (!s || s.by === me()) return;
        if (pend && pend.sid !== s.id) flushReac();
        pend = pend || { sid: s.id, by: s.by, exp: +s.expiresAt, d: {}, t0: Date.now() };
        pend.d[k] = (pend.d[k] || 0) + 1;
        clearTimeout(pendT);
        if (Date.now() - pend.t0 > 3000) flushReac();
        else pendT = setTimeout(flushReac, 1200);
        fly(btn, emo(k));
    }
    function flushReac() {
        clearTimeout(pendT); pendT = 0;
        const p = pend; pend = null;
        if (!p || !Object.keys(p.d).length) return;
        const who = me(), inc = {};
        Object.keys(p.d).forEach(k => { inc[k] = increment(Math.min(500, p.d[k])); });
        setDoc(doc(db, "storyActivity", p.sid), { by: p.by, exp: p.exp || Date.now() + LIFE, reac: { [who]: inc }, rts: { [who]: Date.now() } }, { merge: true })
            .catch(e => console.warn("Story reaction:", e && (e.code || e.message)));
        // one notification at most every 2 minutes for the same story
        if (!lastNotif[p.sid] || Date.now() - lastNotif[p.sid] > 120000) {
            lastNotif[p.sid] = Date.now();
            const list = Object.keys(p.d).sort((a, b) => p.d[b] - p.d[a]).map(emo).join("");
            HY.notify("story_react", `${NAME(who)} reacted to your story ${list}`, p.by, "home", p.sid, "story");
        }
    }
    function fly(btn, e) {
        const st = $("hys-stage"); if (!st || !btn) return;
        const r = st.getBoundingClientRect(), b = btn.getBoundingClientRect();
        const f = document.createElement("span"); f.className = "sv-fly"; f.textContent = e;
        f.style.left = (b.left - r.left + b.width / 2) + "px"; f.style.top = (b.top - r.top - 6) + "px";
        f.style.setProperty("--dx", Math.round(Math.random() * 90 - 45) + "px");
        st.appendChild(f); setTimeout(() => f.remove(), 1600);
    }
    function countsToList(c) {
        const out = [];
        REACTIONS.forEach(r => { for (let i = 0; i < (+c[r[0]] || 0) && out.length < 400; i++) out.push(r[1]); });
        return out.sort(() => Math.random() - 0.5);
    }
    // emojis raining down for the author (as many as taps, 150 at most at once)
    function rain(list) {
        const st = $("hys-stage"); if (!st || !list.length) return;
        const H = st.clientHeight + 90, n = Math.min(150, list.length), spread = Math.min(6500, 300 + n * 90);
        for (let i = 0; i < n; i++) {
            const e = list[i];
            setTimeout(() => {
                if (!V) return;
                const f = document.createElement("span"); f.className = "sv-drop"; f.textContent = e;
                const d = Math.round(2300 + Math.random() * 1300);
                f.style.left = (3 + Math.random() * 86) + "%"; f.style.fontSize = Math.round(26 + Math.random() * 18) + "px";
                f.style.setProperty("--h", H + "px"); f.style.setProperty("--dx", Math.round(Math.random() * 70 - 35) + "px");
                f.style.setProperty("--rot", Math.round(Math.random() * 90 - 45) + "deg"); f.style.animationDuration = d + "ms";
                st.appendChild(f); setTimeout(() => f.remove(), d + 120);
            }, i === 0 ? 150 : Math.round(150 + Math.random() * spread));
        }
    }
    // new activity while I look at my own story → new emojis fall, "Seen" updates
    function onActivity() {
        if (!V) return;
        const s = V.list[V.i]; if (!s || s.by !== me()) return;
        const now = reacOf(s, other(me())), prev = V.counts || {}, out = [];
        REACTIONS.forEach(r => { for (let i = +prev[r[0]] || 0; i < (+now[r[0]] || 0); i++) out.push(r[1]); });
        V.counts = Object.assign({}, now);
        if (out.length) rain(out.sort(() => Math.random() - 0.5));
        updateSeenPill(s); renderViews();
    }
    function renderViews() {
        const box = $("hys-vues-list"); if (!box || !V) return;
        const s = V.list[V.i]; if (!s) return;
        const p = other(me()), v = vueOf(s, p), r = reacOf(s, p);
        const emos = REACTIONS.filter(x => +r[x[0]] > 0).map(x => x[1]).join(" ");
        const a = S.act[s.id] || {}, rt = a.rts && +a.rts[p] || 0;
        const when = v ? `Seen ${agoText(v)}` + (rt ? ` · reacted ${agoText(rt)}` : "") : "Not seen yet";
        box.innerHTML = `<div class="sv-v${emos ? " a-reac" : ""}"${emos ? ` onclick="hysReplay()"` : ""}>
            <img src="${HY.avatarUrl(p)}" alt=""><div class="sv-v-t"><b>${esc(NAME(p))}</b><small>${when}</small></div>
            <div class="sv-v-r">${emos}</div></div>` + (emos ? `<div class="sv-hint">Tap ${esc(NAME(p))} to see the reactions fall again</div>` : "");
    }
    window.hysReplay = function() {
        if (!V) return;
        const s = V.list[V.i]; if (!s) return;
        rain(countsToList(reacOf(s, other(me()))));
    };
    function openViews() {
        if (!V) return;
        const s = V.list[V.i]; if (!s || s.by !== me()) return;
        pause(true);
        renderViews();
        $("hys-vues").classList.add("open");
    }
    function closeViews(silent) {
        const pan = $("hys-vues"); if (!pan.classList.contains("open")) return;
        pan.classList.remove("open");
        if (!silent) pause(false);
    }
    window.hysOpenViews = openViews;
    window.hysCloseViews = () => closeViews(false);
    window.hysEditCurrent = function() {
        if (!V) return;
        const s = V.list[V.i]; if (!s || s.by !== me()) return;
        closeViewer();
        HysEd.open({ story: s });
    };
    window.hysDeleteCurrent = async function() {
        if (!V) return;
        const s = V.list[V.i]; if (!s || s.by !== me()) return;
        pause(true);
        if (!confirm("Delete this story?")) { pause(false); return; }
        try {
            await deleteDoc(doc(db, "stories", s.id));
            deleteDoc(doc(db, "storyActivity", s.id)).catch(() => {});
        } catch (e) { pause(false); toast("Could not delete — check your internet"); return; }
        S.stories = S.stories.filter(x => x.id !== s.id);
        toast("Story deleted");
        if (!V) return;
        V.list = V.list.filter(x => x.id !== s.id);
        if (!V.list.length) return closeViewer();
        V.i = Math.min(V.i, V.list.length - 1); show();
    };

    /* ---------- a notification opens the story ---------- */
    window.hysOpenFromNotif = function(id, tries) {
        const s = S.stories.find(x => x.id === id);
        if (!s) {
            if (!S.loaded && (tries || 0) < 8) return setTimeout(() => window.hysOpenFromNotif(id, (tries || 0) + 1), 600);
            toast("This story has disappeared (24 h) ⏳");
            return;
        }
        if (+s.expiresAt <= Date.now()) { toast("This story has disappeared (24 h) ⏳"); return; }
        if (s.by === me()) openViewer(s.by, s.id);
        else openViewer(s.by, s.id);
    };
    // switching between Hamdi and Yossr on the same phone
    window.hysRefresh = function() { closeViewer(); closeChooser(); if (HysEd.isOpen()) HysEd.close(true); partnerKey = null; decorate(); };

    /* ------------------------------------------------------------------
       CLEAN-UP: a story leaves Firebase after 24 h (with its activity)
       ------------------------------------------------------------------ */
    let cleanT = 0;
    async function cleanup() {
        const now = Date.now();
        try {
            const old = await getDocs(query(collection(db, "stories"), where("expiresAt", "<=", now)));
            await Promise.allSettled(old.docs.map(d => Promise.all([deleteDoc(d.ref), deleteDoc(doc(db, "storyActivity", d.id))])));
            const oldAct = await getDocs(query(collection(db, "storyActivity"), where("exp", "<=", now)));
            await Promise.allSettled(oldAct.docs.map(d => deleteDoc(d.ref)));
        } catch (e) { console.warn("Story clean-up:", e && (e.code || e.message)); }
    }
    function planCleanup() {
        clearTimeout(cleanT);
        const ends = S.stories.map(s => +s.expiresAt).filter(t => t > 0);
        if (!ends.length) return;
        const wait = Math.max(5000, Math.min(...ends) - Date.now() + 5000);
        if (wait < 2e9) cleanT = setTimeout(() => { cleanup(); decorate(); refreshViewer(); }, wait);
    }
    setTimeout(cleanup, 6000);

    /* ------------------------------------------------------------------
       EDITOR
       ------------------------------------------------------------------ */
    const START = new Date("2025-08-15T00:00:00"), WEDDING = new Date("2027-10-10T00:00:00");
    const HysEd = {
        LW: 1080, LH: 1920,
        BGS: [["#e07fa0", "#c0396b"], ["#ff9a9e", "#fad0c4"], ["#a18cd1", "#fbc2eb"], ["#f6d365", "#fda085"],
              ["#84fab0", "#8fd3f4"], ["#232526", "#414345"], ["#fff1eb", "#ace0f9"], ["#0f2027", "#2c5364"]],
        COLORS: ["#FFFFFF", "#111111", "#FF3E7F", "#C0396B", "#FF8A3C", "#FFC23C", "#26A96B", "#3E7BFF", "#7F5AF0", "#8B5E3C", "#FFD9E6", "#A3E4FF"],
        FONTS: [
            { id: "bold", name: "Bold", css: '800 {s}px "Baloo 2", system-ui, sans-serif', lh: 1.12, k: 1, btn: "font-family:'Baloo 2';font-weight:800" },
            { id: "classic", name: "Classic", css: '700 {s}px "Lato", system-ui, sans-serif', lh: 1.25, k: 1, btn: "font-family:'Lato';font-weight:700" },
            { id: "romantic", name: "Romantic", css: '400 {s}px "Great Vibes", cursive', lh: 1.25, k: 1.35, btn: "font-family:'Great Vibes';font-size:1.25rem" },
            { id: "fun", name: "Fun", css: '400 {s}px "Pacifico", cursive', lh: 1.45, k: 1, btn: "font-family:'Pacifico'" }
        ],
        STICKERS: "❤️ 💕 💖 💘 💍 💐 🌹 🌸 🥰 😍 😘 😂 🤗 🥺 😴 ✨ ⭐ 🎉 🎁 🎂 ☕ 🍕 🍰 🍿 🏠 ✈️ 🌙 ☀️ 🌧️ 🐱 🐶 📸 🎵 👫 💑 👰 🤵 🔥 🙈 🫶".split(" "),
        MUSIC_LIB: "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js",
        st: null, _ptrs: new Map(), _g: null, _edI: -1,
        _el: id => $(id),
        isOpen() { return $("hys-editor").classList.contains("open"); },

        async open(opts) {
            opts = opts || {};
            if (!me()) return;
            this.st = { photo: null, bg: 0, bgPhoto: "blur", items: [], strokes: [], music: null, sel: -1, draw: false, strokeColor: "#FFFFFF", strokeW: 14 };
            this._ptrs.clear(); this._g = null; this._edI = -1;
            this._fonts();
            const ed = $("hys-editor"); ed.classList.add("open"); ed.setAttribute("aria-hidden", "false");
            lockBody(true);
            this._bind(); this._size(); this._ui(); this.render();
            $("hys-pub").textContent = opts.story ? "Save ›" : "Share story ›";
            if (opts.story) await this._restore(opts.story);
            else if (opts.file) await this.loadPhoto(opts.file);
            else if (opts.text) this.addText();
        },
        async _restore(s) {
            const st = this.st; if (!st) return;
            st.edit = { id: String(s.id), createdAt: +s.createdAt || Date.now(), expiresAt: +s.expiresAt || 0 };
            if (s.audio) st.music = { data: s.audio, title: s.audioTitle || "Music", dur: +s.dur || 15000 };
            let ed = null; try { ed = s.ed ? JSON.parse(s.ed) : null; } catch (e) { ed = null; }
            if (ed && ed.v === 1) {
                st.bg = +ed.bg || 0; st.bgPhoto = ed.bgPhoto || "blur";
                st.items = (Array.isArray(ed.items) ? ed.items : []).filter(x => x && x.type);
                st.strokes = (Array.isArray(ed.strokes) ? ed.strokes : []).filter(t => t && Array.isArray(t.pts));
                if (ed.photo && s.src) {
                    try { this._setPhoto(await this._imgUrl(s.src)); Object.assign(st.photo, { x: +ed.photo.x, y: +ed.photo.y, s: +ed.photo.s || 1, r: +ed.photo.r || 0 }); } catch (e) {}
                }
            } else {
                try { this._setPhoto(await this._imgUrl(s.img)); st.bgPhoto = "black"; } catch (e) {}
            }
            this._ui(); this.render();
        },
        _imgUrl(url) { return new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error("image")); im.src = url; }); },
        close(force) {
            const st = this.st;
            if (!force && st && (st.photo || st.items.length || st.strokes.length)) {
                if (!confirm(st.edit ? "Leave without saving?" : "Leave without sharing?")) return;
            }
            this._stopPlay();
            ["hys-textedit", "hys-stickers", "hys-music"].forEach(id => $(id).classList.remove("open"));
            const ed = $("hys-editor"); ed.classList.remove("open", "is-text", "is-draw"); ed.setAttribute("aria-hidden", "true");
            if (!anyOpen()) lockBody(false);
            this.st = null;
        },
        _fonts() {
            if (!document.getElementById("hys-fonts-link")) {
                const l = document.createElement("link"); l.id = "hys-fonts-link"; l.rel = "stylesheet";
                l.href = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&family=Pacifico&display=swap"; document.head.appendChild(l);
            }
            try {
                Promise.all(['800 60px "Baloo 2"', '700 60px "Lato"', '400 60px "Great Vibes"', '400 60px "Pacifico"'].map(f => document.fonts.load(f)))
                    .then(() => this.render()).catch(() => {});
            } catch (e) {}
        },
        _size() {
            const vw = window.innerWidth, vh = window.innerHeight;
            const W = Math.floor(Math.min(vw, 520, vh * 9 / 16)), H = Math.round(W * 16 / 9);
            const stage = $("hys-se-stage"); stage.style.width = W + "px"; stage.style.height = H + "px";
            const cv = $("hys-canvas"), dpr = Math.min(2.5, window.devicePixelRatio || 1);
            cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px";
            this.W = W; this.H = H; this.k = W * dpr / this.LW; this.kc = W / this.LW;
        },
        _bind() {
            if (this._bound) return; this._bound = true;
            const cv = $("hys-canvas");
            cv.addEventListener("pointerdown", e => this._pd(e));
            cv.addEventListener("pointermove", e => this._pm(e));
            cv.addEventListener("pointerup", e => this._pu(e, false));
            cv.addEventListener("pointercancel", e => this._pu(e, true));
            window.addEventListener("resize", () => { if (this.st && this.isOpen() && this._edI < 0) { this._size(); this.render(); } });
            $("hys-zoom").addEventListener("input", e => { const p = this.st && this.st.photo; if (!p) return; p.s = (+e.target.value || 100) / 100; this.render(); });
            $("hys-photo-in").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) this.loadPhoto(f); });
            $("hys-audio-in").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) this._audioFile(f); });
            const ta = $("hys-ta");
            ta.addEventListener("input", () => { const it = this.st && this.st.items[this._edI]; if (it) { it.text = ta.value; this._styleTa(); } });
            $("hys-size").addEventListener("input", e => { const it = this.st && this.st.items[this._edI]; if (it) { it.fs = +e.target.value; this._styleTa(); } });
            $("hys-fonts").innerHTML = this.FONTS.map(f => `<button type="button" data-p="${f.id}" style="${f.btn}" onclick="HysEd.font('${f.id}')">${f.name}</button>`).join("");
        },
        _ui() {
            const st = this.st; if (!st) return;
            const ed = $("hys-editor");
            ed.classList.toggle("is-draw", !!st.draw);
            ed.classList.toggle("a-photo", !!st.photo);
            $("hys-zoom").value = st.photo ? Math.round(st.photo.s * 100) : 100;
            $("hys-b-music").classList.toggle("on", !!st.music);
            $("hys-mu-chip").classList.toggle("show", !!st.music);
            $("hys-mu-chip-t").textContent = st.music ? "♪ " + st.music.title : "";
            const dc = $("hys-draw-cols");
            if (!dc.childNodes.length) dc.innerHTML = this.COLORS.map(c => `<button type="button" class="se-col" style="background:${c}" onclick="HysEd.strokeColor('${c}')"></button>`).join("");
            [...dc.children].forEach((b, i) => b.classList.toggle("on", this.COLORS[i] === st.strokeColor));
            document.querySelectorAll("#hys-larg button").forEach(b => b.classList.toggle("on", +b.dataset.l === st.strokeW));
        },

        /* photo */
        async loadPhoto(file) {
            let img;
            try { img = await this._img(file); } catch (e) { return toast("This picture can't be read — try another one"); }
            if (!this.st) return;
            this._setPhoto(img); this._ui(); this.render();
        },
        _setPhoto(img) {
            if (!this.st) return;
            const r = Math.min(1, 1600 / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * r)), h = Math.max(1, Math.round(img.height * r));
            const src = document.createElement("canvas"); src.width = w; src.height = h;
            src.getContext("2d").drawImage(img, 0, 0, w, h);
            const bl = document.createElement("canvas"); bl.width = 27; bl.height = 48;
            const bx = bl.getContext("2d"), sc = Math.max(27 / w, 48 / h);
            bx.drawImage(src, (27 - w * sc) / 2, (48 - h * sc) / 2, w * sc, h * sc);
            this.st.photo = { src, blur: bl, w, h, x: this.LW / 2, y: this.LH / 2, s: 1, r: 0 };
        },
        _img(file) {
            return new Promise((ok, ko) => {
                const url = URL.createObjectURL(file), im = new Image();
                im.onload = () => { URL.revokeObjectURL(url); ok(im); };
                im.onerror = () => { URL.revokeObjectURL(url); ko(new Error("image")); };
                im.src = url;
            });
        },
        pickPhoto() { $("hys-photo-in").click(); },
        recenter() { const p = this.st && this.st.photo; if (!p) return; p.x = this.LW / 2; p.y = this.LH / 2; p.s = 1; p.r = 0; this._ui(); this.render(); },
        nextBackground() {
            const st = this.st; if (!st) return;
            if (st.photo) {
                const modes = ["blur", "black"].concat(this.BGS.map((_, i) => "g" + i));
                const i = modes.indexOf(st.bgPhoto === "grad" ? "g" + st.bg : st.bgPhoto);
                const n = modes[(i + 1) % modes.length];
                if (n[0] === "g") { st.bgPhoto = "grad"; st.bg = +n.slice(1); } else st.bgPhoto = n;
            } else st.bg = (st.bg + 1) % this.BGS.length;
            this.render();
        },

        /* drawing on the canvas (preview = export) */
        render() {
            if (this._raf || !this.st) return;
            this._raf = requestAnimationFrame(() => {
                this._raf = 0; if (!this.st) return;
                const ctx = $("hys-canvas").getContext("2d");
                ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
                this.draw(ctx, false);
            });
        },
        _grad(ctx, i) {
            const f = this.BGS[i] || this.BGS[0];
            const g = ctx.createLinearGradient(0, 0, this.LW, this.LH); g.addColorStop(0, f[0]); g.addColorStop(1, f[1]);
            ctx.fillStyle = g; ctx.fillRect(0, 0, this.LW, this.LH);
        },
        draw(ctx, exporting) {
            const st = this.st, LW = this.LW, LH = this.LH;
            ctx.save();
            if (st.photo) {
                const p = st.photo;
                if (st.bgPhoto === "blur") { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(p.blur, 0, 0, LW, LH); ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(0, 0, LW, LH); }
                else if (st.bgPhoto === "black") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, LW, LH); }
                else this._grad(ctx, st.bg);
                const base = Math.min(LW / p.w, LH / p.h) * p.s;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(base, base);
                ctx.imageSmoothingQuality = "high"; ctx.drawImage(p.src, -p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
            } else this._grad(ctx, st.bg);
            st.strokes.forEach(t => this._stroke(ctx, t));
            st.items.forEach((it, i) => { if (!exporting && i === this._edI) return; this._item(ctx, it, !exporting && i === st.sel && !st.draw); });
            ctx.restore();
        },
        _stroke(ctx, t) {
            const pts = t.pts; if (!pts.length) return;
            ctx.save(); ctx.strokeStyle = t.c; ctx.fillStyle = t.c; ctx.lineWidth = t.l; ctx.lineCap = "round"; ctx.lineJoin = "round";
            if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], t.l / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
            ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
            const L = pts[pts.length - 1]; ctx.lineTo(L[0], L[1]); ctx.stroke(); ctx.restore();
        },
        _fontOf(it) { return this.FONTS.find(f => f.id === it.font) || this.FONTS[0]; },
        _css(it) {
            if (it.type === "emoji") return `${it.fs}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
            if (it.type === "chip") return `700 ${it.fs}px "Lato", system-ui, sans-serif`;
            const f = this._fontOf(it);
            return f.css.replace("{s}", Math.round(it.fs * f.k));
        },
        _measure(ctx, it) {
            ctx.font = this._css(it);
            const f = this._fontOf(it);
            const lh = it.type === "emoji" ? it.fs * 1.15 : (it.type === "text" ? it.fs * f.k * f.lh : it.fs * 1.3);
            const max = it.type === "text" ? 860 : 2000;
            const lines = [];
            String(it.text || " ").split("\n").forEach(par => {
                const words = par.split(/(\s+)/); let cur = "";
                words.forEach(w => {
                    if (!w) return;
                    const tryL = cur + w;
                    if (cur && ctx.measureText(tryL.trimEnd()).width > max) { lines.push(cur.trimEnd()); cur = w.trimStart(); }
                    else cur = tryL;
                    while (ctx.measureText(cur).width > max && cur.length > 1) {
                        let n = cur.length - 1; while (n > 1 && ctx.measureText(cur.slice(0, n)).width > max) n--;
                        lines.push(cur.slice(0, n)); cur = cur.slice(n);
                    }
                });
                lines.push(cur.trimEnd());
            });
            const L = lines.map(t => ({ t, w: ctx.measureText(t).width }));
            const w = Math.max(10, ...L.map(l => l.w));
            const pad = it.type === "emoji" ? 0 : it.fs * 0.32;
            return { lines: L, lh, w, h: lh * L.length, pad };
        },
        _contrast(c) {
            const h = c.replace("#", ""); const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
            return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#111111" : "#FFFFFF";
        },
        _round(ctx, x, y, w, h, r) {
            r = Math.min(r, h / 2, w / 2);
            ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
        },
        _item(ctx, it, selected) {
            const m = this._measure(ctx, it); it._m = m;
            ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.r || 0); ctx.scale(it.sc || 1, it.sc || 1);
            ctx.font = this._css(it); ctx.textBaseline = "middle";
            try { ctx.direction = /[֐-ࣿ]/.test(it.text) ? "rtl" : "ltr"; } catch (e) {}
            const n = m.lines.length, align = it.align || "center";
            const tx = align === "left" ? -m.w / 2 : (align === "right" ? m.w / 2 : 0);
            ctx.textAlign = align;
            const yL = i => (i - (n - 1) / 2) * m.lh;
            if (it.type === "chip") {
                const l = m.lines[0], bw = l.w + m.pad * 2.4, bh = m.lh + m.pad * 0.6;
                ctx.fillStyle = "#FFFFFF"; ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 18;
                this._round(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fill(); ctx.shadowBlur = 0;
                ctx.fillStyle = "#C0396B"; ctx.textAlign = "center"; ctx.fillText(l.t, 0, 2);
            } else if (it.type === "emoji") {
                ctx.textAlign = "center"; ctx.fillText(it.text, 0, 0);
            } else {
                const c = it.color || "#FFFFFF", mode = it.bgTxt || 0;
                if (mode > 0) {
                    ctx.fillStyle = mode === 1 ? c : (this._contrast(c) === "#111111" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.82)");
                    m.lines.forEach((l, i) => {
                        if (!l.t) return;
                        const x0 = align === "left" ? -m.w / 2 - m.pad : (align === "right" ? m.w / 2 - l.w - m.pad : -l.w / 2 - m.pad);
                        this._round(ctx, x0, yL(i) - m.lh / 2 - m.pad * 0.15, l.w + m.pad * 2, m.lh + m.pad * 0.3, m.pad * 0.9); ctx.fill();
                    });
                } else { ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = it.fs * 0.18; }
                ctx.fillStyle = mode === 1 ? this._contrast(c) : c;
                m.lines.forEach((l, i) => ctx.fillText(l.t, tx, yL(i) + it.fs * 0.04));
                ctx.shadowBlur = 0;
            }
            if (selected) {
                ctx.setLineDash([14, 10]); ctx.lineWidth = 3 / (it.sc || 1); ctx.strokeStyle = "rgba(255,255,255,.85)";
                const bw = m.w + m.pad * 2 + 20, bh = m.h + m.pad + 20; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh); ctx.setLineDash([]);
            }
            ctx.restore();
        },
        _hit(x, y) {
            const st = this.st;
            for (let i = st.items.length - 1; i >= 0; i--) {
                const it = st.items[i], m = it._m; if (!m) continue;
                const dx = x - it.x, dy = y - it.y, c = Math.cos(-(it.r || 0)), s = Math.sin(-(it.r || 0)), sc = it.sc || 1;
                const lx = (dx * c - dy * s) / sc, ly = (dx * s + dy * c) / sc;
                if (Math.abs(lx) <= m.w / 2 + m.pad + 30 && Math.abs(ly) <= m.h / 2 + m.pad + 30) return i;
            }
            return -1;
        },

        /* gestures: drag, pinch to zoom / rotate, tap a text to edit it, drop on 🗑️ */
        _pt(e) { const r = $("hys-canvas").getBoundingClientRect(); return { x: (e.clientX - r.left) / this.kc, y: (e.clientY - r.top) / this.kc, cx: e.clientX, cy: e.clientY }; },
        _copy(o) { return o ? { x: o.x, y: o.y, s: o.s, sc: o.sc, r: o.r || 0 } : null; },
        _target(g) { return g.t === "photo" ? this.st.photo : this.st.items[g.t]; },
        _pd(e) {
            const st = this.st; if (!st) return;
            e.preventDefault();
            try { $("hys-canvas").setPointerCapture(e.pointerId); } catch (_) {}
            const p = this._pt(e); this._ptrs.set(e.pointerId, p);
            if (st.draw) {
                if (this._ptrs.size === 1) { this._cur = { c: st.strokeColor, l: st.strokeW, pts: [[p.x, p.y]] }; st.strokes.push(this._cur); this.render(); }
                return;
            }
            if (this._ptrs.size === 1) {
                let i = this._hit(p.x, p.y);
                if (i >= 0) { const it = st.items.splice(i, 1)[0]; st.items.push(it); i = st.items.length - 1; }
                st.sel = i;
                const t = i >= 0 ? i : (st.photo ? "photo" : null);
                this._g = { t, t0: Date.now(), p0: p, moved: false, base: t === null ? null : this._copy(t === "photo" ? st.photo : st.items[t]) };
                this.render();
            } else if (this._ptrs.size === 2 && this._g && this._g.t !== null) {
                const [a, b] = [...this._ptrs.values()];
                this._g.pinch = { d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, base: this._copy(this._target(this._g)) };
                this._g.moved = true;
            }
        },
        _pm(e) {
            const st = this.st; if (!st || !this._ptrs.has(e.pointerId)) return;
            const p = this._pt(e); this._ptrs.set(e.pointerId, p);
            if (st.draw) { if (this._cur) { this._cur.pts.push([p.x, p.y]); this.render(); } return; }
            const g = this._g; if (!g || g.t === null) return;
            const o = this._target(g); if (!o) return;
            if (this._ptrs.size >= 2 && g.pinch) {
                const [a, b] = [...this._ptrs.values()];
                const f = Math.hypot(b.x - a.x, b.y - a.y) / g.pinch.d0, da = Math.atan2(b.y - a.y, b.x - a.x) - g.pinch.a0;
                const mx = (a.x + b.x) / 2 - g.pinch.m0.x, my = (a.y + b.y) / 2 - g.pinch.m0.y, B = g.pinch.base;
                if (g.t === "photo") o.s = Math.max(0.3, Math.min(6, B.s * f)); else o.sc = Math.max(0.25, Math.min(6, B.sc * f));
                o.r = B.r + da; o.x = B.x + mx; o.y = B.y + my;
                if (g.t === "photo") $("hys-zoom").value = Math.round(o.s * 100);
            } else if (this._ptrs.size === 1 && !g.pinch) {
                const dx = p.x - g.p0.x, dy = p.y - g.p0.y;
                if (!g.moved && Math.hypot(dx, dy) * this.kc > 6) g.moved = true;
                if (g.moved) { o.x = g.base.x + dx; o.y = g.base.y + dy; }
                if (g.moved && g.t !== "photo") this._trash(true, this._onTrash(p));
            }
            this.render();
        },
        _pu(e, cancel) {
            const st = this.st; if (!st) return;
            const p = this._ptrs.get(e.pointerId) || this._pt(e);
            this._ptrs.delete(e.pointerId);
            if (st.draw) { if (!this._ptrs.size) this._cur = null; return; }
            const g = this._g; if (!g) return;
            if (this._ptrs.size === 1 && g.pinch) { const rest = [...this._ptrs.values()][0]; g.pinch = null; g.p0 = rest; g.base = this._copy(this._target(g)); return; }
            if (this._ptrs.size) return;
            if (g.t !== null && g.t !== "photo") {
                const it = st.items[g.t];
                if (!cancel && g.moved && !g.pinch && this._onTrash(p)) { st.items.splice(g.t, 1); st.sel = -1; }
                else if (!cancel && !g.moved && Date.now() - g.t0 < 400 && it && it.type === "text") this.editText(g.t);
            }
            this._trash(false); this._g = null; this._ui(); this.render();
        },
        _onTrash(p) { const r = $("hys-trash").getBoundingClientRect(); return Math.hypot(p.cx - (r.left + r.width / 2), p.cy - (r.top + r.height / 2)) < 60; },
        _trash(show, hot) { const t = $("hys-trash"); t.classList.toggle("show", !!show); t.classList.toggle("hot", !!hot); },

        /* text */
        addText() {
            const st = this.st; if (!st) return;
            st.items.push({ type: "text", text: "", x: this.LW / 2, y: this.LH * 0.42, sc: 1, r: 0, fs: 84, font: "bold", color: "#FFFFFF", bgTxt: 0, align: "center" });
            this.editText(st.items.length - 1);
        },
        editText(i) {
            const st = this.st, it = st.items[i]; if (!it) return;
            this._edI = i; st.sel = -1;
            $("hys-editor").classList.add("is-text");
            $("hys-textedit").classList.add("open");
            $("hys-cols").innerHTML = this.COLORS.map(c => `<button type="button" class="se-col" style="background:${c}" onclick="HysEd.color('${c}')"></button>`).join("");
            const ta = $("hys-ta"); ta.value = it.text;
            $("hys-size").value = it.fs;
            this._styleTa(); this.render();
            setTimeout(() => { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 60);
        },
        _styleTa() {
            const it = this.st && this.st.items[this._edI]; if (!it) return;
            const ta = $("hys-ta"), F = this._fontOf(it), c = it.color, mode = it.bgTxt || 0;
            const px = Math.max(16, Math.round(it.fs * F.k * this.kc * (it.sc || 1)));
            ta.style.font = F.css.replace("{s}", px); ta.style.lineHeight = F.lh;
            ta.style.textAlign = it.align || "center";
            ta.style.color = mode === 1 ? this._contrast(c) : c;
            ta.style.background = mode === 1 ? c : (mode === 2 ? (this._contrast(c) === "#111111" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.82)") : "transparent");
            ta.style.textShadow = mode === 0 ? "0 2px 10px rgba(0,0,0,.35)" : "none";
            document.querySelectorAll("#hys-fonts button").forEach(b => b.classList.toggle("on", b.dataset.p === it.font));
            [...$("hys-cols").children].forEach((b, i) => b.classList.toggle("on", this.COLORS[i] === c));
            $("hys-bgtxt").dataset.m = mode;
            ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 4, window.innerHeight * 0.45) + "px";
        },
        font(id) { const it = this.st && this.st.items[this._edI]; if (it) { it.font = id; this._styleTa(); } },
        color(c) { const it = this.st && this.st.items[this._edI]; if (it) { it.color = c; this._styleTa(); } },
        textBg() { const it = this.st && this.st.items[this._edI]; if (it) { it.bgTxt = ((it.bgTxt || 0) + 1) % 3; this._styleTa(); } },
        align() { const it = this.st && this.st.items[this._edI]; if (it) { const o = ["center", "left", "right"]; it.align = o[(o.indexOf(it.align || "center") + 1) % 3]; this._styleTa(); } },
        finishText() {
            const st = this.st; if (!st || this._edI < 0) return;
            const it = st.items[this._edI];
            if (it) { it.text = $("hys-ta").value.replace(/\s+$/, ""); if (!it.text.trim()) st.items.splice(this._edI, 1); }
            this._edI = -1; $("hys-textedit").classList.remove("open"); $("hys-editor").classList.remove("is-text");
            try { $("hys-ta").blur(); } catch (e) {}
            setTimeout(() => { if (this.st) { this._size(); this.render(); } }, 250);
            this.render();
        },

        /* stickers + little labels about us */
        openStickers() {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const together = Math.floor((today - START) / DAY);
            const toWed = Math.ceil((WEDDING - Date.now()) / DAY);
            const chips = ["💑 Hamdi & Yossr", "🗓️ " + today.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })];
            if (together > 0) chips.push(`💕 ${together} days together`);
            if (toWed > 0) chips.push(`💍 ${toWed} days to our wedding`);
            chips.push("❤️ I love you", "🥺 I miss you", "☀️ Good morning", "🌙 Good night");
            $("hys-st-grid").innerHTML = this.STICKERS.map(e => `<button type="button" class="se-emo" onclick="HysEd.addSticker('${e}')">${e}</button>`).join("");
            $("hys-chips").innerHTML = chips.map(t => `<button type="button" class="se-chip" onclick="HysEd.addChip(this.textContent)">${esc(t)}</button>`).join("");
            $("hys-stickers").classList.add("open");
        },
        closePanel(id) { $(id).classList.remove("open"); if (id === "hys-music") this._stopPlay(); },
        _place(it) { const st = this.st; st.items.push(it); st.sel = st.items.length - 1; this._ui(); this.render(); },
        addSticker(e) { this.closePanel("hys-stickers"); this._place({ type: "emoji", text: e, x: this.LW / 2, y: this.LH * 0.5, sc: 1, r: 0, fs: 220 }); },
        addChip(t) { this.closePanel("hys-stickers"); this._place({ type: "chip", text: String(t).trim(), x: this.LW / 2, y: this.LH * 0.62, sc: 1, r: 0, fs: 54 }); },

        /* drawing */
        drawMode(on) { const st = this.st; if (!st) return; st.draw = on === undefined ? !st.draw : !!on; st.sel = -1; this._ui(); this.render(); },
        strokeColor(c) { if (this.st) { this.st.strokeColor = c; this._ui(); } },
        width(l) { if (this.st) { this.st.strokeW = l; this._ui(); } },
        undoStroke() { if (this.st && this.st.strokes.length) { this.st.strokes.pop(); this.render(); } },

        /* music: a song from the phone, slide the track under the frame
           (start / end), 5–20 s, saved as a light MP3 */
        DURS: [5, 10, 15, 20],
        pickMusic() { this._unlockAudio(); $("hys-audio-in").click(); },
        _unlockAudio() { try { const AC = window.AudioContext || window.webkitAudioContext; this._ac = this._ac || new AC(); if (this._ac.state === "suspended") this._ac.resume(); } catch (e) {} },
        tuneMusic() {
            const m = this.st && this.st.music;
            if (!(m && m.aud)) return this.pickMusic();
            this._unlockAudio();
            this._aud = m.aud; this._aud.start = m.from; this._aud.dur = m.dur / 1000; this._aud.title = m.title;
            $("hys-music").classList.add("open");
            this._musicUi(); this.play(true);
        },
        removeMusic() { const st = this.st; if (!st || !st.music) return; st.music = null; this._ui(); this.render(); toast("Music removed"); },
        async _audioFile(file) {
            this._stopPlay();
            const body = $("hys-mu-body");
            $("hys-music").classList.add("open");
            body.innerHTML = `<div class="se-mu-info">Loading the song…</div>`;
            let buf;
            try {
                const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                buf = await new OAC(1, 44100, 44100).decodeAudioData(await file.arrayBuffer());
            } catch (e) { body.innerHTML = `<div class="se-mu-info">This audio file can't be read.</div>`; return; }
            const title = String(file.name || "Music").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 40);
            this._aud = { buf, title, start: 0, dur: 15, peaks: this._peaks(buf) };
            const o = this._durs(); if (!o.includes(15)) this._aud.dur = o[o.length - 1];
            this._musicUi(); this.play(true);
        },
        _peaks(buf) {
            const n = Math.max(1, Math.ceil(buf.duration * 20)), pk = new Float32Array(n), stp = buf.sampleRate / 20;
            for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
                const d = buf.getChannelData(c);
                for (let b = 0; b < n; b++) {
                    const i0 = Math.floor(b * stp), i1 = Math.min(d.length, Math.floor((b + 1) * stp)); let m = 0;
                    for (let i = i0; i < i1; i += 3) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; }
                    if (m > pk[b]) pk[b] = m;
                }
            }
            let mx = 0; for (let b = 0; b < n; b++) if (pk[b] > mx) mx = pk[b];
            if (mx > 0) for (let b = 0; b < n; b++) pk[b] = Math.pow(pk[b] / mx, 0.75);
            return pk;
        },
        _durs() { const m = Math.floor(this._aud.buf.duration), o = this.DURS.filter(d => d <= m); return o.length ? o : [Math.max(1, m)]; },
        _fmt(x) { x = Math.max(0, x); return Math.floor(x / 60) + ":" + String(Math.floor(x % 60)).padStart(2, "0"); },
        _musicUi() {
            const a = this._aud; if (!a) return;
            if (!this._durs().includes(a.dur)) a.dur = this._durs().slice(-1)[0];
            a.start = Math.max(0, Math.min(a.start, a.buf.duration - a.dur));
            const tuning = !!(this.st && this.st.music && this.st.music.aud === a);
            $("hys-mu-body").innerHTML = `
              <label class="se-mu-l">Title shown on the story</label>
              <input class="se-mu-in" id="hys-mu-title" maxlength="40" value="${esc(a.title)}" dir="auto">
              <div class="se-mu-temps"><span>Start<b id="hys-mu-t1"></b></span><span class="se-mu-tot" id="hys-mu-tot"></span><span>End<b id="hys-mu-t2"></b></span></div>
              <div class="se-mu-wave" id="hys-mu-wave"><canvas id="hys-mu-cv"></canvas></div>
              <div class="se-mu-hint">Slide the track to choose the part you want. The circle changes the length.</div>
              <div class="se-mu-ctrl">
                <button type="button" class="se-mu-dur" id="hys-mu-dur" onclick="HysEd.nextDur()" aria-label="Length"><b>${a.dur}</b><small>s</small></button>
                <button type="button" class="se-mu-chg" onclick="HysEd.pickMusic()">Another song</button>
                <button type="button" class="se-mu-pp" id="hys-mu-play" onclick="HysEd.play()" aria-label="Play">▶</button>
              </div>
              <div class="se-mu-actions"><button type="button" class="se-mu-b" id="hys-mu-ok" onclick="HysEd.saveMusic()">${tuning ? "Done" : "Add the music"}</button></div>`;
            this._waveBind(); this._times();
            requestAnimationFrame(() => this._wave(0));
        },
        _times() {
            const a = this._aud; if (!a) return;
            const t1 = $("hys-mu-t1"), t2 = $("hys-mu-t2"), tt = $("hys-mu-tot");
            if (t1) t1.textContent = " " + this._fmt(a.start);
            if (t2) t2.textContent = " " + this._fmt(a.start + a.dur);
            if (tt) tt.textContent = a.dur + " s · " + this._fmt(a.buf.duration);
        },
        nextDur() {
            const a = this._aud; if (!a) return;
            const o = this._durs(), i = o.indexOf(a.dur);
            a.dur = o[(i + 1) % o.length];
            a.start = Math.max(0, Math.min(a.start, a.buf.duration - a.dur));
            const b = $("hys-mu-dur"); if (b && b.firstChild) b.firstChild.textContent = a.dur;
            this._times();
            if (this._src) this.play(true); else this._wave(0);
        },
        _waveBind() {
            const w = $("hys-mu-wave"); if (!w) return;
            let g = null;
            w.addEventListener("pointerdown", e => { const a = this._aud; if (!a) return; g = { x: e.clientX, d: a.start, id: e.pointerId, moved: false }; try { w.setPointerCapture(e.pointerId); } catch (_) {} w.classList.add("drag"); });
            w.addEventListener("pointermove", e => {
                if (!g || e.pointerId !== g.id) return;
                const a = this._aud, dx = e.clientX - g.x;
                if (!g.moved && Math.abs(dx) < 4) return;
                if (!g.moved) { g.moved = true; this._stopPlay(); }
                a.start = Math.max(0, Math.min(a.buf.duration - a.dur, g.d - dx / (this._pps || 10)));
                this._times(); this._wave(0);
            });
            const end = () => { if (!g) return; g = null; w.classList.remove("drag"); this.play(true); };
            w.addEventListener("pointerup", end); w.addEventListener("pointercancel", end);
        },
        _wave(p) {
            const a = this._aud, cv = $("hys-mu-cv"); if (!a || !cv) return;
            const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
            const dpr = Math.min(2.5, window.devicePixelRatio || 1);
            if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
            const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
            const winW = Math.round(Math.min(cw * 0.62, 320)), x0 = (cw - winW) / 2, pps = winW / a.dur; this._pps = pps;
            const pk = a.peaks, stp = 5, bw = 3, dt = stp / pps, H = ch - 20, cy = ch / 2;
            if (p > 0) {
                ctx.save(); this._round(ctx, x0, 3, winW, ch - 6, 11); ctx.clip();
                const gr = ctx.createLinearGradient(x0, 0, x0 + winW, 0); gr.addColorStop(0, "#ffb3cc"); gr.addColorStop(1, "#e0457b");
                ctx.fillStyle = gr; ctx.fillRect(x0, 0, winW * p, ch); ctx.restore();
            }
            const k0 = Math.max(0, Math.floor((a.start - x0 / pps) / dt)), k1 = Math.ceil((a.start + (cw - x0) / pps) / dt);
            for (let k = k0; k <= k1; k++) {
                const t = k * dt; if (t >= a.buf.duration) break;
                const x = x0 + (t - a.start) * pps; if (x < -bw || x > cw) continue;
                const b0 = Math.floor(t * 20), b1 = Math.max(b0 + 1, Math.ceil((t + dt) * 20)); let m = 0;
                for (let b = b0; b < b1 && b < pk.length; b++) if (pk[b] > m) m = pk[b];
                const h = Math.max(4, m * H);
                ctx.fillStyle = (x + bw > x0 && x < x0 + winW) ? "#FFFFFF" : "rgba(255,255,255,.3)";
                this._round(ctx, x, cy - h / 2, bw, h, 1.5); ctx.fill();
            }
            ctx.lineWidth = 3; ctx.strokeStyle = "#FFFFFF"; this._round(ctx, x0, 3, winW, ch - 6, 11); ctx.stroke();
        },
        play(restart) {
            const a = this._aud; if (!a) return;
            if (this._src && !restart) { this._stopPlay(); return; }
            this._stopPlay();
            try {
                this._unlockAudio();
                const ac = this._ac, src = ac.createBufferSource(); src.buffer = a.buf; src.connect(ac.destination);
                src.loop = true; src.loopStart = a.start; src.loopEnd = Math.min(a.buf.duration, a.start + a.dur);
                src.start(0, a.start); this._src = src; this._t0 = ac.currentTime;
                const b = $("hys-mu-play"); if (b) { b.textContent = "■"; b.setAttribute("aria-label", "Stop"); }
                const anim = () => { if (this._src !== src) return; this._wave(((ac.currentTime - this._t0) % a.dur) / a.dur); this._rafW = requestAnimationFrame(anim); };
                anim();
            } catch (e) {}
        },
        _stopPlay() {
            if (this._src) { try { this._src.stop(); } catch (e) {} this._src = null; }
            if (this._rafW) { cancelAnimationFrame(this._rafW); this._rafW = 0; }
            const b = $("hys-mu-play"); if (b) { b.textContent = "▶"; b.setAttribute("aria-label", "Play"); }
            this._wave(0);
        },
        _lame() {
            if (window.lamejs && window.lamejs.Mp3Encoder) return Promise.resolve();
            return new Promise((ok, ko) => {
                const s = document.createElement("script"); s.src = this.MUSIC_LIB; s.async = true;
                s.onload = () => (window.lamejs && window.lamejs.Mp3Encoder) ? ok() : ko(new Error("lamejs"));
                s.onerror = () => ko(new Error("lamejs")); document.head.appendChild(s);
            });
        },
        async saveMusic() {
            const a = this._aud; if (!a || this._enc) return;
            this._stopPlay();
            a.title = (($("hys-mu-title") || {}).value || a.title || "Music").trim().slice(0, 40) || "Music";
            const ok = $("hys-mu-ok"); if (ok) { ok.disabled = true; ok.textContent = "Preparing the music…"; }
            this._enc = true;
            try {
                await this._lame();
                const data = await this._mp3(a.buf, a.start, a.dur);
                const st = this.st; if (!st) return;
                st.music = { data, title: a.title, dur: a.dur * 1000, aud: a, from: a.start };
                this.closePanel("hys-music"); this._ui(); this.render();
                toast("Music added ♪");
            } catch (e) { console.warn("music", e); toast("Music unavailable — check your internet"); }
            finally { this._enc = false; if (ok) { ok.disabled = false; ok.textContent = "Add the music"; } }
        },
        async _mp3(buf, from, dur) {
            const sr = buf.sampleRate, n0 = Math.floor(from * sr), n = Math.min(buf.length - n0, Math.floor(dur * sr));
            const ch = buf.numberOfChannels, mono = new Float32Array(n);
            for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[n0 + i] / ch; }
            const fade = Math.floor(sr * 0.6), pcm = new Int16Array(n);
            for (let i = 0; i < n; i++) {
                let v = mono[i]; if (i < fade) v *= i / fade; if (i > n - fade) v *= (n - i) / fade;
                v = Math.max(-1, Math.min(1, v)); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
            }
            const enc = new lamejs.Mp3Encoder(1, sr, 64), parts = [];
            for (let i = 0; i < n; i += 1152) { const o = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (o.length) parts.push(o); if (i % (1152 * 200) === 0) await new Promise(r => setTimeout(r, 0)); }
            const end = enc.flush(); if (end.length) parts.push(end);
            const blob = new Blob(parts, { type: "audio/mpeg" });
            return await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(blob); });
        },

        /* share / save */
        async publish() {
            const st = this.st; if (!st || this._sending) return;
            const who = me(); if (!who) return;
            if (this._edI >= 0) this.finishText();
            if (!st.photo && !st.items.length && !st.strokes.length) return toast("Add a photo or a text first");
            const btn = $("hys-pub"); btn.disabled = true; btn.textContent = st.edit ? "Saving…" : "Sharing…";
            this._sending = true;
            try {
                try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
                const cv = document.createElement("canvas"); cv.width = this.LW; cv.height = this.LH;
                const ctx = cv.getContext("2d"); st.sel = -1; this.draw(ctx, true);
                // layers kept so the story can be edited later (✏️)
                const clean = o => { const r = {}; Object.keys(o).forEach(k => { if (k[0] !== "_") r[k] = o[k]; }); return r; };
                let edStr = JSON.stringify({ v: 1, bg: st.bg, bgPhoto: st.bgPhoto, items: st.items.map(clean),
                    strokes: st.strokes.map(t => ({ c: t.c, l: t.l, pts: t.pts.map(q => [Math.round(q[0]), Math.round(q[1])]) })),
                    photo: st.photo ? { x: +st.photo.x.toFixed(1), y: +st.photo.y.toFixed(1), s: +st.photo.s.toFixed(4), r: +(st.photo.r || 0).toFixed(4) } : null });
                let src = st.photo ? this._jpeg(st.photo.src, 1280, 230000) : "";
                if (edStr.length > 90000) { edStr = ""; src = ""; }
                // one Firestore document is 1 MB at most: picture + music + layers must fit
                const LIM = 985000, aLen = st.music ? st.music.data.length + 200 : 0;
                let max = Math.min(760000, LIM - aLen - edStr.length - src.length);
                if (max < 300000) { edStr = ""; src = ""; max = Math.min(760000, LIM - aLen); }
                let q = 0.86, img = cv.toDataURL("image/jpeg", q);
                while (img.length > max && q > 0.42) { q -= 0.08; img = cv.toDataURL("image/jpeg", q); }
                const now = Date.now(), edit = st.edit;
                const id = edit ? edit.id : "st" + now.toString(36) + Math.random().toString(36).slice(2, 6);
                const data = { id, by: who, img, caption: "", createdAt: edit ? edit.createdAt : now, expiresAt: edit && edit.expiresAt ? edit.expiresAt : now + LIFE };
                if (edit) data.updatedAt = now;
                if (st.music) { data.audio = st.music.data; data.audioTitle = st.music.title; data.dur = st.music.dur; }
                if (edStr) { data.ed = edStr; if (src) data.src = src; }
                const write = setDoc(doc(db, "stories", id), data);
                const slow = await Promise.race([write.then(() => false), new Promise(r => setTimeout(() => r(true), 45000))]);
                if (!S.stories.some(s => s.id === id)) S.stories.push(data);
                else S.stories = S.stories.map(s => s.id === id ? data : s);
                this.close(true);
                decorate();
                if (slow) toast("Slow connection: the story will be sent as soon as possible");
                else toast(edit ? "Story updated ✨" : "Story shared! It disappears in 24 h ✨");
                if (!edit) HY.notify("story", `✨ ${NAME(who)} shared a new story`, other(who), "home", id, "story");
            } catch (e) {
                console.warn("story", e);
                toast("Could not share — check your internet and try again");
            } finally {
                this._sending = false;
                btn.disabled = false; btn.textContent = this.st && this.st.edit ? "Save ›" : "Share story ›";
            }
        },
        _jpeg(canvas, side, maxLen) {
            let k = Math.min(1, side / Math.max(canvas.width, canvas.height)), out = "";
            for (let t = 0; t < 4; t++) {
                const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(canvas.width * k)); c.height = Math.max(1, Math.round(canvas.height * k));
                const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(canvas, 0, 0, c.width, c.height);
                for (let q = 0.8; q >= 0.5; q -= 0.1) { out = c.toDataURL("image/jpeg", q); if (out.length <= maxLen) return out; }
                k *= 0.8;
            }
            return out.length <= maxLen ? out : "";
        }
    };
    window.HysEd = HysEd;

    /* ◁ (Android back) closes the story screens one by one */
    const reg = (id, fn) => { try { HY.navRegister(id, fn); } catch (e) {} };
    reg("hys-chooser", closeChooser);
    reg("hys-viewer", closeViewer);
    reg("hys-vues", () => closeViews(false));
    reg("hys-editor", () => HysEd.close());
    reg("hys-textedit", () => HysEd.finishText());
    reg("hys-stickers", () => HysEd.closePanel("hys-stickers"));
    reg("hys-music", () => HysEd.closePanel("hys-music"));

    decorate();
}

if (window.HY) hysStart();
else window.addEventListener("hy-ready", hysStart, { once: true });
