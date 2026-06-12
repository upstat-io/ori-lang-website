import type { APIRoute } from 'astro';
import { buildLlmsFullTxt } from '../lib/llms';

export const GET: APIRoute = () =>
  new Response(buildLlmsFullTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
