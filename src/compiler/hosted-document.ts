/** Validate authored documents and bound grounded corrections against unchanged evidence. */
import { hostedCompletion } from './hosted-plan.js';
import { reviewHostedSupport } from './hosted-support.js';
import { citedSections, references, normalizeHostedCitations, HostedDocumentError } from './hosted-citations.js';
import type { HostedCompileInput, HostedEvidence } from './hosted-types.js';

export const MAX_DOCUMENT_CORRECTIONS = 3;

export const DOCUMENT_CORRECTION = 'Correct the rejected page, rather than writing a new introduction. Every reported block must either receive a citation to genuinely supporting supplied lines or be omitted. Do not retain or paraphrase an unsupported factual introduction. Return the complete corrected Markdown page, with no preface. Validate every content block before responding.';
export const DOCUMENT_CORRECTION_INPUT = 'Return the complete corrected Markdown page. Every factual block needs valid supporting evidence and line citations. Purely editorial organization needs no citation. Keep the planned subject; never substitute a nearby topic. Use only the 1-based local quote line numbers before | in each supplied SOURCE, never original document character offsets. Remove claims unsupported by the supplied evidence. Address every reported block. Omit unsupported topics instead of adding statements about missing material or what this page cannot cover; those statements also require supplied evidence. Navigation-only blocks must use bare [[page-id|title]] links without connective prose. Headings and thematic breaks need no citations. Never invent references or copy citation examples as facts.';

/** Page links and evidence must both resolve before the draft can be published. */
async function validate(input: HostedCompileInput, body: string, context: { subject: string; aliases: Map<string, HostedEvidence>; allowed: Set<string>; links: Set<string>; approved: Map<string, boolean> }) {
  const { aliases, allowed, links } = context;
  body = normalizeHostedCitations(body);
  const dependsOn = [...new Set([...body.matchAll(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/gu)].map(match => match[1]))];
  if (dependsOn.some(link => !links.has(link))) throw new HostedDocumentError('Invalid wiki page link', ['links']);
  // Resolve identities and line bounds before spending a review call.
  references(body, aliases, allowed);
  const editorial = await reviewHostedSupport(input, body, context);
  return { body, dependsOn, sections: citedSections(body, aliases, allowed, editorial) };
}

/** Invalid output is never repaired by attaching arbitrary evidence or dropping claims. */
export async function writeHostedDocument(input: HostedCompileInput, request: Parameters<HostedCompileInput['complete']>[0],
  context: { subject: string; pageId: string; aliases: Map<string, HostedEvidence>; allowed: Set<string>; links: Set<string> }) {
  const review = { ...context, approved: new Map<string, boolean>() };
  const rejected = new Set<string>();
  let raw = await hostedCompletion(input, request);
  for (let attempt = 0; ; attempt++) {
    try { return await validate(input, raw, review); }
    catch (error) {
      if (!(error instanceof HostedDocumentError)) throw error;
      if (attempt === MAX_DOCUMENT_CORRECTIONS || rejected.has(normalizeHostedCitations(raw))) {
        throw new HostedDocumentError(error.message, error.diagnostic.validationErrors[0].location, context.pageId,
          error.diagnostic.validationErrors.map(issue => issue.location), error.diagnostic.validationErrors.map(issue => issue.reason ?? ''));
      }
      rejected.add(normalizeHostedCitations(raw));
      raw = await hostedCompletion(input, { ...request,
        system: `${request.system}\n\nCORRECTION REQUIRED: ${error.message}. ${DOCUMENT_CORRECTION}`, user: JSON.stringify({
          task: request.user, rejectedResponse: raw,
          rejectedResponseLines: raw.split('\n').map((line, index) => `${index + 1} | ${line}`).join('\n'), validationError: { message: error.message, ...error.diagnostic },
          instruction: DOCUMENT_CORRECTION_INPUT,
        }) });
    }
  }
}
