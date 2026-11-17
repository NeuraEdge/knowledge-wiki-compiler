/** Invalid corrections remain grounded and bounded across persisted completion replay. */
import { expect, it, vi } from 'vitest';
import { writeHostedDocument } from '../../../src/compiler/hosted-document.js';

const context = { subject: 'Energy', pageId: 'energy', aliases: new Map([['e0.md', {
  id: 'e', sourceId: 's', quote: 'Energy use fell.', locator: {},
}]]), allowed: new Set(['e']), links: new Set<string>() };
const request = { system: 'Author a page', user: 'Energy', stage: 'writing' };
const input = (complete: ReturnType<typeof vi.fn>) => ({ sources: [], retrieve: async () => [], complete });

it('corrects an invalid first correction against the same supplied evidence', async () => {
  const complete = vi.fn().mockResolvedValueOnce('Energy use fell. ^[e0.md:50]')
    .mockResolvedValueOnce('Energy use fell. ^[e0.md:1] [e99.md:1]')
    .mockResolvedValueOnce('Energy use fell. ^[e0.md:1]')
    .mockResolvedValueOnce(JSON.stringify({ onTopic: true, reason: 'On topic', blocks: [
      { line: 1, score: 2, editorial: false, reason: 'Supported' },
    ] }));
  const result = await writeHostedDocument(input(complete), request, context);
  expect(result.sections[0].evidenceIds).toEqual(['e']);
  const correction = JSON.parse(complete.mock.calls[2][0].user);
  expect(correction.task).toBe(request.user);
  expect(correction.rejectedResponse).toContain('e99.md');
  expect(correction.validationError.message).toContain('identity');
  expect(complete).toHaveBeenCalledTimes(4);
});

it('stops when a correction repeats a previously rejected body', async () => {
  const complete = vi.fn().mockResolvedValue('Bad ^[e99.md:1]');
  await expect(writeHostedDocument(input(complete), request, context))
    .rejects.toMatchObject({ diagnostic: { code: 'energy' } });
  expect(complete).toHaveBeenCalledTimes(2);
});

it('limits changing invalid corrections and preserves the final page diagnostic', async () => {
  let attempt = 0;
  const complete = vi.fn(async () => `Claim ${attempt++} ^[e99.md:1]`);
  await expect(writeHostedDocument(input(complete), request, context))
    .rejects.toMatchObject({ diagnostic: { code: 'energy' } });
  expect(complete).toHaveBeenCalledTimes(4);
});
