import React, { useState } from 'react';
import { formatCurrency } from '../../utils/finance';

interface DonutItem {
  label: string;
  value: number;
  color: string;
}

export function CategoryDonutChart({
  items,
  totalLabel = 'Total',
  currency = 'CAD',
  height = 240,
  size = 240,
}: {
  items: DonutItem[];
  totalLabel?: string;
  currency?: string;
  height?: number;
  size?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm 2xl:text-base text-neutral-400">
        No expense data to display
      </div>
    );
  }

  // Calculate SVG arc segments
  const center = size / 2;
  const radius = Math.round(size * 0.36);
  const strokeWidth = Math.round(size * 0.13);

  let accumulatedAngle = 0;
  const segments = items
    .filter((item) => item.value > 0)
    .map((item, idx) => {
      const percentage = (item.value / total) * 100;
      const angle = (item.value / total) * 360;
      const startAngle = accumulatedAngle;
      accumulatedAngle += angle;

      const isLargeArc = angle > 180 ? 1 : 0;
      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((startAngle + angle - 0.001 - 90) * Math.PI) / 180;

      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${isLargeArc} 1 ${x2} ${y2}`;

      return {
        ...item,
        idx,
        percentage,
        pathData,
      };
    });

  const activeItem = hoveredIdx !== null ? items[hoveredIdx] : null;

  return (
    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-6 2xl:gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full transform transition-all duration-300"
        >
          {segments.map((seg) => (
            <path
              key={seg.label}
              d={seg.pathData}
              fill="none"
              stroke={seg.color}
              strokeWidth={hoveredIdx === seg.idx ? strokeWidth + 4 : strokeWidth}
              className="cursor-pointer transition-all duration-200"
              onMouseEnter={() => setHoveredIdx(seg.idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Center cutout summary */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
          {activeItem ? (
            <>
              <span className="text-xs 2xl:text-sm font-semibold text-slate-400 uppercase tracking-wider truncate max-w-[110px]">
                {activeItem.label}
              </span>
              <span className="text-lg 2xl:text-2xl font-bold text-white">
                {formatCurrency(activeItem.value, currency)}
              </span>
              <span className="text-[11px] 2xl:text-xs font-medium text-slate-400">
                {((activeItem.value / total) * 100).toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[11px] 2xl:text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {totalLabel}
              </span>
              <span className="text-lg 2xl:text-2xl font-extrabold text-white">
                {formatCurrency(total, currency)}
              </span>
              <span className="text-[11px] 2xl:text-xs text-slate-400">100% total</span>
            </>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 2xl:gap-x-6 gap-y-1.5 2xl:gap-y-2.5 w-full text-xs 2xl:text-sm max-h-56 2xl:max-h-64 overflow-y-auto pr-1">
        {items.map((item, idx) => {
          const isHovered = hoveredIdx === idx;
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <div
              key={item.label}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center justify-between p-1.5 2xl:p-2 rounded-xl cursor-pointer transition-colors border ${
                isHovered
                  ? 'bg-white/10 border-white/20'
                  : 'hover:bg-white/5 border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2 truncate mr-2">
                <span
                  className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-medium text-slate-300 truncate">
                  {item.label}
                </span>
              </div>
              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="font-semibold text-white">
                  {formatCurrency(item.value, currency)}
                </span>
                <span className="text-[10px] text-slate-400">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthlyDividendBarChart({
  payouts,
  currentMonthIndex = 8, // September = index 8
}: {
  payouts: number[]; // 12 elements
  currentMonthIndex?: number;
}) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const maxVal = Math.max(...payouts, 100);
  const totalAnnual = payouts.reduce((a, b) => a + b, 0);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
        <span>Projected Monthly Cash Flow (CAD)</span>
        <span className="font-semibold text-slate-200">
          Annual PADI: {formatCurrency(totalAnnual)}
        </span>
      </div>

      <div className="h-44 flex items-end justify-between gap-1.5 pt-6 pb-2 px-1 border-b border-white/10">
        {payouts.map((amount, idx) => {
          const heightPct = Math.max(8, (amount / maxVal) * 100);
          const isCurrent = idx === currentMonthIndex;
          const isHovered = hoveredMonth === idx;

          return (
            <div
              key={monthNames[idx]}
              className="flex-1 flex flex-col items-center h-full justify-end group relative"
              onMouseEnter={() => setHoveredMonth(idx)}
              onMouseLeave={() => setHoveredMonth(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute -top-10 z-20 bg-slate-900/95 backdrop-blur-md border border-white/20 text-white text-[11px] py-1 px-2.5 rounded-lg shadow-xl pointer-events-none whitespace-nowrap font-mono">
                  {monthNames[idx]}: {formatCurrency(amount)}
                </div>
              )}

              <div
                style={{ height: `${heightPct}%` }}
                className={`w-full rounded-t-lg transition-all duration-300 ${
                  isCurrent
                    ? 'bg-rose-500 shadow-md shadow-rose-500/30'
                    : isHovered
                    ? 'bg-emerald-400 shadow-md shadow-emerald-400/20'
                    : 'bg-emerald-500/70 hover:bg-emerald-400'
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[11px] font-medium text-slate-400 pt-2 px-1">
        {monthNames.map((name, idx) => (
          <span
            key={name}
            className={`text-center flex-1 ${
              idx === currentMonthIndex
                ? 'font-bold text-rose-400'
                : ''
            }`}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DRIPGrowthAreaChart({
  timeline,
}: {
  timeline: Array<{
    year: number;
    portfolioValueWithDRIP: number;
    portfolioValueNoDRIP: number;
    annualDividendIncomeWithDRIP: number;
    annualDividendIncomeNoDRIP: number;
    totalContributed: number;
  }>;
}) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  if (timeline.length === 0) return null;

  const maxVal = Math.max(
    ...timeline.map((t) => t.portfolioValueWithDRIP),
    1000
  );

  const width = 600;
  const height = 220;
  const paddingX = 40;
  const paddingY = 25;

  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const getX = (idx: number) => paddingX + (idx / (timeline.length - 1)) * chartW;
  const getY = (val: number) => paddingY + chartH - (val / maxVal) * chartH;

  // Generate path data
  const dripPoints = timeline.map((t, idx) => `${getX(idx)},${getY(t.portfolioValueWithDRIP)}`);
  const noDripPoints = timeline.map((t, idx) => `${getX(idx)},${getY(t.portfolioValueNoDRIP)}`);
  const contribPoints = timeline.map((t, idx) => `${getX(idx)},${getY(t.totalContributed)}`);

  const dripArea = `${getX(0)},${getY(0)} ${dripPoints.join(' ')} ${getX(
    timeline.length - 1
  )},${getY(0)}`;

  const activePoint =
    hoveredYear !== null && hoveredYear >= 0 && hoveredYear < timeline.length
      ? timeline[hoveredYear]
      : timeline[timeline.length - 1];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2 text-xs">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-1.5 bg-emerald-400 rounded-sm" />
            <span className="text-slate-300 font-medium">
              Portfolio with DRIP
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-1.5 bg-sky-400 rounded-sm" />
            <span className="text-slate-300 font-medium">
              Without DRIP (Cash-out)
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-1.5 bg-slate-500 rounded-sm border-dashed" />
            <span className="text-slate-400 font-medium">Cumulative Capital</span>
          </div>
        </div>

        {activePoint && (
          <div className="text-xs font-mono bg-white/5 border border-white/10 py-1 px-3 rounded-xl text-slate-200">
            Year {activePoint.year}:{' '}
            <span className="text-emerald-400 font-bold">
              {formatCurrency(activePoint.portfolioValueWithDRIP)}
            </span>{' '}
            (Divs: {formatCurrency(activePoint.annualDividendIncomeWithDRIP)}/yr)
          </div>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          {/* Subtle grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="rgba(255,255,255,0.07)"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY + chartH / 2}
            x2={width - paddingX}
            y2={paddingY + chartH / 2}
            stroke="rgba(255,255,255,0.07)"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY + chartH}
            x2={width - paddingX}
            y2={paddingY + chartH}
            stroke="rgba(255,255,255,0.15)"
          />

          {/* Area fill for DRIP */}
          <polygon
            points={dripArea}
            fill="currentColor"
            className="text-emerald-500/15"
          />

          {/* Lines */}
          <polyline
            fill="none"
            stroke="#64748b"
            strokeWidth="2"
            strokeDasharray="4 3"
            points={contribPoints.join(' ')}
          />
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            points={noDripPoints.join(' ')}
          />
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            points={dripPoints.join(' ')}
          />

          {/* Interactive touch targets */}
          {timeline.map((_, idx) => {
            const cx = getX(idx);
            return (
              <rect
                key={idx}
                x={cx - chartW / (timeline.length * 2)}
                y={paddingY}
                width={chartW / timeline.length}
                height={chartH}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredYear(idx)}
              />
            );
          })}

          {/* Marker dot on hovered year */}
          {hoveredYear !== null && (
            <circle
              cx={getX(hoveredYear)}
              cy={getY(timeline[hoveredYear].portfolioValueWithDRIP)}
              r="5"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>

      <div className="flex justify-between text-[11px] text-slate-400 px-4 mt-1">
        <span>Year 0 (Today)</span>
        <span>Year {Math.round(timeline.length / 2)}</span>
        <span>Year {timeline[timeline.length - 1].year}</span>
      </div>
    </div>
  );
}
