/**
 * Converts native compiler paragraph citations back to the host's immutable
 * evidence IDs. Citation aliases are run-local and never become source IDs.
 * Unknown, missing or out-of-range references fail publication.
 */
import type { HostedEvidence, HostedReport } from './hosted-types.js';

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
  if (!citation || !evidence || !allowed.has(evidence.id)) throw new Error('Invalid wiki citation identity');
  const start = Number(citation[2]);
  const end = Number(citation[3] ?? citation[2]);
  if (start < 1 || end < start || end > evidence.quote.split('\n').length) throw new Error('Invalid wiki citation lines');
  return evidence.id;
}

/** Resolve the model's paragraph references against the current page's evidence. */
function references(text: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/\^\[([^\]]+)\]/gu)) {
    for (const entry of match[1].split(/,\s*/u)) {
      ids.push(reference(entry, aliases, allowed));
    }
  }
  return [...new Set(ids)];
}

/** Every authored content block retains its own evidence; citations never float across sections. */
export function citedSections(body: string, aliases: Map<string, HostedEvidence>, allowed: Set<string>): HostedReport['sections'] {
  const sections: HostedReport['sections'] = [];
  let title = '';
  for (const block of body.trim().split(/\n\s*\n/u)) {
    if (/^#{1,6}\s/u.test(block) && !block.includes('\n')) { title = block.replace(/^#{1,6}\s+/u, ''); continue; }
    if (/^(?:[-*]\s*)?\[\[[^\]]+\]\](?:\s*[-*]?\s*\[\[[^\]]+\]\])*$/u.test(block.trim())) continue;
    const evidenceIds = references(block, aliases, allowed);
    if (!evidenceIds.length) throw new Error('Wiki content block has no evidence citation');
    sections.push({ ...(title ? { title } : {}), text: block.replace(/\s*\^\[[^\]]+\]/gu, '').trim(), evidenceIds });
    title = '';
  }
  if (!sections.length) throw new Error('Wiki page has no cited content');
  return sections;
}
