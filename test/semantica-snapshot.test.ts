/** Contract tests for the Semantica-only wiki input boundary. */

import { describe, expect, it } from "vitest";
import {
  adaptSemanticaSnapshot,
  semanticaSnapshotDigest,
  type SemanticaSnapshot,
} from "../src/semantica-snapshot.js";

function fixture(): SemanticaSnapshot {
  const snapshot = {
    snapshotId: "snapshot-1",
    inputRevision: "revision-1",
    pages: [
      { entityId: "entity-a", title: "Alpha", summary: "Approved Alpha.", sourceIds: ["source-a"], evidenceIds: ["evidence-a"] },
      { entityId: "entity-b", title: "Beta", summary: "Approved Beta.", sourceIds: ["source-b"], evidenceIds: ["evidence-b"] },
    ],
    evidence: [
      { id: "evidence-a", sourceId: "source-a", quote: "Alpha evidence" },
      { id: "evidence-b", sourceId: "source-b", quote: "Beta evidence" },
    ],
    relations: [{ fromEntityId: "entity-a", toEntityId: "entity-b", label: "related" }],
  };
  return { ...snapshot, digest: semanticaSnapshotDigest(snapshot) };
}

describe("Semantica snapshot adapter", () => {
  it("preserves identity, evidence, and relation links", () => {
    const result = adaptSemanticaSnapshot(fixture());
    expect(result.warnings).toEqual([]);
    expect(result.pages[0].metadata).toMatchObject({ semanticaSnapshotId: "snapshot-1", semanticaEntityId: "entity-a", evidenceIds: ["evidence-a"] });
    expect(result.pages[0].markdown).toContain("[[beta-entity-b]]");
  });

  it("rejects a changed snapshot", () => {
    const snapshot = fixture();
    snapshot.pages[0].summary = "tampered";
    expect(() => adaptSemanticaSnapshot(snapshot)).toThrow(/digest mismatch/);
  });

  it("fails closed when evidence is missing and warns on dangling relations", () => {
    const snapshot = fixture();
    snapshot.relations.push({ fromEntityId: "entity-a", toEntityId: "gone", label: "old" });
    const { digest: _originalDigest, ...withDanglingRelation } = snapshot;
    snapshot.digest = semanticaSnapshotDigest(withDanglingRelation);
    expect(adaptSemanticaSnapshot(snapshot).warnings).toHaveLength(1);
    snapshot.pages[0].evidenceIds = ["missing"];
    const { digest: _digest, ...content } = snapshot;
    snapshot.digest = semanticaSnapshotDigest(content);
    expect(() => adaptSemanticaSnapshot(snapshot)).toThrow(/Missing Semantica evidence/);
  });
});
