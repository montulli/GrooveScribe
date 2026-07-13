import { describe, it, expect } from 'vitest';
import { newGrooveUtils, loadGrooves } from './legacyLoader.js';

// Meta-tests for the legacy loader itself. If these fail, every other suite is
// suspect -- so they act as a smoke check of the test infrastructure (the
// in-memory export shim, the jsdom environment, instance isolation).
describe('legacy source loading', () => {
  it('loads the GrooveUtils constructor from the unmodified source file', async () => {
    const gu = await newGrooveUtils();
    expect(gu).toBeTypeOf('object');
    expect(gu.parseTimeSigString).toBeTypeOf('function');
  });

  it('returns independent instances on each construction', async () => {
    const a = await newGrooveUtils();
    const b = await newGrooveUtils();
    expect(a).not.toBe(b);
    a.setMetronomeSolo(true);
    expect(a.getMetronomeSolo()).toBe(true);
    // Mutating one instance must not leak into another.
    expect(b.getMetronomeSolo()).toBe(false);
  });

  it('loads the grooves library object from its source file', async () => {
    const grooves = await loadGrooves();
    expect(grooves).toBeTypeOf('object');
    expect(grooves.Rock_Grooves).toBeTypeOf('object');
  });

  it('runs inside a jsdom environment with a working window.location', () => {
    // Confirms the environment the rest of the suite relies on.
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    expect(window.location).toBeTruthy();
  });
});
