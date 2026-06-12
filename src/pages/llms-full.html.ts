import type { APIRoute } from 'astro';
import { buildLlmsFullTxt, htmlWrapText } from '../lib/llms';

export const GET: APIRoute = () =>
  new Response(
    htmlWrapText(
      'OriLang Complete Language Reference — Full Specification in One Document',
      'The full OriLang specification, EBNF grammar, operator rules, and example programs from the conformance test suite, inlined into a single document.',
      buildLlmsFullTxt(),
      '/llms-full.html',
    ),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
