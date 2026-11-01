/**
 * Converts native compiler paragraph citations back to the host's immutable
 * evidence IDs. Citation aliases are run-local and never become source IDs.
 * Unknown, missing or out-of-range references fail publication.
 */
import type { HostedEvidence, HostedReport } from './hosted-types.js';
import MarkdownIt from 'markdown-it';
import { isLiteralMarkdown } from './link-repair-code.js';

const markdown = new MarkdownIt({ html: true });

/** Only document contract failures may trigger a bounded grounded correction. */
export class HostedDocumentError extends Error {
  readonly providerCode = 'WIKI_DOCUMENT_INVALID';
  readonly diagnostic: { code: string; validationErrorCount: number; validationErrors: Array<{ location: Array<string | number>; type: string }> };
  constructor(message: string, location: Array<string | number>, pageId = 'document') {
    super(message);
    this.diagnostic = { code: pageId, validationErrorCount: 1,
      validationErrors: [{ location, type: this.providerCode.toLowerCase() }] };
  }
}

/** Numbered native source files keep original evidence and locators outside the prompt. */
export function numberedEvidence(evidence: HostedEvidence[], aliases: Map<string, HostedEvidence>): string {
  return evidence.map(item => {
    let alias = [...aliases].find(([, value]) => value.id === item.id)?.[0];
    if (!alias) { alias = `e${aliases.size}.md`; aliases.set(alias, item); }
    const lines = item.quote.split('\n').map((line, index) => `${index + 1} | ${line}`).join('\n');
    return `--- SOURCE: ${alias} ---\nSource identity: ${item.sourceId}\nLocation: ${JSON.stringify(item.locator)}\n${lines}`;
  }).join('\n\n');
}

/** Resolve only evidence actually supplied to this page, including exact line bounds. */
function reference(entry: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>): string {
  const citation = /^(e\d+\.md):(\d+)(?:-(\d+))?$/u.exec(entry.trim());
  const evidence = citation && aliases.get(citation[1]);
  if (!citation || !evidence || !allowed.has(evidence.id)) throw new HostedDocumentError('Invalid wiki citation identity', ['reference']);
  const start = Number(citation[2]);
  const end = Number(citation[3] ?? citation[2]);
  if (start < 1 || end < start || end > evidence.quote.split('\n').length) throw new HostedDocumentError('Invalid wiki citation lines', ['reference']);
  return evidence.id;
}

/** Resolve the model's paragraph references against the current page's evidence. */
function references(text: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>): string[] {
  const ids: string[] = [];
  const literal = isLiteralMarkdown(text, { htmlBlocks: true });
  for (const match of text.matchAll(/\^\[([^\]]+)\]/gu)) {
    if (literal(match.index)) continue;
    for (const entry of match[1].split(/,\s*/u)) {
      ids.push(reference(entry, aliases, allowed));
    }
  }
  return [...new Set(ids)];
}

/** Every authored content block retains its own evidence; citations never float across sections. */
export function citedSections(body: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>): HostedReport['sections'] {
  const sections: HostedReport['sections'] = [];
  const lines = body.split('\n');
  let title = '';
  for (const token of markdown.parse(body, {})) {
    if (token.level !== 0 || !token.map || token.type === 'hr') continue;
    const block = lines.slice(...token.map).join('\n').trim();
    if (token.type === 'heading_open') { title = block.replace(/^#{1,6}\s+|\s+#+$/gu, '').split('\n')[0]; continue; }
    if (/^(?:[-*]\s*)?\[\[[^\]]+\]\](?:\s*[-*]?\s*\[\[[^\]]+\]\])*$/u.test(block.trim())) continue;
    const evidenceIds = references(block, aliases, allowed);
    if (!evidenceIds.length) throw new HostedDocumentError('Wiki content block has no evidence citation', ['body', token.map[0] + 1]);
    sections.push({ ...(title ? { title } : {}), text: block.replace(/\s*\^\[[^\]]+\]/gu, '').trim(), evidenceIds });
    title = '';
  }
  if (!sections.length) throw new HostedDocumentError('Wiki page has no cited content', ['body']);
  return sections;
}
