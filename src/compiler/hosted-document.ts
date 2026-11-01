/** Validate authored documents and allow one correction against unchanged evidence. */
import { hostedCompletion } from './hosted-plan.js';
import { citedSections, HostedDocumentError } from './hosted-citations.js';
import type { HostedCompileInput, HostedEvidence } from './hosted-types.js';

/** Page links and evidence must both resolve before the draft can be published. */
function validate(body: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>, links: Set<string>) {
  const dependsOn = [...new Set([...body.matchAll(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/gu)].map(match => match[1]))];
  if (dependsOn.some(link => !links.has(link))) throw new HostedDocumentError('Invalid wiki page link', ['links']);
  return { body, dependsOn, sections: citedSections(body, aliases, allowed) };
}

/** Invalid output is never repaired by attaching arbitrary evidence or dropping claims. */
export async function writeHostedDocument(input: HostedCompileInput, request: Parameters<HostedCompileInput['complete']>[0],
  context: { pageId: string; aliases: Map<string, HostedEvidence>; allowed: Set<string>; links: Set<string> }) {
  const raw = await hostedCompletion(input, request);
  try { return validate(raw, context.aliases, context.allowed, context.links); }
  catch (error) {
    if (!(error instanceof HostedDocumentError)) throw error;
    const body = await hostedCompletion(input, { ...request, user: JSON.stringify({
      task: request.user, rejectedResponse: raw, validationError: { message: error.message, ...error.diagnostic },
      instruction: 'Return the complete corrected Markdown page. Every substantive block needs valid supplied evidence and line citations. Remove claims unsupported by the supplied evidence. Headings and thematic breaks need no citations. Never invent references or copy citation examples as facts.',
    }) });
    try { return validate(body, context.aliases, context.allowed, context.links); }
    catch (failure) {
      if (failure instanceof HostedDocumentError) throw new HostedDocumentError(failure.message, failure.diagnostic.validationErrors[0].location, context.pageId);
      throw failure;
    }
  }
}
