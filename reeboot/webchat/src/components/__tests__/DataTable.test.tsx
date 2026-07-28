import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DataTable from '../DataTable';

describe('DataTable', () => {
  it('renders column headers and row cells', () => {
    render(
      <DataTable
        columns={['Name', 'Email']}
        rows={[{ Name: 'Alice', Email: 'a@b.com' }]}
      />
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('renders empty state when rows is empty', () => {
    render(<DataTable columns={['Name']} rows={[]} />);
    expect(screen.getByText('No rows')).toBeInTheDocument();
  });

  it('shows "Show N more" button when more than 100 rows', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ Name: `User ${i}` }));
    render(<DataTable columns={['Name']} rows={rows} />);
    expect(screen.getByText('Show 50 more')).toBeInTheDocument();
  });

  it('shows all rows when "Show N more" is clicked', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ Name: `User ${i}` }));
    render(<DataTable columns={['Name']} rows={rows} />);
    fireEvent.click(screen.getByText('Show 50 more'));
    expect(screen.getByText('User 149')).toBeInTheDocument();
    expect(screen.queryByText('Show 50 more')).not.toBeInTheDocument();
  });

  it('renders empty columns gracefully', () => {
    render(<DataTable columns={[]} rows={[]} />);
    expect(screen.getByText('No columns')).toBeInTheDocument();
  });
});
