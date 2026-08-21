import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import type { TooltipContent } from '@app/components/Stats/ChartTooltip';
import ChartTooltip, { ChartCard } from '@app/components/Stats/ChartTooltip';
import Leaderboard, {
  LeaderboardTable,
} from '@app/components/Stats/Leaderboard';
import RequestLog from '@app/components/Stats/RequestLog';
import SmallMultiples from '@app/components/Stats/SmallMultiples';
import WeeklyChart, {
  WeeklyLegend,
  WeeklyTable,
} from '@app/components/Stats/WeeklyChart';
import type { Kind, Metric } from '@app/components/Stats/utils';
import {
  derive,
  formatBytes,
  rankBy,
  seriesColor,
} from '@app/components/Stats/utils';
import defineMessages from '@app/utils/defineMessages';
import type { StatsResponse } from '@server/interfaces/api/statsInterfaces';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Stats', {
  stats: 'Stats',
  subtext: 'Who requests what, how often, and how much of the disk it takes.',
  period: 'Period',
  rankBy: 'Rank by',
  type: 'Type',
  users: 'Users',
  allTime: 'All time',
  weeksShort: '{count} wks',
  requests: 'Requests',
  data: 'Data',
  all: 'All',
  movies: 'Movies',
  tv: 'TV',
  tableView: 'Table view',
  chartView: 'Chart view',
  whoRequestsMost: 'Who requests the most',
  whoPullsMostData: 'Who pulls the most data',
  requestsPerWeek: 'Requests per week',
  eachUserWeekly: 'Each user, week by week',
  requestLog: 'Request log',
  dataOnDisk: 'Data on disk',
  activeRequesters: 'Active requesters',
  moviesTv: 'Movies / TV',
  busiestWeek: 'Busiest week',
  avgPerWeek: 'Avg per week',
  notDownloaded: 'Not yet downloaded',
  sizesUnavailable:
    'Radarr and Sonarr could not be reached, so every size reads as zero. Request counts are unaffected.',
  pendingNote:
    '{count} requests have no file on disk yet, so they count as zero bytes. Data figures are what actually landed, not what was asked for.',
});

const SEGMENT_BASE =
  'whitespace-nowrap border-r border-gray-500 px-3 py-2 text-sm font-medium leading-5 transition last:border-r-0 sm:px-3.5';

const Segmented = <T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[11px] uppercase tracking-wider text-gray-500">
      {label}
    </span>
    <div className="inline-flex overflow-hidden rounded-md border border-gray-500 bg-gray-700 shadow-sm">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`${SEGMENT_BASE} ${
            option.value === value
              ? 'bg-indigo-600/80 text-white hover:bg-indigo-600'
              : 'text-gray-300 hover:bg-gray-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const Tile = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider text-gray-500">
      {label}
    </p>
    <p className="mt-1 text-xl font-semibold text-gray-100">{value}</p>
    {note && <p className="text-xs text-gray-400">{note}</p>}
  </div>
);

const Stats = () => {
  const intl = useIntl();
  const { data, error } = useSWR<StatsResponse>('/api/v1/stats');

  const [weeks, setWeeks] = useState(0);
  const [metric, setMetric] = useState<Metric>('requests');
  const [kind, setKind] = useState<Kind>('all');
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const [lbTable, setLbTable] = useState(false);
  const [wkTable, setWkTable] = useState(false);

  const view = useMemo(
    () => (data ? derive(data, { weeks, kind, hidden }) : null),
    [data, weeks, kind, hidden]
  );

  if (error) {
    return (
      <div className="mt-8 text-gray-300">Unable to load request stats.</div>
    );
  }
  if (!data || !view) {
    return <LoadingSpinner />;
  }

  const ranked = rankBy(view.users, metric);
  const top = ranked[0];
  const totalForMetric =
    metric === 'bytes' ? view.totals.bytes : view.totals.requests;
  const busiest = view.weekTotals.reduce(
    (best, n, i) => (n > best.n ? { n, i } : best),
    { n: -1, i: 0 }
  );
  const weekStart = (key: string) =>
    new Date(`${data.weekStarts[key]}T00:00:00Z`).toLocaleDateString(
      undefined,
      {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }
    );

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.stats)} />
      <Header subtext={intl.formatMessage(messages.subtext)}>
        {intl.formatMessage(messages.stats)}
      </Header>

      {!data.sizesAvailable && (
        <div className="mt-4 rounded-lg border border-l-4 border-gray-700 border-l-yellow-500 bg-gray-800 bg-opacity-50 px-4 py-3 text-sm text-gray-300">
          {intl.formatMessage(messages.sizesUnavailable)}
          {data.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-gray-400">
              {warning}
            </p>
          ))}
        </div>
      )}
      {data.sizesAvailable && view.totals.pending > 0 && (
        <div className="mt-4 rounded-lg border border-l-4 border-gray-700 border-l-yellow-500 bg-gray-800 bg-opacity-50 px-4 py-3 text-sm text-gray-300">
          {intl.formatMessage(messages.pendingNote, {
            count: view.totals.pending,
          })}
        </div>
      )}

      {/* One filter row, scoping every card below it. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-gray-700 bg-gray-800 bg-opacity-50 px-4 py-3">
        <Segmented
          label={intl.formatMessage(messages.period)}
          value={weeks}
          onChange={setWeeks}
          options={[
            {
              value: 4,
              label: intl.formatMessage(messages.weeksShort, { count: 4 }),
            },
            {
              value: 8,
              label: intl.formatMessage(messages.weeksShort, { count: 8 }),
            },
            {
              value: 12,
              label: intl.formatMessage(messages.weeksShort, { count: 12 }),
            },
            { value: 0, label: intl.formatMessage(messages.allTime) },
          ]}
        />
        <Segmented
          label={intl.formatMessage(messages.rankBy)}
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'requests', label: intl.formatMessage(messages.requests) },
            { value: 'bytes', label: intl.formatMessage(messages.data) },
          ]}
        />
        <Segmented
          label={intl.formatMessage(messages.type)}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: intl.formatMessage(messages.all) },
            { value: 'movie', label: intl.formatMessage(messages.movies) },
            { value: 'tv', label: intl.formatMessage(messages.tv) },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-gray-500">
            {intl.formatMessage(messages.users)}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.users.map((user) => {
              const on = !hidden.has(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(user.id);
                      else next.delete(user.id);
                      return next;
                    })
                  }
                  className={`flex items-center gap-2 rounded-full border border-gray-500 bg-gray-700 px-3 py-2 text-sm font-medium leading-5 shadow-sm transition hover:bg-gray-600 ${
                    on ? 'text-gray-200' : 'text-gray-500'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{
                      backgroundColor: seriesColor(user.slot),
                      opacity: on ? 1 : 0.3,
                    }}
                  />
                  {user.displayName}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hero + KPI row */}
      <div className="mt-4 flex flex-wrap items-center gap-x-12 gap-y-6 rounded-lg border border-gray-700 bg-gray-800 bg-opacity-50 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500">
            {metric === 'bytes'
              ? intl.formatMessage(messages.data)
              : intl.formatMessage(messages.requests)}
          </p>
          <p className="mt-1 text-5xl font-semibold leading-none text-white">
            {metric === 'bytes'
              ? formatBytes(view.totals.bytes)
              : view.totals.requests.toLocaleString()}
          </p>
          {top && totalForMetric > 0 && (
            <p className="mt-2 text-sm text-gray-400">
              {top.displayName} accounts for{' '}
              {((top[metric] / totalForMetric) * 100).toFixed(0)}% of it
            </p>
          )}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Tile
            label={intl.formatMessage(messages.dataOnDisk)}
            value={formatBytes(view.totals.bytes)}
            note={`${formatBytes(
              view.totals.requests
                ? view.totals.bytes / view.totals.requests
                : 0
            )} per request`}
          />
          <Tile
            label={intl.formatMessage(messages.activeRequesters)}
            value={String(view.users.length)}
            note={`of ${data.totals.accounts} accounts`}
          />
          <Tile
            label={intl.formatMessage(messages.moviesTv)}
            value={`${view.totals.movies} / ${view.totals.tv}`}
            note={`${view.totals.seasons} seasons`}
          />
          <Tile
            label={intl.formatMessage(messages.busiestWeek)}
            value={String(Math.max(busiest.n, 0))}
            note={
              view.weeks.length ? `w/c ${weekStart(view.weeks[busiest.i])}` : ''
            }
          />
          <Tile
            label={intl.formatMessage(messages.avgPerWeek)}
            value={(view.totals.requests / (view.weeks.length || 1)).toFixed(1)}
            note={`across ${view.weeks.length} weeks`}
          />
          <Tile
            label={intl.formatMessage(messages.notDownloaded)}
            value={String(view.totals.pending)}
            note={
              view.totals.pending ? 'counted as 0 bytes' : 'everything landed'
            }
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <ChartCard
          title={
            metric === 'bytes'
              ? intl.formatMessage(messages.whoPullsMostData)
              : intl.formatMessage(messages.whoRequestsMost)
          }
          subtitle={`${ranked.length} users over ${view.weeks.length} weeks`}
          action={
            <button
              type="button"
              onClick={() => setLbTable((v) => !v)}
              className="text-sm text-gray-400 hover:text-gray-200"
            >
              {lbTable
                ? intl.formatMessage(messages.chartView)
                : intl.formatMessage(messages.tableView)}
            </button>
          }
        >
          {lbTable ? (
            <LeaderboardTable users={ranked} weekCount={view.weeks.length} />
          ) : (
            <Leaderboard users={ranked} metric={metric} onHover={setTooltip} />
          )}
        </ChartCard>

        <ChartCard
          title={intl.formatMessage(messages.requestsPerWeek)}
          subtitle={`Stacked by user · week beginning Monday · ${view.weeks.length} weeks, ${view.totals.requests} requests`}
          action={
            <button
              type="button"
              onClick={() => setWkTable((v) => !v)}
              className="text-sm text-gray-400 hover:text-gray-200"
            >
              {wkTable
                ? intl.formatMessage(messages.chartView)
                : intl.formatMessage(messages.tableView)}
            </button>
          }
        >
          {wkTable ? (
            <WeeklyTable
              weeks={view.weeks}
              weekStarts={data.weekStarts}
              weekTotals={view.weekTotals}
              users={view.users}
            />
          ) : (
            <>
              <WeeklyLegend users={view.users} />
              <WeeklyChart
                weeks={view.weeks}
                weekStarts={data.weekStarts}
                weekTotals={view.weekTotals}
                users={view.users}
                onHover={setTooltip}
              />
            </>
          )}
        </ChartCard>

        <ChartCard
          title={intl.formatMessage(messages.eachUserWeekly)}
          subtitle="Same vertical scale on every row, so heights compare directly"
        >
          <SmallMultiples
            weeks={view.weeks}
            weekStarts={data.weekStarts}
            users={ranked}
            onHover={setTooltip}
          />
        </ChartCard>

        <ChartCard title={intl.formatMessage(messages.requestLog)}>
          <RequestLog rows={view.rows} users={view.users} />
        </ChartCard>
      </div>

      <ChartTooltip content={tooltip} />
    </>
  );
};

export default Stats;
