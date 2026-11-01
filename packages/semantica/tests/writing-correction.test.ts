/** A rejected draft gets one grounded correction, never automatic citation attachment. */
import { expect, it, vi } from 'vitest';
import { generateSemanticaWiki } from '../src/generation.js';

const source = { id: 's', title: 'Source', passages: [{ text: 'Supported.', sectionPath: [] }] };
const evidence = { id: 'e', sourceId: 's', quote: 'Supported.', locator: {} };
const plan = { pages: [{ id: 'topic', title: 'Topic', type: 'topic', summary: 'Theme', sourceIds: ['s'], query: 'theme', relatedIds: [] }] };
function completion() {
  return vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify(plan));
}

it('corrects writing and synthesis under the original evidence contract', async () => {
  const complete = completion().mockResolvedValueOnce('Unsupported draft.')
    .mockResolvedValueOnce('Supported. ^[e0.md:1]').mockResolvedValueOnce('Uncited overview.')
    .mockResolvedValueOnce('Overview. ^[e0.md:1]');
  const result = await generateSemanticaWiki({ sources: [source], retrieve: async () => [evidence], complete, maxInputChars: 32000 });
  expect(result.reports).toHaveLength(2);
  expect(complete).toHaveBeenCalledTimes(6);
  expect(JSON.parse(complete.mock.calls[3][0].user)).toMatchObject({ rejectedResponse: 'Unsupported draft.' });
  expect(complete.mock.calls[3][0].system).toBe(complete.mock.calls[2][0].system);
});

it('fails closed after one invalid correction with a safe page diagnostic', async () => {
  const complete = completion().mockResolvedValue('Uncited claim.');
  await expect(generateSemanticaWiki({ sources: [source], retrieve: async () => [evidence], complete, maxInputChars: 32000 }))
    .rejects.toMatchObject({ providerCode: 'WIKI_DOCUMENT_INVALID', diagnostic: {
      code: 'topic', validationErrorCount: 1, validationErrors: [{ location: ['body', 1], type: 'wiki_document_invalid' }],
    } });
  expect(complete).toHaveBeenCalledTimes(4);
});
