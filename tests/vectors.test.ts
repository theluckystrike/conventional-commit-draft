import { describe, expect, it } from 'vitest';
import vectors from './vectors/conventional-commit-draft.json';
import * as draft from '../src/draft';
interface Case { name: string; function: string; args: unknown[]; expected: unknown }
describe('Golden acceptance vectors', () => {
  it('has at least 20 vectors', () => expect(vectors.cases.length).toBeGreaterThanOrEqual(20));
  for (const c of vectors.cases as Case[]) it(c.name, () => {
    const fn = (draft as unknown as Record<string, (...args: unknown[]) => unknown>)[c.function]!;
    const expected = c.expected as { error?: string };
    if (expected.error) expect(() => fn(...c.args)).toThrow(expected.error);
    else expect(fn(...c.args)).toEqual(c.expected);
  });
});
