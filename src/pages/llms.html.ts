import type { APIRoute } from 'astro';
import { buildLlmsTxt, htmlWrapText } from '../lib/llms';

export const GET: APIRoute = () =>
  new Response(
    htmlWrapText(
      'OriLang LLM Writing Kit — Syntax Reference, Grammar, Operator Rules',
      'Self-contained OriLang reference for AI models: the maintained syntax quick reference, the full EBNF grammar, and the operator rules in one document.',
      buildLlmsTxt(),
      '/llms.html',
    ),
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
