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
