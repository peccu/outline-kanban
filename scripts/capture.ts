// capture.ts — a low-friction "drop it in the Inbox" intake for outline-kanban.
//
// The point is to make it trivial to throw anything onto the board (a review
// request, a TODO, a link someone Slacked you) without leaving your terminal.
// Cards land in the Inbox lane by default; tags are optional (e.g. --tag review
// to mark code-review requests). Lanes are the status, so you advance an item
// by moving it between lanes.
//
//   OUTLINE_KANBAN_URL=http://localhost:8787 bun run scripts/capture.ts <cmd>
//
// Commands:
//   add <title> [--url U] [--by NAME] [--lane LANE] [--tag T]... [--body TEXT]
//   list [--lane LANE] [--tag T] [--all]
//   move <id|title> <LANE>
//   done <id|title>
//   open
//
// <id|title> matches a card by full id, id prefix, or a substring of its title
// (must be unambiguous).
const BASE = (process.env.OUTLINE_KANBAN_URL ?? "http://localhost:8787").replace(/\/$/, "");
const DEFAULT_LANE = process.env.CAPTURE_LANE ?? "Inbox";
const DONE_LANE = process.env.CAPTURE_DONE_LANE ?? "Done";

type Lane = { id: string; name: string; color: string | null };
type Tag = { id: string; name: string };
type Node = {
  id: string;
  parentId: string | null;
  laneId: string | null;
  title: string;
  bodyMd: string;
  tags?: Tag[];
  commentCount?: number;
};

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).catch((e) => die(`cannot reach ${BASE} — is the server up? (${e})`));
  if (!res.ok && res.status !== 204) {
    die(`API ${method} ${path} → ${res.status} ${await res.text().catch(() => "")}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const lanes = () => api<Lane[]>("GET", "/api/lanes");
const nodes = () => api<Node[]>("GET", "/api/nodes");

function resolveLane(list: Lane[], name: string): Lane {
  const m = list.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (!m) die(`lane "${name}" not found. Available: ${list.map((l) => l.name).join(", ")}`);
  return m;
}

const firstUrl = (body: string) => body.match(/https?:\/\/\S+/)?.[0] ?? null;
const short = (id: string) => id.slice(0, 8);

function parseFlags(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const tags: string[] = [];
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--all") all = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[++i] ?? "";
      if (key === "tag") tags.push(val);
      else flags[key] = val;
    } else positional.push(a);
  }
  return { positional, flags, tags, all };
}

async function cmdAdd(argv: string[]) {
  const { positional, flags, tags } = parseFlags(argv);
  const title = positional.join(" ").trim();
  if (!title) die('add: need a title. e.g. add "Look into flaky test" --tag chore');

  const laneList = await lanes();
  const lane = resolveLane(laneList, flags.lane ?? DEFAULT_LANE);

  const node = await api<Node>("POST", "/api/nodes", {
    laneId: lane.id,
    parentId: null,
    title,
  });

  for (const name of tags) {
    await api("POST", `/api/nodes/${node.id}/tags`, { name });
  }

  let body = flags.body ?? "";
  if (!body) {
    const lines: string[] = [];
    if (flags.url) lines.push(`🔗 ${flags.url}`);
    if (flags.by) lines.push(`From: ${flags.by}`);
    lines.push(`Filed: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    body = lines.join("\n\n");
  }
  if (body) await api("PATCH", `/api/nodes/${node.id}`, { bodyMd: body });

  const tagStr = tags.length ? `  [${tags.map((t) => "#" + t).join(" ")}]` : "";
  console.log(`✓ ${short(node.id)}  "${title}"  → ${lane.name}${tagStr}`);
}

async function cmdList(argv: string[]) {
  const { flags, tags, all } = parseFlags(argv);
  const [laneList, allNodes] = await Promise.all([lanes(), nodes()]);
  let items = allNodes.filter((n) => n.parentId === null);
  if (tags.length) {
    items = items.filter((n) =>
      tags.every((t) => (n.tags ?? []).some((x) => x.name.toLowerCase() === t.toLowerCase())),
    );
  }
  // Default view: just the intake lane. --all or --lane widen/redirect it.
  const focusLane = flags.lane
    ? resolveLane(laneList, flags.lane)
    : all || tags.length
      ? null
      : resolveLane(laneList, DEFAULT_LANE);

  const byLane = new Map<string | null, Node[]>();
  for (const n of items) {
    const arr = byLane.get(n.laneId) ?? [];
    arr.push(n);
    byLane.set(n.laneId, arr);
  }

  let shown = 0;
  const out: string[] = [];
  for (const lane of laneList) {
    if (focusLane && lane.id !== focusLane.id) continue;
    const list = byLane.get(lane.id) ?? [];
    if (list.length === 0) continue;
    out.push(`${lane.name} (${list.length})`);
    for (const n of list) {
      const tagStr = (n.tags ?? []).map((t) => "#" + t.name).join(" ");
      const meta = [tagStr, n.commentCount ? `💬${n.commentCount}` : "", firstUrl(n.bodyMd) ?? ""]
        .filter(Boolean)
        .join("  ·  ");
      out.push(`  ${short(n.id)}  ${n.title}${meta ? "  ·  " + meta : ""}`);
      shown++;
    }
    out.push("");
  }
  const scope = focusLane ? focusLane.name : tags.length ? `#${tags.join(" #")}` : "all lanes";
  console.log(`${shown} card(s) in ${scope} on ${BASE}\n`);
  console.log(out.join("\n").trimEnd() || "(none)");
}

function findCard(items: Node[], q: string): Node {
  const exact = items.filter((n) => n.id === q);
  if (exact.length === 1) return exact[0]!;
  const prefix = items.filter((n) => n.id.startsWith(q));
  if (prefix.length === 1) return prefix[0]!;
  const ql = q.toLowerCase();
  const sub = items.filter((n) => (n.title ?? "").toLowerCase().includes(ql));
  if (sub.length === 1) return sub[0]!;
  if (sub.length === 0) die(`no card matches "${q}"`);
  die(`ambiguous "${q}":\n` + sub.map((n) => `  ${short(n.id)}  ${n.title}`).join("\n"));
}

async function moveTo(query: string, laneName: string) {
  const [laneList, allNodes] = await Promise.all([lanes(), nodes()]);
  const lane = resolveLane(laneList, laneName);
  const card = findCard(allNodes.filter((n) => n.parentId === null), query);
  await api("POST", `/api/nodes/${card.id}/move`, {
    parentId: null,
    laneId: lane.id,
    beforeId: null,
  });
  console.log(`✓ ${short(card.id)}  "${card.title}"  → ${lane.name}`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "add":
    case "a":
      return cmdAdd(rest);
    case "list":
    case "ls":
      return cmdList(rest);
    case "move":
    case "mv":
      if (rest.length < 2) die("move: usage: move <id|title> <LANE>");
      return moveTo(rest[0]!, rest[rest.length - 1]!);
    case "done":
      if (rest.length < 1) die("done: usage: done <id|title>");
      return moveTo(rest.join(" "), DONE_LANE);
    case "open":
      console.log(BASE);
      return;
    default:
      console.log(
        [
          "capture — drop things into the outline-kanban Inbox",
          "",
          '  add <title> [--url U] [--by NAME] [--lane LANE] [--tag T]... [--body TEXT]',
          "  list [--lane LANE] [--tag T] [--all]",
          "  move <id|title> <LANE>",
          "  done <id|title>",
          "  open",
          "",
          `target: ${BASE}  (override with OUTLINE_KANBAN_URL)`,
          `default lane: ${DEFAULT_LANE}`,
        ].join("\n"),
      );
      if (cmd && !["help", "-h", "--help"].includes(cmd)) process.exit(1);
  }
}

await main();
