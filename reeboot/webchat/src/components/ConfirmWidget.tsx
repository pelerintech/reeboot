import type { JSX } from 'react';

interface ConfirmWidgetProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onAction: (action: { action: 'confirm'; value: boolean }) => void;
}

export default function ConfirmWidget({
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  onAction,
}: ConfirmWidgetProps): JSX.Element {
  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-zinc-900 mb-2">{title}</h4>
      <p className="text-sm text-zinc-600 mb-4">{message}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onAction({ action: 'confirm', value: true })}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          {confirmLabel}
        </button>
        <button
          onClick={() => onAction({ action: 'confirm', value: false })}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
