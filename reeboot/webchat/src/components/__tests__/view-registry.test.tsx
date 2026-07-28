import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
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

  it('renders ConfirmWidget when view type is "confirm"', () => {
    render(
      <ToolCall
        name="confirm-tool"
        view={{ type: 'confirm', title: 'Test Title', message: 'Go?' }}
      />
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Go?')).toBeInTheDocument();
  });

  it('renders FormWidget when view type is "form"', () => {
    render(
      <ToolCall
        name="form-tool"
        view={{ type: 'form', fields: [{ name: 'name', label: 'Company', type: 'text' }] }}
      />
    );
    expect(screen.getByText('Company')).toBeInTheDocument();
  });

  it('still renders data-table when confirm/form views exist', () => {
    render(<ToolCall name="simple" view={{ type: 'data-table', columns: ['N'], rows: [{ N: '1' }] }} />);
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('still renders PlanView when confirm/form views exist', () => {
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
    expect(screen.getByText('Flow')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('calls onAction when confirm button is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ToolCall
        name="confirm-tool"
        view={{ type: 'confirm', title: 'Sure?', message: 'Go?' }}
        onAction={onAction}
      />
    );
    await user.click(screen.getByText('Yes'));
    expect(onAction).toHaveBeenCalled();
  });

  it('calls onAction when form is submitted', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ToolCall
        name="form-tool"
        view={{ type: 'form', fields: [{ name: 'name', label: 'Company', type: 'text' }] }}
        onAction={onAction}
      />
    );
    await user.type(screen.getByRole('textbox', { name: 'Company' }), 'Acme');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(onAction).toHaveBeenCalled();
  });
});
