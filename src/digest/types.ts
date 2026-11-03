// Plan morning-digest § 1. The contract every part of § 2 starts against: the reader fills it,
// the page, the JSON and the board link only read it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the log's offset; owner and lastError stay null here and the
// views render them as `—`.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse: counted, never thrown.
  badLines: number;
  // Lines per status, for the board.
  counts: Record<RunStatus, number>;
};

// null when runs/<night>.jsonl doesn't exist (the routes answer 404). An empty file is a Night
// with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
