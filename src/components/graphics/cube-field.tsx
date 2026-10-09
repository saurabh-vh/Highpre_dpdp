import { cn } from "@/lib/utils";

/**
 * Isometric field of raised cubes. A scan beam sweeps across and each cube
 * lights up as it passes; "verified" cubes stay white — personal data that's
 * been accounted for. Fully deterministic (seeded) so it renders identically
 * on server and client.
 */

type CubeFieldProps = {
  cols?: number;
  rows?: number;
  size?: number;
  seed?: number;
  verifiedRatio?: number;
  animate?: boolean;
  cycleSeconds?: number;
  /** Hold the field still below 640px: hundreds of animated polygons are heavy on phones. */
  staticOnMobile?: boolean;
  className?: string;
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export function CubeField({
  cols = 18,
  rows = 18,
  size = 56,
  seed = 7,
  verifiedRatio = 0.12,
  animate = true,
  cycleSeconds = 7,
  staticOnMobile = false,
  className,
}: CubeFieldProps) {
  const rand = mulberry32(seed);
  const w = size * 0.866;
  const h = size * 0.5;
  const depth = size;

  const cubes: { i: number; j: number; cx: number; cy: number; lift: number; verified: boolean }[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      cubes.push({
        i,
        j,
        cx: (i - j) * w,
        cy: (i + j) * h,
        lift: Math.round(rand() * size * 0.7),
        verified: rand() < verifiedRatio,
      });
    }
  }
  // Paint back to front so nearer cubes overlap farther ones.
  cubes.sort((a, b) => a.i + a.j - (b.i + b.j) || a.lift - b.lift);

  // The grid forms a diamond; crop to its inscribed rectangle so the field
  // fills the frame edge to edge instead of floating as a rhombus.
  const minX = -(rows - 1) * w - w;
  const maxX = (cols - 1) * w + w;
  const minY = -h - size;
  const maxY = (cols + rows - 2) * h + h + depth;
  const viewW = (maxX - minX) / 2;
  const viewH = (maxY - minY) / 2;
  const viewX = (minX + maxX) / 2 - viewW / 2;
  const viewY = (minY + maxY) / 2 - viewH / 2;

  return (
    // Callers position the field (absolute to fill a frame, or relative with a height).
    <div className={cn("overflow-hidden", staticOnMobile && "max-sm:[&_.cube-face]:![animation:none] max-sm:[&_.scan-beam]:hidden", className)} aria-hidden>
      <svg
        viewBox={`${viewX.toFixed(1)} ${viewY.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}`}
        preserveAspectRatio="xMidYMid slice"
        className="cube-field h-full w-full"
        data-animate={animate}
        style={{ ["--cycle" as string]: `${cycleSeconds}s` }}
      >
        {cubes.map(({ i, j, cx, cy: baseY, lift, verified }) => {
          const cy = baseY - lift;
          // Delay so the light-up follows the beam's horizontal position.
          // The beam centre crosses fraction f of the width at cycle point (f + 0.5) / 2.
          const f = (cx - viewX) / viewW;
          const delay = ((f + 0.5) / 2 - 0.06) * cycleSeconds;
          return (
            <g key={`${i}-${j}`} className={cn("cube", verified && "verified")} style={{ ["--d" as string]: `${delay.toFixed(2)}s` }}>
              <polygon className="cube-face left" fill="#232325" points={pts([[cx - w, cy], [cx, cy + h], [cx, cy + h + depth], [cx - w, cy + depth]])} />
              <polygon className="cube-face right" fill="#141415" points={pts([[cx, cy + h], [cx + w, cy], [cx + w, cy + depth], [cx, cy + h + depth]])} />
              <polygon
                className="cube-face top"
                fill="#3a3a3c"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.8}
                points={pts([[cx, cy - h], [cx + w, cy], [cx, cy + h], [cx - w, cy]])}
              />
            </g>
          );
        })}
      </svg>
      {animate && (
        <div className="pointer-events-none absolute inset-0" style={{ ["--cycle" as string]: `${cycleSeconds}s` }}>
          <div
            className="scan-beam absolute inset-0"
            style={{ background: "linear-gradient(90deg, transparent 36%, rgba(255,255,255,0.05) 46%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.05) 54%, transparent 64%)" }}
          />
        </div>
      )}
    </div>
  );
}
