import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Fixtures live in a temp dir; runs/ is read-only and never touched here.
let runsDir: string;

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

const GOOD_NIGHT = '2026-11-01';
const EMPTY_NIGHT = '2026-11-02';
const BAD_NIGHT = '2026-11-03';
const MISSING_NIGHT = '2026-11-09';

const line = (job: string, status: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at: '2026-11-01T01:30:00+01:00', job, status, owner: 'rook', ...extra });

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  config.runsDir = runsDir;

  // Written out of job order on purpose: the page and the JSON must both sort by job.
  writeFileSync(
    join(runsDir, `${GOOD_NIGHT}.jsonl`),
    [
      line('lane/sync', 'ok'),
      line('fixtures/refresh', 'retry', { error: 'upstream 503' }),
      line('digest/render', 'ok', { owner: null }),
      line('fixtures/refresh', 'ok'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD_NIGHT}.jsonl`),
    [line('lane/sync', 'ok'), 'this is not json', line('digest/render', 'ok', { owner: null })].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('answers 200 with every job and the latest error for a night with a file', async () => {
    const res = await createApp(config).request(`/digest/${GOOD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest/render');
    expect(html).toContain('fixtures/refresh');
    expect(html).toContain('lane/sync');
    expect(html).toContain('upstream 503');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('answers 200 and says nothing ran for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('answers 200 and still lists the good jobs when a line is bad', async () => {
    const res = await createApp(config).request(`/digest/${BAD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('digest/render');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with the Night object and one row per job', async () => {
    const res = await createApp(config).request(`/api/digest/${GOOD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe(GOOD_NIGHT);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync']);
    expect(body.rows.find((r) => r.job === 'fixtures/refresh')).toMatchObject({
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'upstream 503',
    });
    expect(body.counts).toEqual({ ok: 3, retry: 1, fail: 0 });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('answers 200 with no rows for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body).toMatchObject({ night: EMPTY_NIGHT, rows: [], badLines: 0 });
  });

  it('counts the bad line and keeps the good rows', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
  });
});

describe('digest job order', () => {
  it('lists jobs in the JSON order on the page', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${GOOD_NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${GOOD_NIGHT}`)).json()) as Night;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
