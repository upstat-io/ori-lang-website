import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';

// ============================================================================
// Core Interfaces
// ============================================================================

export interface Task {
  name: string;
  done: boolean;
}

export interface Section {
  name: string;
  tasks: Task[];
}

export interface RoadmapSection {
  num: number | string;
  slug: string;
  name: string;
  status: 'complete' | 'partial' | 'not-started';
  note?: string;
  goal: string;
  spec?: string;
  subsections: Section[];
}

export interface Reroute {
  name: string;
  fullName: string;
  status: 'active' | 'queued' | 'resolved';
  order: number;  // queue priority (lower = promoted first, default 999)
  key: string;    // URL-friendly key (hyphens)
  dir: string;    // filesystem directory name
  basePath: string; // relative path from website root to plan parent (e.g., '../plans' or '../plans/completed')
  format: 'v7' | 'md'; // v7 = plan.json-native; md = legacy index.md + section-*.md
}

// ============================================================================
// Slug Humanization
// ============================================================================

/** Acronyms that stay uppercase when humanizing a plan/section slug. */
const SLUG_ACRONYMS = new Set([
  'ffi', 'aot', 'jit', 'llvm', 'aims', 'arc', 'rc', 'ssot', 'ui', 'eh',
  'json', 'api', 'ir', 'wasm', 'tpr', 'cow', 'sso', 'std', 'v7',
]);

/** Humanize a kebab/snake slug into a display title (acronym-aware). */
export function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(w => SLUG_ACRONYMS.has(w.toLowerCase())
      ? w.toUpperCase()
      : w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// Reroute Plan Registry (loaded from plan index.md frontmatter)
// ============================================================================

/**
 * Scan plan directories for index.md files with `reroute: true` frontmatter.
 * Each reroute plan's index.md is the single source of truth for its metadata.
 *
 * @param plansBase - path to plans directory, relative to process.cwd()
 */
/**
 * Scan directories for plan index.md files matching a frontmatter predicate.
 * Scans both the base plans directory and plans/completed/ for archived plans.
 */
function scanPlanDirs(
  plansBase: string,
  predicate: (parsed: Record<string, unknown>) => boolean,
): Reroute[] {
  const plansDir = resolve(process.cwd(), plansBase);
  const results: Reroute[] = [];

  // Scan both the main plans dir and the completed subdirectory
  const scanTargets: { dir: string; base: string }[] = [];
  if (existsSync(plansDir)) {
    scanTargets.push({ dir: plansDir, base: plansBase });
  }
  const completedDir = join(plansDir, 'completed');
  if (existsSync(completedDir)) {
    scanTargets.push({ dir: completedDir, base: `${plansBase}/completed` });
  }

  for (const target of scanTargets) {
    const dirs = readdirSync(target.dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'completed');

    for (const d of dirs) {
      // v7 plans (plan.json-native) are discovered by loadV7Plans(), not here.
      if (existsSync(join(target.dir, d.name, 'plan.json'))) continue;
      const indexPath = join(target.dir, d.name, 'index.md');
      if (!existsSync(indexPath)) continue;

      const content = readFileSync(indexPath, 'utf-8');
      if (!content.startsWith('---')) continue;

      const endIndex = content.indexOf('---', 3);
      if (endIndex === -1) continue;

      const yamlStr = content.slice(3, endIndex);
      const parsed = parseYamlFrontmatter(yamlStr) as unknown as Record<string, unknown>;
      if (!parsed || !predicate(parsed)) continue;
      // Public-website surface: hide plans marked `visibility: private` (tooling /
      // workflow / infra). Absent visibility = treated as public (denylist).
      if (parsed.visibility === 'private') continue;

      const dir = d.name;
      const key = dir.replace(/_/g, '-');
      const order = typeof parsed.order === 'number' ? parsed.order : 999;

      // Normalize legacy status vocab onto the track-pill three-state.
      const rawStatus = normalizeStatus(String(parsed.status ?? ''));
      const status: 'active' | 'queued' | 'resolved' =
        rawStatus === 'resolved' || rawStatus === 'complete' || rawStatus === 'completed' ? 'resolved' :
        rawStatus === 'active' || rawStatus === 'in-progress' ? 'active' : 'queued';

      // `name:` is a slug-like short key by convention; humanize for display.
      const rawName = (parsed.name as string) || dir;
      const name = /^[a-z0-9_-]+$/.test(rawName) ? humanizeSlug(rawName) : rawName;

      results.push({
        name,
        fullName: (parsed.full_name as string) || name,
        status,
        order,
        key,
        dir,
        basePath: target.base,
        format: 'md',
      });
    }
  }

  // Sort: active first, then queued, then resolved; within same status, by order
  const statusOrder: Record<string, number> = { active: 0, queued: 1, resolved: 2 };
  results.sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (statusDiff !== 0) return statusDiff;
    return a.order - b.order;
  });

  return results;
}

export function loadReroutes(plansBase: string = '../plans'): Reroute[] {
  return scanPlanDirs(plansBase, (parsed) => parsed.reroute === true);
}

export const reroutes: Reroute[] = loadReroutes();

// ============================================================================
// Parallel Plan Registry (loaded from plan index.md frontmatter)
// ============================================================================

/**
 * Scan plan directories for index.md files with `parallel: true` frontmatter.
 * Same shape as reroutes — just a different discriminator field.
 */
export function loadParallelPlans(plansBase: string = '../plans'): Reroute[] {
  return scanPlanDirs(plansBase, (parsed) => parsed.parallel === true);
}

export const parallelPlans: Reroute[] = loadParallelPlans();

// ============================================================================
// v7 Plan Registry (plan.json-native plans)
// ============================================================================

interface V7PlanJson {
  plan_id?: string;
  status?: string;
  visibility?: string;
  sections?: Array<Record<string, unknown>>;
  work_items?: Array<Record<string, unknown>>;
}

/** Read and parse a v7 plan.json. Returns null when absent or invalid. */
export function readV7PlanJson(planDir: string): V7PlanJson | null {
  const planJsonPath = join(planDir, 'plan.json');
  if (!existsSync(planJsonPath)) return null;
  try {
    return JSON.parse(readFileSync(planJsonPath, 'utf-8')) as V7PlanJson;
  } catch {
    return null;
  }
}

/** Map a v7 plan status onto the track-pill status vocabulary. */
function v7TrackStatus(status: string | undefined): 'active' | 'queued' | 'resolved' {
  if (status === 'completed') return 'resolved';
  if (status === 'in-progress') return 'active';
  return 'queued';
}

/**
 * Discover public v7 (plan.json-native) plans under plansBase and
 * plansBase/completed. The roadmap plan is excluded — it renders natively
 * at /roadmap/ rather than as a plan track.
 */
export function loadV7Plans(plansBase: string = '../plans'): Reroute[] {
  const plansDir = resolve(process.cwd(), plansBase);
  const results: Reroute[] = [];

  const scanTargets: { dir: string; base: string }[] = [];
  if (existsSync(plansDir)) {
    scanTargets.push({ dir: plansDir, base: plansBase });
  }
  const completedDir = join(plansDir, 'completed');
  if (existsSync(completedDir)) {
    scanTargets.push({ dir: completedDir, base: `${plansBase}/completed` });
  }

  for (const target of scanTargets) {
    const dirs = readdirSync(target.dir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'completed');

    for (const d of dirs) {
      const plan = readV7PlanJson(join(target.dir, d.name));
      if (!plan) continue;
      // Public-website surface: hide private (tooling / workflow / infra) plans.
      if (plan.visibility === 'private') continue;
      if (plan.plan_id === 'roadmap') continue;
      if (plan.status === 'superseded' || plan.status === 'abandoned') continue;

      const dir = d.name;
      const key = dir.replace(/_/g, '-');
      const name = humanizeSlug(dir);

      results.push({
        name,
        fullName: name,
        status: v7TrackStatus(plan.status),
        order: 999,
        key,
        dir,
        basePath: target.base,
        format: 'v7',
      });
    }
  }

  const statusOrder: Record<string, number> = { active: 0, queued: 1, resolved: 2 };
  results.sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (statusDiff !== 0) return statusDiff;
    return a.name.localeCompare(b.name);
  });

  return results;
}

export const v7Plans: Reroute[] = loadV7Plans();

/**
 * Unified public plan registry: legacy reroute + parallel plans and v7 plans,
 * sorted active -> queued -> resolved. This is the single list the website
 * renders; private plans are already filtered out by both scanners.
 */
export const publicPlans: Reroute[] = (() => {
  const all = [...reroutes, ...parallelPlans, ...v7Plans];
  const statusOrder: Record<string, number> = { active: 0, queued: 1, resolved: 2 };
  all.sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
    if (statusDiff !== 0) return statusDiff;
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
  return all;
})();

// ============================================================================
// v7 Section Loading (sections[] + work_items[] from plan.json)
// ============================================================================

export interface V7Section {
  slug: string;
  title: string;
  goal?: string;
  status: 'complete' | 'partial' | 'not-started';
  done: number;   // completed + superseded work items
  total: number;  // all work items in the section
  order: number;  // 1-based position in lexorank order
  bodyRef?: string;
}

/** Map a v7 section status onto the website's three-state vocabulary. */
export function v7SectionStatus(status: string | undefined): 'complete' | 'partial' | 'not-started' {
  if (status === 'completed') return 'complete';
  if (status === 'in-progress') return 'partial';
  return 'not-started';
}

/**
 * Extract a display title and goal line from a v7 section content sidecar.
 * Title = first `# ` heading (legacy `Section NN:` prefix stripped);
 * goal = first `**Goal**:` line.
 */
export function extractSidecarMeta(planDir: string, bodyRef: string): { title?: string; goal?: string } {
  const sidecarPath = join(planDir, bodyRef);
  if (!existsSync(sidecarPath)) return {};
  const content = readFileSync(sidecarPath, 'utf-8');

  let title: string | undefined;
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    title = headingMatch[1]
      .replace(/^Section\s+[\w.]+:\s*/i, '')   // "Section 7D: " prefix
      .replace(/^s\d+[A-Z]?\s*[—–:-]+\s*/, '') // "s00 — " prefix
      .trim();
  }

  let goal: string | undefined;
  const goalMatch = content.match(/^\*\*Goal\*\*:?\s*(.+)$/m);
  if (goalMatch) {
    goal = goalMatch[1]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // markdown links -> text
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim();
  }

  return { title, goal };
}

/**
 * Load a v7 plan's sections with work-item progress rollups, sorted by
 * lexorank key. Superseded/abandoned sections are excluded.
 */
export function loadV7Sections(planDir: string): V7Section[] {
  const plan = readV7PlanJson(planDir);
  if (!plan || !Array.isArray(plan.sections)) return [];

  const doneBySection: Record<string, number> = {};
  const totalBySection: Record<string, number> = {};
  for (const wi of (Array.isArray(plan.work_items) ? plan.work_items : [])) {
    if (!wi || typeof wi !== 'object') continue;
    const sid = String(wi.section_id ?? '');
    totalBySection[sid] = (totalBySection[sid] ?? 0) + 1;
    if (wi.status === 'completed' || wi.status === 'superseded') {
      doneBySection[sid] = (doneBySection[sid] ?? 0) + 1;
    }
  }

  const sections = plan.sections
    .filter(s => s && typeof s === 'object')
    .filter(s => s.status !== 'superseded' && s.status !== 'abandoned')
    .sort((a, b) => String(a.key ?? '').localeCompare(String(b.key ?? '')));

  return sections.map((s, i) => {
    const slug = String(s.slug ?? s.id ?? `section-${i + 1}`);
    const bodyRef = typeof s.body_ref === 'string' ? s.body_ref : undefined;
    const meta = bodyRef ? extractSidecarMeta(planDir, bodyRef) : {};
    const sid = String(s.id ?? '');
    return {
      slug,
      title: meta.title ?? humanizeSlug(slug),
      goal: meta.goal,
      status: v7SectionStatus(s.status as string | undefined),
      done: doneBySection[sid] ?? 0,
      total: totalBySection[sid] ?? 0,
      order: i + 1,
      bodyRef,
    };
  });
}

// ============================================================================
// YAML Frontmatter Parser
// ============================================================================

interface YamlSection {
  id: string;
  title: string;
  status: string;
}

export interface YamlFrontmatter {
  section: number | string;
  title: string;
  status: string;
  tier?: number;
  goal: string;
  spec?: string | string[];
  inspired_by?: string[];
  depends_on?: string[];
  sections: YamlSection[];
}

/**
 * Parse simple YAML frontmatter (handles our specific schema).
 * Supports top-level key: value pairs, simple arrays, and arrays of objects.
 */
export function parseYamlFrontmatter(yaml: string): YamlFrontmatter | null {
  const lines = yaml.trim().split('\n');
  const result: Record<string, unknown> = {};
  let currentKey = '';
  let currentArray: unknown[] | null = null;
  let currentObject: Record<string, unknown> | null = null;
  let inArray = false;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Check for array item (starts with "  - ")
    const arrayItemMatch = line.match(/^(\s*)- (.+)$/);
    if (arrayItemMatch) {
      const [, indent, value] = arrayItemMatch;
      const indentLevel = indent.length;

      // `- id: ...` starts an object item REGARDLESS of the dash indent
      // (plan section `sections:` block sequences sit at indent 0, e.g.
      // `- id: '09.1'`). Gating on `indentLevel >= 2` mis-pushed indent-0
      // object items as strings → Zod "expected object, received string".
      const objectMatch = value.match(/^(\w+):\s*(.*)$/);
      if (objectMatch && objectMatch[1] === 'id') {
        const val = objectMatch[2];
        if (currentObject && currentArray) {
          currentArray.push(currentObject);
        }
        currentObject = { id: val.replace(/^["']|["']$/g, '') };
      } else if (objectMatch && currentObject) {
        const [, key, val] = objectMatch;
        currentObject[key] = val.replace(/^["']|["']$/g, '');
      } else if (inArray && currentArray) {
        currentArray.push(value.trim());
      }
      continue;
    }

    // Check for indented object property (continuation of array object).
    // Plan section object props sit at indent 2 (`  title:` / `  status:`
    // under a `- id:` at indent 0), so accept indent >= 2 (not >= 4).
    const indentedKvMatch = line.match(/^(\s+)(\w+):\s*(.*)$/);
    if (indentedKvMatch && currentObject) {
      const [, indent, key, val] = indentedKvMatch;
      if (indent.length >= 2) {
        currentObject[key] = val.replace(/^["']|["']$/g, '');
        continue;
      }
    }

    // Top-level key: value
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      if (currentKey && currentArray) {
        if (currentObject) {
          currentArray.push(currentObject);
          currentObject = null;
        }
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const [, key, value] = kvMatch;
      currentKey = key;

      if (value === '' || value === undefined) {
        currentArray = [];
        inArray = true;
      } else if (value === '[]') {
        // Inline empty array syntax
        result[key] = [];
        inArray = false;
      } else if (value.startsWith('[')) {
        // Inline array syntax: ["a", "b"] or [a, b] — strip trailing YAML comments
        const lastBracket = value.lastIndexOf(']');
        if (lastBracket !== -1) {
          const inner = value.slice(1, lastBracket).trim();
          if (inner === '') {
            result[key] = [];
          } else {
            result[key] = inner.split(',').map(item =>
              item.trim().replace(/^["']|["']$/g, '')
            );
          }
        } else {
          result[key] = [];
        }
        inArray = false;
      } else {
        let parsed: unknown = value.replace(/^["']|["']$/g, '');
        if (parsed === 'true') parsed = true;
        else if (parsed === 'false') parsed = false;
        else if (/^\d+$/.test(parsed as string)) parsed = parseInt(parsed as string, 10);
        result[key] = parsed;
        inArray = false;
      }
    }
  }

  if (currentKey && currentArray) {
    if (currentObject) {
      currentArray.push(currentObject);
    }
    result[currentKey] = currentArray;
  }

  // Normalize "subsections" to "sections" (some plan files use either)
  if (!result.sections && result.subsections) {
    result.sections = result.subsections;
    delete result.subsections;
  }

  return result as unknown as YamlFrontmatter;
}

// ============================================================================
// Task Extraction
// ============================================================================

/**
 * Extract tasks from markdown body by parsing checkboxes under section headers.
 * Returns a map of section ID -> tasks.
 */
export function extractTasksFromBody(body: string): Map<string, Task[]> {
  const result = new Map<string, Task[]>();
  const lines = body.split('\n');

  let currentSectionId = '';
  let currentTasks: Task[] = [];

  for (const line of lines) {
    // Match section headers: digits, uppercase letters, dots in any combination
    const sectionMatch = line.match(/^##\s+([\dA-Z.]+)\s+(.+)/);
    if (sectionMatch) {
      if (currentSectionId) {
        result.set(currentSectionId, currentTasks);
      }
      currentSectionId = sectionMatch[1];
      currentTasks = [];
      continue;
    }

    // Match: - [x] **Verb**: Description text — optional spec reference
    const checkboxMatch = line.match(/^-\s+\[([ xX])\]\s+\*\*(.+?)\*\*:?\s*(.*)/);
    if (checkboxMatch && currentSectionId) {
      const done = checkboxMatch[1].toLowerCase() === 'x';
      const verb = checkboxMatch[2].trim();
      const description = checkboxMatch[3]
        ?.replace(/\s*—\s*spec\/.*$/, '')
        ?.replace(/\s*—\s*[A-Za-z\/]+\.md.*$/, '')
        ?.replace(/`/g, '')
        ?.trim() || '';
      const name = description || verb;
      currentTasks.push({ name, done });
      continue;
    }

    // Fallback: Match plain checkbox without bold
    const plainCheckboxMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)/);
    if (plainCheckboxMatch && currentSectionId) {
      const done = plainCheckboxMatch[1].toLowerCase() === 'x';
      const name = plainCheckboxMatch[2]
        ?.replace(/\s*—\s*.*$/, '')
        ?.replace(/`/g, '')
        ?.trim() || '';
      if (name) {
        currentTasks.push({ name, done });
      }
    }
  }

  if (currentSectionId) {
    result.set(currentSectionId, currentTasks);
  }

  return result;
}

// ============================================================================
// Status & Task Helpers
// ============================================================================

/** Normalize status values to handle both hyphen and underscore variants. */
export function normalizeStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, '-');
}

/** Count done/total tasks across subsections. If the section is complete, treat all tasks as done. */
export function countTasks(subsections: Section[], sectionStatus?: 'complete' | 'partial' | 'not-started'): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const subsection of subsections) {
    for (const task of subsection.tasks) {
      total++;
      if (task.done) done++;
    }
  }
  if (sectionStatus === 'complete' && total > 0) {
    done = total;
  }
  return { done, total };
}

// ============================================================================
// Section File Loading
// ============================================================================

/**
 * Load and parse a single section file into a RoadmapSection.
 */
export function loadSectionFile(filepath: string): RoadmapSection | null {
  if (!existsSync(filepath)) return null;

  const content = readFileSync(filepath, 'utf-8');
  if (!content.startsWith('---')) return null;

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return null;

  const frontmatterStr = content.slice(3, endIndex);
  const body = content.slice(endIndex + 3);

  const frontmatter = parseYamlFrontmatter(frontmatterStr);
  if (!frontmatter) return null;

  const tasksMap = extractTasksFromBody(body);

  const subsections: Section[] = (frontmatter.sections || []).map(s => ({
    name: `${s.id} ${s.title}`,
    tasks: tasksMap.get(s.id) || [],
  }));

  let doneCount = 0, totalCount = 0;
  for (const subsection of subsections) {
    for (const task of subsection.tasks) {
      totalCount++;
      if (task.done) doneCount++;
    }
  }

  const normalizedStatus = normalizeStatus(frontmatter.status);
  const status: 'complete' | 'partial' | 'not-started' =
    normalizedStatus === 'complete' ? 'complete' :
    normalizedStatus === 'in-progress' ? 'partial' : 'not-started';

  const filename = basename(filepath, '.md');

  return {
    num: frontmatter.section,
    slug: filename.toLowerCase(),
    name: frontmatter.title,
    status,
    note: totalCount > 0 ? `${doneCount}/${totalCount} tasks` : undefined,
    goal: frontmatter.goal,
    spec: Array.isArray(frontmatter.spec) ? frontmatter.spec.join(', ') : frontmatter.spec,
    subsections,
  };
}

/**
 * Load all section-*.md files from a directory into a sorted list.
 */
export function loadAllSections(dir: string): RoadmapSection[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter(f => f.startsWith('section-') && f.endsWith('.md'))
    .sort();

  const sections: RoadmapSection[] = [];
  for (const file of files) {
    const section = loadSectionFile(join(dir, file));
    if (section) sections.push(section);
  }
  return sections;
}

/** Look up a reroute by its URL key. */
export function findRerouteByKey(key: string): Reroute | undefined {
  return reroutes.find(r => r.key === key);
}

/** Look up any public plan (legacy or v7) by its URL key. */
export function findPlanByKey(key: string): Reroute | undefined {
  return publicPlans.find(p => p.key === key);
}

// ============================================================================
// Mission Extraction
// ============================================================================

/**
 * Extract the `## Mission` section from a plan's 00-overview.md.
 * Returns the text content (without the heading), or null if not found.
 */
export function loadMission(planDir: string): string | null {
  // Legacy plans: `## Mission` section inside 00-overview.md.
  const overviewPath = join(planDir, '00-overview.md');
  if (existsSync(overviewPath)) {
    let content = readFileSync(overviewPath, 'utf-8');

    // Skip frontmatter if present
    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        content = content.slice(endIndex + 3);
      }
    }

    // Find ## Mission heading
    const missionMatch = content.match(/^## Mission\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/m);
    if (!missionMatch) return null;

    const text = missionMatch[1].trim();
    return text || null;
  }

  // v7 plans: standalone mission.md at the plan root.
  const missionPath = join(planDir, 'mission.md');
  if (existsSync(missionPath)) {
    let content = readFileSync(missionPath, 'utf-8');
    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        content = content.slice(endIndex + 3);
      }
    }
    // Drop the top-level heading; keep the first few paragraphs.
    content = content.replace(/^\s*#\s+.+$/m, '').trim();
    const paragraphs = content.split(/\n\n+/).slice(0, 3).join('\n\n').trim();
    return paragraphs || null;
  }

  return null;
}

/**
 * Convert basic inline markdown to HTML for `set:html` rendering.
 * Handles **bold**, *italic*, `code`, and paragraph breaks.
 */
export function inlineMarkdownToHtml(md: string): string {
  const paragraphs = md.split(/\n\n+/);
  return paragraphs
    .map(p => {
      let html = p.trim();
      // Code spans first (to avoid nested transforms)
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      // Bold
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Wrap single newlines as line continuation
      html = html.replace(/\n/g, ' ');
      return `<p>${html}</p>`;
    })
    .join('\n');
}
