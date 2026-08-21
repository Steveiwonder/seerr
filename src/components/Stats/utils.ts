import type {
  StatsRequestRow,
  StatsResponse,
  StatsUser,
} from '@server/interfaces/api/statsInterfaces';
import { useEffect, useRef, useState } from 'react';

/**
 * Categorical colour slots, validated for colourblind separation against the
 * dark chart surface (worst adjacent pair dE 8.4 protan, 19.3 normal vision).
 *
 * Seerr's UI is dark-only, so only the dark steps exist here. The ORDER is the
 * safety mechanism, not decoration - adjacent slots are the pairs that end up
 * touching in a stacked column, so they are the ones that must stay apart.
 * Re-order only after re-validating.
 */
export const SERIES = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
] as const;

export const seriesColor = (slot: number) => SERIES[slot % SERIES.length];

export type Metric = 'requests' | 'bytes';
export type Kind = 'all' | 'movie' | 'tv';

export const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 GB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  if (gb >= 100) return `${gb.toFixed(0)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
};

export const formatMetric = (value: number, metric: Metric) =>
  metric === 'bytes' ? formatBytes(value) : value.toLocaleString();

/** Round axis ticks to clean numbers so gridlines land on 0 / 5 / 10. */
export const axisTicks = (max: number, target = 4) => {
  if (max <= 0) return { max: 1, values: [0, 1] };
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => mag * m >= raw) ?? 10) * mag;
  const top = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) values.push(v);
  return { max: top, values };
};

/** Rounded data-end, square at the baseline (horizontal bar). */
export const barPathH = (x: number, y: number, w: number, h: number, r = 4) => {
  const radius = Math.min(r, w, h / 2);
  if (w <= 0.5) return `M${x},${y}h0.5v${h}h-0.5z`;
  const x1 = x + w;
  return (
    `M${x},${y}H${x1 - radius}Q${x1},${y} ${x1},${y + radius}` +
    `V${y + h - radius}Q${x1},${y + h} ${x1 - radius},${y + h}H${x}Z`
  );
};

/** Rounded cap, square at the baseline (vertical column). */
export const barPathV = (
  x: number,
  top: number,
  w: number,
  h: number,
  r = 4
) => {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0.5) return `M${x},${top}h${w}v0.5h${-w}z`;
  const bottom = top + h;
  return (
    `M${x},${bottom}V${top + radius}Q${x},${top} ${x + radius},${top}` +
    `H${x + w - radius}Q${x + w},${top} ${x + w},${top + radius}V${bottom}Z`
  );
};

/** Width of an element, kept current across resizes. */
export const useElementWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
};

export interface DerivedUser extends StatsUser {
  weekMap: Map<string, number>;
  avgPerWeekFiltered: number;
  bytesPerRequest: number;
  peak: [string, number] | null;
}

export interface Derived {
  weeks: string[];
  rows: StatsRequestRow[];
  users: DerivedUser[];
  ranked: DerivedUser[];
  weekTotals: number[];
  totals: {
    requests: number;
    bytes: number;
    movies: number;
    tv: number;
    seasons: number;
    pending: number;
  };
}

/**
 * Recompute every figure on screen from the raw request rows.
 *
 * Filtering happens here rather than server-side so the controls respond
 * instantly. Fine at this scale; if an instance ever has tens of thousands of
 * requests, the log rows are the thing to paginate first.
 */
export const derive = (
  data: StatsResponse,
  {
    weeks: weekWindow,
    kind,
    hidden,
  }: {
    weeks: number;
    kind: Kind;
    hidden: Set<number>;
  }
): Derived => {
  const weeks =
    weekWindow > 0 ? data.weeks.slice(-weekWindow) : [...data.weeks];
  const weekSet = new Set(weeks);

  const rows = data.requests.filter(
    (r) =>
      weekSet.has(r.week) &&
      (kind === 'all' || r.type === kind) &&
      !hidden.has(r.userId)
  );

  const byUser = new Map<number, DerivedUser>();
  for (const user of data.users) {
    byUser.set(user.id, {
      ...user,
      requests: 0,
      movies: 0,
      tv: 0,
      seasons: 0,
      bytes: 0,
      pending: 0,
      unmatched: 0,
      activeWeeks: 0,
      weekMap: new Map(),
      avgPerWeekFiltered: 0,
      bytesPerRequest: 0,
      peak: null,
    });
  }

  for (const row of rows) {
    const user = byUser.get(row.userId);
    if (!user) continue;
    user.requests += 1;
    user.bytes += row.bytes;
    user.weekMap.set(row.week, (user.weekMap.get(row.week) ?? 0) + 1);
    if (row.type === 'movie') {
      user.movies += 1;
    } else {
      user.tv += 1;
      user.seasons += row.seasons.length || 1;
    }
    if (row.bytes === 0) user.pending += 1;
    if (!row.matched) user.unmatched += 1;
  }

  const users = [...byUser.values()].filter((u) => u.requests > 0);
  for (const user of users) {
    user.activeWeeks = user.weekMap.size;
    user.avgPerWeekFiltered = user.requests / (weeks.length || 1);
    user.bytesPerRequest = user.requests ? user.bytes / user.requests : 0;
    let peak: [string, number] | null = null;
    for (const entry of user.weekMap) {
      if (!peak || entry[1] > peak[1]) peak = entry;
    }
    user.peak = peak;
  }

  return {
    weeks,
    rows,
    users,
    ranked: [...users].sort((a, b) => b.requests - a.requests),
    weekTotals: weeks.map((w) =>
      users.reduce((sum, u) => sum + (u.weekMap.get(w) ?? 0), 0)
    ),
    totals: {
      requests: rows.length,
      bytes: rows.reduce((sum, r) => sum + r.bytes, 0),
      movies: rows.filter((r) => r.type === 'movie').length,
      tv: rows.filter((r) => r.type === 'tv').length,
      seasons: users.reduce((sum, u) => sum + u.seasons, 0),
      pending: rows.filter((r) => r.bytes === 0).length,
    },
  };
};

export const rankBy = (users: DerivedUser[], metric: Metric) =>
  [...users].sort((a, b) => b[metric] - a[metric] || b.requests - a.requests);
