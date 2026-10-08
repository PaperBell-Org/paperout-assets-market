import { describe, it, expect } from 'vitest';
import { hasCoreChangeLabel } from '../scripts/check-pr-scope.mjs';

describe('hasCoreChangeLabel', () => {
  it('accepts the label alone or among others, in any case, with stray spaces', () => {
    expect(hasCoreChangeLabel('core-change')).toBe(true);
    expect(hasCoreChangeLabel('enhancement,core-change,docs')).toBe(true);
    expect(hasCoreChangeLabel('docs, Core-Change ')).toBe(true);
  });

  it('rejects labels that merely contain core-change', () => {
    expect(hasCoreChangeLabel('not-core-change')).toBe(false);
    expect(hasCoreChangeLabel('revert-core-change,docs')).toBe(false);
    expect(hasCoreChangeLabel('core-change-requested')).toBe(false);
    expect(hasCoreChangeLabel('core change')).toBe(false);
  });

  it('rejects no labels', () => {
    expect(hasCoreChangeLabel('')).toBe(false);
    expect(hasCoreChangeLabel(undefined)).toBe(false);
  });
});
