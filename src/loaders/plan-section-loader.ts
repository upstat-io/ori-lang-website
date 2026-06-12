import type { Loader } from 'astro/loaders';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { parseYamlFrontmatter, extractSidecarMeta, humanizeSlug } from '../lib/plan-data';

interface PlanEntry {
  key: string;   // URL-friendly key (e.g., 'value-semantics-optimization')
  base: string;  // relative path from website root (e.g., '../plans/value-semantics-optimization')
}

interface PlanSectionLoaderOptions {
  plans: PlanEntry[];
}

/** HTML marker for a work item's status, rendered inline in list items. */
function wiMarker(status: string | undefined): string {
  const cls = status === 'completed' || status === 'superseded' ? 'wi-done'
    : status === 'in-progress' ? 'wi-progress'
    : 'wi-open';
  const label = cls === 'wi-done' ? 'Completed' : cls === 'wi-progress' ? 'In progress' : 'Not started';
  return `<span class="wi-marker ${cls}" title="${label}"></span> `;
}

/**
 * Clean a content body for public rendering:
 * - `[w-xxxx]` work-item tokens become inline status markers (from plan.json)
 * - `- [x]` / `- [ ]` checkboxes become done/open markers
 * - `[done] (verified 2026-03-29)`-style stamps are stripped
 * - `## X.Y` subsection headings get a done/total rollup chip
 * - blockquote lines hard-break so consecutive `>` lines don't merge
 * Code fences are left untouched.
 */
function sanitizeSidecarMd(md: string, statusById?: Record<string, string>): string {
  const lines = md.split('\n');

  // Pass 1: per-`##`-heading work-item rollups (v7 sidecars only).
  const headingChip: Record<number, string> = {};
  if (statusById) {
    let headingIdx = -1;
    let done = 0;
    let total = 0;
    let inFence = false;
    const flush = () => {
      if (headingIdx >= 0 && total > 0) {
        const cls = done === total ? 'complete' : done > 0 ? 'in-progress' : 'not-started';
        // Empty element + CSS attr() so the count never leaks into heading slugs
        // (slugs must stay stable as work-item counts change).
        headingChip[headingIdx] = `<span class="subsec-status ${cls}" data-count="${done}/${total}"></span>`;
      }
    };
    lines.forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return;
      if (/^##\s+/.test(line)) {
        flush();
        headingIdx = i;
        done = 0;
        total = 0;
        return;
      }
      const idMatch = line.match(/\[(w-[0-9a-z]{4,})\]/);
      if (idMatch && headingIdx >= 0) {
        const st = statusById[idMatch[1]];
        if (st !== undefined) {
          total++;
          if (st === 'completed' || st === 'superseded') done++;
        }
      }
    });
    flush();
  }

  // Pass 2: line-level cleanup.
  const out: string[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      return;
    }
    if (inFence) {
      out.push(line);
      return;
    }
    let l = line
      // `- [w-xxxx]` list items -> inline status marker
      .replace(/^(\s*[-*]\s+)\[(w-[0-9a-z]{4,})\]\s*/, (_, pre, id) =>
        pre + (statusById ? wiMarker(statusById[id]) : ''))
      // remaining id tokens anywhere -> stripped
      .replace(/\[(?:w|s)-[0-9a-z]{4,}\]\s*/g, '')
      // `- [x]` / `- [ ]` checkbox markers -> done/open markers
      .replace(/^(\s*[-*]\s+)\[( |x|X)\]\s*/, (_, pre, mark) =>
        pre + wiMarker(mark === ' ' ? 'not-started' : 'completed'))
      // `[done] (verified 2026-03-29)`-style status markers, anywhere on the line
      .replace(/\s*\[(?:done|completed?|superseded|verified|skipped|in-progress|not-started)\]\s*(?:\((?:[a-z]+\s+)?\d{4}-\d{2}-\d{2}\))?/gi, '')
      // `(verified 2026-03-29)` / `(verified 2026-03-25: evidence...)` /
      // `(verified 2026-04-23 post ...)` date stamps with optional trailing text
      .replace(/\s*\(\s*(?:(?:re-|grep-)?verified|done|completed)\s+\d{4}-\d{2}-\d{2}[^)]*\)/gi, '')
      // `— verified 2026-04-18.` trailing dash-form stamps
      .replace(/\s*[—–-]+\s*(?:re-|grep-)?verified\s+\d{4}-\d{2}-\d{2}\.?/gi, '');
    // Subsection heading rollup chip.
    if (headingChip[i]) {
      l = `${l} ${headingChip[i]}`;
    }
    // Hard line break inside blockquotes (two trailing spaces).
    if (/^\s*>\s*\S/.test(l)) {
      l = l.replace(/\s*$/, '  ');
    }
    out.push(l);
  });
  return out.join('\n');
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
          // Defense in depth: never load private (tooling / workflow) plans
          // even if a caller lists one.
          if (planJson.visibility === 'private') {
            logger.info(`Skipping private plan ${plan.key}`);
            continue;
          }
          // Prefer v7 sections[] + work_items[] (Decision-05 three-type); fall back to v6 subsections.
          let subs: any[];
          const wiStatusById: Record<string, string> = {};
          if (Array.isArray(planJson.sections)) {
            const doneBySection: Record<string, number> = {};
            const totalBySection: Record<string, number> = {};
            for (const wi of (Array.isArray(planJson.work_items) ? planJson.work_items : [])) {
              if (!wi || typeof wi !== 'object') continue;
              const sid = String(wi.section_id ?? '');
              if (typeof wi.id === 'string') wiStatusById[wi.id] = String(wi.status ?? 'not-started');
              totalBySection[sid] = (totalBySection[sid] ?? 0) + 1;
              if (wi.status === 'completed' || wi.status === 'superseded') {
                doneBySection[sid] = (doneBySection[sid] ?? 0) + 1;
              }
            }
            subs = planJson.sections
              .filter((s: any) => s && typeof s === 'object')
              .filter((s: any) => s.status !== 'superseded' && s.status !== 'abandoned')
              .sort((a: any, b: any) => String(a.key ?? '').localeCompare(String(b.key ?? '')))
              .map((s: any, i: number) => {
                const slug = String(s.slug ?? s.id ?? `section-${i + 1}`);
                const bodyRef = typeof s.body_ref === 'string' ? s.body_ref : undefined;
                const meta = bodyRef ? extractSidecarMeta(baseDir, bodyRef) : {};
                const sid = String(s.id ?? '');
                return {
                  id: i + 1,
                  slug,
                  title: meta.title ?? humanizeSlug(slug),
                  goal: meta.goal,
                  status: s.status === 'completed' ? 'complete' : (s.status ?? 'not-started'),
                  body_ref: bodyRef,
                  done: doneBySection[sid] ?? 0,
                  total: totalBySection[sid] ?? 0,
                  sections: [],
                };
              });
          } else {
            subs = (Array.isArray(planJson.subsections) ? planJson.subsections : []).map((sub: any) => ({
              ...sub,
              slug: `section-${sub.id}`,
              title: sub.title ?? sub.slug ?? sub.id,
              sections: Array.isArray(sub.sections) ? sub.sections : [],
            }));
          }
          logger.info(`Loading ${subs.length} sections from ${plan.key} (plan.json native)`);
          for (const sub of subs) {
            if (!sub || typeof sub !== 'object') continue;
            const slug = sub.slug;
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
                done: sub.done,
                total: sub.total,
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
                // Strip sidecar YAML frontmatter so it doesn't render as content.
                if (bodyMd.startsWith('---')) {
                  const fmEnd = bodyMd.indexOf('\n---', 3);
                  if (fmEnd !== -1) {
                    bodyMd = bodyMd.slice(fmEnd + 4);
                  }
                }
                bodyMd = sanitizeSidecarMd(bodyMd, wiStatusById);
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

          // Lowercase to match the URL slugs loadAllSections produces
          // (letter-suffix files like section-08A-*.md link as section-08a-*).
          const slug = file.replace(/\.md$/, '').toLowerCase();
          const id = `${plan.key}/${slug}`;

          // Count checkboxes for progress BEFORE stripping them for display.
          const checked = (body.match(/- \[x\]/gi) || []).length;
          const unchecked = (body.match(/- \[ \]/g) || []).length;

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
              done: checked,
              total: checked + unchecked,
              sections: frontmatter.sections || [],
            },
          });

          const cleanBody = sanitizeSidecarMd(body);
          const rendered = await renderMarkdown(cleanBody, {
            fileURL: new URL(`file://${filePath}`),
          });
          const digest = generateDigest(data);

          store.set({
            id,
            data,
            body: cleanBody,
            rendered,
            digest,
            filePath: filePath.replace(resolve(process.cwd(), '..') + '/', ''),
          });
        }
      }
    },
  };
}
