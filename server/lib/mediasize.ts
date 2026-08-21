import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import { MediaType } from '@server/constants/media';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

/**
 * Builds an index of "how many bytes does this title actually occupy" by asking
 * Radarr and Sonarr directly.
 *
 * Seerr's Media entity stores no size, and adding one would mean a migration, so
 * this is resolved on demand and cached in memory instead. The trade is a slow
 * first call after expiry (two full library listings) for a schema that stays
 * identical to stock Seerr.
 */

interface SeriesEntry {
  title: string;
  total: number;
  seasons: Map<number, number>;
}

interface MovieEntry {
  title: string;
  bytes: number;
}

export interface SizeIndex {
  movieByService: Map<string, MovieEntry>;
  movieByTmdb: Map<number, MovieEntry>;
  seriesByService: Map<string, SeriesEntry>;
  seriesByTvdb: Map<number, SeriesEntry>;
  /** False when no *arr server could be reached at all. */
  available: boolean;
  warnings: string[];
}

export interface ResolvedSize {
  bytes: number;
  title?: string;
  /** False when the title isn't in Radarr/Sonarr at all (failed or removed). */
  matched: boolean;
}

const CACHE_TTL_MS = 15 * 60 * 1000;

let cached: SizeIndex | undefined;
let cachedAt = 0;
let inFlight: Promise<SizeIndex> | undefined;

const svcKey = (serviceId: number, externalId: number) =>
  `${serviceId}:${externalId}`;

const build = async (): Promise<SizeIndex> => {
  const settings = getSettings();
  const index: SizeIndex = {
    movieByService: new Map(),
    movieByTmdb: new Map(),
    seriesByService: new Map(),
    seriesByTvdb: new Map(),
    available: false,
    warnings: [],
  };

  let reached = 0;

  for (const server of settings.radarr) {
    try {
      const radarr = new RadarrAPI({
        apiKey: server.apiKey,
        url: RadarrAPI.buildUrl(server, '/api/v3'),
      });
      const movies = await radarr.getMovies();
      for (const movie of movies) {
        const entry: MovieEntry = {
          title: movie.year ? `${movie.title} (${movie.year})` : movie.title,
          bytes: movie.sizeOnDisk ?? movie.movieFile?.size ?? 0,
        };
        index.movieByService.set(svcKey(server.id, movie.id), entry);
        if (movie.tmdbId) {
          index.movieByTmdb.set(movie.tmdbId, entry);
        }
      }
      reached++;
    } catch (e) {
      logger.warn('Failed to read movie sizes from Radarr', {
        label: 'Stats',
        server: server.name,
        errorMessage: e.message,
      });
      index.warnings.push(`Could not reach Radarr server "${server.name}".`);
    }
  }

  for (const server of settings.sonarr) {
    try {
      const sonarr = new SonarrAPI({
        apiKey: server.apiKey,
        url: SonarrAPI.buildUrl(server, '/api/v3'),
      });
      const allSeries = await sonarr.getSeries();
      for (const series of allSeries) {
        const entry: SeriesEntry = {
          title: series.title,
          total: series.statistics?.sizeOnDisk ?? 0,
          seasons: new Map(
            series.seasons.map((s) => [
              s.seasonNumber,
              s.statistics?.sizeOnDisk ?? 0,
            ])
          ),
        };
        if (series.id != null) {
          index.seriesByService.set(svcKey(server.id, series.id), entry);
        }
        if (series.tvdbId) {
          index.seriesByTvdb.set(series.tvdbId, entry);
        }
      }
      reached++;
    } catch (e) {
      logger.warn('Failed to read series sizes from Sonarr', {
        label: 'Stats',
        server: server.name,
        errorMessage: e.message,
      });
      index.warnings.push(`Could not reach Sonarr server "${server.name}".`);
    }
  }

  index.available = reached > 0;
  return index;
};

export const getSizeIndex = async (
  forceRefresh = false
): Promise<SizeIndex> => {
  if (!forceRefresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  // Collapse concurrent callers onto one build - two page loads shouldn't mean
  // two full library listings.
  if (!inFlight) {
    inFlight = build()
      .then((index) => {
        cached = index;
        cachedAt = Date.now();
        return index;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  return inFlight;
};

/**
 * Bytes attributable to a single request.
 *
 * A movie counts its whole file. A TV request counts only the seasons actually
 * requested, not the whole series - requesting season 2 shouldn't charge you for
 * seasons 1 through 5. A request whose file hasn't been grabbed yet resolves to
 * 0 bytes, which is why the response reports a separate "pending" count.
 */
export const resolveRequestSize = (
  index: SizeIndex,
  request: {
    type: MediaType | string;
    is4k: boolean;
    media: {
      tmdbId: number;
      tvdbId?: number | null;
      serviceId?: number | null;
      serviceId4k?: number | null;
      externalServiceId?: number | null;
      externalServiceId4k?: number | null;
    };
    seasons: { seasonNumber: number }[];
  }
): ResolvedSize => {
  const { media, is4k } = request;
  const serviceId = is4k ? media.serviceId4k : media.serviceId;
  const externalId = is4k ? media.externalServiceId4k : media.externalServiceId;

  if (request.type === MediaType.MOVIE) {
    const entry =
      (serviceId != null && externalId != null
        ? index.movieByService.get(svcKey(serviceId, externalId))
        : undefined) ??
      (media.tmdbId ? index.movieByTmdb.get(media.tmdbId) : undefined);

    return entry
      ? { bytes: entry.bytes, title: entry.title, matched: true }
      : { bytes: 0, matched: false };
  }

  const entry =
    (serviceId != null && externalId != null
      ? index.seriesByService.get(svcKey(serviceId, externalId))
      : undefined) ??
    (media.tvdbId ? index.seriesByTvdb.get(media.tvdbId) : undefined);

  if (!entry) {
    return { bytes: 0, matched: false };
  }

  const wanted = request.seasons.map((s) => s.seasonNumber);
  if (!wanted.length) {
    return { bytes: entry.total, title: entry.title, matched: true };
  }

  const bytes = wanted.reduce((sum, n) => sum + (entry.seasons.get(n) ?? 0), 0);
  const title =
    wanted.length === 1
      ? `${entry.title} - S${String(wanted[0]).padStart(2, '0')}`
      : `${entry.title} - ${wanted.length} seasons`;

  return { bytes, title, matched: true };
};
