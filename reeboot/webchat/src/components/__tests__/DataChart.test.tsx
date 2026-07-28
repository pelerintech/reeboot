import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DataChart from '../DataChart';

describe('DataChart', () => {
  it('renders bar chart with labels', () => {
    const { container } = render(
      <DataChart labels={['Jan', 'Feb']} values={[10, 20]} kind="bar" />
    );
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
    // Should render SVG
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Should render rect elements for bar chart
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(2);
    // Should render Y-axis value labels
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('renders line chart with labels', () => {
    const { container } = render(
      <DataChart labels={['A', 'B', 'C']} values={[5, 15, 10]} kind="line" />
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    // Should render Y-axis value labels
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    // Should render path for line
    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
    // Should render circles for data points
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(3);
  });

  it('renders empty state when no data', () => {
    render(<DataChart labels={[]} values={[]} kind="bar" />);
    expect(screen.getByText('No data to display')).toBeInTheDocument();
  });
});
