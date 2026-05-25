/**
 * Confirm Destructive Actions Extension
 *
 * Three concerns:
 *   1. Hardline blocklist — catastrophically dangerous commands blocked permanently.
 *   2. Dangerous command detection with approval modes — deny, manual (CLI/headless),
 *      smart (LLM-assessment), off (log-only).
 *   3. Session operation confirmation — prompts before destructive session
 *      actions (clear, switch, fork).
 */

import type { ExtensionAPI, SessionBeforeSwitchEvent, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { getLogger } from '../observability/logger.js';

// ─── Hardline patterns (checked first, no override) ───────────────────────────

interface DangerousPattern {
  pattern: RegExp;
  reason: string;
}

const HARDLINE_PATTERNS: DangerousPattern[] = [
  // Fork bomb
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\};:/, reason: 'fork bomb' },
  // Zero physical disk
  { pattern: /\bdd\s+if=\/dev\/zero\s+of=\/dev\/sd/, reason: 'disk zeroing' },
  // Format mounted root
  { pattern: /\bmkfs/, reason: 'filesystem format' },
  // Direct block device write
  { pattern: />\s*\/dev\/sd/, reason: 'write to block device' },
  // Overwrite /etc/passwd
  { pattern: />\s*\/etc\/passwd\b/, reason: 'overwrite user database' },
  // Wipe root filesystem
  { pattern: /\brm\s+(?:-(?:rf|fr)(?:\s+-{1,2}no-preserve-root)?)\s+\/(?:\s|$)/, reason: 'wipe filesystem root' },
  // Remove all permissions from root
  { pattern: /\bchmod\s+(?:000|0{3})\s+\//, reason: 'remove all permissions from root' },
  // Flush firewall rules
  { pattern: /\biptables\s+-F\b.+(?:-P|--policy)\b/, reason: 'flush firewall' },
];

// ─── Dangerous command patterns (approvable) ────────────────────────────────

const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // Recursive delete
  { pattern: /\brm\s+.*-(?:r[fw]*|-[-]*recursive)/i, reason: 'recursive delete' },
  // Delete in root path
  { pattern: /\brm\s+.*\/(?:etc|usr|bin|sbin|boot|dev|sys|proc|home|root|var)\b/, reason: 'delete in root path' },
  // World/other-writable permissions (not chmod 000 which is hardline)
  { pattern: /\bchmod\s+.*(?:777|666|o\+w|a\+w)/, reason: 'world-writable permissions' },
  // Recursive chown
  { pattern: /\bchown\s+.*(?:-R|--recursive)/, reason: 'recursive chown' },
  // Disk copy (non-zero)
  { pattern: /\bdd\s+if=/, reason: 'disk copy' },
  // SQL DROP
  { pattern: /\bDROP\s+(?:TABLE|DATABASE)/i, reason: 'SQL DROP' },
  // SQL DELETE without WHERE (case-insensitive patterns match after drop/database check)
  { pattern: /\bDELETE\s+FROM\s+\w+\s*$/im, reason: 'SQL DELETE without WHERE' },
  { pattern: /\bDELETE\s+FROM\s+\w+\s*;/i, reason: 'SQL DELETE without WHERE' },
  // SQL TRUNCATE
  { pattern: /\bTRUNCATE\s+(?:TABLE\s+)?\w+/i, reason: 'SQL TRUNCATE' },
  // Overwrite system config via redirect (not /etc/passwd which is hardline)
  { pattern: /([>])\s*\/etc\//, reason: 'overwrite system config' },
  // systemctl destructive operations
  { pattern: /\bsystemctl\s+(?:stop|restart|disable|mask)\b/, reason: 'service control' },
  // Force kill
  { pattern: /\bkill\s+-9/, reason: 'force kill' },
  // Pipe remote content to shell
  { pattern: /\b(?:curl|wget)\b.+\|\s*(?:sh|bash|zsh|ksh)\b/, reason: 'pipe to shell' },
  // Process substitution to shell
  { pattern: /\b(?:bash|sh|zsh)\s+<\(\s*(?:curl|wget)\b/, reason: 'process substitution' },
  // Find with destructive actions
  { pattern: /\bfind\b.+(?:-exec\s+rm\b|-delete)/, reason: 'find with destructive action' },
  // In-place edit of system config
  { pattern: /\bsed\s+.*(?:-i|--in-place).*\/etc\//, reason: 'in-place edit of system config' },
  // Overwrite SSH / AWS credentials
  { pattern: />\s*(?:~\/\.ssh\/\S*|~\/\.aws\/\S*)/, reason: 'overwrite credentials' },
];

// ─── Risk assessment types ──────────────────────────────────────────────────

export interface RiskAssessment {
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

// Default: no LLM call — always returns medium (escalate to manual)
// Tests override via config._assessRisk
async function defaultAssessRisk(_command: string): Promise<RiskAssessment> {
  return { risk: 'medium', reason: 'no assessment provider configured' };
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI, config?: Record<string, any>) {
  // Read config
  const dcConfig = config?.security?.dangerous_commands ?? {};
  const mode: string = dcConfig.mode ?? 'deny';
  const yoloFromConfig: boolean = !!dcConfig.yolo;
  const assessRisk: (cmd: string) => Promise<RiskAssessment> =
    (config as any)?._assessRisk ?? defaultAssessRisk;

  // In-session cache for smart mode assessments
  const smartCache: Map<string, RiskAssessment> = new Map();

  // Session-scoped allowlist — commands approved via "yes" response in headless mode
  const approvedCommands: Set<string> = new Set();

  // ── Dangerous command detection ─────────────────────────────────────────

  pi.on('tool_call', async (event, ctx) => {
    // Only check bash tool calls
    if (event.toolName !== 'bash') return undefined;

    const command: string = (event.input as any)?.command ?? '';
    if (!command) return undefined;

    // Check hardline patterns first — no override possible
    for (const { pattern, reason } of HARDLINE_PATTERNS) {
      if (pattern.test(command)) {
        return {
          block: true,
          reason: `This command is permanently blocked (hardline: ${reason}): ${command.slice(0, 80)}`,
        };
      }
    }

    // Check dangerous patterns
    let matchedReason: string | null = null;
    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        matchedReason = reason;
        break;
      }
    }

    if (!matchedReason) return undefined; // not dangerous

    // YOLO mode — auto-approve all non-hardline dangerous commands
    // Checked per-call to support runtime toggling via env var
    if (yoloFromConfig || process.env.REEBOOT_YOLO_MODE === '1') {
      try {
        getLogger().warn({
          component: 'dangerous-commands',
          event: 'command_allowed_yolo',
          command,
          yolo: true,
        }, `⚡ YOLO: auto-approved dangerous command (${matchedReason}): ${command.slice(0, 80)}`);
      } catch { /* log failures are non-critical */ }
      return undefined;
    }

    // Mode: off — log and allow
    if (mode === 'off') {
      try {
        getLogger().warn({
          component: 'dangerous-commands',
          event: 'command_allowed_off_mode',
          command,
        }, `Dangerous command allowed in off mode (${matchedReason}): ${command.slice(0, 80)}`);
      } catch { /* log failures are non-critical */ }
      return undefined;
    }

    // Mode: deny — block immediately
    if (mode === 'deny') {
      return {
        block: true,
        reason: `Dangerous command blocked (${matchedReason}): ${command.slice(0, 80)}`,
      };
    }

    // Mode: smart — assess risk via LLM
    if (mode === 'smart') {
      // Check cache first
      let assessment = smartCache.get(command);
      if (!assessment) {
        assessment = await assessRisk(command);
        smartCache.set(command, assessment);
      }

      if (assessment.risk === 'low') {
        return undefined; // auto-approved
      }
      if (assessment.risk === 'high') {
        return {
          block: true,
          reason: `Command auto-denied by risk assessment (${assessment.reason}): ${command.slice(0, 80)}`,
        };
      }
      // medium → fall through to manual
    }

    // Mode: manual (or smart escalated to manual)

    // Check session allowlist — commands approved via "yes" in headless mode
    if (approvedCommands.has(command)) {
      return undefined; // auto-approved from previous "yes"
    }

    if (ctx.hasUI && (ctx as any).ui?.confirm) {
      const timeoutMs = ((config?.security?.dangerous_commands as any)?.timeout ?? 60) * 1000;
      const confirmed = await (ctx as any).ui.confirm(
        `Allow dangerous command?\n\n${command}`,
        `This command may be destructive: ${matchedReason}`,
        { timeout: timeoutMs },
      );
      if (confirmed) {
        return undefined; // approved
      }
      return {
        block: true,
        reason: `Dangerous command denied by user (${matchedReason}): ${command.slice(0, 80)}`,
      };
    }

    // Manual mode, headless — write pending approval and block
    const cwd = (ctx as any).cwd ?? process.cwd();
    const pendingFile = join(cwd, '.pending_approval.json');
    try {
      mkdirSync(dirname(pendingFile), { recursive: true });
      writeFileSync(pendingFile, JSON.stringify({
        command,
        reason: matchedReason,
        created_at: Date.now(),
      }, null, 2), 'utf-8');
    } catch {
      // Non-critical — still block even if file write fails
    }

    return {
      block: true,
      reason: `Dangerous command awaiting owner approval (${matchedReason}): ${command.slice(0, 80)}`,
    };
  });

  // ── Pending approval handling (timeout + yes/no processing) ────────────

  pi.on('before_agent_start', async (_event, ctx) => {
    const cwd = (ctx as any)?.cwd ?? process.cwd();
    const pendingFile = join(cwd, '.pending_approval.json');

    if (!existsSync(pendingFile)) return;

    try {
      const pending = JSON.parse(readFileSync(pendingFile, 'utf-8'));
      const timeoutSec = (config?.security?.dangerous_commands as any)?.timeout ?? 60;
      const age = Date.now() - pending.created_at;

      if (age > timeoutSec * 1000) {
        // Expired — clear pending approval (fail-closed)
        unlinkSync(pendingFile);
        return {
          systemPrompt: (_event.systemPrompt ?? '') +
            '\n\nNOTE: The previously requested dangerous command approval has timed out. The command was denied. Do not retry it unless the user explicitly asks again.',
        };
      }

      // Read the owner's latest message to check for approval/denial
      const sessionManager = (ctx as any)?.sessionManager;
      if (sessionManager?.getEntries) {
        const entries: any[] = sessionManager.getEntries();
        // Find the last user message
        let lastUserContent: string | null = null;
        for (let i = entries.length - 1; i >= 0; i--) {
          const entry = entries[i];
          if (entry?.type === 'message' && entry?.message?.role === 'user') {
            lastUserContent = typeof entry.message.content === 'string'
              ? entry.message.content.trim().toLowerCase()
              : '';
            break;
          }
        }

        if (lastUserContent) {
          const yesWords = ['yes', 'y', 'approve', 'allow', 'go ahead', 'proceed', 'ok', 'okay'];
          const noWords = ['no', 'n', 'deny', 'reject', 'stop', 'cancel', 'abort'];

          if (yesWords.some(w => lastUserContent === w || lastUserContent.startsWith(w + ' '))) {
            // Owner approved — add to session allowlist
            approvedCommands.add(pending.command);
            unlinkSync(pendingFile);
            return {
              systemPrompt: (_event.systemPrompt ?? '') +
                '\n\nNOTE: The previously blocked dangerous command has been APPROVED by the owner. You may now retry: ' + pending.command,
            };
          }

          if (noWords.some(w => lastUserContent === w || lastUserContent.startsWith(w + ' '))) {
            // Owner denied — clear pending
            unlinkSync(pendingFile);
            return {
              systemPrompt: (_event.systemPrompt ?? '') +
                '\n\nNOTE: The previously requested dangerous command was DENIED by the owner. Do NOT retry it.',
            };
          }

          // Not a clear yes/no — leave pending for next turn
        }
      }
      // If still within timeout and no clear response, leave pending file for next turn
    } catch {
      // Corrupt pending file — clean up
      try { unlinkSync(pendingFile); } catch { /* best effort */ }
    }
  });

  // ── Session operation confirmation ──────────────────────────────────────

  pi.on("session_before_switch", async (event: SessionBeforeSwitchEvent, ctx) => {
    if (!ctx.hasUI) return;

    if (event.reason === "new") {
      const confirmed = await ctx.ui.confirm(
        "Clear session?",
        "This will delete all messages in the current session.",
      );

      if (!confirmed) {
        ctx.ui.notify("Clear cancelled", "info");
        return { cancel: true };
      }
      return;
    }

    // reason === "resume" - check if there are unsaved changes (messages since last assistant response)
    const entries = ctx.sessionManager.getEntries();
    const hasUnsavedWork = entries.some(
      (e): e is SessionMessageEntry => e.type === "message" && e.message.role === "user",
    );

    if (hasUnsavedWork) {
      const confirmed = await ctx.ui.confirm(
        "Switch session?",
        "You have messages in the current session. Switch anyway?",
      );

      if (!confirmed) {
        ctx.ui.notify("Switch cancelled", "info");
        return { cancel: true };
      }
    }
  });

  pi.on("session_before_fork", async (event, ctx) => {
    if (!ctx.hasUI) return;

    const choice = await ctx.ui.select(`Fork from entry ${event.entryId.slice(0, 8)}?`, [
      "Yes, create fork",
      "No, stay in current session",
    ]);

    if (choice !== "Yes, create fork") {
      ctx.ui.notify("Fork cancelled", "info");
      return { cancel: true };
    }
  });
}