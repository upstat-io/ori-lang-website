import type { Loader } from 'astro/loaders';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { parseYamlFrontmatter } from '../lib/plan-data';

interface PlanEntry {
  key: string;   // URL-friendly key (e.g., 'value-semantics-optimization')
  base: string;  // relative path from website root (e.g., '../ori_lang/plans/value-semantics-optimization')
}

interface PlanSectionLoaderOptions {
  plans: PlanEntry[];
}

export function planSectionLoader(options: PlanSectionLoaderOptions): Loader {
  return {
    name: 'plan-section-loader',

    load: async ({ store, parseData, renderMarkdown, generateDigest, logger }) => {
      store.clear();

      for (const plan of options.plans) {
        const baseDir = resolve(process.cwd(), plan.base);

        if (!existsSync(baseDir)) {
          logger.warn(`Plan directory not found: ${baseDir}`);
          continue;
        }

        // §35.7 dual-mode: prefer plan.json (Decision 14 — sole canonical artifact,
        // parsed with native JSON.parse) over the per-section .md frontmatter reader
        // (whose hand-rolled YAML parser mis-handles nested `sections:` list-of-dicts).
        // Falls back to the .md reader when no plan.json is present.
        const planJsonPath = join(baseDir, 'plan.json');
        if (existsSync(planJsonPath)) {
          let planJson: any;
          try {
            planJson = JSON.parse(readFileSync(planJsonPath, 'utf-8'));
          } catch (err) {
            logger.warn(`Invalid plan.json in ${baseDir}: ${err}`);
            continue;
          }
          const subs = Array.isArray(planJson.subsections) ? planJson.subsections : [];
          logger.info(`Loading ${subs.length} subsections from ${plan.key} (plan.json native)`);
          for (const sub of subs) {
            if (!sub || typeof sub !== 'object') continue;
            const slug = `section-${sub.id}`;
            const id = `${plan.key}/${slug}`;

            const data = await parseData({
              id,
              data: {
                plan: plan.key,
                section: sub.id,
                title: sub.title,
                status: sub.status,
                goal: sub.goal,
                tier: sub.tier,
                spec: sub.spec,
                inspired_by: sub.inspired_by,
                depends_on: sub.depends_on,
                sections: Array.isArray(sub.sections) ? sub.sections : [],
              },
            });

            // Body from the body_ref sidecar (Decision 14 §4); empty when none.
            let bodyMd = '';
            let bodyPath = planJsonPath;
            if (typeof sub.body_ref === 'string' && sub.body_ref) {
              const sidecarPath = join(baseDir, sub.body_ref);
              if (existsSync(sidecarPath)) {
                bodyMd = readFileSync(sidecarPath, 'utf-8');
                bodyPath = sidecarPath;
              }
            }
            const rendered = await renderMarkdown(bodyMd, {
              fileURL: new URL(`file://${bodyPath}`),
            });
            const digest = generateDigest(data);

            store.set({
              id,
              data,
              body: bodyMd,
              rendered,
              digest,
              filePath: planJsonPath.replace(resolve(process.cwd(), '..') + '/', ''),
            });
          }
          continue; // plan.json handled — skip the .md fallback for this plan
        }

        const files = readdirSync(baseDir)
          .filter(f => f.startsWith('section-') && f.endsWith('.md'))
          .sort();

        logger.info(`Loading ${files.length} sections from ${plan.key}`);

        for (const file of files) {
          const filePath = join(baseDir, file);
          const content = readFileSync(filePath, 'utf-8');

          // Extract frontmatter
          if (!content.startsWith('---')) {
            logger.warn(`No frontmatter in ${filePath}`);
            continue;
          }

          const endIndex = content.indexOf('---', 3);
          if (endIndex === -1) {
            logger.warn(`Unclosed frontmatter in ${filePath}`);
            continue;
          }

          const frontmatterStr = content.slice(3, endIndex);
          const body = content.slice(endIndex + 3);

          const frontmatter = parseYamlFrontmatter(frontmatterStr);
          if (!frontmatter) {
            logger.warn(`Failed to parse frontmatter in ${filePath}`);
            continue;
          }

          const slug = file.replace(/\.md$/, '');
          const id = `${plan.key}/${slug}`;

          const data = await parseData({
            id,
            data: {
              plan: plan.key,
              section: frontmatter.section,
              title: frontmatter.title,
              status: frontmatter.status,
              goal: frontmatter.goal,
              tier: frontmatter.tier,
              spec: frontmatter.spec,
              inspired_by: frontmatter.inspired_by,
              depends_on: frontmatter.depends_on,
              sections: frontmatter.sections || [],
            },
          });

          const rendered = await renderMarkdown(body, {
            fileURL: new URL(`file://${filePath}`),
          });
          const digest = generateDigest(data);

          store.set({
            id,
            data,
            body,
            rendered,
            digest,
            filePath: filePath.replace(resolve(process.cwd(), '..') + '/', ''),
          });
        }
      }
    },
  };
}
