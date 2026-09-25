import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const JUNK = /^(desktop\.ini|\.~lock\..*#)$/;

async function exists(target) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}

function naturalSort(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

export function prettify(name) {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Recursively scans a content root. A folder is a problem when it directly
 * contains a .dig or .pdf file; every folder above it becomes a group.
 */
export async function scanProblemLibrary(root, { ignoredFolders = [] } = {}) {
  const ignored = new Set(['.git', '.github', 'tools', 'generated', 'data', 'src', 'scripts', 'test', 'dist', 'node_modules', ...ignoredFolders]);
  const problems = [];

  async function scan(dir, prefix) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.') && !JUNK.test(entry.name)).sort(naturalSort);
    const folders = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !ignored.has(entry.name)).sort(naturalSort);

    if (files.some((f) => /\.dig$/i.test(f.name)) || files.some((f) => /\.pdf$/i.test(f.name))) {
      const first = (ext) => {
        const file = files.find((f) => f.name.toLowerCase().endsWith(ext));
        return file ? `${prefix}/${file.name}` : null;
      };
      const pdf = first('.pdf');
      const dig = first('.dig');
      const ods = first('.ods');
      const csv = first('.csv');
      const segments = prefix ? prefix.split('/') : [];
      problems.push({
        id: prefix,
        title: prettify(path.basename(prefix)),
        groupPath: segments.slice(0, -1),
        pdf,
        dig,
        ods,
        csv,
        hasNote: Boolean(ods || csv),
      });
      return; // problem folders are leaves: do not recurse into them
    }

    for (const folder of folders) {
      await scan(path.join(dir, folder.name), prefix ? `${prefix}/${folder.name}` : folder.name);
    }
  }

  await scan(root, '');
  return problems;
}
