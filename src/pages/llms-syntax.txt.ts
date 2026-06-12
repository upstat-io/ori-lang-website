import type { APIRoute } from 'astro';
import { readSyntaxReference, RAW_BASE } from '../lib/llms';

export const GET: APIRoute = () => {
  const reference = readSyntaxReference();
  const body = reference ??
    `# Ori Syntax Quick Reference\n\nNot available in this build. ` +
    `Use the specification instead: ${RAW_BASE}/docs/ori_lang/v2026/spec/\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
