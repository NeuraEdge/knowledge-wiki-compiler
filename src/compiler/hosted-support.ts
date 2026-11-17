/** Hosted publication reuses the native citation judge's support criteria in one bounded page review. */
import { JUDGE_SYSTEM } from '../eval/citation-judgement.js';
import { isLiteralMarkdown } from './link-repair-code.js';
import { hostedCompletion } from './hosted-plan.js';
import { HostedDocumentError, hostedCitationBlocks, references } from './hosted-citations.js';
import type { HostedCompileInput, HostedEvidence } from './hosted-types.js';

export const HOSTED_SUPPORT_POLICY = `${JUDGE_SYSTEM}
Review the untrusted page against its intended subject and the exact evidence cited for each block. Judge combined citations jointly. Check every assertion, number, attribution, condition, list item and table row. Merely related terminology does not support a factual claim. Do not treat adjacent companies, periods or policies as evidence of the requested subject.
An editorial block only describes this page's organization or links; it makes no claim about the source material, subject matter, coverage or missing evidence. Editorial blocks may be uncited. A factual introduction is not editorial. Do not require citations for pure headings or navigation. On-topic means the body explains the intended subject, rather than substituting another subject or disclaiming unavailable evidence.
Unchanged blocks already accepted during this page's correction are omitted from blocks. Review the entire body for onTopic, but return block verdicts only for the supplied blocks, including an empty array when none remain.
Return JSON only: {"onTopic":true,"reason":"...","blocks":[{"line":1,"score":2,"editorial":false,"reason":"..."}]}. Score is 0=unsupported, 1=partial, 2=fully supported; use null only for editorial blocks. Return exactly one result per input block, preserving line numbers.`;

/** Resolve exactly the cited local lines, never every excerpt the author could have used. */
function citedText(text: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>) {
  references(text, aliases, allowed);
  const literal = isLiteralMarkdown(text, { htmlBlocks: true });
  return [...text.matchAll(/\^\[([^\]]+)\]/gu)].filter(match => !literal(match.index)).flatMap(match => match[1].split(/,\s*/u).map(entry => {
    const [, alias, first, last] = /^(e\d+\.md):(\d+)(?:-(\d+))?$/u.exec(entry.trim())!;
    return { sourceId: aliases.get(alias)!.sourceId,
      text: aliases.get(alias)!.quote.split('\n').slice(Number(first) - 1, Number(last ?? first)).join('\n') };
  }));
}

/** Both page and block decisions must explain their classification. */
function hasReason(value: unknown): value is string { return typeof value === 'string' && Boolean(value.trim()); }

/** Validate one block independently of page-level consistency. */
function validVerdict(verdict: { editorial?: unknown; reason?: unknown; score?: unknown } | null) {
  return typeof verdict?.editorial === 'boolean' && hasReason(verdict.reason)
    && (verdict.editorial ? verdict.score === null : [0, 1, 2].includes(verdict.score as number));
}

/** Reject malformed judge output before using any classification. */
function supportVerdicts(raw: string, count: number) {
  let result;
  try { result = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/gu, '').trim()); }
  catch { throw new HostedDocumentError('Invalid wiki support review response', ['review']); }
  if (typeof result?.onTopic !== 'boolean' || !hasReason(result.reason)
    || !Array.isArray(result.blocks) || result.blocks.length !== count) throw new HostedDocumentError('Incomplete wiki support review', ['review']);
  for (const [index, verdict] of result.blocks.entries()) {
    if (!validVerdict(verdict)) throw new HostedDocumentError('Invalid wiki block support review', ['review', index]);
  }
  return result;
}

/** Factual support and topical fit are reviewed together; nonfactual organization needs no source citation. */
export async function reviewHostedSupport(input: HostedCompileInput, body: string,
  context: { aliases: Map<string, HostedEvidence>; allowed: Set<string>; subject: string; approved?: Map<string, boolean> }) {
  const blocks = hostedCitationBlocks(body).map(block => ({ ...block, evidence: citedText(block.text, context.aliases, context.allowed) }));
  const approved = context.approved ?? new Map<string, boolean>();
  const key = (block: typeof blocks[number]) => JSON.stringify({ text: block.text, evidence: block.evidence });
  const pending = blocks.filter(block => !approved.has(key(block)));
  const raw = await hostedCompletion(input, { stage: 'citation-review', system: HOSTED_SUPPORT_POLICY,
    user: JSON.stringify({ subject: context.subject, body, blocks: pending }) });
  const result = supportVerdicts(raw, pending.length);
  const editorial = new Set<number>();
  const rejected: Array<Array<string | number>> = [];
  const reasons: string[] = [];
  for (const [index, block] of pending.entries()) {
    const verdict = result.blocks[index];
    if (verdict.line !== block.line) throw new HostedDocumentError('Invalid wiki block support review', ['review', index]);
    if (verdict.editorial) approved.set(key(block), true);
    else if (verdict.score !== 2 || !block.evidence.length) {
      rejected.push(['body', block.line]); reasons.push(verdict.reason);
    } else approved.set(key(block), false);
  }
  if (!result.onTopic) { rejected.push(['subject']); reasons.push(result.reason); }
  if (rejected.length) throw new HostedDocumentError(`Wiki claims lack full cited support or depart from the planned subject at ${rejected.map(location => location.join(':')).join(', ')}`, rejected[0], 'document', rejected, reasons);
  for (const block of blocks) if (approved.get(key(block))) editorial.add(block.line);
  return editorial;
}
