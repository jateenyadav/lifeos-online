import { useId, useState } from 'react';
import { inr, inrShort } from './format.js';

/*
 * Hand-written SVG charts. Each chart is one focusable group: hover or use the arrow keys to read a value.
 * Colours come from the categorical tokens --chart-1..9 (docs/DESIGN.md).
 */

function useActive(count) {
  const [active, setActive] = useState(null);
  const onKeyDown = (event) => {
    if (!count) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) =>
        value === null ? 0 : Math.min(count - 1, value + 1),
      );
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) =>
        value === null ? count - 1 : Math.max(0, value - 1),
      );
    }
    if (event.key === 'Escape') setActive(null);
  };
  return { active, setActive, onKeyDown };
}

function niceMax(value) {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

/** Vertical bars, e.g. spend per day. data: [{ key, label, value, tip? }] */
export function BarChart({
  data,
  label,
  height = 168,
  color = 'var(--chart-1)',
  highlight,
  format = inr,
}) {
  const { active, setActive, onKeyDown } = useActive(data.length);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const gap = data.length > 20 ? 0.28 : 0.36;
  const current = active === null ? null : data[active];
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div
      className="chart bar-chart"
      role="group"
      tabIndex={0}
      aria-label={`${label}. Total ${format(total)}. Use the arrow keys to read each bar.`}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
    >
      <div className="chart-axis-max" aria-hidden="true">
        {inrShort(max)}
      </div>
      <div className="chart-plot" style={{ height }}>
        <div className="chart-grid" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <svg
          viewBox={`0 0 ${data.length * 10} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {data.map((d, index) => {
            const h = max ? (d.value / max) * 100 : 0;
            return (
              <g key={d.key} onMouseEnter={() => setActive(index)}>
                <rect
                  x={index * 10}
                  y="0"
                  width="10"
                  height="100"
                  fill="transparent"
                />
                <rect
                  className="bar"
                  x={index * 10 + gap * 5}
                  y={100 - Math.max(h, d.value ? 1.2 : 0)}
                  width={10 - gap * 10}
                  height={Math.max(h, d.value ? 1.2 : 0)}
                  rx="1.6"
                  fill={d.key === highlight ? 'var(--chart-2)' : color}
                  opacity={active === null || active === index ? 1 : 0.45}
                />
              </g>
            );
          })}
        </svg>
        {current && (
          <div
            className="chart-tip"
            role="status"
            style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
          >
            <strong>{format(current.value)}</strong>
            <span>{current.tip ?? current.label}</span>
          </div>
        )}
      </div>
      <div className="chart-ticks" aria-hidden="true">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
    </div>
  );
}

/** Donut with a legend. slices: [{ label, value, color }] */
export function Donut({
  slices,
  label,
  centerLabel = 'Total',
  format = inr,
  size = 176,
}) {
  const { active, setActive, onKeyDown } = useActive(slices.length);
  const total = slices.reduce((s, d) => s + d.value, 0);
  const radius = 15.9155; // circumference 100
  let offset = 25;
  const current = active === null ? null : slices[active];
  return (
    <div className="donut-wrap">
      <div
        className="chart donut"
        role="group"
        tabIndex={0}
        aria-label={`${label}: ${slices.map((s) => `${s.label} ${format(s.value)}`).join(', ')}`}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 42 42" aria-hidden="true">
          <circle
            cx="21"
            cy="21"
            r={radius}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth="5.2"
          />
          {total > 0 &&
            slices.map((slice, index) => {
              const share = (slice.value / total) * 100;
              const visible = Math.max(
                0,
                share - (slices.length > 1 ? 0.8 : 0),
              );
              const dash = `${visible} ${100 - visible}`;
              const node = (
                <circle
                  key={slice.label}
                  className="donut-slice"
                  cx="21"
                  cy="21"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={active === index ? 6.6 : 5.2}
                  strokeDasharray={dash}
                  strokeDashoffset={offset}
                  opacity={active === null || active === index ? 1 : 0.4}
                  onMouseEnter={() => setActive(index)}
                />
              );
              offset -= share;
              return node;
            })}
        </svg>
        <div
          className="donut-center"
          aria-hidden={current ? undefined : 'true'}
          role={current ? 'status' : undefined}
        >
          <small>{current ? current.label : centerLabel}</small>
          <strong>{format(current ? current.value : total)}</strong>
          {current && total > 0 && (
            <small>{Math.round((current.value / total) * 100)}%</small>
          )}
        </div>
      </div>
      <ul className="legend">
        {slices.map((slice, index) => (
          <li
            key={slice.label}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            data-dim={active !== null && active !== index ? 'true' : undefined}
          >
            <i style={{ background: slice.color }} aria-hidden="true" />
            <span>{slice.label}</span>
            <b>{format(slice.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lines over months. series: [{ name, color, values: [number] }], labels: [string] */
export function LineChart({
  series,
  labels,
  label,
  height = 190,
  format = inr,
  area = true,
}) {
  const { active, setActive, onKeyDown } = useActive(labels.length);
  const gradient = useId().replace(/:/g, '');
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(...all, 0));
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const n = labels.length;
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v) => 100 - ((v - min) / span) * 100;
  return (
    <div
      className="chart line-chart"
      role="group"
      tabIndex={0}
      aria-label={`${label}. ${series.map((s) => `${s.name}: latest ${format(s.values.at(-1) ?? 0)}`).join('. ')}. Use the arrow keys to read each month.`}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
    >
      <div className="chart-axis-max" aria-hidden="true">
        {inrShort(max)}
      </div>
      <div
        className="chart-plot"
        style={{ height }}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (!box.width) return;
          setActive(
            Math.round(((event.clientX - box.left) / box.width) * (n - 1)),
          );
        }}
      >
        <div className="chart-grid" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor={series[0]?.color}
                stopOpacity="0.28"
              />
              <stop
                offset="100%"
                stopColor={series[0]?.color}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          {area && series[0] && (
            <path
              d={`M0 100 ${series[0].values.map((v, i) => `L${x(i)} ${y(v)}`).join(' ')} L100 100 Z`}
              fill={`url(#${gradient})`}
            />
          )}
          {series.map((s) => (
            <polyline
              key={s.name}
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '4 3' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {active !== null && (
          <>
            <span
              className="chart-cross"
              style={{ left: `${x(active)}%` }}
              aria-hidden="true"
            />
            {series.map((s) => (
              <span
                key={s.name}
                className="chart-dot"
                aria-hidden="true"
                style={{
                  left: `${x(active)}%`,
                  top: `${y(s.values[active])}%`,
                  background: s.color,
                }}
              />
            ))}
            <div
              className="chart-tip"
              role="status"
              style={{ left: `${x(active)}%` }}
            >
              <span>{labels[active]}</span>
              {series.map((s) => (
                <strong key={s.name}>
                  <i style={{ background: s.color }} aria-hidden="true" />
                  {s.name} {format(s.values[active])}
                </strong>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="chart-ticks" aria-hidden="true">
        {labels.map((text, index) => (
          <span key={index} className={index % 2 && n > 7 ? 'tick-minor' : ''}>
            {text}
          </span>
        ))}
      </div>
      {series.length > 1 && (
        <ul className="legend legend-inline" aria-hidden="true">
          {series.map((s) => (
            <li key={s.name}>
              <i style={{ background: s.color }} />
              <span>{s.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A progress ring. value / max; tone turns warn/danger as it fills. */
export function Ring({ value, max, size = 132, label, children }) {
  const share = max > 0 ? value / max : 0;
  const tone = share > 1 ? 'danger' : share > 0.85 ? 'warn' : 'ok';
  return (
    <div
      className="ring"
      data-tone={tone}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <circle
          cx="21"
          cy="21"
          r="17"
          pathLength="100"
          className="ring-track"
        />
        <circle
          cx="21"
          cy="21"
          r="17"
          pathLength="100"
          className="ring-fill"
          strokeDasharray={`${Math.min(100, share * 100)} 100`}
        />
      </svg>
      <div className="ring-center" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

/** A thin horizontal meter. */
export function Meter({ value, max, tone, label }) {
  const share = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <span
      className="meter"
      data-tone={
        tone ??
        (max > 0 && value > max ? 'danger' : share > 0.85 ? 'warn' : 'ok')
      }
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-label={label}
    >
      <i style={{ width: `${share * 100}%` }} />
    </span>
  );
}
