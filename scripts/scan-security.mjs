#!/usr/bin/env node
// Static security scan. Blocks high-risk APIs in contributed Lua filters and LaTeX
// templates, because they execute on the user's machine when a recipe runs.
// Legitimate exceptions must be recorded, with a reason, in .security-allowlist.json
// (reviewed by a maintainer) — nothing passes silently.
//
//   node scripts/scan-security.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const LUA_RULES = [
  { name: 'os-execute', re: /\bos\.execute\s*\(/ },
  { name: 'io-popen', re: /\bio\.popen\s*\(/ },
  { name: 'os-remove', re: /\bos\.remove\s*\(/ },
  { name: 'os-rename', re: /\bos\.rename\s*\(/ },
  { name: 'loadstring', re: /\bloadstring\s*\(/ },
  { name: 'load', re: /\bload\s*\(/ },
  { name: 'dofile', re: /\bdofile\s*\(/ },
  { name: 'loadfile', re: /\bloadfile\s*\(/ },
  // require of anything that isn't a built-in pandoc.* module
  { name: 'external-require', re: /\brequire\s*[(\s]\s*['"](?!pandoc)/ },
];

const LATEX_RULES = [
  { name: 'latex-write18', re: /write18/ },
  { name: 'latex-shell-escape', re: /shell-escape/ },
  { name: 'latex-write-stream', re: /\\write\d/ },
  { name: 'latex-abs-input', re: /\\(input|include)\s*\{\s*(\/|[A-Za-z]:\\)/ },
];

// Strip line comments so commented-out code (e.g. `-- require 'logging'`) is ignored.
function stripLua(line) {
  const i = line.indexOf('--');
  return i >= 0 ? line.slice(0, i) : line;
}
function stripLatex(line) {
  return line.replace(/(^|[^\\])%.*/, '$1');
}

function listFiles(rel, exts, recursive = false) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(rel, e.name);
    if (e.isDirectory()) { if (recursive) out.push(...listFiles(child, exts, recursive)); continue; }
    if (exts.some((x) => e.name.endsWith(x))) out.push(child);
  }
  return out;
}

function scanFile(rel, rules, strip) {
  const hits = [];
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const code = strip(line);
    for (const rule of rules) {
      if (rule.re.test(code)) hits.push({ file: rel.split(path.sep).join('/'), rule: rule.name, line: idx + 1, text: line.trim() });
    }
  });
  return hits;
}

function loadAllowlist() {
  const fp = path.join(ROOT, '.security-allowlist.json');
  if (!fs.existsSync(fp)) return [];
  const list = JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (const e of list) {
    if (!e.file || !e.pattern || !e.reason) {
      console.error(`error: .security-allowlist.json entry needs file, pattern, reason: ${JSON.stringify(e)}`);
      process.exit(2);
    }
  }
  return list;
}

const allowlist = loadAllowlist();
const isAllowed = (hit) => allowlist.some((a) => a.file === hit.file && a.pattern === hit.rule);

const hits = [];
for (const rel of listFiles('filters', ['.lua'])) hits.push(...scanFile(rel, LUA_RULES, stripLua));
for (const rel of listFiles('templates', ['.tex', '.latex', '.sty'], true)) hits.push(...scanFile(rel, LATEX_RULES, stripLatex));
if (fs.existsSync(path.join(ROOT, 'preamble.sty'))) hits.push(...scanFile('preamble.sty', LATEX_RULES, stripLatex));

const blocked = hits.filter((h) => !isAllowed(h));
const allowed = hits.filter(isAllowed);

for (const a of allowed) console.error(`allow: ${a.file}:${a.line} [${a.rule}] (allowlisted)`);
for (const b of blocked) console.error(`BLOCK: ${b.file}:${b.line} [${b.rule}]  ${b.text}`);

if (blocked.length) {
  console.error(`\nsecurity scan failed: ${blocked.length} blocked pattern(s). If a use is legitimate, a maintainer must add it to .security-allowlist.json with a reason.`);
  process.exit(1);
}
console.error(`security scan passed (${allowed.length} allowlisted, ${hits.length} total matches)`);
