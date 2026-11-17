/** Shared table footers are explicit citations, not evidence borrowed across prose. */
import { expect, it } from 'vitest';
import { citedSections } from '../../../src/compiler/hosted-citations.js';
const aliases = new Map([['e0.md', { id: 'e', sourceId: 's', quote: 'Energy fell.', locator: {} }]]);
const allowed = new Set(['e']);
it('keeps a table with its immediately following citation-only footer', () => {
  const sections = citedSections('| Metric | Change |\n|---|---|\n| Energy | fell |\n\n^[e0.md:1]', aliases, allowed);
  expect(sections).toHaveLength(1);
  expect(sections[0].evidenceIds).toEqual(['e']);
  expect(sections[0].text).toContain('| Energy | fell |');
});
it('does not borrow a citation from a separate factual paragraph', () => {
  const warnings: string[] = [];
  const sections = citedSections('Uncited.\n\nEnergy fell. ^[e0.md:1]', aliases, allowed, new Set(), warnings);
  expect(sections[0].evidenceIds).toEqual([]);
  expect(warnings.join()).toContain('body lines 1');
});
it('still rejects an invalid identity in a shared footer', () => {
  expect(() => citedSections('| A |\n|---|\n| B |\n\n^[e99.md:1]', aliases, allowed)).toThrow(/identity/);
});
