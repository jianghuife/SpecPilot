import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_TYPE_POLICIES } from '../../src/memory/knowledge-policy.js';

interface ContextRoutingCase {
  id: string;
  prompt: string;
  expected_knowledge_type: string;
  priority: 'p0' | 'p1' | 'p2';
}

describe('knowledge policy evaluation set', () => {
  it('covers every governed knowledge type with a representative routing case', async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const cases = (await readFile(path.join(root, 'docs/ai/evals/context-routing.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as ContextRoutingCase);
    const policies = new Map(KNOWLEDGE_TYPE_POLICIES.map((policy) => [policy.id, policy]));

    expect(new Set(KNOWLEDGE_TYPE_POLICIES.map((policy) => policy.id)).size).toBe(16);
    expect(new Set(cases.map((item) => item.expected_knowledge_type))).toEqual(
      new Set(policies.keys()),
    );
    for (const item of cases) {
      expect(item.id).not.toBe('');
      expect(item.prompt.length).toBeGreaterThan(20);
      const policy = policies.get(item.expected_knowledge_type);
      expect(policy?.priority).toBe(item.priority);
      expect(policy?.recommended_locations.length).toBeGreaterThan(0);
      expect(policy?.update_when.length).toBeGreaterThan(0);
    }
  });
});
