import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ToolCall from '../ToolCall';

describe('View registry — ToolCall with plan type', () => {
  it('renders PlanView when view type is "plan"', () => {
    render(
      <ToolCall
        name="visual-plan"
        view={{
          type: 'plan',
          blocks: [
            { type: 'diagram', title: 'Flow', nodes: [{ id: 'a', label: 'Start' }], edges: [] },
          ],
        }}
      />
    );
    // PlanView should render the diagram title
    expect(screen.getByText('Flow')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('renders PlanView with multiple block types', () => {
    render(
      <ToolCall
        name="visual-plan"
        view={{
          type: 'plan',
          blocks: [
            { type: 'decision', title: 'Decision', options: ['A', 'B'], chosen: 'A', rationale: 'Best' },
            { type: 'file-tree', title: 'Files', paths: [{ path: 'src/index.ts' }] },
          ],
        }}
      />
    );
    expect(screen.getByText('Decision')).toBeInTheDocument();
    expect(screen.getByText('Best')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('falls back to JSON card for non-plan views', () => {
    render(<ToolCall name="simple" view={{ type: 'data-table', columns: ['N'], rows: [{ N: '1' }] }} />);
    // DataTable renders, not PlanView — just verify no crash
    expect(screen.getByText('N')).toBeInTheDocument();
  });
});
