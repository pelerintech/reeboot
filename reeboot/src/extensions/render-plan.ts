/**
 * render_plan tool
 *
 * Produces plan views with diagram, decision, annotated-code, wireframe,
 * and file-tree blocks. The LLM calls this to render structured plans.
 */

import type { ExtensionAPI } from './extension-api.js';

interface PlanBlock {
  type: string;
  [key: string]: unknown;
}

interface RenderPlanInput {
  title?: string;
  blocks: PlanBlock[];
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'render_plan',
    label: 'Render Plan',
    description: 'Render a structured plan with diagram, decision, annotated-code, wireframe, and file-tree blocks. Call this when creating plans, architectures, or designs.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional plan title' },
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Block type: diagram, decision, annotated-code, wireframe, or file-tree' },
            },
            required: ['type'],
          },
          description: 'Plan blocks',
        },
      },
      required: ['blocks'],
    },
    execute: async (_id: string, input: RenderPlanInput) => {
      // Validate
      if (!input.blocks || input.blocks.length === 0) {
        return {
          isError: true,
          content: 'At least one block is required.',
        };
      }

      // Build content summary
      const blockTypes = input.blocks.map((b) => b.type).join(', ');
      const content = `Plan with ${input.blocks.length} block(s)\nTypes: ${blockTypes}`;

      return {
        content,
        view: {
          type: 'plan',
          blocks: input.blocks,
        },
      };
    },
  });
}
