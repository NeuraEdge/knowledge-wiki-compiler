/** Publication must distinguish organization from facts and reject unrelated citations. */
import { expect, it, vi } from 'vitest';
import { reviewHostedSupport } from '../../../src/compiler/hosted-support.js';
import { hostedCitationBlocks, normalizeHostedCitations, references } from '../../../src/compiler/hosted-citations.js';
const context = { subject: 'Energy performance', aliases: new Map([['e0.md', {
  id: 'e', sourceId: 'company-a', quote: 'Energy use fell.\nWater use rose.', locator: {},
}]]), allowed: new Set(['e']) };
function fixture(verdicts: Array<{ score: number | null; editorial: boolean }>, onTopic = true) {
  const complete = vi.fn(async request => {
    const { blocks } = JSON.parse(request.user);
    return JSON.stringify({ onTopic, reason: 'Subject assessment', blocks: verdicts.map((verdict, index) =>
      ({ line: blocks[index].line, reason: 'Support assessment', ...verdict })) });
  });
  return { complete, sources: [], retrieve: async () => [] };
}
it('allows uncited organization while checking only exactly cited original lines', async () => {
  const input = fixture([{ score: null, editorial: true }, { score: 2, editorial: false }]);
  expect(await reviewHostedSupport(input, 'This page is organized by metric.\n\nEnergy use fell. ^[e0.md:1]', context)).toEqual(new Set([1]));
  const request = JSON.parse(input.complete.mock.calls[0][0].user);
  expect(request.blocks[1].evidence).toEqual([{ sourceId: 'company-a', text: 'Energy use fell.' }]);
  expect(input.complete.mock.calls[0][0].user).not.toContain('Water use rose.');
});
it('rejects related terminology that does not support the cited claim', async () => {
  const input = fixture([{ score: 0, editorial: false }]);
  await expect(reviewHostedSupport(input, 'Water use fell. ^[e0.md:1]', context))
    .rejects.toMatchObject({ providerCode: 'WIKI_DOCUMENT_INVALID' });
});
it('rejects topic substitution even when each substituted claim is supported', async () => {
  const input = fixture([{ score: 2, editorial: false }], false);
  await expect(reviewHostedSupport(input, 'Water use rose. ^[e0.md:2]', context))
    .rejects.toMatchObject({ diagnostic: { validationErrors: [{ location: ['subject'] }] } });
});
it('does not allow one list item to borrow another item citation', async () => {
  const input = fixture([{ score: 2, editorial: false }, { score: 0, editorial: false }]);
  await expect(reviewHostedSupport(input, '- Energy use fell. ^[e0.md:1]\n- Uncited factual claim.', context))
    .rejects.toMatchObject({ diagnostic: { validationErrors: [{ location: ['body', 2] }] } });
});
it('reviews table data rows without requiring evidence for column headings', () => {
  expect(hostedCitationBlocks('| Metric | Change |\n|---|---|\n| Energy | fell ^[e0.md:1] |').map(block => block.line)).toEqual([3]);
});
it('normalizes adjacent citations without modifying code literals', () => {
  expect(normalizeHostedCitations('Fact ^[e0.md:1][e1.md:2]\n\n`^[e0.md:1][e1.md:2]`'))
    .toBe('Fact ^[e0.md:1, e1.md:2]\n\n`^[e0.md:1][e1.md:2]`');
});
it('normalizes whitespace-separated citation chains and validates every reference', () => {
  const body = normalizeHostedCitations('Fact ^[e0.md:1] [e1.md:2]\n\n`^[e0.md:1] [e1.md:2]`');
  expect(body).toBe('Fact ^[e0.md:1, e1.md:2]\n\n`^[e0.md:1] [e1.md:2]`');
  const aliases = new Map(context.aliases);
  aliases.set('e1.md', { ...context.aliases.get('e0.md')!, id: 'other' });
  expect(() => references(body, context.aliases, context.allowed)).toThrow('identity');
  expect(() => references(body, aliases, context.allowed)).toThrow('identity');
  expect(references(body, aliases, new Set(['e', 'other']))).toEqual(['e', 'other']);
  expect(() => references(normalizeHostedCitations('Fact ^[e0.md:1] [e1.md:3]'), aliases, new Set(['e', 'other'])))
    .toThrow('lines');
});
it('does not treat citation examples in inline code as source evidence', async () => {
  const input = fixture([{ score: null, editorial: true }]);
  await reviewHostedSupport(input, 'Citation syntax: `^[e99.md:100]`.', context);
  expect(JSON.parse(input.complete.mock.calls[0][0].user).blocks[0].evidence).toEqual([]);
});
it('fails closed on incomplete support verdicts', async () => {
  const input = fixture([]);
  await expect(reviewHostedSupport(input, 'Energy use fell. ^[e0.md:1]', context)).rejects.toThrow('Incomplete');
});

it('does not reject purely editorial organization just because it has a valid citation', async () => {
  const input = fixture([{ score: null, editorial: true }]);
  expect(await reviewHostedSupport(input, 'This page is organized by metric. ^[e0.md:1]', context)).toEqual(new Set([1]));
});

it('passes each failed support reason to the single correction, not just line numbers', async () => {
  const { writeHostedDocument } = await import('../../../src/compiler/hosted-document.js');
  const complete = vi.fn()
    .mockResolvedValueOnce('Energy and water use fell. ^[e0.md:1]')
    .mockResolvedValueOnce(JSON.stringify({ onTopic: true, reason: 'On subject', blocks: [
      { line: 1, score: 1, editorial: false, reason: 'The cited line supports energy only, not water.' },
    ] }))
    .mockResolvedValueOnce('Energy use fell. ^[e0.md:1]')
    .mockResolvedValueOnce(JSON.stringify({ onTopic: true, reason: 'On subject', blocks: [
      { line: 1, score: 2, editorial: false, reason: 'Fully supported' },
    ] }));
  await writeHostedDocument({ ...fixture([]), complete }, { system: 'Author a page', user: 'Energy', stage: 'writing' },
    { ...context, pageId: 'energy', links: new Set() });
  const correction = JSON.parse(complete.mock.calls[2][0].user);
  expect(correction.validationError.validationErrors).toEqual([
    { location: ['body', 1], type: 'wiki_document_invalid', reason: 'The cited line supports energy only, not water.' },
  ]);
  expect(complete).toHaveBeenCalledTimes(4);
});

it('reuses accepted unchanged blocks during correction and still reviews changed evidence', async () => {
  const approved = new Map<string, boolean>();
  const complete = vi.fn()
    .mockResolvedValueOnce(JSON.stringify({ onTopic: true, reason: 'On subject', blocks: [
      { line: 1, score: 2, editorial: false, reason: 'Energy supported' },
      { line: 3, score: 0, editorial: false, reason: 'Water claim contradicted' },
    ] }))
    .mockResolvedValueOnce(JSON.stringify({ onTopic: true, reason: 'On subject', blocks: [
      { line: 3, score: 2, editorial: false, reason: 'Water now supported' },
    ] }));
  const input = { ...fixture([]), complete };
  await expect(reviewHostedSupport(input, 'Energy use fell. ^[e0.md:1]\n\nWater use fell. ^[e0.md:2]', { ...context, approved })).rejects.toThrow();
  await expect(reviewHostedSupport(input, 'Energy use fell. ^[e0.md:1]\n\nWater use rose. ^[e0.md:2]', { ...context, approved })).resolves.toEqual(new Set());
  expect(JSON.parse(complete.mock.calls[1][0].user).blocks.map(block => block.line)).toEqual([3]);
});

it('rechecks changed source identity and keeps whole-page topical review for accepted blocks', async () => {
  const approved = new Map<string, boolean>();
  const input = fixture([{ score: 2, editorial: false }]);
  const body = 'Energy use fell. ^[e0.md:1]';
  await reviewHostedSupport(input, body, { ...context, approved });
  const aliases = new Map([['e0.md', { ...context.aliases.get('e0.md')!, sourceId: 'company-b' }]]);
  await reviewHostedSupport(input, body, { ...context, approved, aliases });
  expect(JSON.parse(input.complete.mock.calls[1][0].user).blocks).toHaveLength(1);
  const offTopic = fixture([], false);
  await expect(reviewHostedSupport(offTopic, body, { ...context, approved }))
    .rejects.toMatchObject({ diagnostic: { validationErrors: [{ location: ['subject'] }] } });
  expect(JSON.parse(offTopic.complete.mock.calls[0][0].user)).toMatchObject({ body, blocks: [] });
});
