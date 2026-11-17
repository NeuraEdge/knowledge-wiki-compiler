/** Planning repairs are bounded and never bypass source or identity validation. */
import { expect, it, vi } from 'vitest';
import { planHostedWiki } from '../../../src/compiler/hosted-plan.js';

const sources = [{ id: 'a', title: 'Report', passages: [{ text: 'Supported source passage.', sectionPath: [] }] }];
const page = { id: 'energy', title: 'Energy', type: 'topic', summary: 'Energy management',
  sourceIds: ['a'], query: 'energy', relatedIds: [] };

it('corrects malformed discovery for only the affected source before planning', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[{"concept":"unfinished')
    .mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce(JSON.stringify({ pages: [page] }));
  expect(await planHostedWiki({ sources, complete, retrieve: vi.fn() })).toEqual([page]);
  expect(complete.mock.calls.map(([request]) => request.stage)).toEqual(['discovery', 'discovery', 'planning']);
  expect(complete.mock.calls[1][0].user).toContain('valid JSON');
});

it('rejects persistently malformed discovery after one correction', async () => {
  const complete = vi.fn().mockResolvedValue('{broken');
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn() }))
    .rejects.toThrow('Wiki discovery: response must be valid JSON');
  expect(complete).toHaveBeenCalledTimes(2);
});

it('does not retry discovery provider failures as invalid output', async () => {
  const complete = vi.fn().mockRejectedValue(new Error('provider offline'));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn() }))
    .rejects.toThrow('provider offline');
  expect(complete).toHaveBeenCalledTimes(1);
});

it('rejects schema-invalid discovery after one correction', async () => {
  const complete = vi.fn().mockResolvedValue('{"concepts":[{"concept":"missing required fields"}]}');
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn() }))
    .rejects.toThrow('Wiki discovery: response must match the extract_concepts schema');
  expect(complete).toHaveBeenCalledTimes(2);
});

it('validates oversized malformed discovery without a local budget', async () => {
  const complete = vi.fn().mockResolvedValue('x'.repeat(32000));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn() }))
    .rejects.toThrow(/valid JSON/);
  expect(complete).toHaveBeenCalledTimes(2);
});

it('repairs a rejected plan once without repeating source discovery', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}')
    .mockResolvedValueOnce(JSON.stringify({ pages: [{ ...page, relatedIds: ['absent'] }] }))
    .mockResolvedValueOnce(JSON.stringify({ pages: [page] }));
  expect(await planHostedWiki({ sources, complete, retrieve: vi.fn() })).toEqual([page]);
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
    await expect(planHostedWiki({ sources, complete, retrieve: vi.fn() }))
      .rejects.toThrow(/Wiki planning.*pages\[0\]/);
    expect(complete.mock.calls.map(([request]) => request.stage)).toEqual(['discovery', 'planning', 'planning']);
  });

it('does not retry provider failures as invalid model output', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockRejectedValueOnce(new Error('provider offline'));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn() }))
    .rejects.toThrow('provider offline');
  expect(complete).toHaveBeenCalledTimes(2);
});

it('repairs malformed JSON without exposing a parser exception as success', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce('{broken')
    .mockResolvedValueOnce(JSON.stringify({ pages: [page] }));
  expect(await planHostedWiki({ sources, complete, retrieve: vi.fn() })).toEqual([page]);
  expect(complete.mock.calls[2][0].user).toContain('valid JSON');
});

it('validates oversized malformed plans without a local budget', async () => {
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockResolvedValueOnce('x'.repeat(32000));
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn() }))
    .rejects.toThrow(/valid JSON/);
  expect(complete).toHaveBeenCalledTimes(3);
});

it('honors cancellation before correcting a rejected plan', async () => {
  const controller = new AbortController();
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}').mockImplementationOnce(async () => {
    controller.abort(new Error('canceled'));
    return '{broken';
  });
  await expect(planHostedWiki({ sources, complete, retrieve: vi.fn(), signal: controller.signal }))
    .rejects.toThrow('canceled');
  expect(complete).toHaveBeenCalledTimes(2);
});

it('consumes lazy passage pages through the final section without truncating its representative passage', async () => {
  let visited = 0;
  async function* passages() {
    for (let i = 0; i < 10000; i++) {
      visited++;
      yield { text: 'x'.repeat(20000), sectionPath: ['Main'] };
    }
    yield { text: 'Final section findings', sectionPath: ['Conclusion'] };
  }
  const complete = vi.fn().mockResolvedValueOnce('{"concepts":[]}')
    .mockResolvedValueOnce(JSON.stringify({ pages: [page] }));
  await planHostedWiki({ sources: [{ id: 'a', title: 'Report', passages: passages() }],
    complete, retrieve: vi.fn() });
  expect(visited).toBe(10000);
  expect(complete.mock.calls[0][0].system).toContain('Final section findings');
  expect(complete.mock.calls[0][0].system).toContain('x'.repeat(20000));
});

it('cancels during passage traversal before any model call', async () => {
  const controller = new AbortController();
  async function* passages() {
    controller.abort(new Error('canceled'));
    yield { text: 'Unused', sectionPath: [] };
  }
  const complete = vi.fn();
  await expect(planHostedWiki({ sources: [{ id: 'a', title: 'Report', passages: passages() }],
    complete, retrieve: vi.fn(), signal: controller.signal })).rejects.toThrow('canceled');
  expect(complete).not.toHaveBeenCalled();
});
