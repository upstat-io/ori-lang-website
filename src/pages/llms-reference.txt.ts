import type { APIRoute } from 'astro';
import { buildLlmsReferenceTxt } from '../lib/llms';

export const GET: APIRoute = () =>
  new Response(buildLlmsReferenceTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
