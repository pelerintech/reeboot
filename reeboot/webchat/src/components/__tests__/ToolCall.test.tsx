import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import ToolCall from '../ToolCall';

describe('ToolCall', () => {
  it('renders tool name indicator', () => {
    render(<ToolCall name="schedule_task" />);
    expect(screen.getByText('schedule_task')).toBeInTheDocument();
  });

  it('shows collapsed state by default', () => {
    render(<ToolCall name="schedule_task" args={{ date: '2024-01-01' }} />);
    expect(screen.queryByText('Args')).not.toBeInTheDocument();
  });

  it('expands when clicked', async () => {
    const user = userEvent.setup();
    render(<ToolCall name="schedule_task" args={{ date: '2024-01-01' }} />);
    const button = screen.getByText('schedule_task').closest('button')!;
    await user.click(button);
    expect(screen.getByText('Args')).toBeInTheDocument();
  });

  it('collapses when clicked again', async () => {
    const user = userEvent.setup();
    render(<ToolCall name="schedule_task" args={{ date: '2024-01-01' }} defaultExpanded />);
    expect(screen.getByText('Args')).toBeInTheDocument();
    const button = screen.getByText('schedule_task').closest('button')!;
    await user.click(button);
    expect(screen.queryByText('Args')).not.toBeInTheDocument();
  });

  it('shows tool result when expanded', async () => {
    const user = userEvent.setup();
    render(<ToolCall name="schedule_task" args={{ date: '2024-01-01' }} result="Scheduled at 2024-01-01" />);
    const button = screen.getByText('schedule_task').closest('button')!;
    await user.click(button);
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText('Scheduled at 2024-01-01')).toBeInTheDocument();
  });

  it('shows error styling when isError is true', () => {
    render(<ToolCall name="schedule_task" result="Task failed" isError defaultExpanded />);
    const errorElements = screen.getAllByText('Error');
    expect(errorElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Task failed')).toBeInTheDocument();
  });

  it('starts expanded when defaultExpanded is true', () => {
    render(<ToolCall name="schedule_task" args={{ date: '2024-01-01' }} defaultExpanded />);
    expect(screen.getByText('Args')).toBeInTheDocument();
  });

  it('shows running state when no args or result', () => {
    render(<ToolCall name="fetch_data" defaultExpanded />);
    expect(screen.getByText('Running…')).toBeInTheDocument();
  });

  it('truncates long results', () => {
    const longResult = 'x'.repeat(600);
    const { container } = render(<ToolCall name="fetch_data" result={longResult} defaultExpanded />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toContain('…');
  });

  it('truncates long args', () => {
    const { container } = render(<ToolCall name="fetch_data" args={{ data: 'x'.repeat(600) }} defaultExpanded />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toContain('…');
  });

  // ── View-aware rendering tests ─────────────────────────────────────────────

  it('renders data-table view as a table instead of JSON card', () => {
    render(
      <ToolCall
        name="list-tools"
        view={{ type: 'data-table', columns: ['Name', 'Status'], rows: [{ Name: 'Alice', Status: 'OK' }] }}
      />
    );
    // Should render table headers instead of collapsible card
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    // Should NOT show the tool name in a button (since it's rendered as a widget)
    expect(screen.queryByText('list-tools')).not.toBeInTheDocument();
  });

  it('renders data-chart view as a chart instead of JSON card', () => {
    render(
      <ToolCall
        name="stats"
        view={{ type: 'data-chart', labels: ['Jan', 'Feb'], values: [10, 20], kind: 'bar' }}
      />
    );
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
  });

  it('renders fallback JSON card when view type is unknown', () => {
    render(
      <ToolCall
        name="future-tool"
        view={{ type: 'future-widget', data: 'test' }}
        defaultExpanded
      />
    );
    // Should show the tool name as a button (collapsible card)
    expect(screen.getByText('future-tool')).toBeInTheDocument();
    // Should show the expandable card
    const button = screen.getByText('future-tool').closest('button')!;
    expect(button).toBeInTheDocument();
  });

  it('renders fallback JSON card when no view provided', () => {
    render(<ToolCall name="simple-tool" result="done" defaultExpanded />);
    expect(screen.getByText('simple-tool')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });
});
