import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('run log reader', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28')!;
    expect(n.badLines).toBe(1);
    expect(n.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(n.counts).toEqual({ ok: 10, retry: 4, fail: 1 });

    const refresh = n.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(refresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(n.rows.find((r) => r.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
    expect(n.rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render')!;
    expect(row.owner).toBeNull();
    expect(row.lastError).toBeNull();
  });

  it('returns null for a night with no file, and for a name that is not a night', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    expect(readNight(dir, '2026-11-01')).toEqual({
      night: '2026-11-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts lines with the wrong shape as bad, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-11-01.jsonl'),
      ['null', '[]', '{"at":"x","job":"a","status":"maybe","owner":null}', '{"at":"x","job":"a","status":"ok"}'].join('\n'),
    );
    const n = readNight(dir, '2026-11-01')!;
    expect(n.badLines).toBe(3);
    expect(n.rows).toHaveLength(1);
    expect(n.rows[0]!.owner).toBeNull();
  });
});
