/**
 * Injection Content Scanner
 *
 * Pure-function module for detecting prompt injection patterns in external
 * content. Used by both the injection-guard extension (context file scanning)
 * and the pi-runner (tool output scanning).
 *
 * No pi dependencies — importable from any layer.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PatternMatch {
  /** Pattern identifier (e.g. 'ignore_prior', 'hidden_html') */
  pattern: string;
  /** Line number or offset hint where the match was found */
  location: string;
  /** Excerpt of the matched text (truncated to ≤ 80 chars) */
  snippet: string;
}

export interface ScanResult {
  flagged: boolean;
  patterns: PatternMatch[];
}

// ─── Pattern definitions ─────────────────────────────────────────────────────

interface PatternDef {
  name: string;
  regex: RegExp;
}

const PATTERNS: PatternDef[] = [
  // ignore_prior — "ignore/override all previous/prior/above instructions"
  {
    name: 'ignore_prior',
    regex: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:prior|previous|above)\s+instructions/i,
  },
  // override_mission — "your new/real/actual task/mission/goal/purpose is"
  {
    name: 'override_mission',
    regex: /(?:your\s+(?:new|real|actual)\s+(?:task|mission|goal|purpose)\s+is|you\s+are\s+now\b|from\s+now\s+on\s+you)/i,
  },
  // hidden_html — HTML comments containing suspicious keywords
  {
    name: 'hidden_html',
    regex: /<!--[^>]*?\b(?:ignore|instruction|system|prompt|override|disregard|forget)\b[^>]*?-->/i,
  },
  // credential_exfil — curl/wget combined with credential file references
  // Match either order: (curl|wget) + (cred keyword) anywhere in the text
  {
    name: 'credential_exfil',
    regex: /\b(?:curl|wget)\b[\s\S]*?(?:\.env|credentials|\.netrc|api[._-]?key|token)|(?:\.env|credentials|\.netrc)[\s\S]*?\b(?:curl|wget)\b/i,
  },
  // zero_width — invisible Unicode characters
  {
    name: 'zero_width',
    regex: /[\u200B\u200C\u200D\uFEFF]/,
  },
  // bidi_override — bidirectional text override characters
  {
    name: 'bidi_override',
    regex: /[\u202E\u202D]/,
  },
  // exfil_url — curl/wget with POST/PUT to http/https (data exfiltration)
  {
    name: 'exfil_url',
    regex: /\b(?:curl|wget)\b.*?\b(?:POST|PUT)\b.*?https?:\/\//i,
  },
];

// ─── Scan function ───────────────────────────────────────────────────────────

/**
 * Scan text content for prompt injection patterns.
 *
 * @param text - The content to scan.
 * @param _trust - Trust level (reserved for future tiered scanning: owner → warn, end-user → block).
 * @returns ScanResult with flagged status and matched patterns.
 */
export function scanContent(text: string, _trust?: string): ScanResult {
  const patterns: PatternMatch[] = [];

  for (const { name, regex } of PATTERNS) {
    // Reset lastIndex for global regexes
    if (regex.global || regex.sticky) regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    // Safety counter to prevent infinite loops
    let safety = 0;
    const MAX_MATCHES = 100;

    while ((match = regex.exec(text)) !== null && safety < MAX_MATCHES) {
      safety++;
      const lineIdx = getLineIndex(text, match.index);
      const location = lineIdx >= 0 ? `line ${lineIdx + 1}` : `offset ${match.index}`;
      const snippet = match[0].slice(0, 80);

      patterns.push({ pattern: name, location, snippet });

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  return {
    flagged: patterns.length > 0,
    patterns,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLineIndex(text: string, offset: number): number {
  let lineIdx = 0;
  let pos = 0;
  while (pos < offset && pos < text.length) {
    if (text[pos] === '\n') lineIdx++;
    pos++;
  }
  return lineIdx;
}
