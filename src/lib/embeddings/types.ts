/** Every embedding in the knowledge base is this many dimensions. */
export const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingProvider {
  /**
   * Stable id, recorded on each chunk as `embedding_model`. Retrieval only ever
   * compares chunks written by the same id — vectors from different models live
   * in different spaces and must not be mixed.
   */
  readonly id: string;
  readonly dimensions: number;
  /** Embed a batch. Returns one vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}
