import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryCatalog } from '../../src/memory/memory-catalog.js';

interface RetrievalDocument {
  path: string;
  content: string;
}

interface RetrievalCase {
  id: string;
  query: string;
  documents: RetrievalDocument[];
  baseline_top: string;
  expected_top: string;
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function cases(): Promise<RetrievalCase[]> {
  return (
    await readFile(path.join(repositoryRoot, 'docs/ai/evals/retrieval-ranking.jsonl'), 'utf8')
  )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as RetrievalCase);
}

describe('deterministic retrieval ranking evaluation', () => {
  it('ranks the expected result first with token and field weighting', async () => {
    const evaluationCases = await cases();
    expect(new Set(evaluationCases.map((item) => item.id)).size).toBe(evaluationCases.length);
    expect(evaluationCases.some((item) => item.baseline_top !== item.expected_top)).toBe(true);

    for (const item of evaluationCases) {
      const root = await mkdtemp(path.join(tmpdir(), `specpilot-ranking-${item.id}-`));
      for (const document of item.documents) {
        const filePath = path.join(root, document.path);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, document.content);
      }

      const result = await new MemoryCatalog(root).search(item.query);

      expect(result[0]?.relativePath, item.id).toBe(item.expected_top);
    }
  });
});
