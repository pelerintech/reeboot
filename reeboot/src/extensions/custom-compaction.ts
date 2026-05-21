/**
 * Custom Compaction Extension
 *
 * Replaces the default compaction behavior with a full summary of the entire context.
 * Instead of keeping the last 20k tokens of conversation turns, this extension:
 * 1. Summarizes ALL messages (messagesToSummarize + turnPrefixMessages)
 * 2. Discards all old turns completely, keeping only the summary
 *
 * This example also demonstrates using a different model (Gemini Flash) for summarization,
 * which can be cheaper/faster than the main conversation model.
 *
 * Usage:
 *   pi --extension examples/extensions/custom-compaction.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { generateSummary } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_before_compact", async (event, ctx) => {
		ctx.ui.notify("Custom compaction extension triggered", "info");

		const { preparation, branchEntries: _, signal } = event;
		const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;

		// Use Gemini Flash for summarization (cheaper/faster than most conversation models)
		const model = ctx.modelRegistry.find("google", "gemini-2.5-flash");
		if (!model) {
			ctx.ui.notify(`Could not find Gemini Flash model, using default compaction`, "warning");
			return;
		}

		// Resolve API key and headers for the summarization model
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			ctx.ui.notify(`No API key for ${model.provider}, using default compaction`, "warning");
			return;
		}

		// Combine all messages for full summary
		const allMessages = [...messagesToSummarize, ...turnPrefixMessages];

		ctx.ui.notify(
			`Custom compaction: summarizing ${allMessages.length} messages (${tokensBefore.toLocaleString()} tokens) with ${model.id}...`,
			"info",
		);

		// Custom instructions: ask for a comprehensive full-context summary.
		// generateSummary builds its own prompt internally and appends customInstructions.
		const customInstructions = `Create a comprehensive summary that captures:
1. The main goals and objectives discussed
2. Key decisions made and their rationale
3. Important code changes, file modifications, or technical details
4. Current state of any ongoing work
5. Any blockers, issues, or open questions
6. Next steps that were planned or suggested

Be thorough but concise. The summary will replace the ENTIRE conversation history, so include all information needed to continue the work effectively.

Format the summary as structured markdown with clear sections.`;

		try {
			const summary = await generateSummary(
				allMessages,
				model,
				8192,
				auth.apiKey,
				auth.headers,
				signal,
				customInstructions,
				previousSummary,
			);

			if (!summary.trim()) {
				if (!signal.aborted) ctx.ui.notify("Compaction summary was empty, using default compaction", "warning");
				return;
			}

			// Return compaction content - SessionManager adds id/parentId
			// Use firstKeptEntryId from preparation to keep recent messages
			return {
				compaction: {
					summary,
					firstKeptEntryId,
					tokensBefore,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Compaction failed: ${message}`, "error");
			// Fall back to default compaction on error
			return;
		}
	});
}
