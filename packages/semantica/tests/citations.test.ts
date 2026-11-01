/** Markdown structure must not be confused with uncited substantive content. */
import { expect, it } from 'vitest';
import { citedSections, HostedDocumentError } from '../../../src/compiler/hosted-citations.js';

const aliases = new Map([['e0.md', { id: 'e', sourceId: 's', quote: 'Supported evidence.', locator: {} }]]);
const allowed = new Set(['e']);

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
