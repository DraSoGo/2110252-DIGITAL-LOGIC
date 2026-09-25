import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const JUNK_PATTERN = /^(desktop\.ini|\.~lock\..*#)$/;
const CANONICAL = {
  statement: 'statement.pdf',
  dig: 'solution.dig',
  ods: 'note.ods',
  csv: 'note.csv',
};

export class ContentError extends Error {
  constructor(message, { file = null, field = null } = {}) {
    super(message);
    this.name = 'ContentError';
    this.file = file;
    this.field = field;
  }
}

export async function readJsonFile(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new ContentError(`cannot read config: ${error.message}`, { file: filePath });
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ContentError(`malformed JSON: ${error.message}`, { file: filePath });
  }
}

export function validateGroupConfig(config, { file }) {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new ContentError('group.json must be a JSON object', { file });
  }
  if (config.schemaVersion !== 1) {
    throw new ContentError(`unsupported schemaVersion: ${JSON.stringify(config.schemaVersion)}`, { file, field: 'schemaVersion' });
  }
  if (typeof config.id !== 'string' || !config.id.trim()) {
    throw new ContentError('id must be a non-empty string', { file, field: 'id' });
  }
  if (typeof config.title !== 'string' || !config.title.trim()) {
    throw new ContentError('title must be a non-empty string', { file, field: 'title' });
  }
  if (!Number.isInteger(config.order) || config.order < 0) {
    throw new ContentError('order must be an integer >= 0', { file, field: 'order' });
  }
  return config;
}

export function validateProblemConfig(config, { file }) {
  validateGroupConfig(config, { file }); // same primitive fields
  if (!Array.isArray(config.aliases) || config.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) {
    throw new ContentError('aliases must be an array of non-empty strings', { file, field: 'aliases' });
  }
  if (config.kind !== undefined && typeof config.kind !== 'string') {
    throw new ContentError('kind must be a string when present', { file, field: 'kind' });
  }
  return config;
}

/**
 * Reads canonical resources from a problem directory. `dir` is the absolute
 * path for filesystem access; `relative` is the repo-relative path used in
 * the manifest record. Throws on non-canonical or conflicting resources.
 */
export async function detectCanonicalResources(dir, relative, { file }) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const subdirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
  const warnings = [];
  const errors = [];

  for (const subdir of subdirs) {
    warnings.push(`ignored subdirectory in problem directory: ${subdir.name}`);
  }
  for (const entry of files) {
    if (JUNK_PATTERN.test(entry.name)) {
      warnings.push(`ignored system file: ${entry.name}`);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (lower.endsWith('.pdf') && entry.name !== CANONICAL.statement) errors.push(`non-canonical PDF: ${entry.name} (rename to statement.pdf)`);
    else if (lower.endsWith('.dig') && entry.name !== CANONICAL.dig) errors.push(`non-canonical DIG: ${entry.name} (rename to solution.dig)`);
    else if ((lower.endsWith('.ods') || lower.endsWith('.csv')) && entry.name !== CANONICAL.ods && entry.name !== CANONICAL.csv) {
      errors.push(`non-canonical note: ${entry.name} (rename to note.ods or note.csv)`);
    } else if (!Object.values(CANONICAL).includes(entry.name) && entry.name !== 'metadata.json') {
      warnings.push(`unexpected file in problem directory: ${entry.name}`);
    }
  }
  if (files.some((f) => f.name === CANONICAL.ods) && files.some((f) => f.name === CANONICAL.csv)) {
    errors.push('problem has both note.ods and note.csv — exactly one note type is allowed');
  }

  const has = (name) => files.some((f) => f.name === name);
  const resources = {
    pdf: has(CANONICAL.statement) ? `${relative}/${CANONICAL.statement}` : null,
    dig: has(CANONICAL.dig) ? `${relative}/${CANONICAL.dig}` : null,
    ods: has(CANONICAL.ods) ? `${relative}/${CANONICAL.ods}` : null,
    csv: has(CANONICAL.csv) ? `${relative}/${CANONICAL.csv}` : null,
  };
  if (!resources.pdf && !resources.dig) {
    errors.push('problem must have statement.pdf or solution.dig');
  }
  if (errors.length) throw new ContentError(errors.join('; '), { file });
  return { resources, warnings };
}

export function validateSiblingOrders(siblings, { type, parent }) {
  const seen = new Map();
  for (const item of siblings) {
    if (seen.has(item.order)) {
      const other = seen.get(item.order);
      throw new ContentError(`duplicate ${type} order ${item.order} in ${parent}: ${other.id} and ${item.id}`, { file: item.file, field: 'order' });
    }
    seen.set(item.order, item);
  }
}

export function buildProblemRecord(config, resources, groupPath) {
  return {
    id: config.id,
    aliases: config.aliases,
    title: config.title,
    kind: config.kind ?? null,
    order: config.order,
    groupPath,
    pdf: resources.pdf,
    dig: resources.dig,
    ods: resources.ods,
    csv: resources.csv,
    hasNote: Boolean(resources.ods || resources.csv),
  };
}

async function hasMetadata(dir) {
  try {
    await stat(path.join(dir, 'metadata.json'));
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Recursively scans <root>/<contentRoot>. Config is the source of truth: a
 * directory is a problem iff it contains metadata.json (recursion stops
 * there); every other directory is a group and must contain group.json.
 * IDs, titles and ordering come from configs, never from folder names.
 */
export async function scanContent(root, { contentRoot = 'content' } = {}) {
  const contentDir = path.join(root, contentRoot);
  if (!(await isDirectory(contentDir))) {
    throw new ContentError(`content root not found: ${contentRoot}/`);
  }

  const problems = [];
  const groups = [];
  const warnings = [];

  async function scanGroup(dir, relative, groupTitles, parentLabel, isRoot) {
    const groupChildren = [];
    const problemChildren = [];
    const errors = [];

    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = path.join(dir, entry.name);
      const entryRelative = relative ? `${relative}/${entry.name}` : `${contentRoot}/${entry.name}`;
      if (entry.isDirectory()) {
        if (await hasMetadata(entryPath)) problemChildren.push({ dir: entryPath, relative: entryRelative });
        else groupChildren.push({ dir: entryPath, relative: entryRelative });
      } else if (entry.isFile()) {
        if (!isRoot && entry.name === 'group.json') continue; // the group's own config
        if (JUNK_PATTERN.test(entry.name)) {
          warnings.push(`ignored system file: ${entryRelative}`);
          continue;
        }
        const lower = entry.name.toLowerCase();
        if (/\.(pdf|dig|ods|csv)$/.test(lower)) {
          errors.push(`orphan resource in group directory: ${entryRelative} (problems must live in their own folder with metadata.json)`);
        } else {
          warnings.push(`unexpected file in group directory: ${entryRelative}`);
        }
      }
    }
    if (errors.length) throw new ContentError(errors.join('; '), { file: relative });

    const readConfigs = async (children, filename, validate) => {
      const loaded = [];
      for (const child of children) {
        const configPath = path.join(child.dir, filename);
        const config = validate(await readJsonFile(configPath), { file: configPath });
        loaded.push({ ...child, config, configPath });
      }
      return loaded;
    };

    const loadedGroups = await readConfigs(groupChildren, 'group.json', validateGroupConfig);
    validateSiblingOrders(loadedGroups.map((g) => ({ order: g.config.order, id: g.config.id, file: g.configPath })), { type: 'group', parent: parentLabel });

    const loadedProblems = await readConfigs(problemChildren, 'metadata.json', validateProblemConfig);
    validateSiblingOrders(loadedProblems.map((p) => ({ order: p.config.order, id: p.config.id, file: p.configPath })), { type: 'problem', parent: parentLabel });

    // Traversal order comes from config order, not folder names.
    loadedGroups.sort((a, b) => a.config.order - b.config.order);
    for (const child of loadedGroups) {
      groups.push({ config: child.config, file: child.configPath, relative: child.relative });
      await scanGroup(child.dir, child.relative, [...groupTitles, child.config.title], child.config.id, false);
    }

    loadedProblems.sort((a, b) => a.config.order - b.config.order);
    for (const child of loadedProblems) {
      const { resources, warnings: problemWarnings } = await detectCanonicalResources(child.dir, child.relative, { file: child.configPath });
      problems.push(buildProblemRecord(child.config, resources, groupTitles));
      for (const warning of problemWarnings) warnings.push(`${child.relative}: ${warning}`);
    }
  }

  await scanGroup(contentDir, '', [], '(root)', true);

  // --- cross-record validation (two passes so ordering never hides a clash) ---
  const idOwners = new Map();
  for (const problem of problems) {
    if (idOwners.has(problem.id)) throw new ContentError(`duplicate problem id: ${problem.id}`, { field: 'id' });
    idOwners.set(problem.id, problem.id);
  }
  const aliasOwners = new Map();
  for (const problem of problems) {
    for (const alias of problem.aliases) {
      if (idOwners.has(alias) && idOwners.get(alias) !== problem.id) {
        throw new ContentError(`alias "${alias}" of ${problem.id} collides with the canonical id of ${idOwners.get(alias)}`, { field: 'aliases' });
      }
      if (aliasOwners.has(alias) && aliasOwners.get(alias) !== problem.id) {
        throw new ContentError(`duplicate alias: ${alias} (used by ${aliasOwners.get(alias)} and ${problem.id})`, { field: 'aliases' });
      }
      aliasOwners.set(alias, problem.id);
    }
  }
  const groupIds = new Set();
  for (const group of groups) {
    if (groupIds.has(group.config.id)) throw new ContentError(`duplicate group id: ${group.config.id}`, { file: group.file, field: 'id' });
    groupIds.add(group.config.id);
  }

  return { problems, groups, warnings };
}

// Legacy export kept for older callers.
export async function scanProblemLibrary(root) {
  const { problems } = await scanContent(root);
  return problems;
}

/** Augments manifest records with generated-asset paths (SVG + note HTML). */
export function buildSiteRecords(problems) {
  const flat = (id) => id.split('/').join('__');
  return problems.map((p) => ({
    ...p,
    svg: p.dig ? `generated/svg/${flat(p.id)}.svg` : null,
    note: p.ods || p.csv ? `generated/note/${flat(p.id)}.html` : null,
  }));
}
