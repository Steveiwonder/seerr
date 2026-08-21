import type { TooltipContent } from '@app/components/Stats/ChartTooltip';
import type { DerivedUser } from '@app/components/Stats/utils';
import {
  axisTicks,
  barPathV,
  seriesColor,
  useElementWidth,
} from '@app/components/Stats/utils';

interface WeeklyChartProps {
  weeks: string[];
  weekStarts: Record<string, string>;
  weekTotals: number[];
  users: DerivedUser[];
  onHover: (content: TooltipContent | null) => void;
}

const PLOT_HEIGHT = 210;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const AXIS_BAND = 26;
const MIN_BAND = 30;
/** Surface gap between stacked segments - white does the separating, not a stroke. */
const GAP = 2;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const WeeklyChart = ({
  weeks,
  weekStarts,
  weekTotals,
  users,
  onHover,
}: WeeklyChartProps) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();

  if (!weeks.length) {
    return (
      <div ref={ref} className="py-6 text-sm text-gray-400">
        Nothing in this slice.
      </div>
    );
  }

  // Stack in slot order so the segments that touch are the adjacent palette
  // pairs - the ones validated to stay apart under colourblind simulation.
  const stackUsers = [...users].sort((a, b) => a.slot - b.slot);

  const available = Math.max(360, (width || 720) - PAD_LEFT - PAD_RIGHT);
  const band = Math.max(MIN_BAND, available / weeks.length);
  const plotWidth = band * weeks.length;
  const chartWidth = PAD_LEFT + plotWidth + PAD_RIGHT;
  const height = PAD_TOP + PLOT_HEIGHT + AXIS_BAND;
  const barWidth = Math.min(24, band - 8);

  const peak = Math.max(...weekTotals, 1);
  const ticks = axisTicks(peak, 4);
  const yOf = (n: number) =>
    PAD_TOP + PLOT_HEIGHT - (n / ticks.max) * PLOT_HEIGHT;
  const labelEvery = Math.max(1, Math.ceil(52 / band));

  return (
    <div ref={ref} className="w-full overflow-x-auto">
      <svg
        width={chartWidth}
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        role="img"
        aria-label={`Stacked column chart of requests per week. Peak ${peak} in one week. Full values in the table view.`}
      >
        {ticks.values.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={PAD_LEFT + plotWidth}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke={tick === 0 ? '#4b5563' : '#374151'}
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 8}
              y={yOf(tick) + 4}
              textAnchor="end"
              className="fill-gray-500 text-[11px] tabular-nums"
            >
              {tick}
            </text>
          </g>
        ))}

        {weeks.map((week, i) => {
          const x = PAD_LEFT + i * band + (band - barWidth) / 2;
          const total = weekTotals[i];
          const parts: [DerivedUser, number][] = [];
          let acc = 0;

          const segments = stackUsers.flatMap((user) => {
            const count = user.weekMap.get(week) ?? 0;
            if (!count) return [];
            parts.push([user, count]);
            const top = yOf(acc + count);
            const bottom = yOf(acc);
            const isTop = acc + count === total;
            // Take the gap out of each segment's own height so the stack still
            // measures true against the axis.
            const h = Math.max(1.5, bottom - top - (acc > 0 ? GAP : 0));
            acc += count;
            return [
              <path
                key={`${week}-${user.id}`}
                d={barPathV(x, top, barWidth, h, isTop ? 4 : 0)}
                fill={seriesColor(user.slot)}
              />,
            ];
          });

          return (
            <g
              key={week}
              onMouseEnter={() =>
                onHover({
                  title: `Week of ${longDate(weekStarts[week])}`,
                  rows: parts.length
                    ? [...parts]
                        .sort((a, b) => b[1] - a[1])
                        .map(([user, count]) => ({
                          label: user.displayName,
                          value: String(count),
                          slot: user.slot,
                        }))
                    : [{ label: 'No requests', value: '0' }],
                  footer: total ? `${total} total` : undefined,
                })
              }
              onMouseLeave={() => onHover(null)}
            >
              {segments}
              {/* Label the extreme only; the axis and tooltip carry the rest. */}
              {total === peak && total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={yOf(total) - 6}
                  textAnchor="middle"
                  className="fill-gray-300 text-xs tabular-nums"
                >
                  {total}
                </text>
              )}
              {(i % labelEvery === 0 || i === weeks.length - 1) && (
                <text
                  x={x + barWidth / 2}
                  y={PAD_TOP + PLOT_HEIGHT + 16}
                  textAnchor="middle"
                  className="fill-gray-500 text-[11px]"
                >
                  {shortDate(weekStarts[week])}
                </text>
              )}
              <rect
                x={PAD_LEFT + i * band}
                y={PAD_TOP}
                width={band}
                height={PLOT_HEIGHT}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const WeeklyLegend = ({ users }: { users: DerivedUser[] }) => (
  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
    {[...users]
      .sort((a, b) => a.slot - b.slot)
      .map((user) => (
        <span
          key={user.id}
          className="flex items-center gap-2 text-sm text-gray-400"
        >
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: seriesColor(user.slot) }}
          />
          {user.displayName} ({user.requests})
        </span>
      ))}
  </div>
);

export const WeeklyTable = ({
  weeks,
  weekStarts,
  weekTotals,
  users,
}: Omit<WeeklyChartProps, 'onHover'>) => {
  const ordered = [...users].sort((a, b) => a.slot - b.slot);

  return (
    <div className="max-h-[460px] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-800 text-xs uppercase tracking-wide text-gray-400">
          <tr>
            <th className="py-2 pr-3 text-left">Week beginning</th>
            {ordered.map((user) => (
              <th key={user.id} className="py-2 pr-3 text-right">
                {user.displayName}
              </th>
            ))}
            <th className="py-2 pr-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="text-gray-300">
          {weeks.map((week, i) => (
            <tr key={week} className="border-t border-gray-700">
              <td className="py-2 pr-3">{longDate(weekStarts[week])}</td>
              {ordered.map((user) => {
                const count = user.weekMap.get(week) ?? 0;
                return (
                  <td
                    key={user.id}
                    className={`py-2 pr-3 text-right tabular-nums ${
                      count ? '' : 'text-gray-600'
                    }`}
                  >
                    {count || '-'}
                  </td>
                );
              })}
              <td className="py-2 pr-3 text-right font-medium tabular-nums text-gray-100">
                {weekTotals[i] || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WeeklyChart;
