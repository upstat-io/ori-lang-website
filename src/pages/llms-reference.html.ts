import type { APIRoute } from 'astro';
import { buildLlmsReferenceTxt, htmlWrapText } from '../lib/llms';

export const GET: APIRoute = () =>
  new Response(
    htmlWrapText(
      'OriLang Reference Catalog — Specification, Guide, Examples, Stdlib',
      'Per-document links for the OriLang specification, learning guide, example programs, and standard library.',
      buildLlmsReferenceTxt(),
      '/llms-reference.html',
      'Ori programming language reference, OriLang specification index, Ori language guide, Ori code examples, Ori standard library, programming language documentation',
    ),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
