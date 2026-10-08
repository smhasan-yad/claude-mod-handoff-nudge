// Handoff Nudge: a one-line band offering your handoff skills when a session
// is getting full or long, so the thread survives a compaction or a new chat.
//
// It reads $.session.usage(), which costs nothing, after each turn. Each
// trigger fires once per session: context at 60%, context at 85%, and the
// session passing 3 hours. Clicking a button runs the skill; "Later" hides it.

const CONTEXT_STEPS = [60, 85];
const LONG_SESSION_MS = 3 * 60 * 60 * 1000;
const SKILLS = ["handoff-journal", "handoff-local"];

let fired = new Set(); // trigger keys already shown this session
let nudge = null; // { reason } while the band shows
let available = []; // the handoff skills that are installed

export function register(on) {
  on("session.start", async ($, e, next) => {
    const r = await next(e);
    try {
      const names = (await $.command.list()).map((c) => c.name);
      available = SKILLS.map((s) => names.find((n) => n === s || n.endsWith(`:${s}`))).filter(Boolean);
    } catch {
      available = [];
    }
    return r;
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (e.agentId || available.length === 0) {
      return r;
    }
    try {
      const usage = await $.session.usage();
      const pct = usage.context.percent ?? 0;
      for (const step of CONTEXT_STEPS) {
        if (pct >= step && !fired.has(`ctx${step}`)) {
          for (const s of CONTEXT_STEPS) if (s <= step) fired.add(`ctx${s}`);
          show($, `Context is ${pct}% full.`);
          return r;
        }
      }
      const age = (await $.clock.now()) - usage.startedAt;
      if (age >= LONG_SESSION_MS && !fired.has("long")) {
        fired.add("long");
        show($, `This session has run ${Math.floor(age / 3600000)}h.`);
      }
    } catch {
      // a failed read just skips this turn
    }
    return r;
  });

  // A compaction or /clear starts a fresh context: allow the context nudges again.
  on("session.compact", async ($, e, next) => {
    const r = await next(e);
    fired = new Set([...fired].filter((k) => k === "long"));
    return r;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const below = await next(e);
    if (e.props.hasSurvey || nudge === null) {
      return below;
    }
    const t = $.ui.resolve(e);
    const row = t.Box({
      key: "handoff-nudge",
      flexDirection: "row",
      gap: 1,
      children: [
        t.Text({ key: "why", color: "cyan", children: `📝 ${nudge.reason} Save a handoff?` }),
        ...available.map((name) => t.Button({ key: `h-${name}`, label: `/${name.split(":").pop()}`, onPress: () => run($, name) })),
        t.Button({ key: "later", label: "Later", plain: true, onPress: () => hide($) }),
      ],
    });
    return below ? t.Box({ flexDirection: "column", rowGap: e.surface === "terminal" ? 0 : 1, children: [below, row] }) : row;
  });
}

function show($, reason) {
  nudge = { reason };
  $.ui.invalidate("ui.render");
}

function hide($) {
  nudge = null;
  $.ui.invalidate("ui.render");
}

// Puts the skill into the message box for you to send, as a typed command would be.
async function run($, name) {
  hide($);
  try {
    const box = await $.prompt.read();
    const typed = String(box?.text ?? "").replace(/^\/\S+\s*/, "").trim();
    await $.prompt.fill({ text: `/${name} ${typed}`.trimEnd() + " " });
  } catch {
    $.ui.toast(`Type /${name} in the message box to use it.`);
  }
}
