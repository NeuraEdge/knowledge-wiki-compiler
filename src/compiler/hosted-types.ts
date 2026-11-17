/**
 * Host boundary for the native compiler when source storage and model execution
 * are supplied by an application. Evidence identity and location remain owned
 * by the source system; wiki identities describe editorial pages, not entities.
 */
export interface HostedSource {
  id: string;
  title: string;
  revision?: string;
  passages: AsyncIterable<HostedPassage> | Iterable<HostedPassage>;
}
export interface HostedPassage { text: string; sectionPath: string[] }
export interface HostedEvidence {
  id: string;
  sourceId: string;
  quote: string;
  locator: Record<string, unknown>;
}
export interface HostedPagePlan {
  id: string;
  title: string;
  type: 'concept' | 'topic' | 'open-question';
  summary: string;
  sourceIds: string[];
  query: string;
  relatedIds: string[];
}
export interface HostedReport {
  warnings?: string[];
  id: string;
  title: string;
  type: string;
  sections: Array<{ title?: string; text: string; evidenceIds: string[] }>;
  dependsOn: string[];
}
export interface HostedCompileInput {
  sources: HostedSource[];
  signal?: AbortSignal;
  complete(request: { system: string; user: string; stage: string }): Promise<string>;
  retrieve(request: { query: string; sourceIds: string[]; limit: number }): Promise<HostedEvidence[]>;
  onProgress?(stage: string, detail: string): void;
  checkpoint?<T>(binding: string, produce: () => Promise<T>, stage?: 'document'): Promise<T>;
}
