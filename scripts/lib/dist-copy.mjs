import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

// Files that must never reach dist/: runtime only consumes generated
// manifests, so configs, system junk and lock files stay behind.
const EXCLUDED_FILES = new Set(['metadata.json', 'group.json', 'desktop.ini']);

/**
 * Copies the content tree into dist/content without config files or junk.
 * Preserves the folder structure so canonical resource paths in site.json
 * resolve identically in dev, dist preview and GitHub Pages subpaths.
 */
export async function copyContentTree(contentDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  let copied = 0;

  async function walk(dir, relative) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.includes('~lock')) continue;
      const source = path.join(dir, entry.name);
      const targetRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await mkdir(path.join(targetDir, targetRelative), { recursive: true });
        await walk(source, targetRelative);
      } else if (entry.isFile() && !EXCLUDED_FILES.has(entry.name)) {
        await cp(source, path.join(targetDir, targetRelative));
        copied++;
      }
    }
  }

  await walk(contentDir, '');
  return copied;
}
