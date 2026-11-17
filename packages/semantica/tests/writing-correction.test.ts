/** A rejected draft gets one grounded correction, never automatic citation attachment. */
import { expect, it, vi } from 'vitest';
import { withCitationReviews } from './support-fixture.js';
import { generateSemanticaWiki } from '../src/generation.js';

const source = { id: 's', title: 'Source', passages: [{ text: 'Supported.', sectionPath: [] }] };
const evidence = { id: 'e', sourceId: 's', quote: 'Supported.', locator: {} };
const plan = { pages: [{ id: 'topic', title: 'Topic', type: 'topic', summary: 'Theme', sourceIds: ['s'], query: 'theme', relatedIds: [] }] };
function completion() {
  return vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify(plan));
}

it('keeps usable writing and marks quality gaps without paid correction loops', async () => {
  const complete = completion().mockResolvedValueOnce('Unsupported draft.\n\nSupported. ^[e0.md:1]')
    .mockResolvedValueOnce('Uncited overview.');
  const result = await generateSemanticaWiki({ sources: [source], retrieve: async () => [evidence], complete: withCitationReviews(complete) });
  expect(result.reports).toHaveLength(2);
  expect(result.reports[1].sections[0].text).toBe('Unsupported draft.');
  expect(result.reports[1].warnings?.join()).toContain('no source citation');
  expect(result.reports[0].warnings?.join()).toContain('no source citations');
  expect(complete).toHaveBeenCalledTimes(4);
});

it('corrects a character-offset citation using the supplied local quote line bounds', async () => {
  const complete = completion().mockResolvedValueOnce('Supported. ^[e0.md:459-542]')
    .mockResolvedValueOnce('Supported. ^[e0.md:1]').mockResolvedValueOnce('Overview. ^[e0.md:1]');
  const located = { ...evidence, locator: { ranges: [{ start: 459, end: 542 }] } };
  const result = await generateSemanticaWiki({ sources: [source], retrieve: async () => [located], complete: withCitationReviews(complete) });
  expect(result.evidence[0].locator).toEqual(located.locator);
  const correction = JSON.parse(complete.mock.calls[3][0].user);
  expect(correction.validationError.message).toContain('e0.md:459-542; valid local quote lines are 1-1');
  expect(complete.mock.calls[2][0].system).not.toContain('"start":459');
  expect(result.reports[1].sections[0].evidenceIds).toEqual(['e']);
});
