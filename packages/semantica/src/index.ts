/**
 * Compile one adopted Semantica graph's reading reports into a navigable wiki.
 * This entry has no model, parser, filesystem or extraction dependency. Reports
 * and their identities remain Semantica-owned; slugs are presentation keys only.
 */
export interface SemanticaWikiReport {
  id: string;
  entityId?: string;
  topicId?: string;
  type: string;
  title: string;
  sections: Array<{ title?: string; text: string; evidenceIds: string[] }>;
  dependsOn: string[];
}

export interface SemanticaWikiInput {
  snapshotId: string;
  inputRevision: string;
  reports: SemanticaWikiReport[];
  evidence: Array<{ id: string; sourceId: string }>;
  conflicts: Array<{ id: string; title: string; text: string; evidenceIds: string[] }>;
  relations?: Array<{ fromEntityId: string; toEntityId: string }>;
}

export interface SemanticaWikiMetadata {
  semanticaSnapshotId: string;
  semanticaEntityId?: string;
  semanticaTopicId?: string;
  semanticaReportId?: string;
  semanticaConflictId?: string;
  evidenceIds: string[];
  sourceIds: string[];
}

export interface SemanticaWikiPage {
  slug: string;
  title: string;
  body: string;
  links: string[];
  pageType: string;
  provenanceState: 'extracted' | 'ambiguous';
  metadata: SemanticaWikiMetadata;
}

function reportSlug(report: SemanticaWikiReport): string {
  if (report.type === 'overview') return 'overview';
  if (report.type === 'concept' && report.entityId) return `concept:${report.entityId}`;
  if (report.type === 'topic' && report.topicId) return `topic:${report.topicId}`;
  return `report:${report.id}`;
}

function metadata(input: SemanticaWikiInput, evidenceIds: string[]): SemanticaWikiMetadata {
  const byId = new Map(input.evidence.map(e => [e.id, e.sourceId]));
  const unique = [...new Set(evidenceIds)];
  for (const id of unique) {
    if (!byId.get(id)) throw new Error(`Missing Semantica evidence: ${id}`);
  }
  return { semanticaSnapshotId: input.snapshotId, evidenceIds: unique,
    sourceIds: [...new Set(unique.map(id => byId.get(id)!))] };
}

function reportPage(input: SemanticaWikiInput, report: SemanticaWikiReport): SemanticaWikiPage {
  return {
    slug: reportSlug(report), title: report.title, pageType: report.type,
    body: report.sections.map(section => [section.title ? `## ${section.title}` : '', section.text].filter(Boolean).join('\n\n')).join('\n\n'),
    links: [], provenanceState: 'extracted',
    metadata: { ...metadata(input, report.sections.flatMap(section => section.evidenceIds)),
      semanticaReportId: report.id,
      ...(report.entityId ? { semanticaEntityId: report.entityId } : {}),
      ...(report.topicId ? { semanticaTopicId: report.topicId } : {}) },
  };
}

function linkPages(pages: SemanticaWikiPage[], reports: SemanticaWikiReport[], warnings: string[], relations: SemanticaWikiInput['relations']) {
  const slugs = new Set(pages.map(page => page.slug));
  const byIdentity = new Map<string, string>();
  for (const report of reports) {
    for (const id of [report.id, report.entityId, report.topicId]) {
      if (id) byIdentity.set(id, reportSlug(report));
    }
  }
  for (const [index, report] of reports.entries()) {
    const page = pages[index];
    page.links = dependencyLinks(report.dependsOn, byIdentity, page.slug, warnings);
  }
  linkRelations(pages, relations);
  for (const page of pages) {
    if (page.pageType === 'overview') page.links = [...slugs].filter(slug => slug !== page.slug);
  }
}

function dependencyLinks(ids: string[], byIdentity: Map<string, string>, slug: string, warnings: string[]) {
  return [...new Set(ids.flatMap(id => {
    const target = byIdentity.get(id);
    if (target) return target === slug ? [] : [target];
    warnings.push(`Missing wiki page for Semantica dependency: ${id}`);
    return [];
  }))];
}

function linkRelations(pages: SemanticaWikiPage[], relations: SemanticaWikiInput['relations']) {
  const byEntity = new Map(pages.flatMap(page => page.metadata.semanticaEntityId ? [[page.metadata.semanticaEntityId, page] as const] : []));
  for (const relation of relations ?? []) {
    const source = byEntity.get(relation.fromEntityId);
    const target = byEntity.get(relation.toEntityId);
    if (source && target && source !== target && !source.links.includes(target.slug)) source.links.push(target.slug);
  }
}

function category(pageType: string): string {
  const type = pageType.toLowerCase();
  if (type === 'overview') return 'overview';
  if (type === 'concept' || type === 'entity') return 'concepts';
  if (['conflict', 'question', 'open-question'].includes(type)) return 'open-questions';
  return 'topics';
}

function navigation(pages: SemanticaWikiPage[]) {
  const categories = [ ['overview', 'Overview'], ['topics', 'Topics'], ['concepts', 'Concepts'], ['open-questions', 'Open questions'] ]
    .map(([id, title]) => ({ id, title, pageSlugs: pages.filter(page => category(page.pageType) === id).map(page => page.slug) }));
  const bySlug = new Map(pages.map(page => [page.slug, page]));
  const readingOutline = { root: {
    id: 'summary:root', kind: 'summary' as const, label: 'Project summary',
    children: categories.filter(item => item.pageSlugs.length).map(item => ({
      id: `category:${item.id}`, kind: 'topic' as const, label: item.title,
      children: item.pageSlugs.map(slug => ({ children: [], id: `page:${slug}`,
        kind: 'page' as const, label: bySlug.get(slug)!.title, pageSlug: slug })),
    })),
  } };
  return { categories, readingOutline };
}

/** Render only supplied report text; missing facts never trigger extraction. */
export function compileSemanticaWiki(input: SemanticaWikiInput) {
  if (!input.snapshotId.trim() || !input.inputRevision.trim()) throw new Error('Semantica snapshot identity is required');
  if (new Set(input.evidence.map(e => e.id)).size !== input.evidence.length) throw new Error('Duplicate Semantica evidence');
  const reports = input.reports.filter(report => report.sections.length);
  const pages = reports.map(report => reportPage(input, report));
  for (const conflict of input.conflicts) pages.push({
    slug: `conflict:${conflict.id}`, title: conflict.title, body: conflict.text,
    pageType: 'open-question', links: [], provenanceState: 'ambiguous',
    metadata: { ...metadata(input, conflict.evidenceIds), semanticaConflictId: conflict.id },
  });
  if (new Set(pages.map(page => page.slug)).size !== pages.length) throw new Error('Duplicate wiki page identity');
  const warnings: string[] = [];
  linkPages(pages, reports, warnings, input.relations);
  return { pages, ...navigation(pages), warnings: [...new Set(warnings)] };
}
