/**
 * JobQueue dedup tests.
 *
 * createJob() collapses genuinely identical requests onto one job (retry
 * protection), but must NOT collapse requests that differ in a param the caller
 * cares about. Regression cover for #80: a second generate-map call with the
 * same prompt but a different scene_name was handed back the earlier job and
 * created the scene under the earlier call's name.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { JobQueue } from './job-queue.js';

function makeQueue() {
  const logger: any = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  return new JobQueue({ logger });
}

const base = {
  prompt: 'a quiet moonlit forest clearing',
  size: 'medium' as const,
  grid_size: 70,
  quality: 'low',
};

let queues: JobQueue[] = [];
function queue() {
  const q = makeQueue();
  queues.push(q);
  return q;
}
afterEach(async () => {
  await Promise.all(queues.map(q => q.shutdown()));
  queues = [];
});

describe('JobQueue.createJob dedup', () => {
  it('dedups a genuinely identical request', async () => {
    const q = queue();
    const a = await q.createJob({ params: { ...base, scene_name: 'A' } });
    const b = await q.createJob({ params: { ...base, scene_name: 'A' } });
    expect(b.id).toBe(a.id);
  });

  it('does not dedup when only scene_name differs (#80)', async () => {
    const q = queue();
    const a = await q.createJob({ params: { ...base, scene_name: 'A' } });
    const b = await q.createJob({ params: { ...base, scene_name: 'B' } });
    expect(b.id).not.toBe(a.id);
    expect(b.params.scene_name).toBe('B');
  });

  it('does not dedup when only quality differs', async () => {
    const q = queue();
    const a = await q.createJob({ params: { ...base, scene_name: 'A', quality: 'low' } });
    const b = await q.createJob({ params: { ...base, scene_name: 'A', quality: 'high' } });
    expect(b.id).not.toBe(a.id);
  });
});
