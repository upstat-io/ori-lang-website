import type { APIRoute } from 'astro';
import {
  RAW_BASE,
  REPO_BASE,
  SITE_BASE,
  readRepoFile,
  readSyntaxReference,
} from '../lib/llms';

export const GET: APIRoute = () => {
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

  // ── The maintained syntax quick reference ──
  if (syntaxRef) {
    lines.push(syntaxRef.trimEnd());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // ── The grammar: the syntax single source of truth ──
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

  // ── Operator rules: precedence + trait desugaring ──
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

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
