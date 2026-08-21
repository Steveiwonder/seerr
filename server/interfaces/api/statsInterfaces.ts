export interface StatsUser {
  id: number;
  displayName: string;
  avatar: string;
  /** Stable colour slot, assigned by account id so filtering never repaints. */
  slot: number;
  requests: number;
  movies: number;
  tv: number;
  seasons: number;
  bytes: number;
  /** Requests resolving to 0 bytes because nothing is on disk yet. */
  pending: number;
  /** Requests with no Radarr/Sonarr entry at all. */
  unmatched: number;
  activeWeeks: number;
  avgPerWeek: number;
  avgPerActiveWeek: number;
  peakWeek: string | null;
  peakCount: number;
  first: string | null;
  last: string | null;
  /** ISO week key -> request count. */
  weeks: Record<string, number>;
}

export interface StatsRequestRow {
  id: number;
  type: string;
  title: string;
  status: string;
  user: string;
  userId: number;
  createdAt: string;
  week: string;
  bytes: number;
  matched: boolean;
  seasons: number[];
  is4k: boolean;
}

export interface StatsTotals {
  requests: number;
  bytes: number;
  requesters: number;
  accounts: number;
  movies: number;
  tv: number;
  seasons: number;
  pending: number;
  unmatched: number;
  spanWeeks: number;
  start: string | null;
  end: string | null;
}

export interface StatsResponse {
  generatedAt: string;
  /** False when no Radarr/Sonarr server answered; byte figures are then all 0. */
  sizesAvailable: boolean;
  warnings: string[];
  /** Every ISO week in range, including quiet ones. */
  weeks: string[];
  /** ISO week key -> Monday's date, so the client needn't do calendar maths. */
  weekStarts: Record<string, string>;
  users: StatsUser[];
  requests: StatsRequestRow[];
  totals: StatsTotals;
}
