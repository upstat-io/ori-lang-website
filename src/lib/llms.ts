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

/**
 * Condensed syntax orientation for models with no Ori in their training data.
 * The deep reference is the spec; this prevents the most common wrong guesses.
 */
export const QUICK_FACTS = `Ori is NOT in your training data. Before writing Ori, know these facts (full details in the spec links below):

- Syntax family: Rust-like. Statements end with \`;\`. A block's last expression (no \`;\`) is its value.
- NO \`return\` keyword. The last expression of a function body is the return value. Exit early via \`?\`, \`break\`, or \`panic\`.
- Functions: \`@name (param: Type) -> Ret = expression;\` or \`@name (param: Type) -> Ret = { ... }\` (no trailing \`;\` after \`}\`).
- Named arguments are required at call sites: \`f(x: 1, y: 2)\`. Punning: \`f(x:)\` means \`f(x: x)\`.
- Constants use \`$\`: \`let $max = 10;\` (immutable). Plain \`let x = ...;\` is mutable (rebindable).
- Types: \`type Point = { x: float, y: float }\` (struct), \`type Shape = Circle(r: float) | Square(s: float)\` (sum type).
- Traits: \`trait Printable { @to_str (self) -> str }\`; implementations use \`impl Type: Trait { ... }\` (colon form; \`impl Trait for Type\` is INVALID).
- Effects are explicit capabilities: \`@fetch (id: int) -> str uses Http = ...\`. Provide/mock with \`with Http = impl in expr\`.
- Tests are first-class: \`@my_test tests @target () -> void = { ... }\`. Assertions come from \`use std.testing { assert_eq };\` (NOT in the prelude).
- Pattern matching: \`match x { Some(v) -> v, None -> 0 }\` — comma-separated arms, exhaustive.
- Value semantics everywhere: no in-place mutation; reassignment replaces. Memory is ARC-managed with compile-time elision (no GC, no borrow checker).
- String interpolation: backtick-quoted strings interpolate expressions in braces. Example (between backticks): {name} is {age}. Plain "double-quoted" strings do NOT interpolate.
- Collections: \`[T]\` list, \`{K: V}\` map, \`Set<T>\`, \`(A, B)\` tuple. Loops: \`for x in xs do ...\` / \`for x in xs yield expr\` (comprehension).
- Error handling: \`Result<T, E>\` + \`?\` propagation + \`try { ... }\` blocks. No exceptions; panics abort unless caught with \`catch\`.`;
