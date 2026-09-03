import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 150,
});

/** Split a document body into overlapping chunks for embedding. */
export async function chunkText(text: string): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return splitter.splitText(trimmed);
}

/** Cheap token estimate (~4 chars/token) — good enough for budgeting. */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4);
