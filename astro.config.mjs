import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'fs';
import remarkInclude from './src/remark/remark-include.mjs';
import remarkMdLinks from './src/remark/remark-md-links.mjs';

const oriGrammar = JSON.parse(
  readFileSync('./src/shiki/ori.tmLanguage.json', 'utf-8')
);

const ebnfGrammar = JSON.parse(
  readFileSync('./src/shiki/ebnf.tmLanguage.json', 'utf-8')
);

const oriDarkTheme = JSON.parse(
  readFileSync('./src/shiki/ori-dark-theme.json', 'utf-8')
);

const oriLanguage = {
  id: 'ori',
  scopeName: 'source.ori',
  grammar: oriGrammar,
  aliases: ['ori'],
};

const ebnfLanguage = {
  id: 'ebnf',
  scopeName: 'source.ebnf',
  grammar: ebnfGrammar,
  aliases: ['ebnf', 'bnf'],
};

export default defineConfig({
  site: 'https://ori-lang.com',
  integrations: [
    svelte(),
    mdx(),
    sitemap({
      // Non-page surfaces worth advertising to crawlers: the LLM reference
      // set (.txt) plus indexable HTML mirrors of the same generated content.
      customPages: [
        'https://ori-lang.com/llms.txt',
        'https://ori-lang.com/llms-reference.txt',
        'https://ori-lang.com/llms-full.txt',
        'https://ori-lang.com/llms.html',
        'https://ori-lang.com/llms-reference.html',
        'https://ori-lang.com/llms-full.html',
        'https://ori-lang.com/grammar.html',
      ],
    }),
  ],
  markdown: {
    remarkPlugins: [remarkInclude, remarkMdLinks],
    shikiConfig: {
      langs: [oriLanguage, ebnfLanguage],
      theme: oriDarkTheme,
    },
  },
  vite: {
    optimizeDeps: {
      exclude: ['monaco-editor'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'monaco-editor': ['monaco-editor'],
          },
        },
      },
    },
    server: {
      watch: {
        // Watch the wasm directory for changes during dev
        ignored: ['!**/src/wasm/**'],
      },
    },
  },
});
