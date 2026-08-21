import type { TooltipContent } from '@app/components/Stats/ChartTooltip';
import type { DerivedUser, Metric } from '@app/components/Stats/utils';
import {
  barPathH,
  formatBytes,
  formatMetric,
  seriesColor,
  useElementWidth,
} from '@app/components/Stats/utils';

interface LeaderboardProps {
  users: DerivedUser[];
  metric: Metric;
  onHover: (content: TooltipContent | null) => void;
}

const ROW_HEIGHT = 34;
const BAR_HEIGHT = 18;
const NAME_WIDTH = 130;
const VALUE_WIDTH = 92;

/**
 * Bars carry the user's colour so identity stays consistent with the weekly
 * chart, and every bar is named in a text token beside it - so the encoding is
 * never colour-alone.
 */
const Leaderboard = ({ users, metric, onHover }: LeaderboardProps) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();

  if (!users.length) {
    return (
      <div ref={ref} className="py-6 text-sm text-gray-400">
        Nothing in this slice.
      </div>
    );
  }

  const chartWidth = Math.max(420, width || 720);
  const plotX = NAME_WIDTH + 14;
  const plotWidth = Math.max(60, chartWidth - plotX - VALUE_WIDTH);
  const height = users.length * ROW_HEIGHT + 12;

  const max = Math.max(...users.map((u) => u[metric]), 1);
  const total = users.reduce((sum, u) => sum + u[metric], 0) || 1;

  return (
    <div ref={ref} className="w-full overflow-x-auto">
      <svg
        width={chartWidth}
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        role="img"
        aria-label={`Ranked bar chart. ${users
          .map((u) => `${u.displayName} ${formatMetric(u[metric], metric)}`)
          .join(', ')}`}
      >
        {users.map((user, i) => {
          const y = 6 + i * ROW_HEIGHT;
          const value = user[metric];
          const barWidth = Math.max(2, (value / max) * plotWidth);
          const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2;

          return (
            <g
              key={user.id}
              onMouseEnter={() =>
                onHover({
                  title: user.displayName,
                  rows: [
                    {
                      label: 'Requests',
                      value: user.requests.toLocaleString(),
                      slot: user.slot,
                    },
                    { label: 'Data on disk', value: formatBytes(user.bytes) },
                    {
                      label: 'Movies / TV',
                      value: `${user.movies} / ${user.tv}`,
                    },
                    {
                      label: 'Avg per week',
                      value: user.avgPerWeekFiltered.toFixed(2),
                    },
                    {
                      label: 'Share',
                      value: `${((value / total) * 100).toFixed(1)}%`,
                    },
                  ],
                  footer: user.peak
                    ? `Peak ${user.peak[1]} in one week`
                    : undefined,
                })
              }
              onMouseLeave={() => onHover(null)}
            >
              <text
                x={0}
                y={y + ROW_HEIGHT / 2 + 4}
                className="fill-gray-200 text-[13px]"
              >
                {user.displayName}
              </text>
              <rect
                x={plotX - 18}
                y={barY + (BAR_HEIGHT - 9) / 2}
                width={9}
                height={9}
                rx={2}
                fill={seriesColor(user.slot)}
              />
              <path
                d={barPathH(plotX, barY, barWidth, BAR_HEIGHT)}
                fill={seriesColor(user.slot)}
              />
              <text
                x={plotX + barWidth + 8}
                y={y + ROW_HEIGHT / 2 + 4}
                className="fill-gray-400 text-xs tabular-nums"
              >
                {formatMetric(value, metric)}
              </text>
              <rect
                x={0}
                y={y}
                width={chartWidth}
                height={ROW_HEIGHT}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const LeaderboardTable = ({
  users,
  weekCount,
}: {
  users: DerivedUser[];
  weekCount: number;
}) => {
  const totalRequests = users.reduce((sum, u) => sum + u.requests, 0) || 1;

  return (
    <div className="max-h-[460px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-800 text-xs uppercase tracking-wide text-gray-400">
          <tr>
            <th className="py-2 pr-3 text-left">#</th>
            <th className="py-2 pr-3 text-left">User</th>
            <th className="py-2 pr-3 text-right">Requests</th>
            <th className="py-2 pr-3 text-right">Share</th>
            <th className="py-2 pr-3 text-right">Movies</th>
            <th className="py-2 pr-3 text-right">TV</th>
            <th className="py-2 pr-3 text-right">Seasons</th>
            <th className="py-2 pr-3 text-right">Data</th>
            <th className="py-2 pr-3 text-right">Avg/req</th>
            <th className="py-2 pr-3 text-right">Avg/wk</th>
            <th className="py-2 pr-3 text-right">Active wks</th>
          </tr>
        </thead>
        <tbody className="text-gray-300">
          {users.map((user, i) => (
            <tr key={user.id} className="border-t border-gray-700">
              <td className="py-2 pr-3 tabular-nums">{i + 1}</td>
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: seriesColor(user.slot) }}
                  />
                  {user.displayName}
                </span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {user.requests}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {((user.requests / totalRequests) * 100).toFixed(1)}%
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {user.movies}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{user.tv}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {user.seasons}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatBytes(user.bytes)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {formatBytes(user.bytesPerRequest)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {user.avgPerWeekFiltered.toFixed(2)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {user.activeWeeks}/{weekCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Leaderboard;
