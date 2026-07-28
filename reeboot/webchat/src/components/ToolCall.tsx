import { useState, useId } from 'react';
import DataTable from './DataTable';
import DataChart from './DataChart';
import PlanView from './PlanView';
import ConfirmWidget from './ConfirmWidget';
import FormWidget from './FormWidget';

interface ViewData {
  type: string;
  [key: string]: unknown;
}

interface ToolCallProps {
  name: string;
  args?: unknown;
  result?: string;
  isError?: boolean;
  defaultExpanded?: boolean;
  view?: ViewData;
  onAction?: (action: { action: string; [key: string]: unknown }) => void;
}

export default function ToolCall({
  name,
  args,
  result,
  isError = false,
  defaultExpanded = false,
  view,
  onAction,
}: ToolCallProps) {
  const previewId = useId();
  const surfaceId = view && (view.type === 'confirm' || view.type === 'form') ? `${view.type}-${previewId}` : undefined;
  const [expanded, setExpanded] = useState(defaultExpanded);

  // If a structured view is provided and recognized, render the widget directly
  // (not inside the collapsible card)
  if (view?.type === 'data-table' && Array.isArray(view.columns) && Array.isArray(view.rows)) {
    return (
      <DataTable
        columns={view.columns as string[]}
        rows={view.rows as Record<string, unknown>[]}
      />
    );
  }

  if (view?.type === 'data-chart' && Array.isArray(view.labels) && Array.isArray(view.values)) {
    return (
      <DataChart
        labels={view.labels as string[]}
        values={view.values as number[]}
        kind={(view.kind as 'bar' | 'line') ?? 'bar'}
      />
    );
  }

  if (view?.type === 'plan' && Array.isArray(view.blocks)) {
    return (
      <PlanView blocks={view.blocks as any[]} />
    );
  }

  if (view?.type === 'confirm' && typeof view.title === 'string' && typeof view.message === 'string') {
    return (
      <ConfirmWidget
        title={view.title as string}
        message={view.message as string}
        confirmLabel={view.confirmLabel as string | undefined}
        cancelLabel={view.cancelLabel as string | undefined}
        onAction={(action) => onAction?.({ action: 'confirm', ...action, surfaceId })}
      />
    );
  }

  if (view?.type === 'form' && Array.isArray(view.fields)) {
    return (
      <FormWidget
        fields={view.fields as any[]}
        onAction={(action) => onAction?.({ action: 'form_submit', ...action, surfaceId })}
      />
    );
  }

  // Fall back to collapsible JSON card for no view or unknown view type
  const argsPreview = (() => {
    if (!args) return undefined;
    if (typeof args === 'string') {
      return args.length > 500 ? args.substring(0, 500) + '…' : args;
    }
    try {
      const json = JSON.stringify(args, null, 2);
      return json.length > 500 ? json.substring(0, 500) + '…' : json;
    } catch {
      return '[non-serializable args]';
    }
  })();

  const resultPreview = result
    ? result.length > 500
      ? result.substring(0, 500) + '…'
      : result
    : undefined;

  return (
    <div className={`my-2 rounded-lg border ${
      isError ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-zinc-50'
    }`}>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        <span className="font-medium text-zinc-800">{name}</span>
        {isError && <span className="text-red-500 text-xs">Error</span>}
        <span className="ml-auto text-zinc-400 text-xs transition-transform">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 text-xs border-t border-zinc-200/50 pt-2">
          {argsPreview && (
            <div>
              <span className="text-zinc-500 font-medium">Args</span>
              <pre className="mt-1 bg-white rounded-md p-2.5 overflow-x-auto text-zinc-700 whitespace-pre-wrap font-mono border border-zinc-200">
                {argsPreview}
              </pre>
            </div>
          )}
          {resultPreview !== undefined && (
            <div>
              <span className={`font-medium ${isError ? 'text-red-500' : 'text-zinc-500'}`}>
                {isError ? 'Error' : 'Result'}
              </span>
              <pre className={`mt-1 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap font-mono border ${
                isError ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-zinc-700 border-zinc-200'
              }`}>
                {resultPreview}
              </pre>
            </div>
          )}
          {!resultPreview && !argsPreview && (
            <div className="text-zinc-500 italic">Running…</div>
          )}
        </div>
      )}
    </div>
  );
}
