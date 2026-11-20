const fs = require("fs"), path = require("path");
const web = process.argv[2];
const root = path.join(web, "apps/site/src/routes");
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith(".fud")) files.push(p); } })(root);
const ids = {};
for (const f of files) {
  const url = "/" + path.relative(root, f).split(path.sep).join("/").replace(/(\/index)?\.fud$/, "");
  ids[url] = new Set([...fs.readFileSync(f, "utf8").matchAll(/id="([^"]+)"/g)].map(m => m[1]));
}
let bad = 0;
for (const f of [...files, path.join(web, "libs/ui/src/snippets/site.fud")]) {
  const t = fs.readFileSync(f, "utf8");
  for (const m of t.matchAll(/href="(\/docs[^"#]*)#([^"]+)"/g)) {
    const s = ids[m[1]];
    if (!s || !s.has(m[2])) { bad++; console.log(path.relative(web, f), m[1] + "#" + m[2]); }
  }
  for (const m of t.matchAll(/href="(\/docs[^"#]*)"/g)) {
    if (!ids[m[1]]) { bad++; console.log(path.relative(web, f), "missing page", m[1]); }
  }
}
console.log("broken:", bad);
