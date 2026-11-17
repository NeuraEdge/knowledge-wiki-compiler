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
  readonly diagnostic: { code: string; validationErrorCount: number; validationErrors: Array<{ location: Array<string | number>; type: string; reason?: string }> };
  constructor(message: string, location: Array<string | number>, pageId = 'document', locations = [location], reasons: string[] = []) {
    super(message);
    this.diagnostic = { code: pageId, validationErrorCount: locations.length,
      validationErrors: locations.map((location, index) => ({ location, type: this.providerCode.toLowerCase(), ...(reasons[index] ? { reason: reasons[index] } : {}) })) };
  }
}

/** Numbered native source files keep original evidence and locators outside the prompt. */
export function numberedEvidence(evidence: HostedEvidence[], aliases: Map<string, HostedEvidence>): string {
  return evidence.map(item => {
    let alias = [...aliases].find(([, value]) => value.id === item.id)?.[0];
    if (!alias) {
      alias = `e${aliases.size}.md`; aliases.set(alias, item);
    }
    const lines = item.quote.split('\n').map((line, index) => `${index + 1} | ${line}`).join('\n');
    return `--- SOURCE: ${alias} ---\nSource identity: ${item.sourceId}\nValid citation lines: 1-${item.quote.split('\n').length}\n${lines}`;
  }).join('\n\n');
}

/** Resolve only evidence actually supplied to this page, including exact line bounds. */
function reference(entry: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>): string {
  const citation = /^(e\d+\.md):(\d+)(?:-(\d+))?$/u.exec(entry.trim());
  const evidence = citation && aliases.get(citation[1]);
  if (!citation || !evidence || !allowed.has(evidence.id)) throw new HostedDocumentError('Invalid wiki citation identity', ['reference']);
  const start = Number(citation[2]);
  const end = Number(citation[3] ?? citation[2]);
  const lineCount = evidence.quote.split('\n').length;
  if (start < 1 || end < start || end > lineCount) throw new HostedDocumentError(
    `Invalid wiki citation lines for ${citation[0]}; valid local quote lines are 1-${lineCount}`, ['reference']);
  return evidence.id;
}

/** Resolve the model's paragraph references against the current page's evidence. */
export function references(text: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>): string[] {
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
export function citedSections(body: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>, editorial = new Set<number>()): HostedReport['sections'] {
  body = normalizeHostedCitations(body);
  const sections: HostedReport['sections'] = [];
  const missing: Array<Array<string | number>> = [];
  const lines = body.split('\n');
  let title = '';
  for (const token of markdown.parse(body, {})) {
    if (token.level !== 0 || !token.map || token.type === 'hr') continue;
    const block = lines.slice(...token.map).join('\n').trim();
    if (token.type === 'heading_open') { title = block.replace(/^#{1,6}\s+|\s+#+$/gu, '').split('\n')[0]; continue; }
    if (/^(?:[-*]\s*)?\[\[[^\]]+\]\](?:\s*[-*]?\s*\[\[[^\]]+\]\])*$/u.test(block.trim())) continue;
    const evidenceIds = references(block, aliases, allowed);
    if (!evidenceIds.length && !editorial.has(token.map[0] + 1)) { missing.push(['body', token.map[0] + 1]); continue; }
    sections.push({ ...(title ? { title } : {}), text: block.replace(/\s*\^\[[^\]]+\]/gu, '').trim(), evidenceIds });
    title = '';
  }
  if (missing.length) throw new HostedDocumentError(
    `Wiki content blocks have no evidence citation at body lines ${missing.map(location => location[1]).join(', ')}`, missing[0], 'document', missing);
  if (!sections.some(section => section.evidenceIds.length)) throw new HostedDocumentError('Wiki page has no cited content', ['body']);
  return sections;
}

/** Normalize citation chains, including horizontal whitespace, without touching code literals. */
export function normalizeHostedCitations(body: string): string {
  const literal = isLiteralMarkdown(body, { htmlBlocks: true });
  return body.replace(/\^\[([^\]]+)\]((?:[\t ]*\[e\d+\.md:\d+(?:-\d+)?\])+)/gu, (raw, first: string, chain: string, offset: number) =>
    literal(offset) ? raw : `^[${[first, ...[...chain.matchAll(/\[([^\]]+)\]/gu)].map(match => match[1])].join(', ')}]`);
}

/** Give the support judge individual prose/list-item/table-row claims, not whole lists. */
export function hostedCitationBlocks(body: string) {
  const lines = body.split('\n');
  let tableHeader = false;
  return markdown.parse(body, {}).filter(token => {
    if (token.type === 'thead_open') tableHeader = true;
    if (token.type === 'thead_close') tableHeader = false;
    return !tableHeader && token.map && ['paragraph_open', 'fence', 'code_block', 'tr_open'].includes(token.type);
  })
    .map(token => ({ line: token.map![0] + 1, text: lines.slice(...token.map!).join('\n').trim() }))
    .filter(block => !/^(?:[-*]\s*)?\[\[[^\]]+\]\](?:\s*[-*]?\s*\[\[[^\]]+\]\])*$/u.test(block.text));
}
