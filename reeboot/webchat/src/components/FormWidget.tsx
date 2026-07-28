import { useState, useCallback, type JSX, type FormEvent } from 'react';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number';
  options?: string[];
}

interface FormWidgetProps {
  fields: FormField[];
  onAction: (action: { action: 'form_submit'; fields: Record<string, unknown> }) => void;
}

export default function FormWidget({ fields, onAction }: FormWidgetProps): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Check if all fields have a value
  const allFilled = fields.every((f) => {
    const v = values[f.name];
    return v !== undefined && v.trim() !== '';
  });

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!allFilled) return;

      const result: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = values[field.name] ?? '';
        if (field.type === 'number') {
          result[field.name] = Number(raw);
        } else {
          result[field.name] = raw;
        }
      }
      onAction({ action: 'form_submit', fields: result });
    },
    [fields, values, allFilled, onAction]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="my-2 rounded-lg border border-zinc-200 bg-white p-4 space-y-3"
    >
      {fields.map((field) => (
        <div key={field.name}>
          <label
            htmlFor={`form-${field.name}`}
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            {field.label}
          </label>
          {field.type === 'select' && field.options ? (
            <select
              id={`form-${field.name}`}
              name={field.name}
              value={values[field.name] ?? ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              aria-label={field.label}
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`form-${field.name}`}
              name={field.name}
              type={field.type === 'number' ? 'number' : 'text'}
              value={values[field.name] ?? ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              aria-label={field.label}
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={!allFilled}
        aria-label="Submit"
        className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Submit
      </button>
    </form>
  );
}
