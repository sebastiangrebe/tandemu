/** Shared Recharts style constants — keeps all charts visually consistent and theme-aware. */

export const AXIS_TICK = { fontSize: 12, fill: 'var(--tt)' } as const;
export const AXIS_TICK_SM = { fontSize: 11, fill: 'var(--tt)' } as const;

export const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--tooltip-bg)',
  border: '1px solid var(--tooltip-border)',
  borderRadius: '12px',
  fontSize: '12px',
};

export const TOOLTIP_LABEL_STYLE: React.CSSProperties = { color: 'var(--ts)' };
export const TOOLTIP_ITEM_STYLE: React.CSSProperties = { color: 'var(--tp)' };

export const LEGEND_STYLE: React.CSSProperties = { fontSize: '12px' };
