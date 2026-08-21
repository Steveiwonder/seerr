import Badge from '@app/components/Common/Badge';
import type { DerivedUser } from '@app/components/Stats/utils';
import { formatBytes, seriesColor } from '@app/components/Stats/utils';
import type { StatsRequestRow } from '@server/interfaces/api/statsInterfaces';
import { useMemo, useState } from 'react';

type SortKey = 'createdAt' | 'title' | 'type' | 'user' | 'status' | 'bytes';

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'createdAt', label: 'Date' },
  { key: 'title', label: 'Title' },
  { key: 'type', label: 'Type' },
  { key: 'user', label: 'User' },
  { key: 'status', label: 'Status' },
  { key: 'bytes', label: 'Size', numeric: true },
];

const STATUS_STYLE: Record<
  string,
  'default' | 'primary' | 'danger' | 'warning'
> = {
  completed: 'primary',
  approved: 'default',
  pending: 'warning',
  declined: 'danger',
  failed: 'danger',
};

const RequestLog = ({
  rows,
  users,
}: {
  rows: StatsRequestRow[];
  users: DerivedUser[];
}) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: 'createdAt',
    dir: -1,
  });

  const slotOf = useMemo(
    () => new Map(users.map((u) => [u.id, u.slot])),
    [users]
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? rows.filter((r) =>
          `${r.title} ${r.user} ${r.status}`.toLowerCase().includes(query)
        )
      : rows;

    return [...filtered].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (typeof x === 'number' && typeof y === 'number') {
        return (x - y) * sort.dir;
      }
      return String(x).localeCompare(String(y)) * sort.dir;
    });
  }, [rows, search, sort]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          {visible.length} of {rows.length} requests · click a column to sort
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by title or user…"
          aria-label="Filter the request log"
          className="rounded-md border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800 text-xs uppercase tracking-wide text-gray-400">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`cursor-pointer py-2 pr-3 ${
                    col.numeric ? 'text-right' : 'text-left'
                  }`}
                  onClick={() =>
                    setSort((prev) =>
                      prev.key === col.key
                        ? { key: col.key, dir: prev.dir === 1 ? -1 : 1 }
                        : {
                            key: col.key,
                            dir:
                              col.key === 'createdAt' || col.key === 'bytes'
                                ? -1
                                : 1,
                          }
                    )
                  }
                >
                  {col.label}
                  {sort.key === col.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-300">
            {visible.map((row) => (
              <tr key={row.id} className="border-t border-gray-700">
                <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                  {new Date(row.createdAt).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="py-2 pr-3 text-gray-100">
                  {row.title}
                  {row.seasons.length > 0 && (
                    <span className="ml-2 text-xs text-gray-500">
                      {row.seasons
                        .map((n) => `S${String(n).padStart(2, '0')}`)
                        .join(' ')}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <Badge badgeType="default">
                    {row.type === 'tv' ? 'TV' : 'Movie'}
                  </Badge>
                </td>
                <td className="whitespace-nowrap py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{
                        backgroundColor: seriesColor(
                          slotOf.get(row.userId) ?? 0
                        ),
                      }}
                    />
                    {row.user}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Badge badgeType={STATUS_STYLE[row.status] ?? 'default'}>
                    {row.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                  {row.bytes ? formatBytes(row.bytes) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default RequestLog;
