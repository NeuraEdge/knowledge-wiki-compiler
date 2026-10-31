/** Contract diagnostics identify rejected fields, never model-authored content. */
import { expect, it } from 'vitest';
import { parseHostedPlan } from '../../../src/compiler/hosted-plan-validation.js';

const page = { id: 'energy', title: 'Energy', type: 'topic', summary: 'Energy management',
  sourceIds: ['a'], query: 'energy', relatedIds: [] };

it.each([
  [null, 'pages'], [{ pages: [] }, 'pages'], [{ pages: [null] }, 'pages[0]'],
  [{ pages: [{ ...page, id: 'Bad ID' }] }, 'pages[0].id'],
  [{ pages: [page, page] }, 'pages[1].id'],
  ...(['title', 'summary', 'query'] as const).map(field => [{ pages: [{ ...page, [field]: '' }] }, `pages[0].${field}`]),
  [{ pages: [{ ...page, sourceIds: [] }] }, 'pages[0].sourceIds'],
  [{ pages: [{ ...page, sourceIds: [1] }] }, 'pages[0].sourceIds'],
  [{ pages: [{ ...page, relatedIds: null }] }, 'pages[0].relatedIds'],
])('rejects invalid contract %j at %s', (value, path) => {
  expect(() => parseHostedPlan(JSON.stringify(value), new Set(['a']))).toThrow(`Wiki planning: ${path}`);
});

it('accepts forward links and fenced JSON without changing page content', () => {
  const pages = [{ ...page, relatedIds: ['second'] }, { ...page, id: 'second' }];
  expect(parseHostedPlan('```json\n' + JSON.stringify({ pages }) + '\n```', new Set(['a']))).toEqual(pages);
});
