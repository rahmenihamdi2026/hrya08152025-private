/* ===== Automatic reminders, even when the app is closed (v29, v34: On this day) =====
   Called by Vercel every morning (vercel.json → around 8:00 Tunis time),
   and — optionally — every few minutes by a free external scheduler
   (cron-job.org) so letters are announced at their exact unlock time.
   Safe to call as often as you want: each reminder is sent only once.

   Every call:   📬 letters whose unlock time has arrived → the recipient
                 🗑️ stories older than 24 h are deleted (v36)
   Once a day:   💕 monthiversary / anniversary (the 15th)
                 🗓️ special dates tomorrow / today
                 ✨ "On this day": a memory (or photos) from this same day
                    1, 2, 3… months / years ago → tap opens it on Home
                 👰🤵 wedding countdown milestones
                 ✅ late tasks and tasks due today
                 💌 letters that open later today
   Optional Vercel variable CRON_SECRET: if set, calls must carry it
   (Vercel's own cron sends it automatically; for cron-job.org add ?key=…). */
const { db, cors, notify } = require("../lib/push");

const START = "2025-08-15";          // together since
const WEDDING = "2027-09-03";        // v37: Friday 3 Sep 2027 — keep in sync with index.html (wedTarget) and stories.js
const WEDDING_MILESTONES = [365, 300, 200, 150, 100, 60, 30, 21, 14, 7, 3, 2, 1];
const BOTH = ["hamdi", "yossr"];
const TUNIS_OFFSET_MIN = 60;         // Tunisia: UTC+1 all year

// "now" in Tunis — read with getUTC*()
const tunisNow = () => new Date(Date.now() + TUNIS_OFFSET_MIN * 60000);
const ymd = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
// letters store a local Tunis time "YYYY-MM-DDTHH:MM" (old ones: a date only)
function letterUnlockMs(l) {
  const v = String(l.unlockDate || "");
  const iso = v.length <= 10 ? v + "T" + (l.unlockTime || "00:00:00").slice(0, 8) : v;
  const ms = Date.parse(iso + (iso.length === 16 ? ":00" : "") + "+01:00");
  return isNaN(ms) ? Infinity : ms;
}
function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

async function lettersReady(summary) {
  const q = await db.collection("futureletters").where("unlockNotified", "==", false).get();
  const now = Date.now();
  for (const d of q.docs) {
    const l = d.data();
    if (l.unlocked || now < letterUnlockMs(l) || (l.to !== "hamdi" && l.to !== "yossr")) continue;
    // only one sender wins (the app may announce it at the same moment)
    const won = await db.runTransaction(async t => {
      const fresh = await t.get(d.ref);
      if (!fresh.exists || fresh.data().unlockNotified) return false;
      t.update(d.ref, { unlockNotified: true });
      return true;
    });
    if (!won) continue;
    await notify(l.to, "letters", `📬 Your letter "${l.title || "💌"}" is ready to open! 💌`, "letters", d.id);
    summary.letters.push(d.id);
  }
}

// same rule as the app's "On this day" card (index.html → otdPast / loadOnThisDay)
function otdLabel(m) {
  if (m % 12 === 0) return m === 12 ? "1 year ago" : (m / 12) + " years ago";
  return m === 1 ? "1 month ago" : m + " months ago";
}
async function onThisDay(now) {
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), day = now.getUTCDate();
  const past = [];
  for (let m = 1; m <= 29; m++) {                       // Firestore "in" takes up to 30 values
    const d = new Date(Date.UTC(y, mo - m, day));
    if (d.getUTCDate() !== day) continue;               // e.g. the 31st in a 30-day month
    past.push({ months: m, key: ymd(d), startMs: d.getTime() - TUNIS_OFFSET_MIN * 60000 });   // Tunis midnight
  }
  if (!past.length) return null;
  const found = {};
  const slot = k => (found[k] = found[k] || { memories: [], photos: 0 });
  // only the small fields — never download the photos themselves
  const ms = await db.collection("memories").where("date", "in", past.map(p => p.key)).select("date", "label", "text").get();
  ms.forEach(d => { const m = d.data(); slot(m.date).memories.push(m); });
  await Promise.all(past.map(async p => {
    const g = await db.collection("gallery")
      .where("addedAt", ">=", new Date(p.startMs).toISOString())
      .where("addedAt", "<", new Date(p.startMs + 86400000).toISOString())
      .select("addedAt").get();
    if (g.size) slot(p.key).photos += g.size;
  }));
  const rows = past.filter(p => found[p.key]).map(p => ({ ...p, ...found[p.key] }));
  if (!rows.length) return null;
  // the oldest memory first (more nostalgic), else the oldest photos
  const main = rows.filter(r => r.memories.length).sort((a, b) => b.months - a.months)[0] || rows.sort((a, b) => b.months - a.months)[0];
  const total = rows.reduce((n, r) => n + r.memories.length + (r.photos ? 1 : 0), 0);
  const more = total > 1 ? ` (+${total - 1} more)` : "";
  if (main.memories.length) {
    const m = main.memories[0];
    let title = String(m.label || m.text || "a memory").replace(/\s+/g, " ").trim();
    if (title.length > 40) title = title.slice(0, 40) + "…";
    return `✨ On this day, ${otdLabel(main.months)}: "${title}"${more} — tap to relive it 💕`;
  }
  return `✨ On this day, ${otdLabel(main.months)}: ${main.photos} photo${main.photos > 1 ? "s" : ""} 📸${more} — tap to see them 💕`;
}

async function daily(summary) {
  const now = tunisNow();
  const today = ymd(now), tomorrow = ymd(addDays(now, 1));
  if (now.getUTCHours() < 7) return;                     // not before 7:00 in the morning
  const flagRef = db.doc("settings/reminders");
  const go = await db.runTransaction(async t => {
    const f = await t.get(flagRef);
    if (f.exists && f.data().lastDaily === today) return false;
    t.set(flagRef, { lastDaily: today, lastDailyAt: new Date().toISOString() }, { merge: true });
    return true;
  });
  if (!go) { summary.daily = "already sent today"; return; }
  const sent = [];
  const both = async (type, msg, page, itemId) => { for (const u of BOTH) await notify(u, type, msg, page, itemId); sent.push(msg); };

  // 💕 the 15th
  if (now.getUTCDate() === 15) {
    const [sy, sm] = START.split("-").map(Number);
    const months = (now.getUTCFullYear() - sy) * 12 + (now.getUTCMonth() + 1 - sm);
    if (months > 0) {
      if (months % 12 === 0) await both("love", `🎉 Happy anniversary! ${months / 12} year${months > 12 ? "s" : ""} together today 💕`, "home");
      else await both("love", `💕 Happy monthiversary — ${months} months together today!`, "home");
    }
  }

  // 🗓️ special dates
  const sd = await db.doc("settings/specialdates").get();
  const events = sd.exists && Array.isArray(sd.data().events) ? sd.data().events : [];
  for (const e of events) {
    if (!e || !e.date) continue;
    if (e.date === tomorrow) await both("special", `🗓️ Tomorrow: ${e.emoji || "🗓️"} ${e.name}`, "special", e.id);
    if (e.date === today) await both("special", `🎉 Today: ${e.emoji || "🗓️"} ${e.name} 💕`, "special", e.id);
  }

  // ✨ On this day (a memory from this same day, months / years ago)
  try {
    const otd = await onThisDay(now);
    if (otd) await both("otd", otd, "home", "otd");
  } catch (e) { console.log("on this day:", e && e.message); }

  // 👰🤵 wedding
  const left = daysBetween(today, WEDDING);
  if (left === 0) await both("love", "💍 Today is our wedding day! Mabrouk 👰🤵💕", "home");
  else if (WEDDING_MILESTONES.includes(left)) await both("love", `👰🤵 ${left} day${left > 1 ? "s" : ""} until our wedding! 💍`, "home");

  // ✅ checklist
  const tasks = await db.collection("checklist").get();
  const late = [], due = [];
  tasks.forEach(d => {
    const t = d.data();
    if ((t.status || "todo") === "done" || !t.dueDate) return;
    if (t.dueDate < today) late.push({ id: d.id, text: t.text });
    else if (t.dueDate === today) due.push({ id: d.id, text: t.text });
  });
  if (late.length || due.length) {
    const first = (late[0] || due[0]);
    const parts = [];
    if (late.length) parts.push(`⚠️ ${late.length} late task${late.length > 1 ? "s" : ""}`);
    if (due.length) parts.push(`🔔 ${due.length} due today`);
    await both("checklist", `${parts.join(" · ")} — "${String(first.text || "").slice(0, 40)}"`, "checklist", first.id);
  }

  // 💌 letters opening later today
  const letters = await db.collection("futureletters").where("unlockNotified", "==", false).get();
  const nowMs = Date.now();
  for (const d of letters.docs) {
    const l = d.data();
    const ms = letterUnlockMs(l);
    if (l.unlocked || ms <= nowMs || (l.to !== "hamdi" && l.to !== "yossr")) continue;
    if (ymd(new Date(ms + TUNIS_OFFSET_MIN * 60000)) !== today) continue;
    const hh = new Date(ms + TUNIS_OFFSET_MIN * 60000).toISOString().slice(11, 16);
    await notify(l.to, "letters", `💌 A letter opens for you today at ${hh} — don't miss it!`, "letters", d.id);
    sent.push("letter today " + d.id);
  }
  summary.daily = sent;
}

// v36: stories older than 24 h leave Firebase (with their "seen" / reactions),
// even if nobody opened the app. Runs on every call — cheap when there is nothing.
async function cleanStories(summary) {
  const now = Date.now();
  const old = await db.collection("stories").where("expiresAt", "<=", now).get();
  for (const d of old.docs) {
    await d.ref.delete();
    await db.doc(`storyActivity/${d.id}`).delete().catch(() => {});
  }
  const oldAct = await db.collection("storyActivity").where("exp", "<=", now).get();
  for (const d of oldAct.docs) await d.ref.delete();
  summary.stories = old.size;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || (req.query && req.query.key) || "";
    if (given !== secret) return res.status(401).json({ error: "bad key" });
  }
  const summary = { letters: [], daily: null, stories: 0 };
  try {
    try { await cleanStories(summary); } catch (e) { console.log("stories clean-up:", e && e.message); }
    await lettersReady(summary);
    await daily(summary);
    return res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e), ...summary });
  }
};
