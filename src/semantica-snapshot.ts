/**
 * Converts an already-approved Semantica snapshot into wiki page inputs.
 *
 * This boundary deliberately consumes IDs and evidence from Semantica. It
 * does not read source files, call an LLM, merge entities, or infer facts.
 */

import { createHash } from "node:crypto";

export interface SemanticaEvidence {
  id: string;
  sourceId: string;
  quote: string;
}

export interface SemanticaPageInput {
  entityId: string;
  title: string;
  summary: string;
  topicId?: string;
  reportId?: string;
  sourceIds: string[];
  evidenceIds: string[];
}

export interface SemanticaRelation {
  fromEntityId: string;
  toEntityId: string;
  label: string;
}

export interface SemanticaSnapshot {
  snapshotId: string;
  inputRevision: string;
  digest: string;
  pages: SemanticaPageInput[];
  evidence: SemanticaEvidence[];
  relations: SemanticaRelation[];
}

export interface WikiPageInput {
  slug: string;
  markdown: string;
  metadata: {
    semanticaSnapshotId: string;
    semanticaEntityId: string;
    semanticaTopicId?: string;
    semanticaReportId?: string;
    evidenceIds: string[];
    sourceIds: string[];
  };
}

export interface SemanticaAdapterResult {
  pages: WikiPageInput[];
  warnings: string[];
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function snapshotDigest(snapshot: SemanticaSnapshot): string {
  const { digest: _digest, ...content } = snapshot;
  return createHash("sha256").update(canonicalize(content)).digest("hex");
}

function slugFor(page: SemanticaPageInput): string {
  const title = page.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${title || "entity"}-${page.entityId}`;
}

function pageMarkdown(page: SemanticaPageInput, links: string[], snapshotId: string): string {
  const frontmatter = [
    "---",
    `semanticaSnapshotId: ${JSON.stringify(snapshotId)}`,
    `semanticaEntityId: ${JSON.stringify(page.entityId)}`,
    ...(page.topicId ? [`semanticaTopicId: ${JSON.stringify(page.topicId)}`] : []),
    ...(page.reportId ? [`semanticaReportId: ${JSON.stringify(page.reportId)}`] : []),
    `evidenceIds: ${JSON.stringify(page.evidenceIds)}`,
    `sourceIds: ${JSON.stringify(page.sourceIds)}`,
    "---",
    "",
    `# ${page.title}`,
    "",
    page.summary,
    ...(links.length ? ["", "## Related", "", ...links.map((link) => `- [[${link}]]`)] : []),
    "",
  ];
  return frontmatter.join("\n");
}

/**
 * Adapt one immutable snapshot. Digest and evidence are trust-boundary checks;
 * dangling relations are retained as warnings because they do not invalidate
 * the page facts supplied by Semantica.
 */
export function adaptSemanticaSnapshot(snapshot: SemanticaSnapshot): SemanticaAdapterResult {
  if (snapshot.digest !== snapshotDigest(snapshot)) {
    throw new Error(`Semantica snapshot digest mismatch: ${snapshot.snapshotId}`);
  }
  const byEntity = new Map(snapshot.pages.map((page) => [page.entityId, page]));
  if (byEntity.size !== snapshot.pages.length) throw new Error("Semantica snapshot contains duplicate entity IDs");
  const evidenceIds = new Set(snapshot.evidence.map((evidence) => evidence.id));
  const warnings: string[] = [];
  const links = new Map<string, string[]>();
  for (const relation of snapshot.relations) {
    const target = byEntity.get(relation.toEntityId);
    if (!target || !byEntity.has(relation.fromEntityId)) {
      warnings.push(`Dangling Semantica relation: ${relation.fromEntityId} -> ${relation.toEntityId}`);
      continue;
    }
    links.set(relation.fromEntityId, [...(links.get(relation.fromEntityId) ?? []), slugFor(target)]);
  }
  const pages = snapshot.pages.map((page) => {
    if (page.evidenceIds.some((id) => !evidenceIds.has(id))) {
      throw new Error(`Missing Semantica evidence for entity: ${page.entityId}`);
    }
    const metadata = {
      semanticaSnapshotId: snapshot.snapshotId,
      semanticaEntityId: page.entityId,
      ...(page.topicId ? { semanticaTopicId: page.topicId } : {}),
      ...(page.reportId ? { semanticaReportId: page.reportId } : {}),
      evidenceIds: [...page.evidenceIds],
      sourceIds: [...page.sourceIds],
    };
    return { slug: slugFor(page), markdown: pageMarkdown(page, links.get(page.entityId) ?? [], snapshot.snapshotId), metadata };
  });
  return { pages, warnings };
}

/** Compute the digest expected by {@link adaptSemanticaSnapshot}. */
export function semanticaSnapshotDigest(snapshot: Omit<SemanticaSnapshot, "digest">): string {
  return createHash("sha256").update(canonicalize(snapshot)).digest("hex");
}
