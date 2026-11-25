/**
 * Which story bible entries appear in which scene: a dot matrix with scenes as
 * columns. Clicking a cell links or unlinks the entry.
 */
import { useState } from 'react';
import type { Presence, SceneInfo } from '../../../../shared/structure';
import { useWidth } from './useWidth';

const LEFT = 150;
const RIGHT = 12;
const ROW = 26;
const TOP = 24;

export function PresenceGrid({ scenes, rows, onToggle }: { scenes: SceneInfo[]; rows: Presence[]; onToggle(sceneId: string, entryId: string): void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const col = scenes.length ? (width - LEFT - RIGHT) / scenes.length : 0;
  const height = TOP + rows.length * ROW + 8;
  const chapters = scenes.flatMap((s, i) => (i === 0 || scenes[i - 1].chapterId !== s.chapterId ? [{ i, title: s.chapter }] : []));
  const r = Math.max(3, Math.min(6, col / 3));

  if (rows.length === 0) return <p className="muted">Tietopankissa ei ole vielä merkintöjä tähän.</p>;

  const hs = hover ? scenes[hover.col] : null;
  const hr = hover ? rows[hover.row] : null;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Esiintymiset kohtauksittain">
        {chapters.map(c => (
          <g key={c.i}>
            {c.i > 0 && <line x1={LEFT + col * c.i} x2={LEFT + col * c.i} y1={TOP - 8} y2={height} stroke="var(--grid)" />}
            {(chapters.length < 14 || c.i === 0) && (
              <text className="axis-label" x={LEFT + col * c.i + 4} y={TOP - 10}>
                {c.title.length > 18 ? `${c.title.slice(0, 17)}…` : c.title}
              </text>
            )}
          </g>
        ))}
        {rows.map((row, ri) => {
          const y = TOP + ri * ROW + ROW / 2;
          return (
            <g key={row.entry.id}>
              <text className="direct-label" x={0} y={y + 4} style={{ fontSize: 14 }}>
                {row.entry.name.length > 20 ? `${row.entry.name.slice(0, 19)}…` : row.entry.name}
              </text>
              <line x1={LEFT} x2={width - RIGHT} y1={y} y2={y} stroke="var(--grid)" />
              {scenes.map((s, ci) => {
                const present = row.scenes.includes(ci);
                return (
                  <g key={s.id}>
                    {present ? (
                      <circle cx={LEFT + col * ci + col / 2} cy={y} r={r} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
                    ) : (
                      <circle cx={LEFT + col * ci + col / 2} cy={y} r={1.5} fill="var(--text-3)" opacity={0.5} />
                    )}
                    <rect
                      className="hover-col"
                      x={LEFT + col * ci}
                      y={y - ROW / 2}
                      width={col}
                      height={ROW}
                      tabIndex={0}
                      aria-label={`${row.entry.name}, ${s.title}: ${present ? 'mukana' : 'ei mukana'}`}
                      onPointerEnter={() => setHover({ row: ri, col: ci })}
                      onPointerLeave={() => setHover(null)}
                      onFocus={() => setHover({ row: ri, col: ci })}
                      onBlur={() => setHover(null)}
                      onClick={() => onToggle(s.id, row.entry.id)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onToggle(s.id, row.entry.id)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && hs && hr && (
        <div className="chart-tooltip" style={{ left: Math.min(LEFT + col * hover.col + col, width - 200), top: TOP + hover.row * ROW + ROW }}>
          <div className="t-title">{hr.entry.name}</div>
          <div className="t-row"><span>Kohtaus</span><strong>{hs.title}</strong></div>
          <div className="t-row"><span>Mukana</span><strong>{hr.scenes.includes(hover.col) ? 'kyllä' : 'ei'}</strong></div>
          <div className="t-row"><span>Kohtauksia yhteensä</span><strong>{hr.scenes.length}</strong></div>
          <div className="muted" style={{ marginTop: 4 }}>Klikkaa vaihtaaksesi</div>
        </div>
      )}
    </div>
  );
}
