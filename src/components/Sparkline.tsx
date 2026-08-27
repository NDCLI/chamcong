import { fmt } from '../logic';

interface SparklineProps {
  months: number[];
  values: number[];
}

const W = 100;
const H = 26;

/**
 * Inline SVG trend of net salary across recent periods. Rendered in a fixed
 * 100x26 viewBox and stretched by CSS, so it scales with the card.
 */
export function Sparkline({ months, values }: SparklineProps) {
  if (values.length < 2 || values.every(v => v === 0)) return null;

  // Scaled to the data range, not to zero: six months of similar pay would
  // otherwise flatten into a straight line and show no trend at all.
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
  const max = hi + pad;
  const min = lo - pad;
  const span = max - min;
  const step = W / (values.length - 1);
  const pt = (v: number, i: number): [number, number] => [
    i * step,
    H - ((v - min) / span) * (H - 3) - 1.5
  ];

  const pts = values.map(pt);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  const [lastX, lastY] = pts[pts.length - 1];
  const label = months.map((m, i) => `Tháng ${m}: ${fmt(values[i])}`).join(' · ');

  return (
    <div className="net-sparkline" role="img" aria-label={`Xu hướng thực nhận — ${label}`}>
      <svg className="spark-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <polygon className="spark-area" points={area} />
        <polyline className="spark-line" points={line} />
      </svg>
      {/* Separate layer: the plot is non-uniformly scaled, which would turn the
          marker into an ellipse. This one keeps its aspect ratio. */}
      <svg className="spark-dot-layer" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <circle className="spark-dot" cx={lastX} cy={lastY} r={1.8} />
      </svg>
      <div className="spark-scale" aria-hidden="true">
        <span>Tháng {months[0]}</span>
        <span>Tháng {months[months.length - 1]}</span>
      </div>
    </div>
  );
}
