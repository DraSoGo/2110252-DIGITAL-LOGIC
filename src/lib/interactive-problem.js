export function resolveInteractiveProblem(problems, search) {
  const id = new URLSearchParams(search).get('problem');
  if (!id) return { problem: null, error: 'missing-problem' };
  const problem = problems.find((candidate) => candidate.id === id);
  if (!problem) return { problem: null, error: 'unknown-problem' };
  if (!problem.dig) return { problem: null, error: 'missing-solution' };
  return { problem, error: null };
}

export function interactivePageHref(id, base = document.baseURI) {
  const url = new URL('interactive.html', base);
  url.searchParams.set('problem', id);
  return url.href;
}
