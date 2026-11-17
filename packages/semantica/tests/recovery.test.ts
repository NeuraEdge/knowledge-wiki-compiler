/** Discovery checkpoints must resume before reading source bodies, under the exact prompt contract. */
import { expect, it, vi } from 'vitest';
import { generateSemanticaWiki, hostedWikiContract } from '../src/generation.js';
import { withCitationReviews } from './support-fixture.js';

it('restores completed source discovery without rereading immutable passages after restart', async () => {
  const saved = new Map<string, unknown>();
  const checkpoint = async <T>(binding: string, produce: () => Promise<T>): Promise<T> => {
    if (saved.has(binding)) return saved.get(binding) as T;
    const value = await produce(); saved.set(binding, value); return value;
  };
  const passages = { async *[Symbol.asyncIterator]() { yield { text: 'Energy use fell.', sectionPath: [] }; } };
  const source = { id: 'a', title: 'A', revision: 'immutable-material', passages };
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockRejectedValueOnce(new Error('planning interrupted'));
  await expect(generateSemanticaWiki({ sources: [source], complete, retrieve: vi.fn(), checkpoint })).rejects.toThrow('planning interrupted');
  const read = vi.spyOn(passages, Symbol.asyncIterator).mockImplementation(() => { throw new Error('must not read completed source'); });
  const plan = { pages: [{ id: 'energy', title: 'Energy', type: 'topic', summary: 'Energy', sourceIds: ['a'], query: 'energy', relatedIds: [] }] };
  complete.mockReset().mockResolvedValueOnce(JSON.stringify(plan)).mockResolvedValue('Energy use fell. ^[e0.md:1-1]');
  const result = await generateSemanticaWiki({ sources: [source], complete: withCitationReviews(complete), checkpoint,
    retrieve: async () => [{ id: 'e', sourceId: 'a', quote: 'Energy use fell.', locator: {} }] });
  expect(result.reports).toHaveLength(2);
  expect(read).not.toHaveBeenCalled();
  expect(complete.mock.calls[0][0].stage).toBe('planning');
  expect(hostedWikiContract()).toContain('extract_concepts');
  expect(hostedWikiContract()).toBe(hostedWikiContract());
  await expect(generateSemanticaWiki({ sources: [{ ...source, revision: 'changed' }], complete, retrieve: vi.fn(), checkpoint }))
    .rejects.toThrow('must not read completed source');
});
