import { seriesColor } from '@app/components/Stats/utils';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export interface TooltipRow {
  label: string;
  value: string;
  slot?: number;
}

export interface TooltipContent {
  title: string;
  rows: TooltipRow[];
  footer?: string;
}

interface ChartTooltipProps {
  content: TooltipContent | null;
}

/**
 * Follows the pointer. Tooltips enhance here, they never gate: every value is
 * also reachable from the table view, and the axis carries the rest.
 */
const ChartTooltip = ({ content }: ChartTooltipProps) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!content) return;
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [content]);

  if (!content) return null;

  const pad = 16;
  const width = 260;
  const flipX = pos.x + width + pad > window.innerWidth;
  const style = {
    left: flipX ? pos.x - width - pad : pos.x + pad,
    top: Math.min(pos.y + pad, window.innerHeight - 180),
    maxWidth: width,
  };

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm shadow-lg"
      style={style}
      role="status"
    >
      <div className="mb-1 font-semibold text-gray-100">{content.title}</div>
      {content.rows.map((row) => (
        <div
          key={`${row.label}-${row.value}`}
          className="flex items-center justify-between gap-4 text-gray-300"
        >
          <span className="flex items-center gap-2">
            {row.slot !== undefined && (
              <span
                className="h-2 w-2 flex-none rounded-sm"
                style={{ backgroundColor: seriesColor(row.slot) }}
              />
            )}
            {row.label}
          </span>
          <span className="font-medium tabular-nums text-gray-100">
            {row.value}
          </span>
        </div>
      ))}
      {content.footer && (
        <div className="mt-1 border-t border-gray-700 pt-1 text-xs text-gray-400">
          {content.footer}
        </div>
      )}
    </div>
  );
};

export const ChartCard = ({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <div className="rounded-lg border border-gray-700 bg-gray-800 bg-opacity-50 p-4 shadow">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export default ChartTooltip;
