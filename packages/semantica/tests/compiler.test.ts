/** The wiki compiler must organize approved reports without inventing knowledge. */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { compileSemanticaWiki, type SemanticaWikiInput } from '../src/index.js';

function fixture(): SemanticaWikiInput {
  return {
    snapshotId: 'snapshot', inputRevision: 'revision',
    evidence: [{ id: 'e1', sourceId: 's1' }],
    reports: [
      { id: 'r0', type: 'overview', title: 'Overview', sections: [{ text: 'Approved overview.', evidenceIds: ['e1'] }], dependsOn: [] },
      { id: 'r1', entityId: 'e/unsafe', type: 'concept', title: '中文', sections: [{ title: 'Facts', text: 'Approved text.', evidenceIds: ['e1'] }], dependsOn: ['t1'] },
      { id: 'r2', topicId: 't1', type: 'topic', title: 'Topic', sections: [{ text: 'Topic text.', evidenceIds: ['e1'] }], dependsOn: ['gone'] },
    ],
    conflicts: [{ id: 'c1', title: 'Unresolved', text: 'Conflicting facts.', evidenceIds: ['e1'] }],
  };
}

test('compiles stable page IDs, report-only prose, citations and navigation', () => {
  const input = fixture();
  const result = compileSemanticaWiki(input);
  const concept = result.pages.find(p => p.slug === 'concept:e/unsafe')!;
  assert.equal(concept.body, '## Facts\n\nApproved text.');
  assert.deepEqual(concept.links, ['topic:t1']);
  assert.deepEqual(concept.metadata, { semanticaSnapshotId: 'snapshot', semanticaEntityId: 'e/unsafe', semanticaReportId: 'r1', evidenceIds: ['e1'], sourceIds: ['s1'] });
  assert.equal(result.pages[0].links.length, 3);
  assert.deepEqual(result.categories.map(c => c.id), ['overview', 'topics', 'concepts', 'open-questions']);
  assert.deepEqual(result.warnings, ['Missing wiki page for Semantica dependency: gone']);
  input.reports[1].title = 'Renamed';
  assert.equal(compileSemanticaWiki(input).pages[1].slug, concept.slug);
});

test('rejects missing evidence, duplicate page identities and duplicate evidence', () => {
  const input = fixture();
  input.reports[1].sections[0].evidenceIds = ['missing'];
  assert.throws(() => compileSemanticaWiki(input), /Missing Semantica evidence/);
  input.reports[1].sections[0].evidenceIds = ['e1'];
  input.reports.push({ ...input.reports[1], id: 'another-report' });
  assert.throws(() => compileSemanticaWiki(input), /Duplicate wiki page/);
  input.reports.pop();
  input.evidence.push({ id: 'e1', sourceId: 's2' });
  assert.throws(() => compileSemanticaWiki(input), /Duplicate Semantica evidence/);
});

test('an empty report set stays empty; it never extracts from sources', () => {
  assert.deepEqual(compileSemanticaWiki({ ...fixture(), reports: [], conflicts: [] }).pages, []);
});

test('links generated entity pages using supplied relations without inventing missing pages', () => {
  const input = fixture();
  input.reports.push({ ...input.reports[1], id: 'r3', entityId: 'e2', dependsOn: [] });
  input.relations = [
    { fromEntityId: 'e/unsafe', toEntityId: 'e2' },
    { fromEntityId: 'e/unsafe', toEntityId: 'missing' },
    { fromEntityId: 'e/unsafe', toEntityId: 'e/unsafe' },
  ];
  const { pages } = compileSemanticaWiki(input);
  assert.deepEqual(pages.find(page => page.slug === 'concept:e/unsafe')!.links, ['topic:t1', 'concept:e2']);
  assert.deepEqual(pages.find(page => page.slug === 'concept:e2')!.links, []);
  assert.equal(pages.length, 5);
});
