import type { APIRoute } from 'astro';
import {
  RAW_BASE,
  SITE_BASE,
  QUICK_FACTS,
  listSpecClauses,
  readRepoFile,
  readSyntaxReference,
  existingRepoPaths,
  CURATED_EXAMPLES,
} from '../lib/llms';

export const GET: APIRoute = () => {
  const out: string[] = [];

  out.push('# OriLang — Complete Language Reference (llms-full.txt)');
  out.push('');
  out.push(
    '> The full OriLang specification, grammar, and operator rules in one document, ' +
    'followed by real example programs from the conformance test suite. ' +
    `Index version of this file: ${SITE_BASE}/llms.txt`
  );
  out.push('');
  out.push(QUICK_FACTS);
  out.push('');
  out.push('---');
  out.push('');

  // The maintained syntax cheat sheet — the fastest orientation.
  const syntaxRef = readSyntaxReference();
  if (syntaxRef) {
    out.push(syntaxRef.trimEnd());
    out.push('');
    out.push('---');
    out.push('');
  }

  // Grammar — the syntax SSOT — first.
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

  // Every spec clause + annex, in order.
  for (const clause of listSpecClauses()) {
    const content = readRepoFile(clause.repoPath);
    if (!content) continue;
    out.push(content.trimEnd());
    out.push('');
    out.push('---');
    out.push('');
  }

  // Worked examples: complete, passing programs.
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

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
