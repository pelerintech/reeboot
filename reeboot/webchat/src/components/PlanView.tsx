import type { JSX } from 'react';

interface DiagramNode {
  id: string;
  label: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

interface DiagramBlock {
  type: 'diagram';
  title?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

interface WireframeSection {
  name: string;
  type: 'header' | 'content' | 'sidebar' | 'footer';
  content: string;
}

interface WireframeBlock {
  type: 'wireframe';
  title?: string;
  sections: WireframeSection[];
}

interface Annotation {
  line: number;
  text: string;
  change?: 'add' | 'remove' | 'modify';
}

interface AnnotatedCodeBlock {
  type: 'annotated-code';
  file: string;
  language?: string;
  annotations: Annotation[];
}

interface DecisionBlock {
  type: 'decision';
  title?: string;
  options: string[];
  chosen: string;
  rationale: string;
  rejected?: string[];
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

type PlanBlock = DiagramBlock | WireframeBlock | AnnotatedCodeBlock | DecisionBlock | FileTreeBlock;

interface PlanViewProps {
  blocks: PlanBlock[];
}

// ─── Sub-renderers ────────────────────────────────────────────────────────────

function DiagramView({ block }: { block: DiagramBlock }) {
  const SVG_W = 400;
  const SVG_H = 250;
  const NODE_W = 80;
  const NODE_H = 36;
  const PAD = 40;
  const MAX_NODES = 50;

  const visibleEdges = block.edges.slice(0, MAX_NODES * 2);
  const visibleNodes = block.nodes.slice(0, MAX_NODES);

  // Simple auto-layout: arrange nodes in a grid
  const cols = Math.ceil(Math.sqrt(visibleNodes.length));
  const cellW = (SVG_W - PAD * 2) / cols;
  const cellH = (SVG_H - PAD * 2) / Math.ceil(visibleNodes.length / cols);

  const nodePos = new Map<string, { x: number; y: number }>();
  visibleNodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    nodePos.set(node.id, {
      x: PAD + col * cellW + cellW / 2,
      y: PAD + row * cellH + cellH / 2,
    });
  });

  const isCapped = block.nodes.length > MAX_NODES;

  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white p-2 overflow-x-auto">
      {block.title && <div className="text-xs font-medium text-zinc-700 mb-1 px-1">{block.title}</div>}
      <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#a1a1aa" />
          </marker>
        </defs>
        {/* Edges */}
        {visibleEdges.map((edge, i) => {
          const from = nodePos.get(edge.from);
          const to = nodePos.get(edge.to);
          if (!from || !to) return null;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2 - 8;
          return (
            <g key={i}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#a1a1aa" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
              {edge.label && (
                <text x={midX} y={midY} textAnchor="middle" fontSize={9} fill="#71717a">{edge.label}</text>
              )}
            </g>
          );
        })}
        {/* Nodes */}
        {visibleNodes.map((node) => {
          const pos = nodePos.get(node.id);
          if (!pos) return null;
          return (
            <g key={node.id}>
              <rect
                x={pos.x - NODE_W / 2}
                y={pos.y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill="#f4f4f5"
                stroke="#d4d4d8"
                strokeWidth={1}
              />
              <text
                x={pos.x}
                y={pos.y + 4}
                textAnchor="middle"
                fontSize={10}
                fill="#27272a"
                className="select-none"
              >
                {node.label.length > 12 ? node.label.slice(0, 12) + '\u2026' : node.label}
              </text>
            </g>
          );
        })}
      </svg>
      {isCapped && (
        <div className="text-[10px] text-zinc-400 text-center mt-1">
          Diagram too large — showing first {MAX_NODES} nodes
        </div>
      )}
    </div>
  );
}

function WireframeView({ block }: { block: WireframeBlock }) {
  const sectionStyles: Record<string, string> = {
    header: 'border-b-2 border-zinc-300 bg-zinc-100 font-medium',
    content: 'flex-1 min-h-[60px]',
    sidebar: 'w-1/4 border-r-2 border-zinc-200 bg-zinc-50',
    footer: 'border-t-2 border-zinc-300 bg-zinc-100',
  };

  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white p-2">
      {block.title && <div className="text-xs font-medium text-zinc-700 mb-1">{block.title}</div>}
      <div className="flex flex-col min-h-[100px] border-2 border-dashed border-zinc-300 rounded">
        {block.sections.map((section, i) => (
          <div
            key={i}
            className={`px-2 py-1.5 text-[10px] text-zinc-600 ${sectionStyles[section.type] ?? ''}`}
            style={section.type === 'sidebar' ? { width: '25%' } : undefined}
          >
            <span className="font-medium text-zinc-500">{section.name}</span>
            {section.content && <div className="text-zinc-400 mt-0.5">{section.content}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnotatedCodeView({ block }: { block: AnnotatedCodeBlock }) {
  const changeColors: Record<string, string> = {
    add: 'bg-emerald-50 border-emerald-300 text-emerald-700',
    remove: 'bg-red-50 border-red-300 text-red-700',
    modify: 'bg-amber-50 border-amber-300 text-amber-700',
  };

  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white p-2">
      <div className="text-xs font-mono text-zinc-500 mb-1 truncate">{block.file}</div>
      {block.annotations.map((ann, i) => (
        <div key={i} className={`flex items-start gap-2 px-2 py-1 rounded mb-0.5 text-[10px] border ${changeColors[ann.change ?? ''] ?? 'border-zinc-200'}`}>
          <span className="font-mono text-zinc-400 min-w-[24px]">L{ann.line}</span>
          {ann.change && (
            <span className={`font-medium uppercase text-[8px] ${ann.change === 'add' ? 'text-emerald-600' : ann.change === 'remove' ? 'text-red-600' : 'text-amber-600'}`}>
              [{ann.change}]
            </span>
          )}
          <span className="text-zinc-700">{ann.text}</span>
        </div>
      ))}
    </div>
  );
}

function DecisionView({ block }: { block: DecisionBlock }) {
  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white p-2">
      {block.title && <div className="text-xs font-medium text-zinc-700 mb-1">{block.title}</div>}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-zinc-500">Chosen:</span>
        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{block.chosen}</span>
      </div>
      <div className="text-[10px] text-zinc-600 mb-1">{block.rationale}</div>
      {block.rejected && block.rejected.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-zinc-500">Rejected:</span>
          {block.rejected.map((r, i) => (
            <span key={i} className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── File tree helpers ────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  children: TreeNode[];
  isLeaf: boolean;
  note?: string;
}

function buildTree(paths: FileTreeEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const entry of paths) {
    const parts = entry.path.split('/');
    let currentLevel = roots;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      let existing = currentLevel.find(n => n.name === part);
      if (!existing) {
        existing = { name: part, children: [], isLeaf: isLast, note: isLast ? entry.note : undefined };
        currentLevel.push(existing);
      } else if (isLast && entry.note) {
        existing.note = entry.note;
      }
      currentLevel = existing.children;
    }
  }
  return roots;
}

function renderTreeNodes(nodes: TreeNode[], depth: number = 0): JSX.Element[] {
  const elements: JSX.Element[] = [];
  for (const node of nodes) {
    const indent = depth * 16;
    elements.push(
      <div key={node.name} className="flex items-start gap-1.5 py-0.5" style={{ paddingLeft: `${indent + 4}px` }}>
        <span className="text-zinc-400 shrink-0">{node.isLeaf ? '\u{1F4C4}' : '\u{1F4C1}'}</span>
        <span className="text-zinc-700">{node.name}</span>
        {node.isLeaf && node.note && <span className="text-zinc-400 ml-1">— {node.note}</span>}
      </div>
    );
    if (node.children.length > 0) {
      elements.push(...renderTreeNodes(node.children, depth + 1));
    }
  }
  return elements;
}

function FileTreeView({ block }: { block: FileTreeBlock }) {
  const tree = buildTree(block.paths);
  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white p-2">
      {block.title && <div className="text-xs font-medium text-zinc-700 mb-1">{block.title}</div>}
      <div className="font-mono text-[10px]">
        {renderTreeNodes(tree)}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlanView({ blocks }: PlanViewProps) {
  if (!blocks || blocks.length === 0) {
    return <div className="my-2 text-xs text-zinc-500 p-2">No plan blocks</div>;
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'diagram':
            return <DiagramView key={i} block={block} />;
          case 'wireframe':
            return <WireframeView key={i} block={block} />;
          case 'annotated-code':
            return <AnnotatedCodeView key={i} block={block} />;
          case 'decision':
            return <DecisionView key={i} block={block} />;
          case 'file-tree':
            return <FileTreeView key={i} block={block} />;
          default:
            return (
              <div key={i} className="my-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                <div className="text-[10px] text-zinc-400 mb-1">Unknown block: {(block as any).type}</div>
                <pre className="text-[10px] text-zinc-600 whitespace-pre-wrap font-mono">
                  {JSON.stringify(block, null, 2)}
                </pre>
              </div>
            );
        }
      })}
    </div>
  );
}
