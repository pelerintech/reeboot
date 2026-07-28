import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PlanView from '../PlanView';

describe('PlanView', () => {
  it('renders diagram block as SVG with directed edges (arrowheads)', () => {
    const { container } = render(
      <PlanView
        blocks={[{
          type: 'diagram',
          title: 'Flow',
          nodes: [
            { id: 'a', label: 'Start' },
            { id: 'b', label: 'End' },
            { id: 'c', label: 'Middle' },
          ],
          edges: [
            { from: 'a', to: 'c', label: 'go' },
            { from: 'c', to: 'b', label: 'finish' },
          ],
        }]}
      />
    );
    expect(screen.getByText('Flow')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Verify directed edges: arrowhead marker must be defined
    const marker = svg!.querySelector('marker');
    expect(marker).toBeInTheDocument();
    expect(marker!.getAttribute('id')).toBe('arrowhead');
    // Edges must reference the arrowhead marker
    const lines = svg!.querySelectorAll('line');
    expect(lines.length).toBe(2);
    lines.forEach(line => {
      expect(line.getAttribute('marker-end')).toBe('url(#arrowhead)');
    });
  });

  it('renders wireframe block with section labels', () => {
    render(
      <PlanView
        blocks={[{
          type: 'wireframe',
          title: 'Layout',
          sections: [
            { name: 'Header', type: 'header', content: 'Nav' },
            { name: 'Main', type: 'content', content: 'Content area' },
          ],
        }]}
      />
    );
    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Main')).toBeInTheDocument();
  });

  it('renders annotated-code block with file and annotations', () => {
    render(
      <PlanView
        blocks={[{
          type: 'annotated-code',
          file: 'src/index.ts',
          language: 'typescript',
          annotations: [
            { line: 10, text: 'Added import', change: 'add' },
            { line: 20, text: 'Removed old code', change: 'remove' },
          ],
        }]}
      />
    );
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('Added import')).toBeInTheDocument();
    expect(screen.getByText('Removed old code')).toBeInTheDocument();
  });

  it('renders decision block with chosen option and rationale', () => {
    render(
      <PlanView
        blocks={[{
          type: 'decision',
          title: 'DB Choice',
          options: ['SQLite', 'Postgres'],
          chosen: 'SQLite',
          rationale: 'Local first',
          rejected: ['Postgres'],
        }]}
      />
    );
    expect(screen.getByText('DB Choice')).toBeInTheDocument();
    expect(screen.getByText('SQLite')).toBeInTheDocument();
    expect(screen.getByText('Local first')).toBeInTheDocument();
  });

  it('renders file-tree block as nested tree with paths and notes', () => {
    render(
      <PlanView
        blocks={[{
          type: 'file-tree',
          title: 'Changes',
          paths: [
            { path: 'src/server.ts', note: 'New route' },
            { path: 'src/config.ts', note: 'Updated' },
          ],
        }]}
      />
    );
    expect(screen.getByText('Changes')).toBeInTheDocument();
    // Rendered as nested tree: folder 'src' containing files
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('server.ts')).toBeInTheDocument();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
    expect(screen.getByText(/New route/)).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });

  it('falls back to JSON display for unknown block type', () => {
    const { container } = render(
      <PlanView
        blocks={[{
          type: 'unknown-block',
          data: 'test',
        } as any]}
      />
    );
    // Should render the block data as JSON text
    expect(container.textContent).toContain('unknown-block');
  });
});
