/**
 * Protected Paths Extension
 *
 * Blocks write and edit operations to protected paths.
 * Useful for preventing accidental modifications to sensitive files.
 */

import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const protectedPaths = [
		".env",
		".git/",
		"node_modules/",
		"config.json",
		// Documented but previously missing:
		".ssh",
		".aws",
		".gnupg",
		// System dirs (prevent writes anywhere under these):
		"/etc/",
		"/usr/",
		"/bin/",
		"/sbin/",
		"/boot/",
		"/System/",
	];

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const rawPath = event.input.path as string;
		// Resolve against cwd to catch ../../ traversal attacks
		const resolved = resolve(process.cwd(), rawPath);

		const isProtected = protectedPaths.some((p) =>
			rawPath.includes(p) || resolved.includes(p)
		);

		if (isProtected) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked write to protected path: ${rawPath}`, "warning");
			}
			return { block: true, reason: `Path "${rawPath}" is protected` };
		}

		return undefined;
	});
}
