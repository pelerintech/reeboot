import { useState } from 'react';

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
}

const MAX_VISIBLE_ROWS = 100;

export default function DataTable({ columns, rows }: DataTableProps) {
  const [showAll, setShowAll] = useState(false);

  if (columns.length === 0) {
    return <div className="my-2 text-xs text-zinc-500 p-2">No columns</div>;
  }

  const visibleRows = showAll ? rows : rows.slice(0, MAX_VISIBLE_ROWS);
  const remaining = rows.length - MAX_VISIBLE_ROWS;

  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-200">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-medium text-zinc-600 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50">
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 text-zinc-700 whitespace-nowrap">
                  {row[col] !== undefined && row[col] !== null ? String(row[col]) : ''}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-zinc-400 italic">
                No rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {remaining > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full px-3 py-2 text-xs text-center text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors border-t border-zinc-200"
        >
          Show {remaining} more
        </button>
      )}
    </div>
  );
}
