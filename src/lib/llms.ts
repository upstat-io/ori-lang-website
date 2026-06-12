import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

/** GitHub raw-content base for the public compiler repo (master branch). */
export const RAW_BASE = 'https://raw.githubusercontent.com/upstat-io/ori-lang/master';
export const REPO_BASE = 'https://github.com/upstat-io/ori-lang';
export const SITE_BASE = 'https://ori-lang.com';

const COMPILER_ROOT = () => resolve(process.cwd(), '..', 'compiler_repo');
const SPEC_DIR = 'docs/ori_lang/v2026/spec';

export interface SpecClause {
  file: string;   // filename within the spec dir
  title: string;  // first heading
  repoPath: string;
}

/** First `# ` heading of a markdown file, or a filename-derived fallback. */
function firstHeading(absPath: string, fallback: string): string {
  try {
    const content = readFileSync(absPath, 'utf-8');
    const m = content.match(/^#\s+(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return fallback;
}

/** Enumerate normative spec clauses (01-27) plus annexes, with real titles. */
export function listSpecClauses(): SpecClause[] {
  const dir = join(COMPILER_ROOT(), SPEC_DIR);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter(f => /^(\d{2}-.*|annex-.*)\.md$/.test(f))
    .sort();
  return files.map(f => ({
    file: f,
    title: firstHeading(join(dir, f), f.replace(/\.md$/, '').replace(/-/g, ' ')),
    repoPath: `${SPEC_DIR}/${f}`,
  }));
}

/** Read a compiler-repo file; null when absent. */
export function readRepoFile(repoPath: string): string | null {
  const abs = join(COMPILER_ROOT(), repoPath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf-8');
}

/**
 * The maintained Ori syntax quick reference, pulled from the development
 * tree at build time. The file leads with internal frontmatter + workflow
 * preamble; only the language content (first `## ` heading onward) plus the
 * "Syntax family" orientation paragraph is published. Returns null when the
 * file isn't present (e.g., standalone website builds).
 */
export function readSyntaxReference(): string | null {
  const abs = resolve(process.cwd(), '..', '.claude', 'rules', 'ori-syntax.md');
  if (!existsSync(abs)) return null;
  const raw = readFileSync(abs, 'utf-8');

  const firstSection = raw.search(/^## /m);
  if (firstSection === -1) return null;
  const body = raw.slice(firstSection).trimEnd();

  // Keep the "Syntax family" orientation paragraph from the preamble.
  const familyMatch = raw.match(/^\*\*Syntax family:.*$/m);
  const orientation = familyMatch ? `${familyMatch[0]}\n\n` : '';

  return (
    '# Ori Syntax Quick Reference\n\n' +
    '> Condensed syntax and prelude reference for the Ori programming language, ' +
    'generated from the compiler team\'s maintained cheat sheet. The specification ' +
    `(${RAW_BASE}/docs/ori_lang/v2026/spec/) and grammar.ebnf are authoritative.\n\n` +
    orientation +
    body +
    '\n'
  );
}

/** Keep only the entries whose file actually exists in the repo right now. */
export function existingRepoPaths<T extends { repoPath: string }>(entries: T[]): T[] {
  return entries.filter(e => existsSync(join(COMPILER_ROOT(), e.repoPath)));
}

export interface CuratedExample {
  repoPath: string;
  note: string;
}

/**
 * Curated spec-conformance tests: real, passing Ori programs chosen to cover
 * the breadth of language concepts. Verified against the repo at build time.
 */
export const CURATED_EXAMPLES: CuratedExample[] = [
  { repoPath: 'tests/spec/traits/generic_impl.ori', note: 'generic trait implementations (`impl<T: Bound> Type<T>: Trait`)' },
  { repoPath: 'tests/spec/traits/default_assoc_types.ori', note: 'associated types with defaults' },
  { repoPath: 'tests/spec/traits/object_safety.ori', note: 'trait objects and object safety' },
  { repoPath: 'tests/spec/capabilities/declaration.ori', note: 'declaring capability effects with `uses`' },
  { repoPath: 'tests/spec/capabilities/providing.ori', note: 'providing capabilities with `with Cap = impl in expr` (mocking)' },
  { repoPath: 'tests/spec/capabilities/async.ori', note: 'capabilities + Suspend (async)' },
  { repoPath: 'tests/spec/patterns/exhaustiveness.ori', note: 'match expressions and exhaustiveness' },
  { repoPath: 'tests/spec/patterns/try.ori', note: '`try` blocks and `?` error propagation' },
  { repoPath: 'tests/spec/patterns/catch.ori', note: '`catch` for panic-to-Result conversion' },
  { repoPath: 'tests/spec/patterns/recurse.ori', note: '`recurse` structured-recursion pattern' },
  { repoPath: 'tests/spec/types/const_generics.ori', note: 'const generics (`@f<T, $N: int>`)' },
  { repoPath: 'tests/spec/types/existential.ori', note: 'existential types (`impl Trait` returns)' },
  { repoPath: 'tests/spec/inference/polymorphism.ori', note: 'Hindley-Milner inference + polymorphism' },
  { repoPath: 'tests/spec/expressions/operators_precedence.ori', note: 'operator precedence in practice' },
  { repoPath: 'tests/spec/collections/cow/map_cow.ori', note: 'value-semantic collections (copy-on-write maps)' },
  { repoPath: 'tests/spec/free_floating_test.ori', note: 'first-class test declarations (`tests` syntax)' },
];

export interface StdlibPointer {
  repoPath: string;
  note: string;
}

/** Standard-library sources — large bodies of idiomatic, real-world Ori. */
export const STDLIB_POINTERS: StdlibPointer[] = [
  { repoPath: 'library/std/prelude.ori', note: 'the prelude: Option, Result, core traits, iterator machinery' },
  { repoPath: 'library/std/testing.ori', note: 'assertion helpers (assert_eq, assert_panics, ...)' },
];

/** Guide chapters (markdown) for a learning-path section. */
export function listGuideChapters(): SpecClause[] {
  const dir = join(COMPILER_ROOT(), 'docs/guide');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /^\d{2}-.*\.md$/.test(f))
    .sort()
    .map(f => ({
      file: f,
      title: firstHeading(join(dir, f), f.replace(/\.md$/, '').replace(/-/g, ' ')),
      repoPath: `docs/guide/${f}`,
    }));
}

// ============================================================================
// Document Builders (single source for the .txt and .html surfaces)
// ============================================================================

/** Build the self-contained writing kit (served as /llms.txt + /llms.html). */
export function buildLlmsTxt(): string {
  const syntaxRef = readSyntaxReference();
  const grammar = readRepoFile('docs/ori_lang/v2026/spec/grammar.ebnf');
  const operatorRules = readRepoFile('docs/ori_lang/v2026/spec/operator-rules.md');

  const lines: string[] = [];

  lines.push('# OriLang');
  lines.push('');
  lines.push(
    '> Ori is a statically-typed, expression-based compiled programming language with ' +
    'Hindley-Milner type inference, value semantics, ARC memory management (no garbage ' +
    'collector, no borrow checker), capability-based effects, and first-class testing. ' +
    'It compiles to native binaries via LLVM. Ori is not in LLM training data — this ' +
    'file is the self-contained writing kit: the maintained syntax reference, the full ' +
    'grammar (EBNF), and the operator rules, in one fetch.'
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  if (syntaxRef) {
    lines.push(syntaxRef.trimEnd());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  if (grammar) {
    lines.push('# Grammar (EBNF) — syntax single source of truth');
    lines.push('');
    lines.push('```ebnf');
    lines.push(grammar.trimEnd());
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  if (operatorRules) {
    lines.push(operatorRules.trimEnd());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Deeper material');
  lines.push('');
  lines.push(`- [llms-reference.txt](${SITE_BASE}/llms-reference.txt): link catalog — every spec clause, guide chapter, curated example program, and standard-library source`);
  lines.push(`- [llms-full.txt](${SITE_BASE}/llms-full.txt): the complete specification, grammar, and example programs inlined into a single document`);
  lines.push(`- [GitHub repository](${REPO_BASE}) | [Playground](${SITE_BASE}/playground) | [Roadmap](${SITE_BASE}/roadmap/)`);
  lines.push(`- Specification source: ${RAW_BASE}/docs/ori_lang/v2026/spec/`);
  lines.push('');

  return lines.join('\n');
}

/** Build the link catalog (served as /llms-reference.txt + /llms-reference.html). */
export function buildLlmsReferenceTxt(): string {
  const clauses = listSpecClauses();
  const guide = listGuideChapters();
  const examples = existingRepoPaths(CURATED_EXAMPLES);
  const stdlib = existingRepoPaths(STDLIB_POINTERS);

  const lines: string[] = [];

  lines.push('# OriLang Reference Catalog');
  lines.push('');
  lines.push(
    '> Per-document links for the OriLang specification, learning guide, example ' +
    `programs, and standard library. The self-contained writing kit (syntax reference + ` +
    `grammar + operator rules) is at ${SITE_BASE}/llms.txt; everything inlined into one ` +
    `document is at ${SITE_BASE}/llms-full.txt.`
  );
  lines.push('');

  lines.push('## Specification (authoritative)');
  lines.push('');
  lines.push(`- [Grammar (EBNF) — the syntax single source of truth](${RAW_BASE}/docs/ori_lang/v2026/spec/grammar.ebnf): every valid Ori construct, in EBNF`);
  lines.push(`- [Operator rules](${RAW_BASE}/docs/ori_lang/v2026/spec/operator-rules.md): precedence, associativity, desugaring to trait methods`);
  for (const c of clauses) {
    lines.push(`- [${c.title}](${RAW_BASE}/${c.repoPath})`);
  }
  lines.push('');

  lines.push('## Guide (learning path)');
  lines.push('');
  for (const g of guide) {
    lines.push(`- [${g.title}](${RAW_BASE}/${g.repoPath})`);
  }
  lines.push('');

  lines.push('## Code examples (real, passing conformance tests)');
  lines.push('');
  lines.push('Each file is a complete Ori program from the compiler test suite — verified against the current compiler:');
  lines.push('');
  for (const e of examples) {
    lines.push(`- [${e.repoPath.split('/').pop()}](${RAW_BASE}/${e.repoPath}): ${e.note}`);
  }
  lines.push(`- [Full conformance suite](${REPO_BASE}/tree/master/tests/spec): hundreds more, organized by language area`);
  lines.push('');

  lines.push('## Standard library (idiomatic Ori source)');
  lines.push('');
  for (const s of stdlib) {
    lines.push(`- [${s.repoPath.split('/').pop()}](${RAW_BASE}/${s.repoPath}): ${s.note}`);
  }
  lines.push(`- [library/std](${REPO_BASE}/tree/master/library/std): the full standard library, written in pure Ori (collections, json, text, math, time, fs, net, crypto, ...)`);
  lines.push('');

  lines.push('## Project');
  lines.push('');
  lines.push(`- [GitHub repository](${REPO_BASE}): compiler source, issues, releases`);
  lines.push(`- [Interactive playground](${SITE_BASE}/playground): run Ori in the browser (WASM)`);
  lines.push(`- [Compiler roadmap](${SITE_BASE}/roadmap/): implementation status by language area`);
  lines.push(`- [Install](${SITE_BASE}/install.sh): \`curl -fsSL ${SITE_BASE}/install.sh | sh\``);
  lines.push('');

  return lines.join('\n');
}

/** Build the everything-inlined document (served as /llms-full.txt + /llms-full.html). */
export function buildLlmsFullTxt(): string {
  const out: string[] = [];

  out.push('# OriLang — Complete Language Reference (llms-full.txt)');
  out.push('');
  out.push(
    '> The full OriLang specification, grammar, and operator rules in one document, ' +
    'followed by real example programs from the conformance test suite. ' +
    `Index version of this file: ${SITE_BASE}/llms.txt`
  );
  out.push('');
  out.push('---');
  out.push('');

  const syntaxRef = readSyntaxReference();
  if (syntaxRef) {
    out.push(syntaxRef.trimEnd());
    out.push('');
    out.push('---');
    out.push('');
  }

  const grammar = readRepoFile('docs/ori_lang/v2026/spec/grammar.ebnf');
  if (grammar) {
    out.push('# Grammar (EBNF) — syntax single source of truth');
    out.push('');
    out.push('```ebnf');
    out.push(grammar.trimEnd());
    out.push('```');
    out.push('');
    out.push('---');
    out.push('');
  }

  const operatorRules = readRepoFile('docs/ori_lang/v2026/spec/operator-rules.md');
  if (operatorRules) {
    out.push(operatorRules.trimEnd());
    out.push('');
    out.push('---');
    out.push('');
  }

  for (const clause of listSpecClauses()) {
    const content = readRepoFile(clause.repoPath);
    if (!content) continue;
    out.push(content.trimEnd());
    out.push('');
    out.push('---');
    out.push('');
  }

  out.push('# Example programs (passing conformance tests)');
  out.push('');
  for (const example of existingRepoPaths(CURATED_EXAMPLES)) {
    const content = readRepoFile(example.repoPath);
    if (!content) continue;
    out.push(`## ${example.repoPath} — ${example.note}`);
    out.push('');
    out.push('```ori');
    out.push(content.trimEnd());
    out.push('```');
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(`Source of truth: ${RAW_BASE}/docs/ori_lang/v2026/spec/`);
  out.push('');

  return out.join('\n');
}

/** Wrap generated text in a minimal indexable HTML document (single source: the text builders). */
export function htmlWrapText(title: string, description: string, text: string, canonicalPath: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${SITE_BASE}${canonicalPath}">
<style>
body { margin: 0; background: #05080a; color: #e8e8e8; }
pre { white-space: pre-wrap; word-wrap: break-word; font: 13px/1.55 ui-monospace, 'JetBrains Mono', Consolas, monospace; padding: 2rem; max-width: 70rem; margin: 0 auto; }
</style>
</head>
<body>
<pre>${escaped}</pre>
</body>
</html>
`;
}
