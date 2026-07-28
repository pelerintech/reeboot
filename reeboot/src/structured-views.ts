/**
 * Structured tool views — discriminated union types for rich tool result rendering.
 *
 * Tools registered via ExtensionAPI.registerTool() can return an optional `view`
 * field alongside `content`. The WebChat renders a matching rich React component.
 */

// ─── Form field types ─────────────────────────────────────────────────────────

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number';
}

// ─── Plan block types ─────────────────────────────────────────────────────────

export interface PlanBlock {
  type: string;
  title?: string;
  [key: string]: unknown;
}

// ─── ToolView discriminated union ─────────────────────────────────────────────

/** Runtime list of valid view discriminant types */
export const VIEW_TYPES = ['data-table', 'data-chart', 'form', 'confirm', 'plan'] as const;
export type ViewType = typeof VIEW_TYPES[number];

/**
 * Extract content and optional view from a tool result object.
 * Tools can return { content, view } where view is an optional structured
 * rendering hint. This utility splits them for downstream propagation.
 */
export function extractViewFromToolResult(result: {
  content: unknown;
  view?: ToolView;
  [key: string]: unknown;
}): { content: unknown; view: ToolView | undefined } {
  return {
    content: result.content,
    view: result.view,
  };
}

export type ToolView =
  | {
      type: 'data-table';
      columns: string[];
      rows: Record<string, unknown>[];
    }
  | {
      type: 'data-chart';
      labels: string[];
      values: number[];
      kind?: 'bar' | 'line';
    }
  | {
      type: 'form';
      fields: FormField[];
    }
  | {
      type: 'confirm';
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  | {
      type: 'plan';
      blocks: PlanBlock[];
    };

// ─── Content text fallback extraction ───────────────────────────────────────

/**
 * Extract a plain-text fallback from a tool result object.
 *
 * Tools that produce structured views return a `content` field that is meant
 * to be delivered to non-visual channels (WhatsApp, Signal, Telegram, CLI)
 * when no rich widget can be rendered. This helper normalises the various
 * shapes a tool result may take into a single string.
 *
 * Handles:
 *   - `{ content: "string" }`           (render_plan/chart/form/confirm)
 *   - `{ content: [{type:"text",text}] }` (pi SDK normalised array form)
 *   - `"string"`                         (bare string result)
 *   - `[{type:"text",text}]`              (bare array result)
 *
 * Returns `null` when no text can be extracted.
 */
export function extractContentText(result: unknown): string | null {
  if (result == null) return null;

  // Canonical shape: result.content
  const content = (result as Record<string, unknown> | undefined)?.content;
  if (typeof content === 'string') {
    return content.length > 0 ? content : null;
  }
  if (Array.isArray(content)) {
    const text = textBlocksToString(content);
    return text;
  }

  // Bare shapes: result itself is a string or array of text blocks
  if (typeof result === 'string') {
    return result.length > 0 ? result : null;
  }
  if (Array.isArray(result)) {
    return textBlocksToString(result);
  }

  return null;
}

/** Join an array of `{ type: 'text', text }` blocks into a newline string. */
function textBlocksToString(blocks: unknown[]): string | null {
  const text = blocks
    .filter(
      (c): c is { type: 'text'; text: string } =>
        !!c &&
        typeof c === 'object' &&
        (c as { type?: string }).type === 'text' &&
        typeof (c as { text?: unknown }).text === 'string',
    )
    .map((c) => c.text)
    .join('\n');
  return text.length > 0 ? text : null;
}
