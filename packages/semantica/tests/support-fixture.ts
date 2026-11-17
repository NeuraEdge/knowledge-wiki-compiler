/** Controlled judge transport for generation tests; author responses remain independent. */
import type { HostedCompileInput } from '../../../src/compiler/hosted-types.js';
export function withCitationReviews(complete: HostedCompileInput['complete']): HostedCompileInput['complete'] {
  return async request => {
    if (request.stage !== 'citation-review') return complete(request);
    const { blocks } = JSON.parse(request.user);
    return JSON.stringify({ onTopic: true, reason: 'Test subject', blocks: blocks.map((block: { line: number; evidence: unknown[] }) =>
      ({ line: block.line, score: block.evidence.length ? 2 : 0, editorial: false, reason: 'Test support' })) });
  };
}
