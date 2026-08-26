import React, { useState } from 'react';
import { formatCurrency } from '../../engine/money';

export interface PieChartItem {
  id: string;
  name: string;
  amount: number; // in cents
  percent: number;
  color: string;
  count: number;
}

interface CategoryPieChartProps {
  items: PieChartItem[];
  totalAmountCents: number;
  size?: number;
  onSelectCategory?: (categoryId: string) => void;
}

export const CategoryPieChart: React.FC<CategoryPieChartProps> = ({
  items,
  totalAmountCents,
  size = 220,
  onSelectCategory
}) => {
  const [hoveredItem, setHoveredItem] = useState<PieChartItem | null>(null);

  if (!items || items.length === 0 || totalAmountCents <= 0) {
    return (
      <div
        style={{
          height: `${size}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.875rem'
        }}
      >
        No spending data for this cycle
      </div>
    );
  }

  const chartSize = size;
  const center = chartSize / 2;
  const outerRadius = center * 0.82;
  const innerRadius = center * 0.54;

  // Build SVG arc paths
  let currentAngle = -Math.PI / 2; // start at top 12 o'clock

  const slices = items.map((item) => {
    const sliceAngle = (item.amount / totalAmountCents) * (2 * Math.PI);
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    // Handle full 100% single category circle
    if (items.length === 1 || sliceAngle >= 2 * Math.PI - 0.001) {
      return {
        item,
        isFullCircle: true,
        path: ''
      };
    }

    const x1 = center + outerRadius * Math.cos(startAngle);
    const y1 = center + outerRadius * Math.sin(startAngle);
    const x2 = center + outerRadius * Math.cos(endAngle);
    const y2 = center + outerRadius * Math.sin(endAngle);

    const x3 = center + innerRadius * Math.cos(endAngle);
    const y3 = center + innerRadius * Math.sin(endAngle);
    const x4 = center + innerRadius * Math.cos(startAngle);
    const y4 = center + innerRadius * Math.sin(startAngle);

    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

    const path = `
      M ${x1.toFixed(2)} ${y1.toFixed(2)}
      A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}
      L ${x3.toFixed(2)} ${y3.toFixed(2)}
      A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}
      Z
    `;

    return {
      item,
      isFullCircle: false,
      path
    };
  });

  const activeDisplay = hoveredItem || {
    name: 'Total Spend',
    amount: totalAmountCents,
    percent: 100,
    color: 'var(--text-primary)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: `${size}px`, height: `${size}px` }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))' }}
        >
          {slices.map((slice, idx) => {
            const isHovered = hoveredItem?.id === slice.item.id;

            if (slice.isFullCircle) {
              return (
                <g
                  key={slice.item.id || idx}
                  style={{ cursor: onSelectCategory ? 'pointer' : 'default' }}
                  onClick={() => onSelectCategory?.(slice.item.id)}
                  onMouseEnter={() => setHoveredItem(slice.item)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <circle
                    cx={center}
                    cy={center}
                    r={(outerRadius + innerRadius) / 2}
                    fill="none"
                    stroke={slice.item.color || '#3b82f6'}
                    strokeWidth={outerRadius - innerRadius}
                    style={{
                      transition: 'stroke-width 0.2s ease',
                      strokeWidth: isHovered ? outerRadius - innerRadius + 6 : outerRadius - innerRadius
                    }}
                  />
                </g>
              );
            }

            return (
              <path
                key={slice.item.id || idx}
                d={slice.path}
                fill={slice.item.color || '#3b82f6'}
                stroke="var(--bg-card)"
                strokeWidth={2}
                style={{
                  cursor: onSelectCategory ? 'pointer' : 'default',
                  transition: 'transform 0.2s ease, opacity 0.2s ease',
                  transformOrigin: `${center}px ${center}px`,
                  transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  opacity: hoveredItem && !isHovered ? 0.6 : 1
                }}
                onClick={() => onSelectCategory?.(slice.item.id)}
                onMouseEnter={() => setHoveredItem(slice.item)}
                onMouseLeave={() => setHoveredItem(null)}
              />
            );
          })}
        </svg>

        {/* Center Text */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            textAlign: 'center',
            padding: '10px'
          }}
        >
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              maxWidth: '90px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {activeDisplay.name}
          </span>
          <span
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginTop: '2px'
            }}
          >
            {formatCurrency(activeDisplay.amount)}
          </span>
          {hoveredItem && (
            <span
              style={{
                fontSize: '0.72rem',
                color: hoveredItem.color || 'var(--brand-primary)',
                fontWeight: 600,
                marginTop: '1px'
              }}
            >
              {activeDisplay.percent.toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
