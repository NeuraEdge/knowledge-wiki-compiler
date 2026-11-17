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

it('corrects writing and synthesis under the original evidence contract', async () => {
  const complete = completion().mockResolvedValueOnce('Unsupported draft.\n\nSupported. ^[e0.md:1]\n\nSee [[topic]].')
    .mockResolvedValueOnce('Supported. ^[e0.md:1]').mockResolvedValueOnce('Uncited overview.')
    .mockResolvedValueOnce('Overview. ^[e0.md:1]');
  const result = await generateSemanticaWiki({ sources: [source], retrieve: async () => [evidence], complete: withCitationReviews(complete) });
  expect(result.reports).toHaveLength(2);
  expect(complete).toHaveBeenCalledTimes(6);
  const correction = JSON.parse(complete.mock.calls[3][0].user);
  expect(correction.validationError.validationErrors.map((issue: { location: unknown }) => issue.location)).toEqual([['body', 1], ['body', 5]]);
  expect(correction.instruction).toContain('Navigation-only blocks must use bare');
  expect(correction.instruction).toContain('Omit unsupported topics');
  expect(complete.mock.calls[3][0].system).toContain(complete.mock.calls[2][0].system);
  expect(complete.mock.calls[3][0].system).toContain('CORRECTION REQUIRED:');
  expect(complete.mock.calls[3][0].system).toContain('Do not retain or paraphrase an unsupported factual introduction');
  expect(correction.rejectedResponseLines).toContain('5 | See [[topic]].');
});

it('fails closed after one invalid correction with a safe page diagnostic', async () => {
  const complete = completion().mockResolvedValue('Uncited claim.');
  await expect(generateSemanticaWiki({ sources: [source], retrieve: async () => [evidence], complete: withCitationReviews(complete) }))
    .rejects.toMatchObject({ providerCode: 'WIKI_DOCUMENT_INVALID', diagnostic: {
      code: 'topic', validationErrorCount: 1, validationErrors: [{ location: ['body', 1], type: 'wiki_document_invalid' }],
    } });
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
