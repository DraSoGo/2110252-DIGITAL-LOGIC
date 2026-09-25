export function buildTree(problems) {
  const root = { name: '', path: '', children: [], problems: [] };
  for (const problem of problems) {
    let node = root;
    for (const segment of problem.groupPath) {
      let child = node.children.find((candidate) => candidate.name === segment);
      if (!child) {
        child = { name: segment, path: node.path ? `${node.path}/${segment}` : segment, children: [], problems: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.problems.push(problem);
  }
  numberSiblings(root.children);
  return root.children;
}

// Codes restart per parent. Sibling order comes from the manifest, which is
// config-driven (group.json / metadata.json order fields) — never re-sorted
// by name here.
function numberSiblings(nodes, offset = 0) {
  nodes.forEach((node, index) => {
    node.code = String(offset + index + 1).padStart(2, '0');
    numberSiblings(node.children);
  });
}

export function countTree(node) {
  let count = node.problems?.length || 0;
  if (node.children) for (const child of node.children) count += countTree(child);
  return count;
}

export function filterProblems(problems, { query }) {
  if (!query) return problems;
  // Both sides are underscore-normalised so "Lab_03" matches "Lab 03" and
  // legacy alias spellings keep working in search.
  const words = query.toLowerCase().replace(/_/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return problems;
  return problems.filter((problem) => {
    const haystack = [problem.title, problem.id, ...(problem.aliases || []), ...(problem.groupPath || [])]
      .join(' ')
      .toLowerCase()
      .replace(/_/g, ' ');
    return words.every((word) => haystack.includes(word));
  });
}

export function pageRoute(hash) {
  const stripped = hash.replace(/^#/, '');
  const match = stripped.match(/^\/problem\/(.+)$/);
  if (match) return { page: 'problem', problemId: decodeURIComponent(match[1]) };
  return { page: 'overview', problemId: null };
}

export function summarize(problems) {
  return {
    problems: problems.length,
    groups: new Set(problems.flatMap((problem) => problem.groupPath)).size,
    pdfs: problems.filter((problem) => problem.pdf).length,
    digs: problems.filter((problem) => problem.dig).length,
    notes: problems.filter((problem) => problem.ods || problem.csv).length,
  };
}

/** Resolves a route id: canonical id first, then any registered alias. */
export function resolveProblemByIdOrAlias(problems, idOrAlias) {
  if (!idOrAlias) return null;
  return problems.find((p) => p.id === idOrAlias || (Array.isArray(p.aliases) && p.aliases.includes(idOrAlias))) || null;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const length = text.length;

  function pushField() {
    row.push(field);
    field = '';
  }

  function pushRow() {
    if (row.length || field) {
      pushField();
      rows.push(row);
      row = [];
    }
  }

  while (i < length) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i += 1;
      } else if (char === ',') {
        pushField();
        i += 1;
      } else if (char === '\r' && next === '\n') {
        pushRow();
        i += 2;
      } else if (char === '\n') {
        pushRow();
        i += 1;
      } else {
        field += char;
        i += 1;
      }
    }
  }

  if (row.length || field) pushRow();
  return rows;
}
