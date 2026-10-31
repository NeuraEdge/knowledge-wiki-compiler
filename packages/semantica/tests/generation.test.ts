/** Hosted compilation must discover semantic pages, retrieve evidence, then synthesize. */
import { expect, it, vi } from 'vitest';
import { generateSemanticaWiki } from '../src/generation.js';

const sources = [{ id: 'a', title: 'Report A', passages: [{ text: 'Energy use fell.', sectionPath: ['Energy'] }] }];
const evidence = [{ id: 'e', sourceId: 'a', quote: 'Energy use fell.', locator: { page: 4 } }];
const plan = { pages: [{ id: 'energy', title: 'Energy management', type: 'topic', summary: 'Reported energy management', sourceIds: ['a'], query: 'energy management', relatedIds: [] }] };

it('runs native discovery, semantic planning, grounded writing and final overview synthesis', async () => {
  const complete = vi.fn().mockResolvedValueOnce(JSON.stringify({ concepts: [{ concept: 'Energy management', summary: 'Energy', is_new: true }] }))
    .mockResolvedValueOnce(JSON.stringify(plan)).mockResolvedValueOnce('## Findings\n\nEnergy use fell. ^[e0.md:1-1]')
    .mockResolvedValueOnce('## Overview\n\nReports describe energy management. ^[e0.md:1-1]\n\n[[energy|Energy management]]');
  const retrieve = vi.fn(async () => evidence);
  const result = await generateSemanticaWiki({ sources, complete, retrieve, maxInputChars: 32000 });
  expect(complete).toHaveBeenCalledTimes(4);
  expect(retrieve).toHaveBeenCalledWith(expect.objectContaining({ query: 'energy management', sourceIds: ['a'] }));
  expect(result.reports.map(page => page.type)).toEqual(['overview', 'topic']);
  expect(result.reports[0].sections[0]).toMatchObject({ evidenceIds: ['e'] });
  expect(result.reports[0].dependsOn).toEqual(['energy']);
  expect(complete.mock.calls[3][0].system).toContain('Energy use fell.');
  expect(complete.mock.calls[2][0].system).not.toContain('Fallback format:');
  expect(complete.mock.calls[2][0].system).not.toContain('Include a ## Sources section');
  expect(complete.mock.calls[2][0].system).toContain('"sourceId":"a","title":"Report A"');
});

it('rejects invented references and never publishes unsupported prose', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify(plan))
    .mockResolvedValueOnce('Invented claim. ^[not-supplied.md:1-2]');
  await expect(generateSemanticaWiki({ sources, complete, retrieve: async () => evidence, maxInputChars: 32000 })).rejects.toThrow(/citation/i);
});

it('does not collapse same-title pages with different semantic identities', async () => {
  const pages = ['organization', 'framework'].map(id => ({ ...plan.pages[0], id, title: 'Same name' }));
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify({ pages }))
    .mockResolvedValue('Supported. ^[e0.md:1-1]');
  const result = await generateSemanticaWiki({ sources, complete, retrieve: async () => evidence, maxInputChars: 32000 });
  expect(result.reports.map(report => report.id)).toEqual(['overview', 'organization', 'framework']);
});

it.each(['Claim without a reference.', 'Claim. ^[e0.md:0-1]', 'Claim. ^[e0.md:1-2]', 'Claim. ^[e0.md]'])('rejects unsupported or invalid line citations: %s', async body => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify(plan)).mockResolvedValueOnce(body);
  await expect(generateSemanticaWiki({ sources, complete, retrieve: async () => evidence, maxInputChars: 32000 })).rejects.toThrow(/citation/i);
});

it('refuses unauthorized contributors before retrieval or writing', async () => {
  const invalid = { pages: [{ ...plan.pages[0], sourceIds: ['other'] }] };
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify(invalid));
  const retrieve = vi.fn();
  await expect(generateSemanticaWiki({ sources, complete, retrieve, maxInputChars: 32000 })).rejects.toThrow(/scope/i);
  expect(retrieve).not.toHaveBeenCalled();
});

it('rejects missing contributor evidence and wrong-source retrieval results', async () => {
  for (const found of [[], [{ ...evidence[0], sourceId: 'other' }]]) {
    const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify(plan));
    await expect(generateSemanticaWiki({ sources, complete, retrieve: async () => found, maxInputChars: 32000 })).rejects.toThrow(/evidence/i);
    expect(complete).toHaveBeenCalledTimes(2);
  }
});

it('cancels after a model call without starting another paid call', async () => {
  const controller = new AbortController();
  const complete = vi.fn(async () => { controller.abort(); return '{"concepts":[]}'; });
  await expect(generateSemanticaWiki({ sources, complete, retrieve: async () => evidence,
    maxInputChars: 32000, signal: controller.signal })).rejects.toThrow();
  expect(complete).toHaveBeenCalledTimes(1);
});

it('rejects oversized planning before sending it to the provider', async () => {
  const complete = vi.fn().mockResolvedValue(JSON.stringify({ concepts: [{ concept: 'Energy', summary: 'x'.repeat(15000), is_new: true }] }));
  await expect(generateSemanticaWiki({ sources, complete, retrieve: async () => evidence, maxInputChars: 12000 })).rejects.toThrow(/budget/i);
  expect(complete).toHaveBeenCalledTimes(1);
});
