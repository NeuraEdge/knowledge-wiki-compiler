/**
 * Validate untrusted editorial plans before retrieval or authorship. Diagnostics
 * identify contract paths without echoing document content or model prose.
 */
import type { HostedPagePlan } from './hosted-types.js';

/** Reject one field without losing its location in a potentially large plan. */
function invalid(path: string, requirement: string): never {
  throw new Error(`Wiki planning: ${path} ${requirement}`);
}

/** Check content and identities before resolving references across the complete plan. */
function validatePageContent(page: HostedPagePlan, path: string, ids: Set<string>): void {
  if (!page || typeof page !== 'object' || Array.isArray(page)) invalid(path, 'must be an object');
  validatePageIdentity(page.id, path, ids);
  for (const field of ['title', 'summary', 'query'] as const) {
    if (typeof page[field] !== 'string' || !page[field].trim()) invalid(`${path}.${field}`, 'must be a nonempty string');
  }
  if (!['topic', 'concept', 'open-question'].includes(page.type)) invalid(`${path}.type`, 'must be topic, concept, or open-question');
}

/** Identity is independent of display titles and must not collide with compiler-owned pages. */
function validatePageIdentity(id: unknown, path: string, ids: Set<string>): void {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(id)) invalid(`${path}.id`, 'must match ^[a-z0-9][a-z0-9-]*$');
  if (ids.has(id) || id === 'overview') invalid(`${path}.id`, 'must be unique and not reserved overview');
  ids.add(id);
}

/** Array membership never coerces model-authored IDs to valid source or page identities. */
function validReferences(value: unknown, allowed: Set<string>, excluded?: string): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && allowed.has(id) && id !== excluded);
}

/** Sources and links use separate registries and have different cardinality rules. */
function validatePageScope(page: HostedPagePlan, path: string, sources: Set<string>, ids: Set<string>): void {
  if (!validReferences(page.sourceIds, sources) || !page.sourceIds.length) {
    invalid(`${path}.sourceIds`, 'must be a nonempty array within the supplied source scope');
  }
  if (!validReferences(page.relatedIds, ids, page.id)) {
    invalid(`${path}.relatedIds`, 'must reference other page IDs in this plan; use [] when there are none');
  }
}

/** A plan is accepted whole; invalid pages and unauthorized sources are never dropped. */
function validateHostedPlan(value: unknown, allowedSources: Set<string>): HostedPagePlan[] {
  const pages = value && typeof value === 'object' && 'pages' in value ? value.pages : undefined;
  if (!Array.isArray(pages) || !pages.length) invalid('pages', 'must be a nonempty array');
  const ids = new Set<string>();
  pages.forEach((page, index) => validatePageContent(page, `pages[${index}]`, ids));
  pages.forEach((page, index) => validatePageScope(page, `pages[${index}]`, allowedSources, ids));
  return pages as HostedPagePlan[];
}

/** Normalize syntax errors into a safe, actionable contract diagnostic. */
export function parseHostedPlan(raw: string, allowedSources: Set<string>): HostedPagePlan[] {
  let value: unknown;
  try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')); }
  catch { invalid('response', 'must be valid JSON'); }
  return validateHostedPlan(value, allowedSources);
}
