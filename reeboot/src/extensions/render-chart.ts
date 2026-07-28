/**
 * render_chart tool
 *
 * Produces data-chart views from structured chart data.
 * The LLM calls this to render bar/line charts in supported channels.
 */

import type { ExtensionAPI } from './extension-api.js';

interface RenderChartInput {
  title?: string;
  labels: string[];
  values: number[];
  kind: 'bar' | 'line';
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'render_chart',
    label: 'Render Chart',
    description: 'Render a bar or line chart. Call this when the user asks for a chart, graph, or visualization of numeric data.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional chart title' },
        labels: { type: 'array', items: { type: 'string' }, description: 'X-axis labels' },
        values: { type: 'array', items: { type: 'number' }, description: 'Y-axis values' },
        kind: { type: 'string', enum: ['bar', 'line'], description: 'Chart type' },
      },
      required: ['labels', 'values', 'kind'],
    },
    execute: async (_id: string, input: RenderChartInput) => {
      // Validate
      if (!input.labels || input.labels.length === 0 || !input.values || input.values.length === 0) {
        return {
          isError: true,
          content: 'Labels and values must be non-empty arrays.',
        };
      }

      if (input.labels.length !== input.values.length) {
        return {
          isError: true,
          content: 'Labels and values must have the same length.',
        };
      }

      const kind = input.kind || 'bar';

      // Build content summary
      const labelList = input.labels.join(', ');
      const valueList = input.values.join(', ');
      const content = `Chart: ${input.labels.length} data points\nLabels: ${labelList}\nValues: ${valueList}\nKind: ${kind}`;

      return {
        content,
        view: {
          type: 'data-chart',
          labels: input.labels,
          values: input.values,
          kind,
        },
      };
    },
  });
}
