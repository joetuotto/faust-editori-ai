/**
 * Pacing of the manuscript, scene by scene. Tension, length and dialogue are
 * separate strips on one shared scene axis (never two y-scales in one plot);
 * the POV strip is colored by character with a legend and direct labels.
 */
import { useMemo, useState } from 'react';
import type { SceneInfo } from '../../../../shared/structure';
import { useWidth } from './useWidth';

const LEFT = 118;
const RIGHT = 12;
const TOP = 26;
const STRIP_GAP = 26;
const STRIPS = { tension: 120, words: 84, dialogue: 60, pov: 14 };
const MAX_POV_COLORS = 7;

/** Rounded 4px data end, square at the baseline */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function povColors(scenes: SceneInfo[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const s of scenes) {
    if (!s.pov || colors.has(s.pov)) continue;
    colors.set(s.pov, colors.size < MAX_POV_COLORS ? `var(--series-${colors.size + 1})` : 'var(--series-other)');
  }
  return colors;
}

export function PacingChart({ scenes, onSelect }: { scenes: SceneInfo[]; onSelect(id: string): void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const plotWidth = width - LEFT - RIGHT;
  const col = scenes.length ? plotWidth / scenes.length : 0;
  const barW = Math.max(2, Math.min(24, col * 0.62));
  const cx = (i: number) => LEFT + col * i + col / 2;

  const maxWords = Math.max(100, ...scenes.map(s => s.words));
  const wordsTicks = [0, Math.round(maxWords / 2 / 100) * 100, Math.round(maxWords / 100) * 100].filter((v, i, a) => a.indexOf(v) === i);
  const y0 = TOP;
  const y1 = y0 + STRIPS.tension + STRIP_GAP;
  const y2 = y1 + STRIPS.words + STRIP_GAP;
  const y3 = y2 + STRIPS.dialogue + STRIP_GAP;
  const height = y3 + STRIPS.pov + 26;

  const colors = useMemo(() => povColors(scenes), [scenes]);
  const legend = [...colors.entries()].slice(0, MAX_POV_COLORS);
  const hasOther = colors.size > MAX_POV_COLORS;

  // Tension line broken where a scene has no value
  const tensionY = (t: number) => y0 + STRIPS.tension - (t / 10) * STRIPS.tension;
  const segments: string[] = [];
  let current = '';
  scenes.forEach((s, i) => {
    if (s.tension === undefined) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += `${current ? 'L' : 'M'}${cx(i)},${tensionY(s.tension)}`;
    }
  });
  if (current) segments.push(current);

  // Chapter boundaries along the top
  const chapters = scenes.flatMap((s, i) => (i === 0 || scenes[i - 1].chapterId !== s.chapterId ? [{ i, title: s.chapter }] : []));

  // POV runs for direct labels
  const povRuns = scenes.flatMap((s, i) => (s.pov && (i === 0 || scenes[i - 1].pov !== s.pov) ? [{ i, pov: s.pov }] : []));

  const h = hover !== null ? scenes[hover] : null;

  return (
    <div className="chart" ref={ref}>
      {(legend.length > 1 || hasOther) && (
        <div className="chart-legend" aria-label="Näkökulmahenkilöt">
          {legend.map(([name, color]) => (
            <span key={name}>
              <span className="key" style={{ background: color }} />
              {name}
            </span>
          ))}
          {hasOther && (
            <span>
              <span className="key" style={{ background: 'var(--series-other)' }} />
              Muut
            </span>
          )}
        </div>
      )}
      <svg width={width} height={height} role="img" aria-label="Kohtausten jännite, pituus ja dialogin osuus">
        {/* chapter separators */}
        {chapters.map(c => (
          <g key={`ch-${c.i}`}>
            {c.i > 0 && <line x1={LEFT + col * c.i} x2={LEFT + col * c.i} y1={TOP - 6} y2={y3 + STRIPS.pov} stroke="var(--grid)" />}
            {(chapters.length < 14 || c.i === 0) && (
              <text className="axis-label" x={LEFT + col * c.i + 4} y={TOP - 10}>
                {c.title.length > 18 ? `${c.title.slice(0, 17)}…` : c.title}
              </text>
            )}
          </g>
        ))}

        {/* tension */}
        <text className="strip-title" x={0} y={y0 + 10}>Jännite</text>
        {[0, 5, 10].map(t => (
          <g key={t}>
            <line x1={LEFT} x2={width - RIGHT} y1={tensionY(t)} y2={tensionY(t)} stroke="var(--grid)" />
            <text className="axis-label" x={LEFT - 8} y={tensionY(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {scenes.map((s, i) =>
          s.tension === undefined ? null : (
            <circle key={s.id} cx={cx(i)} cy={tensionY(s.tension)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          )
        )}

        {/* words */}
        <text className="strip-title" x={0} y={y1 + 10}>Pituus</text>
        {wordsTicks.map(t => {
          const y = y1 + STRIPS.words - (t / maxWords) * STRIPS.words;
          return (
            <g key={t}>
              <line x1={LEFT} x2={width - RIGHT} y1={y} y2={y} stroke="var(--grid)" />
              <text className="axis-label" x={LEFT - 8} y={y + 4} textAnchor="end">{t.toLocaleString('fi-FI')}</text>
            </g>
          );
        })}
        {scenes.map((s, i) => {
          const hgt = (s.words / maxWords) * STRIPS.words;
          return <path key={s.id} d={barPath(cx(i) - barW / 2, y1 + STRIPS.words - hgt, barW, hgt)} fill="var(--series-1)" />;
        })}

        {/* dialogue */}
        <text className="strip-title" x={0} y={y2 + 10}>Dialogi</text>
        {[0, 100].map(t => {
          const y = y2 + STRIPS.dialogue - (t / 100) * STRIPS.dialogue;
          return (
            <g key={t}>
              <line x1={LEFT} x2={width - RIGHT} y1={y} y2={y} stroke="var(--grid)" />
              <text className="axis-label" x={LEFT - 8} y={y + 4} textAnchor="end">{t} %</text>
            </g>
          );
        })}
        {scenes.map((s, i) => {
          const hgt = s.dialogueShare * STRIPS.dialogue;
          return <path key={s.id} d={barPath(cx(i) - barW / 2, y2 + STRIPS.dialogue - hgt, barW, hgt)} fill="var(--series-1)" />;
        })}

        {/* POV */}
        <text className="strip-title" x={0} y={y3 + 10}>Näkökulma</text>
        {scenes.map((s, i) =>
          s.pov ? (
            <rect key={s.id} x={LEFT + col * i + 1} y={y3} width={Math.max(1, col - 2)} height={STRIPS.pov} rx={3} fill={colors.get(s.pov)} />
          ) : null
        )}
        {povRuns.map(r => {
          let len = 1;
          while (scenes[r.i + len]?.pov === r.pov) len++;
          return col * len > 48 ? (
            <text key={`pl-${r.i}`} className="direct-label" x={LEFT + col * r.i + 3} y={y3 + STRIPS.pov + 16}>
              {r.pov}
            </text>
          ) : null;
        })}

        {/* hover columns: the hit target spans every strip */}
        {scenes.map((s, i) => (
          <rect
            key={`hit-${s.id}`}
            className="hover-col"
            x={LEFT + col * i}
            y={TOP - 4}
            width={col}
            height={y3 + STRIPS.pov - TOP + 8}
            tabIndex={0}
            aria-label={`${s.title}: ${s.words} sanaa`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onSelect(s.id)}
          />
        ))}
      </svg>

      {h && hover !== null && (
        <div className="chart-tooltip" style={{ left: Math.min(cx(hover) + 12, width - 200), top: TOP }}>
          <div className="t-title">{h.title}</div>
          <div className="t-row"><span>Luku</span><strong>{h.chapter}</strong></div>
          <div className="t-row"><span>Jännite</span><strong>{h.tension ?? '–'}</strong></div>
          <div className="t-row"><span>Sanoja</span><strong>{h.words.toLocaleString('fi-FI')}</strong></div>
          <div className="t-row"><span>Dialogia</span><strong>{Math.round(h.dialogueShare * 100)} %</strong></div>
          {h.pov && <div className="t-row"><span>Näkökulma</span><strong>{h.pov}</strong></div>}
          {h.storyTime && <div className="t-row"><span>Aika</span><strong>{h.storyTime}</strong></div>}
        </div>
      )}
    </div>
  );
}
