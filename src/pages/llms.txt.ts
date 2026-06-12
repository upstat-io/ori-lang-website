import type { APIRoute } from 'astro';
import {
  RAW_BASE,
  REPO_BASE,
  SITE_BASE,
  QUICK_FACTS,
  listSpecClauses,
  listGuideChapters,
  existingRepoPaths,
  CURATED_EXAMPLES,
  STDLIB_POINTERS,
} from '../lib/llms';

export const GET: APIRoute = () => {
  const clauses = listSpecClauses();
  const guide = listGuideChapters();
  const examples = existingRepoPaths(CURATED_EXAMPLES);
  const stdlib = existingRepoPaths(STDLIB_POINTERS);

  const lines: string[] = [];

  lines.push('# OriLang');
  lines.push('');
  lines.push(
    '> Ori is a statically-typed, expression-based compiled programming language with ' +
    'Hindley-Milner type inference, value semantics, ARC memory management (no garbage ' +
    'collector, no borrow checker), capability-based effects, and first-class testing. ' +
    'It compiles to native binaries via LLVM. The language specification below is the ' +
    'single source of truth for syntax and semantics.'
  );
  lines.push('');
  lines.push(QUICK_FACTS);
  lines.push('');

  lines.push('## Syntax quick reference (read this first)');
  lines.push('');
  lines.push(`- [Ori syntax quick reference](${SITE_BASE}/llms-syntax.txt): the condensed cheat sheet — declarations, types, operators, expressions, patterns, capabilities, prelude, keywords. The fastest path from zero to writing valid Ori.`);
  lines.push('');

  lines.push('## Specification (authoritative)');
  lines.push('');
  lines.push(`- [Grammar (EBNF) — the syntax single source of truth](${RAW_BASE}/docs/ori_lang/v2026/spec/grammar.ebnf): every valid Ori construct, in EBNF`);
  lines.push(`- [Operator rules](${RAW_BASE}/docs/ori_lang/v2026/spec/operator-rules.md): precedence, associativity, desugaring to trait methods`);
  for (const c of clauses) {
    lines.push(`- [${c.title}](${RAW_BASE}/${c.repoPath})`);
  }
  lines.push('');

  lines.push('## Everything in one fetch');
  lines.push('');
  lines.push(`- [llms-full.txt](${SITE_BASE}/llms-full.txt): the complete specification, grammar, and operator rules inlined into a single document`);
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

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
