export function prettifyTitle(name) {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

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
  return sortTree(root).children;
}

function sortTree(node) {
  node.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  node.problems.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  for (const child of node.children) sortTree(child);
  return node;
}

export function countTree(node) {
  let count = node.problems?.length || 0;
  if (node.children) for (const child of node.children) count += countTree(child);
  return count;
}

export function filterProblems(problems, { query }) {
  if (!query) return problems;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return problems;
  return problems.filter((problem) => {
    const haystack = `${problem.title} ${problem.id}`.toLowerCase().replace(/_/g, ' ');
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
