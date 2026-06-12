import type { APIRoute } from 'astro';
import { buildLlmsFullTxt, htmlWrapText } from '../lib/llms';

export const GET: APIRoute = () =>
  new Response(
    htmlWrapText(
      'OriLang Complete Language Reference — Full Specification in One Document',
      'The full OriLang specification, EBNF grammar, operator rules, and example programs from the conformance test suite, inlined into a single document.',
      buildLlmsFullTxt(),
      '/llms-full.html',
      'Ori programming language specification, OriLang complete reference, Ori language spec, EBNF grammar, operator precedence, Ori example programs, compiled language specification',
    ),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
