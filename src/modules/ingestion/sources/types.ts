import type { IngestionSource } from "@/lib/db/schema";

/** A unit of raw material ready to become an `ingestion_jobs` row. */
export interface RawDoc {
  /** ingestion_jobs.kind */
  kind: string;
  /** stable per (source, unit) — re-fetches are idempotent */
  dedupeKey: string;
  payload: {
    text: string;
    title: string;
    /** knowledge_documents.source_kind */
    sourceKind: string;
    /** knowledge_documents.source_ref prefix */
    sourceRef: string;
    /** skill_evidence.source_type for anything this produces */
    evidenceSourceType: "github_repo" | "conversation" | "linkedin" | "local_doc";
  };
}

export interface FetchResult {
  docs: RawDoc[];
  /** the new cursor to persist on the source (SHA / timestamp / offset) */
  cursor: string | null;
}

export interface SourceConnector {
  /** ingestion_sources.kind this connector handles */
  readonly kind: string;
  /** Optional: candidate sub-sources for the user to pick (e.g. repos). */
  list?(): Promise<{ ref: string; label: string; hint?: string }[]>;
  /** Produce raw docs since `source.lastCursor`; return the next cursor. */
  fetchSince(source: IngestionSource): Promise<FetchResult>;
}
