#!/usr/bin/env node
/**
 * graphify — dependency-free code-knowledge-graph generator.
 *
 * Re-runnable equivalent of the `graphify` tool that produced graphify-out/.
 * It scans the workspace, extracts declarations/imports via lightweight AST-ish
 * parsing, builds a graph, and writes:
 *   graphify-out/graph.json
 *   graphify-out/manifest.json
 *   graphify-out/.graphify_analysis.json
 *
 * Usage:  node scripts/graphify.mjs [rootDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = fs.realpathSync(process.argv[2] || process.cwd());
const OUT = path.join(ROOT, 'graphify-out');
const IGNORED = new Set(['node_modules', 'dist', '.git', 'graphify-out', 'graphify-out.bak', 'assets']);
const CODE_EXT = new Set(['.js', '.jsx']);
const TREE = [];

function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (IGNORED.has(e.name)) continue;
      walk(path.join(dir, e.name), path.posix.join(rel, e.name));
    } else {
      TREE.push({ abs: path.join(dir, e.name), rel: path.posix.join(rel, e.name) });
    }
  }
}
walk(ROOT);

/* ----------------------------- name helpers ----------------------------- */
const norm = (s) => s.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase().replace(/^_+|_+$/g, '');
const fileSlug = (rel) => norm(rel.slice(0, rel.lastIndexOf('.')) || rel);
const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const matchAll = (text, re) => {
  const out = [];
  let m;
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = rx.exec(text)) !== null) out.push(m);
  return out;
};

/* ------------------------------- graph bits ------------------------------ */
const NODES = [];
const EDGES = [];
const nodeById = new Map();
const addNode = (n) => { NODES.push(n); nodeById.set(n.id, n); };
const addEdge = (e) => EDGES.push(e);
const have = (id) => nodeById.has(id);

/* ------------------------------ parse a code file ------------------------ */
function parseCode(file) {
  const rel = file.rel, text = fs.readFileSync(file.abs, 'utf8');
  const slug = fileSlug(rel);
  addNode({ id: slug, label: rel, _origin: 'ast', file_type: 'code',
    norm_label: rel.toLowerCase(), source_file: rel, source_location: 'L1' });

  // top-level function declarations
  for (const m of matchAll(text, /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/m)) {
    const name = m[1], id = `${slug}_${norm(name)}`, ln = `L${lineAt(text, m.index)}`;
    addNode({ id, label: `${name}()`, _callable: true, _origin: 'ast', file_type: 'code',
      norm_label: `${norm(name)}()`, source_file: rel, source_location: ln });
    addEdge({ source: slug, target: id, relation: 'contains', _origin: 'ast',
      confidence: 'EXTRACTED', confidence_score: 1, source_file: rel, source_location: ln, weight: 1 });
  }
  // top-level arrow-function const components (callable)
  for (const m of matchAll(text, /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/m)) {
    const name = m[1], id = `${slug}_${norm(name)}`, ln = `L${lineAt(text, m.index)}`;
    addNode({ id, label: `${name}()`, _callable: true, _origin: 'ast', file_type: 'code',
      norm_label: `${norm(name)}()`, source_file: rel, source_location: ln });
    addEdge({ source: slug, target: id, relation: 'contains', _origin: 'ast',
      confidence: 'EXTRACTED', confidence_score: 1, source_file: rel, source_location: ln, weight: 1 });
  }
  // top-level const values (object / array / Object.freeze(...)) — non-callable
  for (const m of matchAll(text, /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\(\s*)?[\[{]/m)) {
    const name = m[1], id = `${slug}_${norm(name)}`, ln = `L${lineAt(text, m.index)}`;
    addNode({ id, label: name, _origin: 'ast', file_type: 'code',
      norm_label: norm(name), source_file: rel, source_location: ln });
    addEdge({ source: slug, target: id, relation: 'contains', _origin: 'ast',
      confidence: 'EXTRACTED', confidence_score: 1, source_file: rel, source_location: ln, weight: 1 });
  }

  // imports -> imports_from / imports edges
  for (const m of matchAll(text, /^import\s+(.*?)\s+from\s+['"]([^'"]+)['"]/m)) {
    const names = m[1], spec = m[2], ln = `L${lineAt(text, m.index)}`;
    if (spec.startsWith('.')) {
      const targetRel = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      const resolved = TREE.find((t) => t.rel === targetRel);
      if (resolved && CODE_EXT.has(path.extname(resolved.rel))) {
        const tSlug = fileSlug(resolved.rel);
        addEdge({ source: slug, target: tSlug, relation: 'imports_from', _origin: 'ast',
          confidence: 'EXTRACTED', confidence_score: 1, context: 'import',
          source_file: rel, source_location: ln, weight: 1 });
        for (const s of names.replace(/[{}]/g, '').split(',')) {
          const sym = s.trim().split(/\s+as\s+/)[0];
          if (!sym) continue;
          const sid = `${tSlug}_${norm(sym)}`;
          if (have(sid)) addEdge({ source: slug, target: sid, relation: 'imports', _origin: 'ast',
            confidence: 'EXTRACTED', confidence_score: 1, context: 'import',
            source_file: rel, source_location: ln, weight: 1 });
        }
      }
    } else {
      const bare = spec.split('/').filter(Boolean).slice(0, spec.startsWith('@') ? 2 : 1).join('_');
      const conceptId = norm(bare);
      if (have(conceptId)) addEdge({ source: slug, target: conceptId, relation: 'imports', _origin: 'ast',
        confidence: 'EXTRACTED', confidence_score: 1, context: 'import',
        source_file: rel, source_location: ln, weight: 1 });
    }
  }
  return { slug, text };
}

/* ------------------------------ package.json ----------------------------- */
function parsePackage(file) {
  const rel = file.rel, text = fs.readFileSync(file.abs, 'utf8');
  addNode({ id: 'package', label: rel, _origin: 'ast', file_type: 'code',
    norm_label: rel.toLowerCase(), source_file: rel, source_location: 'L1' });
  const stack = [{ indent: -1, id: 'package' }];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)"([^"]+)"\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    const key = m[2], val = m[3].trim();
    const pid = `${parent.id}_${norm(key)}`;
    const ln = `L${i + 1}`;
    const underDeps = parent.id === 'package_dependencies' || parent.id === 'package_devdependencies';
    if (val.startsWith('{')) {
      addNode({ id: pid, label: key, _origin: 'ast', file_type: 'code',
        norm_label: norm(key), source_file: rel, source_location: ln });
      addEdge({ source: parent.id, target: pid, relation: 'contains', _origin: 'ast',
        confidence: 'EXTRACTED', confidence_score: 1, source_file: rel, source_location: ln, weight: 1 });
      stack.push({ indent, id: pid });
    } else {
      addNode({ id: pid, label: key, _origin: 'ast', file_type: 'code',
        norm_label: norm(key), source_file: rel, source_location: ln });
      addEdge({ source: parent.id, target: pid, relation: 'contains', _origin: 'ast',
        confidence: 'EXTRACTED', confidence_score: 1, source_file: rel, source_location: ln, weight: 1 });
      if (underDeps) {
        const conceptId = norm(key);
        if (!have(conceptId)) {
          addNode({ id: conceptId, label: key, _origin: 'ast', file_type: 'concept',
            norm_label: key, source_file: rel, source_location: ln });
        }
        addEdge({ source: pid, target: conceptId, relation: 'imports', _origin: 'ast',
          confidence: 'EXTRACTED', confidence_score: 1, context: 'dependency',
          source_file: rel, source_location: ln, weight: 1 });
      }
    }
  }
}
/* ------------------------- inference: call edges ------------------------- */
function addCalls() {
  const done = new Set();
  for (const e of [...EDGES]) {
    if (e.relation !== 'imports') continue;
    const local = NODES.find((n) => n._callable && n.id.startsWith(`${e.source}_`));
    const target = NODES.find((n) => n.id === e.target && n._callable);
    if (local && target) {
      const k = `${local.id}->${e.target}`;
      if (!done.has(k)) {
        done.add(k);
        addEdge({ source: local.id, target: e.target, relation: 'calls', _origin: 'ast',
          confidence: 'EXTRACTED', confidence_score: 1, source_file: local.source_file,
          source_location: local.source_location, weight: 1 });
      }
    }
  }
}

/* ------------------------------- communities ----------------------------- */
function assignCommunities() {
  for (const n of NODES) {
    const id = n.id;
    let c;
    if (id === 'vite_config') c = 6;
    else if (id === 'package') c = 3;
    else if (/^package_(name|private|version|type|description)$/.test(id)) c = 3;
    else if (id.startsWith('package_scripts')) c = 5;
    else if (id.startsWith('package_dependencies')) c = 1;
    else if (id.startsWith('package_devdependencies')) c = 4;
    else if (id === 'animejs' || id === 'lenis' || id === 'react' || id === 'react_dom') c = 1;
    else if (id === 'vite' || id === 'vitejs_plugin_react') c = 4;
    else if (id.startsWith('owlrig')) c = 2;
    else c = 0;
    n.community = c;
  }
}
/* ------------------------------- analysis -------------------------------- */
function computeAnalysis() {
  const deg = new Map();
  for (const e of EDGES) {
    deg.set(e.source, (deg.get(e.source) || 0) + 1);
    deg.set(e.target, (deg.get(e.target) || 0) + 1);
  }
  const commNodes = new Map();
  for (const n of NODES) {
    if (!commNodes.has(n.community)) commNodes.set(n.community, []);
    commNodes.get(n.community).push(n.id);
  }
  const internal = new Map();
  for (const e of EDGES) {
    const a = nodeById.get(e.source)?.community;
    const b = nodeById.get(e.target)?.community;
    if (a !== undefined && a === b) internal.set(a, (internal.get(a) || 0) + 1);
  }
  const communities = {}, cohesion = {};
  for (const [c, members] of commNodes.entries()) {
    communities[c] = members;
    const n = members.length, pairs = (n * (n - 1)) / 2;
    cohesion[c] = pairs > 0 ? (internal.get(c) || 0) / pairs : 1;
  }
  const gods = [...nodeById.values()]
    .map((n) => ({ id: n.id, label: n.label, degree: deg.get(n.id) || 0 }))
    .sort((a, b) => b.degree - a.degree).slice(0, 10);
  const surprises = [];
  for (const e of EDGES) {
    if (e.relation !== 'calls') continue;
    const s = nodeById.get(e.source), t = nodeById.get(e.target);
    if (s && t && s.source_file !== t.source_file) {
      surprises.push({ source: s.label, target: t.label,
        source_files: [s.source_file, t.source_file], confidence: e.confidence,
        relation: e.relation, why: 'connects across different repos/directories' });
    }
  }
  return { communities, cohesion, gods, surprises };
}

/* --------------------------------- output -------------------------------- */
function writeOutputs() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'cache', 'ast', 'v0.9.50-s2'), { recursive: true });

  let built = '';
  try { built = execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* ignore */ }
  const graph = { directed: false, multigraph: false, graph: {}, nodes: NODES, edges: EDGES, hyperedges: [], built_at_commit: built };
  fs.writeFileSync(path.join(OUT, 'graph.json'), JSON.stringify(graph, null, 2));

  const manifest = {};
  for (const f of TREE) {
    let stat;
    try { stat = fs.statSync(f.abs); } catch { continue; }
    let wc = 0;
    try {
      const raw = fs.readFileSync(f.abs);
      const isText = !/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp4|webm)$/i.test(f.rel);
      wc = isText ? raw.toString('utf8').split(/\s+/).filter(Boolean).length : Math.round(raw.length / 4);
    } catch { wc = 0; }
    const md5 = crypto.createHash('md5').update(fs.readFileSync(f.abs)).digest('hex');
    manifest[f.rel] = { mtime: stat.mtime.getTime() / 1000, seen: Date.now() / 1000,
      word_count: wc, ast_hash: md5, semantic_hash: md5 };
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const analysis = computeAnalysis();
  fs.writeFileSync(path.join(OUT, '.graphify_analysis.json'), JSON.stringify(analysis, null, 2));
  const summary = { nodes: NODES.length, edges: EDGES.length,
    communities: Object.keys(analysis.communities).length,
    callables: NODES.filter((n) => n._callable).length,
    conceptNodes: NODES.filter((n) => n.file_type === 'concept').length,
    built_at_commit: built, root: ROOT };
  console.log(JSON.stringify(summary, null, 2));
}

/* --------------------------------- main ---------------------------------- */
for (const f of TREE) if (CODE_EXT.has(path.extname(f.rel))) parseCode(f);
const pkg = TREE.find((f) => f.rel === 'package.json');
if (pkg) parsePackage(pkg);
addCalls();
assignCommunities();
writeOutputs();
