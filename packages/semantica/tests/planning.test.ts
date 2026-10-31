/** Planning repairs are bounded and never bypass source or identity validation. */
import { expect, it, vi } from 'vitest';
import { planHostedWiki } from '../../../src/compiler/hosted-plan.js';

const sources = [{ id: 'a', title: 'Report', passages: [] }];
const page = { id: 'energy', title: 'Energy', type: 'topic', summary: 'Energy management',
  sourceIds: ['a'], query: 'energy', relatedIds: [] };

it('corrects malformed discovery for only the affected source before planning', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[{"concept":"unfinished')
    .mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify({ pages: [page] }));
  expect(await planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 })).toEqual([page]);
  expect(complete.mock.calls.map(([request]) => request.stage)).toEqual(['discovery', 'discovery', 'planning']);
  expect(complete.mock.calls[1][0].user).toContain('valid JSON');
});

it('rejects persistently malformed discovery after one correction', async () => {
  const complete = vi.fn().mockResolvedValue('{broken');
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 }))
    .rejects.toThrow('Wiki discovery: response must be valid JSON');
  expect(complete).toHaveBeenCalledTimes(2);
});

it('does not retry discovery provider failures as invalid output', async () => {
  const complete = vi.fn().mockRejectedValue(new Error('provider offline'));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 }))
    .rejects.toThrow('provider offline');
  expect(complete).toHaveBeenCalledTimes(1);
});

it('rejects schema-invalid discovery after one correction', async () => {
  const complete = vi.fn().mockResolvedValue('{"concepts":[{"concept":"missing required fields"}]}');
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 }))
    .rejects.toThrow('Wiki discovery: response must match the extract_concepts schema');
  expect(complete).toHaveBeenCalledTimes(2);
});

it('does not enlarge the source discovery budget for a correction', async () => {
  const complete = vi.fn().mockResolvedValue('x'.repeat(32000));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 }))
    .rejects.toThrow(/budget/);
  expect(complete).toHaveBeenCalledTimes(1);
});

it('repairs a rejected plan once without repeating source discovery', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}')
    .mockResolvedValueOnce(JSON.stringify({ pages: [{ ...page, relatedIds: ['absent'] }] }))
    .mockResolvedValueOnce(JSON.stringify({ pages: [page] }));
  expect(await planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 })).toEqual([page]);
  expect(complete).toHaveBeenCalledTimes(3);
  expect(complete.mock.calls[2][0]).toMatchObject({ stage: 'planning' });
  expect(complete.mock.calls[2][0].user).toContain('pages[0].relatedIds');
  expect(complete.mock.calls[1][0].system).toContain('overview');
  expect(complete.mock.calls[1][0].system).toContain('^[a-z0-9][a-z0-9-]*$');
});

it.each([null, { ...page, sourceIds: ['invented'] }, { ...page, id: 'overview' },
  { ...page, type: 'topic|concept|open-question' }, { ...page, relatedIds: ['energy'] }])(
  'rejects invalid plans after exactly one correction: %j', async invalid => {
    const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}')
      .mockResolvedValue(JSON.stringify({ pages: [invalid] }));
    await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 }))
      .rejects.toThrow(/Wiki planning.*pages\[0\]/);
    expect(complete).toHaveBeenCalledTimes(3);
  });

it('does not retry provider failures as invalid model output', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockRejectedValueOnce(new Error('provider offline'));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 }))
    .rejects.toThrow('provider offline');
  expect(complete).toHaveBeenCalledTimes(2);
});

it('repairs malformed JSON without exposing a parser exception as success', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce('{broken')
    .mockResolvedValueOnce(JSON.stringify({ pages: [page] }));
  expect(await planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 })).toEqual([page]);
  expect(complete.mock.calls[2][0].user).toContain('valid JSON');
});

it('does not enlarge the input budget for a correction', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce('x'.repeat(32000));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000 }))
    .rejects.toThrow(/budget/);
  expect(complete).toHaveBeenCalledTimes(2);
});

it('honors cancellation before correcting a rejected plan', async () => {
  const controller = new AbortController();
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockImplementationOnce(async () => {
    controller.abort(new Error('canceled'));
    return '{broken';
  });
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), maxInputChars: 32000, signal: controller.signal }))
    .rejects.toThrow('canceled');
  expect(complete).toHaveBeenCalledTimes(2);
});
