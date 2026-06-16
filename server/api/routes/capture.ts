// capture.ts — a one-shot "drop it in the Inbox" intake endpoint.
//
// The whole point is to make filing a thought trivial from anywhere: a browser
// bookmarklet, a macOS Shortcut (which Spotlight can launch by name), the
// address bar, a phone share sheet — all of them just need to hit a single URL.
// The server resolves the Inbox lane by name so callers never deal with lane
// IDs or CORS preflights.
//
//   GET  /api/capture                              → the capture hub (form + bookmarklet)
//   GET  /api/capture?edit=1&title=…&url=…&body=…   → a pre-filled form to review before filing
//   GET  /api/capture?title=…&url=…&body=…&tag=…    → create a card, return an auto-closing page
//   POST /api/capture  {title,url,body,tags,lane}   → create a card, return JSON
//
// GET-that-mutates is deliberate: it's what makes the endpoint reachable from
// Shortcuts and the address bar without any client code. The bookmarklet uses
// edit=1 so the page you're on can be tweaked (or its URL removed) before it
// actually lands — the form there submits a plain create GET.
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { lanes, nodeTags, nodes, tags } from "../../db/schema";
import { nodeSortKeyForInsert } from "../repo";

export const captureRouter = new Hono();

const DEFAULT_LANE = process.env.CAPTURE_LANE ?? "Inbox";

type CaptureInput = {
  title?: string;
  url?: string;
  body?: string;
  tags?: string[];
  lane?: string;
};

async function resolveLaneId(name: string): Promise<string | null> {
  const all = await db.select().from(lanes);
  const want = name.toLowerCase();
  return all.find((l) => l.name.toLowerCase() === want)?.id ?? all[0]?.id ?? null;
}

async function attachTagByName(nodeId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const existing = await db.select().from(tags).where(eq(tags.name, clean)).limit(1);
  let tagId = existing[0]?.id;
  if (!tagId) {
    const [created] = await db.insert(tags).values({ name: clean }).returning();
    tagId = created!.id;
  }
  await db.insert(nodeTags).values({ nodeId, tagId }).onConflictDoNothing();
}

// Build the card body from the captured pieces. A page URL goes on its own line
// (so the board's link detection picks it up), then any free-text body, then a
// filed-at stamp so you can tell at a glance when something landed.
function buildBody(input: CaptureInput): string {
  const lines: string[] = [];
  if (input.url) lines.push(`🔗 ${input.url}`);
  if (input.body) lines.push(input.body);
  lines.push(`Filed: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  return lines.join("\n\n");
}

async function createCard(input: CaptureInput) {
  const title = (input.title ?? input.url ?? "").trim() || "(untitled)";
  const laneId = await resolveLaneId(input.lane ?? DEFAULT_LANE);
  const sortKey = await nodeSortKeyForInsert(null, laneId, null);
  const [row] = await db
    .insert(nodes)
    .values({ parentId: null, laneId, sortKey, title, bodyMd: buildBody(input), status: "open" })
    .returning();
  for (const t of input.tags ?? []) await attachTagByName(row!.id, t);
  const laneName = (await db.select().from(lanes).where(eq(lanes.id, laneId!)).limit(1))[0]?.name ?? "?";
  return { id: row!.id, title: row!.title, laneName };
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Tiny confirmation page. When opened by the bookmarklet in a popup it closes
// itself after a beat; opened in a normal tab it just shows the result.
function confirmPage(card: { id: string; title: string; laneName: string }): string {
  return `<!doctype html><meta charset="utf-8"><title>captured</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;height:100vh;background:#0b0f17;color:#e5e7eb}
.box{text-align:center;padding:2rem}.t{font-size:1.1rem;margin:.4rem 0;color:#fff}.l{color:#9ca3af;font-size:.85rem}.c{font-size:2.4rem}</style>
<div class="box"><div class="c">✓</div><div class="t">${esc(card.title)}</div>
<div class="l">→ ${esc(card.laneName)}</div></div>
<script>setTimeout(function(){try{window.close()}catch(e){}},900)</script>`;
}

// The capture hub: a no-arg landing page with a quick-add form, a draggable
// bookmarklet wired to this exact host, and copy-paste snippets for CLI/Shortcuts.
function hubPage(origin: string): string {
  const bookmarklet =
    `javascript:(function(){var t=encodeURIComponent(document.title||''),` +
    `u=encodeURIComponent(location.href),` +
    `s=encodeURIComponent((window.getSelection&&window.getSelection().toString())||'');` +
    `window.open('${origin}/api/capture?edit=1&title='+t+'&url='+u+'&body='+s,` +
    `'kbcapture','width=480,height=720');})();`;
  return `<!doctype html><meta charset="utf-8"><title>Capture · outline-kanban</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:dark}body{font:15px/1.6 system-ui,sans-serif;margin:0;background:#0b0f17;color:#e5e7eb}
.wrap{max-width:640px;margin:0 auto;padding:2rem 1.25rem 4rem}
h1{font-size:1.4rem;margin:0 0 .25rem}.sub{color:#9ca3af;margin:0 0 2rem}
h2{font-size:1rem;margin:2rem 0 .6rem;color:#fff}
form{display:grid;gap:.6rem}input,textarea{width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid #374151;border-radius:8px;background:#111827;color:#e5e7eb;font:inherit}
textarea{min-height:4.5rem;resize:vertical}button{justify-self:start;padding:.6rem 1.1rem;border:0;border-radius:8px;background:#3b82f6;color:#fff;font:inherit;cursor:pointer}
.bm{display:inline-block;padding:.55rem 1rem;border:1px dashed #6b7280;border-radius:8px;color:#fff;text-decoration:none;background:#1f2937}
code,pre{background:#111827;border:1px solid #374151;border-radius:6px}code{padding:.1rem .4rem}
pre{padding:.7rem .8rem;overflow:auto}.hint{color:#9ca3af;font-size:.85rem}
</style>
<div class="wrap">
<h1>Capture</h1>
<p class="sub">Drop anything into <b>${esc(DEFAULT_LANE)}</b> and get back to what you were doing.</p>

<h2>Quick add</h2>
<form action="/api/capture" method="get">
  <input name="title" placeholder="What's on your mind?" autofocus required>
  <input name="url" placeholder="Link (optional)">
  <textarea name="body" placeholder="Notes (optional)"></textarea>
  <input name="tag" placeholder="Tag (optional), e.g. review">
  <button type="submit">Add to ${esc(DEFAULT_LANE)}</button>
</form>

<h2>Bookmarklet</h2>
<p class="hint">Drag this to your bookmarks bar. Click it on any page to grab that page's title, URL and any selected text — then review and tweak (or drop the URL) before filing.</p>
<p><a class="bm" href="${esc(bookmarklet)}">📥 Capture → ${esc(DEFAULT_LANE)}</a></p>

<h2>CLI</h2>
<pre><code>OUTLINE_KANBAN_URL=${esc(origin)} bun run capture add "Look into flaky test" --tag chore</code></pre>

<h2>macOS Shortcut (Spotlight)</h2>
<p class="hint">Shortcuts.app → new shortcut → "Get Contents of URL" action set to:</p>
<pre><code>${esc(origin)}/api/capture?title=[Ask each time]</code></pre>
<p class="hint">Name it e.g. "Inbox" — then ⌘Space → type "Inbox" → Enter to file from anywhere.</p>
</div>`;
}

// The bookmarklet's review screen: a compact, pre-filled form so you can edit
// the title/notes and, crucially, tweak or clear the captured URL before it
// lands. Submitting it is a plain create GET (no edit flag), which then shows
// the auto-closing confirmation in the popup.
function editPage(input: CaptureInput): string {
  return `<!doctype html><meta charset="utf-8"><title>Capture · review</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:dark}body{font:15px/1.6 system-ui,sans-serif;margin:0;background:#0b0f17;color:#e5e7eb}
.wrap{max-width:560px;margin:0 auto;padding:1.5rem 1.25rem}
h1{font-size:1.15rem;margin:0 0 .25rem}.sub{color:#9ca3af;margin:0 0 1.25rem;font-size:.85rem}
form{display:grid;gap:.6rem}label{font-size:.78rem;color:#9ca3af}
input,textarea{width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid #374151;border-radius:8px;background:#111827;color:#e5e7eb;font:inherit}
textarea{min-height:5rem;resize:vertical}
.row{display:flex;gap:.5rem}.row input{flex:1}
button{padding:.6rem 1.1rem;border:0;border-radius:8px;background:#3b82f6;color:#fff;font:inherit;cursor:pointer}
.ghost{background:#1f2937;color:#e5e7eb;border:1px solid #374151}
.actions{display:flex;gap:.6rem;align-items:center;margin-top:.3rem}
.hint{color:#9ca3af;font-size:.8rem}
</style>
<div class="wrap">
<h1>Review &amp; capture</h1>
<p class="sub">Edit anything before it lands in <b>${esc(DEFAULT_LANE)}</b>. Clear the link if you don't want it.</p>
<form action="/api/capture" method="get">
  <label>Title</label>
  <input name="title" value="${esc(input.title ?? "")}" placeholder="What's on your mind?" autofocus required>
  <label>Link</label>
  <div class="row">
    <input id="url" name="url" value="${esc(input.url ?? "")}" placeholder="Link (optional)">
    <button type="button" class="ghost" onclick="document.getElementById('url').value=''">clear</button>
  </div>
  <label>Notes</label>
  <textarea name="body" placeholder="Notes (optional)">${esc(input.body ?? "")}</textarea>
  <label>Tag</label>
  <input name="tag" placeholder="Tag (optional), e.g. review">
  <div class="actions">
    <button type="submit">Add to ${esc(DEFAULT_LANE)}</button>
    <span class="hint">Esc to cancel</span>
  </div>
</form>
</div>
<script>addEventListener('keydown',function(e){if(e.key==='Escape'){try{window.close()}catch(_){} }});</script>`;
}

captureRouter.get("/", async (c) => {
  const q = c.req.query();
  const has = (v?: string) => typeof v === "string" && v.trim() !== "";
  // Bookmarklet → review screen: pre-fill an editable form instead of filing
  // immediately, so the captured URL/title/notes can be tweaked or dropped.
  if (has(q.edit)) {
    return c.html(editPage({ title: q.title, url: q.url, body: q.body }));
  }
  // No real input → show the hub instead of creating an empty card.
  if (!has(q.title) && !has(q.url) && !has(q.body)) {
    return c.html(hubPage(new URL(c.req.url).origin));
  }
  const card = await createCard({
    title: q.title,
    url: q.url,
    body: q.body,
    lane: q.lane,
    tags: (c.req.queries("tag") ?? []).filter((t) => t.trim() !== ""),
  });
  return c.html(confirmPage(card));
});

captureRouter.post("/", async (c) => {
  const input = (await c.req.json().catch(() => ({}))) as CaptureInput;
  if (!input.title && !input.url && !input.body) {
    return c.json({ error: "need at least a title, url or body" }, 400);
  }
  const card = await createCard(input);
  return c.json(card, 201);
});
