interface DataChartProps {
  labels: string[];
  values: number[];
  kind?: 'bar' | 'line';
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 150;
const PADDING = { top: 10, bottom: 25, left: 35, right: 10 };
const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

/** Number of Y-axis tick marks (including 0) */
const Y_TICK_COUNT = 5;

function formatValue(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

export default function DataChart({ labels, values, kind = 'bar' }: DataChartProps) {
  if (labels.length === 0 || values.length === 0) {
    return <div className="my-2 text-xs text-zinc-500 p-2">No data to display</div>;
  }

  const maxVal = Math.max(...values, 1);
  const barWidth = Math.max(PLOT_WIDTH / labels.length - 4, 4);
  const gap = 4;

  const points = labels.map((_, i) => ({
    x: PADDING.left + i * (barWidth + gap) + barWidth / 2,
    y: PADDING.top + PLOT_HEIGHT - (values[i] / maxVal) * PLOT_HEIGHT,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  // Y-axis tick marks: evenly spaced values from 0 to maxVal
  const yTicks = Array.from({ length: Y_TICK_COUNT }, (_, i) =>
    Math.round((maxVal / (Y_TICK_COUNT - 1)) * i),
  );

  return (
    <div className="my-2 rounded-lg border border-zinc-200 bg-white p-2 overflow-x-auto">
      <svg width={CHART_WIDTH} height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        {/* Y-axis grid lines and value labels */}
        {yTicks.map((tick, i) => {
          const y = PADDING.top + PLOT_HEIGHT - (tick / maxVal) * PLOT_HEIGHT;
          return (
            <g key={i}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + PLOT_WIDTH}
                y2={y}
                stroke="#e4e4e7"
                strokeWidth={i === 0 ? 1 : 0.5}
              />
              <text
                x={PADDING.left - 5}
                y={y + 3}
                textAnchor="end"
                className="text-[10px] fill-zinc-400"
                fontSize={10}
              >
                {formatValue(tick)}
              </text>
            </g>
          );
        })}

        {kind === 'bar' && points.map((p, i) => (
          <rect
            key={i}
            x={p.x - barWidth / 2}
            y={p.y}
            width={barWidth}
            height={PADDING.top + PLOT_HEIGHT - p.y}
            fill="#3b82f6"
            rx={1}
          />
        ))}

        {kind === 'line' && (
          <>
            <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="#3b82f6" />
            ))}
          </>
        )}

        {/* X-axis labels */}
        {labels.map((label, i) => (
          <text
            key={i}
            x={points[i].x}
            y={CHART_HEIGHT - 5}
            textAnchor="middle"
            className="text-[10px] fill-zinc-500"
            fontSize={10}
          >
            {label.length > 8 ? label.slice(0, 8) + '…' : label}
          </text>
        ))}
      </svg>
    </div>
  );
}
