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

it('rejects an uncited paragraph even beside a cited paragraph without a blank line', () => {
  expect(() => citedSections('Uncited.\n\nSupported. ^[e0.md:1]', aliases, allowed)).toThrow(/citation/);
});

it('reports every uncited block so one correction can address the complete page', () => {
  try {
    citedSections('Private uncited introduction.\n\nSupported. ^[e0.md:1]\n\nPrivate uncited navigation.', aliases, allowed);
  } catch (error) {
    expect(error).toBeInstanceOf(HostedDocumentError);
    expect((error as HostedDocumentError).diagnostic.validationErrors.map(item => item.location)).toEqual([['body', 1], ['body', 5]]);
    expect((error as Error).message).toContain('1, 5');
    expect((error as Error).message).not.toContain('Private');
    return;
  }
  throw new Error('Expected all missing citations to be rejected');
});

it('never treats citation examples inside code as evidence attribution', () => {
  expect(() => citedSections('```\nInvented. ^[e0.md:1]\n```', aliases, allowed)).toThrow(/citation/);
});

it('exposes a stable error code for the host without leaking document content', () => {
  try { citedSections('Private uncited material.', aliases, allowed); }
  catch (error) {
    expect(error).toBeInstanceOf(HostedDocumentError);
    expect((error as HostedDocumentError).providerCode).toBe('WIKI_DOCUMENT_INVALID');
    expect(JSON.stringify((error as HostedDocumentError).diagnostic)).not.toContain('Private');
    return;
  }
  throw new Error('Expected a document validation error');
});
