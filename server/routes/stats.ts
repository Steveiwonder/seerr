import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import type {
  StatsRequestRow,
  StatsResponse,
  StatsUser,
} from '@server/interfaces/api/statsInterfaces';
import { getSizeIndex, resolveRequestSize } from '@server/lib/mediasize';
import logger from '@server/logger';
import { Router } from 'express';

const statsRoutes = Router();

const STATUS_NAMES: Record<number, string> = {
  [MediaRequestStatus.PENDING]: 'pending',
  [MediaRequestStatus.APPROVED]: 'approved',
  [MediaRequestStatus.DECLINED]: 'declined',
  [MediaRequestStatus.FAILED]: 'failed',
  [MediaRequestStatus.COMPLETED]: 'completed',
};

/**
 * ISO-8601 week (Mon-Sun) of a date, in UTC.
 *
 * UTC rather than local so the same request always lands in the same bucket
 * regardless of who is looking or from where.
 */
const isoWeek = (date: Date): { year: number; week: number } => {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // Thursday of the current week decides the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { year: d.getUTCFullYear(), week };
};

const weekKey = (date: Date) => {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
};

/** Monday of a given ISO week, as YYYY-MM-DD. */
const weekStart = (key: string): string => {
  const year = Number(key.slice(0, 4));
  const week = Number(key.slice(6));
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
};

/** Every week between two keys inclusive, so quiet weeks show as gaps. */
const weekRange = (first: string, last: string): string[] => {
  const out: string[] = [];
  const cursor = new Date(`${weekStart(first)}T00:00:00Z`);
  const end = new Date(`${weekStart(last)}T00:00:00Z`);
  while (cursor <= end && out.length < 520) {
    out.push(weekKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
};

statsRoutes.get('/', async (req, res, next) => {
  try {
    const requestRepository = getRepository(MediaRequest);
    const userRepository = getRepository(User);

    // media, requestedBy and seasons are eager relations on MediaRequest.
    const [requests, accountCount] = await Promise.all([
      requestRepository.find({ order: { createdAt: 'DESC' } }),
      userRepository.count(),
    ]);

    const sizes = await getSizeIndex(req.query.refresh === '1');

    const byUser = new Map<number, StatsUser>();
    // Week tallies live alongside rather than on StatsUser, so the aggregate can
    // be serialised straight out without stripping working fields.
    const weekMaps = new Map<number, Map<string, number>>();
    const rows: StatsRequestRow[] = [];
    const weeksSeen = new Set<string>();

    for (const request of requests) {
      const requester = request.requestedBy;
      if (!requester) {
        continue;
      }

      const created = new Date(request.createdAt);
      const key = weekKey(created);
      weeksSeen.add(key);

      const { bytes, title, matched } = resolveRequestSize(sizes, {
        type: request.type,
        is4k: request.is4k,
        media: request.media,
        seasons: request.seasons ?? [],
      });

      let user = byUser.get(requester.id);
      if (!user) {
        user = {
          id: requester.id,
          displayName: requester.displayName,
          avatar: requester.avatar,
          slot: 0,
          requests: 0,
          movies: 0,
          tv: 0,
          seasons: 0,
          bytes: 0,
          pending: 0,
          unmatched: 0,
          activeWeeks: 0,
          avgPerWeek: 0,
          avgPerActiveWeek: 0,
          peakWeek: null,
          peakCount: 0,
          first: null,
          last: null,
          weeks: {},
        };
        byUser.set(requester.id, user);
        weekMaps.set(requester.id, new Map());
      }

      const weekMap = weekMaps.get(requester.id) as Map<string, number>;
      user.requests += 1;
      user.bytes += bytes;
      weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
      if (request.type === MediaType.MOVIE) {
        user.movies += 1;
      } else {
        user.tv += 1;
        user.seasons += request.seasons?.length || 1;
      }
      if (!matched) {
        user.unmatched += 1;
      }
      if (bytes === 0) {
        user.pending += 1;
      }

      const iso = created.toISOString();
      if (!user.first || iso < user.first) user.first = iso;
      if (!user.last || iso > user.last) user.last = iso;

      rows.push({
        id: request.id,
        type: request.type,
        title: title ?? `tmdb:${request.media.tmdbId}`,
        status: STATUS_NAMES[request.status] ?? String(request.status),
        user: requester.displayName,
        userId: requester.id,
        createdAt: iso,
        week: key,
        bytes,
        matched,
        seasons: (request.seasons ?? []).map((s) => s.seasonNumber),
        is4k: request.is4k,
      });
    }

    const sorted = [...weeksSeen].sort();
    const weeks = sorted.length
      ? weekRange(sorted[0], sorted[sorted.length - 1])
      : [];
    const span = weeks.length || 1;

    // Colour slots follow account id, never rank, so re-sorting the leaderboard
    // or filtering a user out never repaints the survivors.
    const users = [...byUser.values()].sort((a, b) => a.id - b.id);
    users.forEach((user, i) => {
      const weekMap = weekMaps.get(user.id) ?? new Map<string, number>();
      user.slot = i;
      user.activeWeeks = weekMap.size;
      user.avgPerWeek = Number((user.requests / span).toFixed(3));
      user.avgPerActiveWeek = user.activeWeeks
        ? Number((user.requests / user.activeWeeks).toFixed(3))
        : 0;
      for (const [week, count] of weekMap) {
        if (count > user.peakCount) {
          user.peakCount = count;
          user.peakWeek = week;
        }
      }
      user.weeks = Object.fromEntries([...weekMap.entries()].sort());
    });

    const payload: StatsResponse = {
      generatedAt: new Date().toISOString(),
      sizesAvailable: sizes.available,
      warnings: sizes.warnings,
      weeks,
      weekStarts: Object.fromEntries(weeks.map((w) => [w, weekStart(w)])),
      users,
      requests: rows,
      totals: {
        requests: rows.length,
        bytes: users.reduce((sum, u) => sum + u.bytes, 0),
        requesters: users.length,
        accounts: accountCount,
        movies: users.reduce((sum, u) => sum + u.movies, 0),
        tv: users.reduce((sum, u) => sum + u.tv, 0),
        seasons: users.reduce((sum, u) => sum + u.seasons, 0),
        pending: users.reduce((sum, u) => sum + u.pending, 0),
        unmatched: users.reduce((sum, u) => sum + u.unmatched, 0),
        spanWeeks: weeks.length,
        start: rows.length ? rows[rows.length - 1].createdAt : null,
        end: rows.length ? rows[0].createdAt : null,
      },
    };

    return res.status(200).json(payload);
  } catch (e) {
    logger.error('Something went wrong retrieving request stats', {
      label: 'API',
      errorMessage: e.message,
    });
    return next({ status: 500, message: 'Unable to retrieve request stats.' });
  }
});

export default statsRoutes;
