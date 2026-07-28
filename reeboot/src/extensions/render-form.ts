/**
 * render_form tool
 *
 * Produces form views for batched data collection.
 * The LLM calls this to collect structured information from the user.
 */

import type { ExtensionAPI } from './extension-api.js';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number';
  options?: string[];
}

interface RenderFormInput {
  title?: string;
  fields: FormField[];
}

const ALLOWED_TYPES = ['text', 'select', 'number'];

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'render_form',
    label: 'Render Form',
    description: 'Render a form for collecting structured information from the user. Call this when you need to collect multiple fields at once.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Optional form title' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Field name (identifier)' },
              label: { type: 'string', description: 'Field label shown to user' },
              type: { type: 'string', enum: ['text', 'select', 'number'], description: 'Field type' },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Options for select fields',
              },
            },
            required: ['name', 'label', 'type'],
          },
          description: 'Form fields',
        },
      },
      required: ['fields'],
    },
    execute: async (_id: string, input: RenderFormInput) => {
      // Validate
      if (!input.fields || input.fields.length === 0) {
        return {
          isError: true,
          content: 'At least one field is required.',
        };
      }

      // Validate field types
      for (const field of input.fields) {
        if (!ALLOWED_TYPES.includes(field.type)) {
          return {
            isError: true,
            content: `Invalid field type "${field.type}". Allowed types: ${ALLOWED_TYPES.join(', ')}.`,
          };
        }
      }

      // Build content summary
      const fieldDescriptions = input.fields.map((f) => {
        if (f.type === 'select' && f.options) {
          return `${f.label} (select: ${f.options.join(', ')})`;
        }
        return `${f.label} (${f.type})`;
      });
      const content = `Please provide: ${fieldDescriptions.join(', ')}`;

      return {
        content,
        view: {
          type: 'form',
          fields: input.fields,
        },
      };
    },
  });
}
