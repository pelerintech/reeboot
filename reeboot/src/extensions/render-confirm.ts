/**
 * render_confirm tool
 *
 * Produces confirm views with title, message, and approve/deny buttons.
 * The LLM calls this to create safety gates before destructive actions.
 */

import type { ExtensionAPI } from './extension-api.js';

interface RenderConfirmInput {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'render_confirm',
    label: 'Render Confirm',
    description: 'Render a confirmation dialog. Call this before performing a destructive or consequential action to ask the user for approval.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Confirmation title' },
        message: { type: 'string', description: 'Detailed confirmation message' },
        confirmLabel: { type: 'string', description: 'Custom confirm button label (default: "Yes")' },
        cancelLabel: { type: 'string', description: 'Custom cancel button label (default: "No")' },
      },
      required: ['title', 'message'],
    },
    execute: async (_id: string, input: RenderConfirmInput) => {
      // Validate
      if (!input.title || !input.message) {
        return {
          isError: true,
          content: 'Title and message are required.',
        };
      }

      const content = `${input.title} — ${input.message}. Reply 'yes' to confirm or 'no' to cancel.`;

      return {
        content,
        view: {
          type: 'confirm',
          title: input.title,
          message: input.message,
          confirmLabel: input.confirmLabel,
          cancelLabel: input.cancelLabel,
        },
      };
    },
  });
}
