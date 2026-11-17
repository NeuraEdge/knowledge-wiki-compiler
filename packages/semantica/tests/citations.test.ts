/** Markdown structure must not be confused with uncited substantive content. */
import { expect, it } from 'vitest';
import { citedSections, HostedDocumentError, numberedEvidence } from '../../../src/compiler/hosted-citations.js';

const aliases = new Map([['e0.md', { id: 'e', sourceId: 's', quote: 'Supported evidence.', locator: {} }]]);
const allowed = new Set(['e']);

it('keeps original character coordinates out of the numbered citation namespace', () => {
  const evidence = { id: 'range', sourceId: 's', quote: 'First.\nSecond.', locator: { ranges: [{ start: 459, end: 542 }] } };
  const registry = new Map();
  const prompt = numberedEvidence([evidence], registry);
  expect(prompt).toContain('1 | First.\n2 | Second.');
  expect(prompt).toContain('Valid citation lines: 1-2');
  expect(prompt).not.toContain('459');
  expect(prompt).not.toContain('542');
  expect(registry.get('e0.md')).toEqual(evidence);
});

it('rejects character offsets with the exact valid local line bounds', () => {
  expect(() => citedSections('Supported. ^[e0.md:459-542]', aliases, allowed))
    .toThrow('Invalid wiki citation lines for e0.md:459-542; valid local quote lines are 1-1');
});

it('accepts headings adjacent to paragraphs and thematic separators', () => {
  const sections = citedSections('# Title\n## Findings\nSupported. ^[e0.md:1]\n\n---\n\n## Limits\nLimited. ^[e0.md:1]', aliases, allowed);
  expect(sections).toEqual([
    { title: 'Findings', text: 'Supported.', evidenceIds: ['e'] },
    { title: 'Limits', text: 'Limited.', evidenceIds: ['e'] },
  ]);
});

it('preserves uncited prose with warnings without assigning neighboring evidence', () => {
  const warnings: string[] = [];
  const sections = citedSections('Uncited.\n\nSupported. ^[e0.md:1]', aliases, allowed, new Set(), warnings);
  expect(sections.map(section => section.evidenceIds)).toEqual([[], ['e']]);
  expect(warnings.join()).toContain('body lines 1');
});

it('reports all citation gaps without leaking document content into diagnostics', () => {
  const warnings: string[] = [];
  const sections = citedSections('Private uncited introduction.\n\nSupported. ^[e0.md:1]\n\nPrivate uncited navigation.', aliases, allowed, new Set(), warnings);
  expect(sections).toHaveLength(3);
  expect(warnings.join()).toContain('1, 5');
  expect(warnings.join()).not.toContain('Private');
});

it('never treats citation examples inside code as evidence attribution', () => {
  const warnings: string[] = [];
  expect(citedSections('```\nInvented. ^[e0.md:1]\n```', aliases, allowed, new Set(), warnings)[0].evidenceIds).toEqual([]);
  expect(warnings.join()).toContain('no source citations');
});

it('keeps invalid evidence identities as typed blocking errors', () => {
  expect(() => citedSections('Private ^[e99.md:1]', aliases, allowed)).toThrow(HostedDocumentError);
});
