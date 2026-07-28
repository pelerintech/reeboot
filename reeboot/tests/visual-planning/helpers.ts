/**
 * Helpers for visual-planning E2E tests.
 *
 * These simulate the agent's structured output format when following the
 * visual-planning skill instructions. In production the LLM reads the files
 * and generates the structured blocks; these helpers do the same for tests
 * by parsing markdown content into the expected block types.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types matching the PlanView component contract ──────────────────────────

interface DiagramNode {
  id: string;
  label: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

interface AnnotatedCodeBlock {
  type: 'annotated-code';
  file: string;
  language?: string;
  annotations: { line: number; text: string; change?: string }[];
}

interface FileTreeEntry {
  path: string;
  note?: string;
}

interface FileTreeBlock {
  type: 'file-tree';
  title?: string;
  paths: FileTreeEntry[];
}

interface PlanView {
  type: 'plan';
  blocks: Record<string, unknown>[];
}

interface PlanOutput {
  content: { type: 'text'; text: string }[];
  view: PlanView;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Read a file and return its content as a trimmed string.
 */
function readFile(dir: string, name: string): string {
  return readFileSync(join(dir, name), 'utf-8').trim();
}

/**
 * Extract diagram nodes and edges from an ASCII architecture diagram in markdown.
 * Converts lines like `User → API Server → Database` into nodes and edges.
 */
function extractDiagramFromText(text: string): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const seen = new Set<string>();
  let nodeCounter = 0;

  // Find lines with arrow-like patterns (→, ->, ──>)
  const arrowLines = text.split('\n').filter(l => l.includes('→') || l.includes('->'));

  for (const line of arrowLines) {
    // Split on → or -> with optional surrounding whitespace/pipes
    const parts = line.split(/→|->/).map(p => p.trim().replace(/^\||\|$/g, '').trim());
    for (let i = 0; i < parts.length; i++) {
      const label = parts[i];
      if (!label || label === '') continue;
      if (!seen.has(label)) {
        seen.add(label);
        nodes.push({ id: `n${nodeCounter++}`, label });
      }
      if (i < parts.length - 1) {
        const nextParts = line.split(/→|->/).map(p => p.trim().replace(/^\||\|$/g, '').trim());
        if (nextParts[i + 1]) {
          edges.push({ from: `n${nodes.findIndex(n => n.label === label)}`, to: `n${nodes.findIndex(n => n.label === nextParts[i + 1])}` });
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Extract decision blocks from markdown content.
 * Looks for "### Decision: <title>" or "## Design decisions/## Decisions" sections
 * with bullet lists of options and chosen/rejected markers.
 */
function extractDecisions(text: string): Record<string, unknown>[] {
  const decisions: Record<string, unknown>[] = [];

  // Find "### Decision:" or "### <name> — Decision" patterns
  const decisionHeaders = text.match(/###\s+(?:Decision:\s*)?(.+)/g) || [];

  for (const header of decisionHeaders) {
    const title = header.replace(/^###\s+(?:Decision:\s*)?/, '').trim();
    // Find the content after this header until the next ## or ###
    const headerIdx = text.indexOf(header);
    const nextHeaderIdx = text.indexOf('\n###', headerIdx + 1);
    const section = nextHeaderIdx === -1
      ? text.slice(headerIdx)
      : text.slice(headerIdx, nextHeaderIdx);

    const options: string[] = [];
    let chosen = '';
    let rationale = '';
    const rejected: string[] = [];

    // Parse lines for options, chosen, rationale, rejected
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- **Chosen:**') || trimmed.startsWith('We chose')) {
        chosen = trimmed.replace(/^- \*\*Chosen:\*\*\s*/, '').replace(/^We chose\s*/, '').trim();
      } else if (trimmed.startsWith('- **Rejected:**') || trimmed.startsWith('Rejected:')) {
        const rej = trimmed.replace(/^- \*\*Rejected:\*\*\s*/, '').replace(/^Rejected:\s*/, '').trim();
        rejected.push(...rej.split(',').map(r => r.trim()).filter(Boolean));
      } else if (trimmed.startsWith('- **Rationale:**') || trimmed.match(/^(for|because|rationale):/i)) {
        rationale = trimmed.replace(/^- \*\*Rationale:\*\*\s*/, '').replace(/^(for|because|rationale):\s*/i, '').trim();
      }
    }

    // Fallback: if we couldn't parse structured fields, use the whole section as content
    if (!chosen && !rationale && !rejected.length) {
      // Try to extract from "We chose X for Y. Rejected: Z" patterns
      const choseMatch = section.match(/chose\s+(\w+(?:\s+\w+)?)\s+for\s+(.+?)(?:\.|$)/i);
      const rejectMatch = section.match(/Rejected:\s*(.+?)(?:\.|$)/);
      if (choseMatch) {
        chosen = choseMatch[1].trim();
        rationale = `${choseMatch[2].trim()}`;
      }
      if (rejectMatch) {
        rejected.push(...rejectMatch[1].split(',').map(r => r.trim()).filter(Boolean));
      }
    }

    // Extract options from "options: [A, B, C]" or similar bullet patterns
    const optionsMatch = section.match(/(?:Options?|considered):\s*(.+?)(?:\n|$)/i);
    if (optionsMatch) {
      options.push(...optionsMatch[1].split(',').map(o => o.trim().replace(/^\[|\]$/g, '')).filter(Boolean));
    }

    if (title) {
      decisions.push({
        type: 'decision',
        title,
        options: options.length > 0 ? options : [chosen || title, ...rejected],
        chosen: chosen || (rejected.length > 0 ? title : title),
        rationale: rationale || 'See design document for full context',
        rejected: rejected.length > 0 ? rejected : undefined,
      });
    }
  }

  return decisions;
}

/**
 * Extract annotated-code blocks from markdown content.
 * Looks for file path references (src/... or lib/... patterns) with surrounding context.
 */
function extractAnnotatedCode(text: string): AnnotatedCodeBlock[] {
  const blocks: AnnotatedCodeBlock[] = [];
  const fileRefs = text.match(/(?:src|lib|app|packages)\/[^\s,)]+(?:\.[a-z]+)?/g) || [];
  const seen = new Set<string>();

  // Also look for "Key files" sections or ## Files headers
  const fileSections = text.split(/##\s+(?:Key files|Files|Changed files)/);
  if (fileSections.length > 1) {
    // The section after the header
    const section = fileSections[1].split('\n##')[0];
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      const fileMatch = trimmed.match(/`([^`]+)`/);
      if (fileMatch) {
        const file = fileMatch[1];
        if (!seen.has(file)) {
          seen.add(file);
          const noteMatch = trimmed.match(/—\s*(.+)/);
          blocks.push({
            type: 'annotated-code',
            file,
            language: file.endsWith('.ts') ? 'typescript' : undefined,
            annotations: [
              { line: 1, text: noteMatch ? noteMatch[1].trim() : 'Referenced in design', change: 'add' },
            ],
          });
        }
      }
    }
  }

  // Add any remaining file references as individual blocks
  for (const ref of fileRefs) {
    if (!seen.has(ref)) {
      seen.add(ref);
      blocks.push({
        type: 'annotated-code',
        file: ref,
        language: ref.endsWith('.ts') ? 'typescript' : undefined,
        annotations: [{ line: 1, text: 'Referenced in design', change: 'modify' }],
      });
    }
  }

  return blocks;
}

/**
 * Extract file-tree entries from markdown content.
 * Looks for file path references with optional notes.
 */
function extractFileTree(text: string): FileTreeEntry[] {
  const entries: FileTreeEntry[] = [];
  const seen = new Set<string>();

  const fileRefs = text.match(/(?:`(?:src|lib|app|packages)[^`]+`)/g) || [];
  for (const ref of fileRefs) {
    const file = ref.replace(/`/g, '');
    if (!seen.has(file)) {
      seen.add(file);
      entries.push({ path: file, note: 'Referenced in tasks' });
    }
  }

  // Also check for standard file paths (backtick-free in code blocks)
  const codeBlockSection = text.match(/```[^]*?```/g) || [];
  for (const block of codeBlockSection) {
    const plainRefs = block.match(/(?:src|lib|app|packages)\/[^\s,)]+(?:\.[a-z]+)?/g) || [];
    for (const ref of plainRefs) {
      if (!seen.has(ref)) {
        seen.add(ref);
        entries.push({ path: ref, note: 'Referenced in tasks' });
      }
    }
  }

  return entries;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a visual plan view from a reespec request directory.
 * Reads brief.md and design.md, extracts architecture and decisions.
 */
export function buildPlanView(requestDir: string): PlanOutput {
  const brief = readFile(requestDir, 'brief.md');
  const design = readFile(requestDir, 'design.md');

  const combined = `${brief}\n\n${design}`;
  const diagram = extractDiagramFromText(combined);
  const decisions = extractDecisions(design);
  const codeBlocks = extractAnnotatedCode(design);

  const blocks: Record<string, unknown>[] = [];

  if (diagram.nodes.length > 0) {
    blocks.push({
      type: 'diagram',
      title: 'Architecture',
      nodes: diagram.nodes,
      edges: diagram.edges,
    });
  }

  blocks.push(...decisions);

  if (codeBlocks.length > 0) {
    blocks.push(...codeBlocks);
  }

  // Generate a summary text from what we found
  const summaryParts: string[] = [];
  if (diagram.nodes.length > 0) {
    summaryParts.push(`Architecture with ${diagram.nodes.length} components`);
  }
  if (decisions.length > 0) {
    summaryParts.push(`${decisions.length} design decisions`);
  }
  const summary = summaryParts.length > 0
    ? `Visual plan: ${summaryParts.join(', ')}.`
    : `Visual plan for request.`;

  return {
    content: [{ type: 'text', text: summary }],
    view: {
      type: 'plan',
      blocks,
    },
  };
}

/**
 * Extract file paths from task ACTION descriptions (what was created/modified).
 * Looks for backtick-wrapped file paths in action lines.
 */
function extractBeforeAfterFiles(tasks: string): { before: FileTreeEntry[]; after: FileTreeEntry[] } {
  const before: FileTreeEntry[] = [];
  const after: FileTreeEntry[] = [];
  const beforeSeen = new Set<string>();
  const afterSeen = new Set<string>();

  const lines = tasks.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Collect files from RED steps (the "before" state — things that didn't exist)
    if (trimmed.startsWith('- [x] **RED**')) {
      const fileRefs = trimmed.match(/`([^`]+)`/g);
      if (fileRefs) {
        for (const ref of fileRefs) {
          const file = ref.replace(/`/g, '');
          if (!beforeSeen.has(file)) {
            beforeSeen.add(file);
            before.push({
              path: file,
              note: trimmed.replace(/^- \[x\] \*\*RED\*\*\s*/, '').replace(/`[^`]+`/g, '').trim() || 'Did not exist',
            });
          }
        }
      } else {
        // Extract file names from description like "No server.ts exists"
        const fileMatch = trimmed.match(/(?:No|no)\s+([a-z_./-]+\.[a-z]+)/i);
        if (fileMatch && !beforeSeen.has(fileMatch[1])) {
          beforeSeen.add(fileMatch[1]);
          before.push({ path: fileMatch[1], note: 'Did not exist' });
        }
      }
    }

    // Collect files from ACTION steps (the "after" state — what was created/modified)
    if (trimmed.startsWith('- [x] **ACTION**') || trimmed.startsWith('- [x] **ACTION**')) {
      const fileRefs = trimmed.match(/`([^`]+)`/g);
      if (fileRefs) {
        for (const ref of fileRefs) {
          const file = ref.replace(/`/g, '');
          if (/^(src|lib|app|packages|tests)\//.test(file) && !afterSeen.has(file)) {
            afterSeen.add(file);
            const desc = trimmed.replace(/^- \[x\] \*\*ACTION\*\*\s*/, '').trim();
            after.push({
              path: file,
              note: desc.replace(/`[^`]+`/g, '').trim() || 'Created',
            });
          }
        }
      }
    }
  }

  return { before, after };
}

/**
 * Build a visual recap view from a reespec request directory.
 * Reads tasks.md, extracts completed tasks and referenced files.
 * Produces a before/after diff summary.
 */
export function buildRecapView(requestDir: string): PlanOutput {
  const tasks = readFile(requestDir, 'tasks.md');

  const codeBlocks = extractAnnotatedCode(tasks);
  const fileTree = extractFileTree(tasks);
  const { before, after } = extractBeforeAfterFiles(tasks);

  // Count completed tasks (tasks with [x] checkboxes)
  const completedCount = (tasks.match(/- \[x\]/g) || []).length;
  const totalCount = (tasks.match(/- \[.?\]/g) || []).length;

  const blocks: Record<string, unknown>[] = [];

  // Before block — shows the state before changes
  if (before.length > 0) {
    blocks.push({
      type: 'file-tree',
      title: 'Before',
      paths: before,
    });
  }

  // After block — shows the state after changes
  if (after.length > 0) {
    blocks.push({
      type: 'file-tree',
      title: 'After',
      paths: after,
    });
  }

  // Diff block — shows what changed via annotations
  if (codeBlocks.length > 0) {
    blocks.push(...codeBlocks);
  }

  // Also include a file-tree from general references if before/after was empty
  if (before.length === 0 && after.length === 0 && fileTree.length > 0) {
    blocks.push({
      type: 'file-tree',
      title: 'Changed files',
      paths: fileTree,
    });
  }

  const beforeCount = before.length;
  const afterCount = after.length;

  return {
    content: [{
      type: 'text',
      text: `Completed ${completedCount}/${totalCount} tasks. Before: ${beforeCount} files needed changes. After: ${afterCount} files created or modified.`,
    }],
    view: {
      type: 'plan',
      blocks,
    },
  };
}
