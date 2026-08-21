import type { TooltipContent } from '@app/components/Stats/ChartTooltip';
import type { DerivedUser } from '@app/components/Stats/utils';
import {
  barPathV,
  formatBytes,
  seriesColor,
  useElementWidth,
} from '@app/components/Stats/utils';

interface SmallMultiplesProps {
  weeks: string[];
  weekStarts: Record<string, string>;
  users: DerivedUser[];
  onHover: (content: TooltipContent | null) => void;
}

const ROW_HEIGHT = 34;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * One mini column chart per user, all on a single shared scale so the row
 * heights can be compared directly. Facetting like this is what keeps seven
 * users legible where seven overlaid lines would not be.
 */
const SmallMultiples = ({
  weeks,
  weekStarts,
  users,
  onHover,
}: SmallMultiplesProps) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();

  if (!users.length || !weeks.length) {
    return (
      <div ref={ref} className="py-6 text-sm text-gray-400">
        Nothing in this slice.
      </div>
    );
  }

  const plotWidth = Math.max(200, width || 400);
  const band = plotWidth / weeks.length;
  const barWidth = Math.max(1.5, Math.min(14, band - 2));

  let peak = 1;
  for (const user of users) {
    for (const count of user.weekMap.values()) peak = Math.max(peak, count);
  }

  return (
    <div className="flex flex-col gap-0.5">
      {users.map((user, index) => (
        <div
          key={user.id}
          className="grid items-center gap-4 rounded px-1 py-1.5 hover:bg-gray-700 hover:bg-opacity-30"
          style={{
            gridTemplateColumns: 'minmax(96px,132px) 1fr minmax(150px,auto)',
          }}
        >
          <div className="flex min-w-0 items-center gap-2 text-sm text-gray-200">
            <span
              className="h-2 w-2 flex-none rounded-sm"
              style={{ backgroundColor: seriesColor(user.slot) }}
            />
            <span className="truncate">{user.displayName}</span>
          </div>

          <div ref={index === 0 ? ref : undefined} className="min-w-0">
            <svg
              width={plotWidth}
              height={ROW_HEIGHT}
              viewBox={`0 0 ${plotWidth} ${ROW_HEIGHT}`}
              role="img"
              aria-label={`${user.displayName}: ${user.requests} requests across ${user.activeWeeks} active weeks.`}
            >
              <line
                x1={0}
                x2={plotWidth}
                y1={ROW_HEIGHT - 0.5}
                y2={ROW_HEIGHT - 0.5}
                stroke="#4b5563"
                strokeWidth={1}
              />
              {weeks.map((week, i) => {
                const count = user.weekMap.get(week) ?? 0;
                const x = i * band + (band - barWidth) / 2;
                const h = count
                  ? Math.max(2, (count / peak) * (ROW_HEIGHT - 4))
                  : 0;
                return (
                  <g
                    key={week}
                    onMouseEnter={() =>
                      onHover({
                        title: user.displayName,
                        rows: [
                          {
                            label: `Week of ${shortDate(weekStarts[week])}`,
                            value: `${count} request${count === 1 ? '' : 's'}`,
                            slot: user.slot,
                          },
                        ],
                      })
                    }
                    onMouseLeave={() => onHover(null)}
                  >
                    {count > 0 && (
                      <path
                        d={barPathV(x, ROW_HEIGHT - h, barWidth, h, 3)}
                        fill={seriesColor(user.slot)}
                      />
                    )}
                    <rect
                      x={i * band}
                      y={0}
                      width={band}
                      height={ROW_HEIGHT}
                      fill="transparent"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="text-right text-xs tabular-nums text-gray-400">
            {user.requests} reqs · {formatBytes(user.bytes)} ·{' '}
            {user.avgPerWeekFiltered.toFixed(2)}/wk
          </div>
        </div>
      ))}
    </div>
  );
};

export default SmallMultiples;
