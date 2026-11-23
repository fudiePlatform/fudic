// Checks every internal link of the public site: the page exists and, with a #, so does its id.
// Covers both apps: site (/docs) and mcp (/mcp), and links from one to the other.
const fs = require("fs"), path = require("path");
const web = process.argv[2];

// Each app, the folder of its routes and the URL its routes are served under. The mcp app is a
// subapp of the same domain: if its routes already sit in an `mcp` folder, they need no base.
const apps = [{ dir: "apps/site/src/routes", base: "" }];
const mcpRoutes = path.join(web, "apps/mcp/src/routes");
if (fs.existsSync(mcpRoutes)) {
  apps.push({ dir: "apps/mcp/src/routes", base: fs.existsSync(path.join(mcpRoutes, "mcp")) ? "" : "/mcp" });
}

function walk(d, out) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".fud")) out.push(p);
  }
  return out;
}

const ids = {};
const files = [];
for (const app of apps) {
  const root = path.join(web, app.dir);
  for (const f of walk(root, [])) {
    files.push(f);
    const url = (app.base + "/" + path.relative(root, f).split(path.sep).join("/").replace(/(\/?index)?\.fud$/, "")).replace(/\/$/, "") || "/";
    ids[url] = new Set([...fs.readFileSync(f, "utf8").matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  }
}

// A route with a parameter (`[code].fud`) stands for every value of it: its page exists, and its
// ids are those of its file.
const dynamic = Object.keys(ids)
  .filter(url => url.includes("["))
  .map(url => ({ url, re: new RegExp("^" + url.replace(/\[[^\]]+\]/g, "[^/]+") + "$") }));
// A diagnostic page exists only for a code of the catalog: one file per code in @fudic/diagnostics.
const codes = path.join(web, "../packages/diagnostics/src/codes");
function idsOf(url) {
  if (ids[url]) return ids[url];
  const diagnostic = url.match(/^\/docs\/reference\/diagnostics\/(FUD\d{4})$/);
  if (diagnostic && !fs.existsSync(path.join(codes, diagnostic[1] + ".ts"))) return undefined;
  const d = dynamic.find(d => d.re.test(url));
  return d ? ids[d.url] : undefined;
}

let bad = 0;
for (const f of [...files, path.join(web, "libs/ui/src/snippets/site.fud")]) {
  const t = fs.readFileSync(f, "utf8");
  for (const m of t.matchAll(/href="(\/(?:docs|mcp)[^"#]*)#([^"]+)"/g)) {
    const s = idsOf(m[1]);
    if (!s || !s.has(m[2])) { bad++; console.log(path.relative(web, f), m[1] + "#" + m[2]); }
  }
  for (const m of t.matchAll(/href="(\/(?:docs|mcp)[^"#?]*)(?:\?[^"]*)?"/g)) {
    if (!idsOf(m[1])) { bad++; console.log(path.relative(web, f), "missing page", m[1]); }
  }
}
console.log("apps:", apps.map(a => a.dir.split("/")[1]).join(", "), "· pages:", files.length, "· broken:", bad);
