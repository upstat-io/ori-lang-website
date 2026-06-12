import type { APIRoute } from 'astro';
import { readRepoFile, htmlWrapText, RAW_BASE } from '../lib/llms';

export const GET: APIRoute = () => {
  const grammar = readRepoFile('docs/ori_lang/v2026/spec/grammar.ebnf') ??
    `Grammar not available in this build. Source: ${RAW_BASE}/docs/ori_lang/v2026/spec/grammar.ebnf`;
  return new Response(
    htmlWrapText(
      'OriLang Grammar (EBNF) — Syntax Single Source of Truth',
      'The complete EBNF grammar of the OriLang programming language: every valid Ori construct, normative for syntax.',
      grammar,
      '/grammar.html',
    ),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
};
