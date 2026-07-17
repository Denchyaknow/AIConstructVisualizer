import { TAU, lerp, mixColor } from '../core.js';

const PHI = (1 + Math.sqrt(5)) / 2;
const VERTICES = [
  ...[-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z]))),
  ...[-1, 1].flatMap(y => [-1, 1].map(z => [0, y / PHI, z * PHI])),
  ...[-1, 1].flatMap(x => [-1, 1].map(y => [x / PHI, y * PHI, 0])),
  ...[-1, 1].flatMap(x => [-1, 1].map(z => [x * PHI, 0, z / PHI])),
];

const distances = [];
for (let i = 0; i < VERTICES.length; i++) {
  for (let j = i + 1; j < VERTICES.length; j++) {
    const [ax, ay, az] = VERTICES[i];
    const [bx, by, bz] = VERTICES[j];
    distances.push({ i, j, d: Math.hypot(ax - bx, ay - by, az - bz) });
  }
}
const edgeLength = Math.min(...distances.map(edge => edge.d));
const EDGES = distances.filter(edge => Math.abs(edge.d - edgeLength) < .001);
const OPPOSITE_PAIRS = [];
const paired = new Set();
for (let i = 0; i < VERTICES.length; i++) {
  if (paired.has(i)) continue;
  const opposite = VERTICES.findIndex((point, index) => index !== i && point.every((value, axis) => Math.abs(value + VERTICES[i][axis]) < .001));
  if (opposite >= 0) {
    OPPOSITE_PAIRS.push([i, opposite]);
    paired.add(i);
    paired.add(opposite);
  }
}
const ICONS = ['hub', 'memory', 'search', 'language', 'visibility', 'construction', 'auto_awesome'];
const ICON_VERTICES = [0, 3, 5, 8, 12, 15, 18];
const COLORS = [0x41dfff, 0x4f6bff, 0xffc968, 0xecfdff];

function rotate([x, y, z], ax, ay, az) {
  let py = y * Math.cos(ax) - z * Math.sin(ax);
  let pz = y * Math.sin(ax) + z * Math.cos(ax);
  let px = x * Math.cos(ay) + pz * Math.sin(ay);
  pz = -x * Math.sin(ay) + pz * Math.cos(ay);
  const rx = px * Math.cos(az) - py * Math.sin(az);
  const ry = px * Math.sin(az) + py * Math.cos(az);
  return [rx, ry, pz];
}

export function createDodecahedron(PIXI) {
  const container = new PIXI.Container();
  const aura = new PIXI.Graphics();
  const mesh = new PIXI.Graphics();
  const verticesGraphic = new PIXI.Graphics();
  aura.blendMode = 'add';
  mesh.blendMode = 'add';
  verticesGraphic.blendMode = 'add';
  container.addChild(aura, mesh, verticesGraphic);

  return {
    container,
    render(ctx) {
      const { layout, time, profile, pointer, effect, effectBoost, tuning } = ctx;
      const spread = tuning?.spread ?? 1;
      const spatialSpread = 1 + (spread - 1) * .24;
      const depthSpread = .20 * (.72 + spread * .28);
      const spin = time * lerp(.055, .19, profile.tempo);
      const ax = .36 + Math.sin(time * .13) * .09 + pointer.y * .08;
      const ay = spin + pointer.x * .12;
      const az = -.10 + Math.sin(time * .10) * .08;
      const inflate = (lerp(.88, 1.04, profile.energy) + effect('recognition') * .05) * spatialSpread;
      const projected = VERTICES.map((point, index) => {
        const [x, y, z] = rotate(point, ax, ay, az);
        const perspective = 1 / (2.85 - z * depthSpread);
        const stretch = 1 + profile.curiosity * Math.sin(time * .37 + index * 1.7) * .025 * (.45 + spread * .55);
        return {
          x: layout.cx + x * perspective * layout.scale * 1.54 * inflate * stretch,
          y: layout.cy + y * perspective * layout.scale * 1.54 * inflate,
          z,
          depth: (z + 1.7) / 3.4,
        };
      });

      aura.clear();
      mesh.clear();
      verticesGraphic.clear();
      const auraSpread = 1 + (spread - 1) * .18;
      aura.circle(layout.cx, layout.cy, layout.scale * (.70 + profile.energy * .07) * auraSpread)
        .fill({ color: 0x276cff, alpha: .014 + profile.energy * .012 });
      aura.circle(layout.cx, layout.cy, layout.scale * (.54 + Math.sin(time * .7) * .015) * auraSpread)
        .stroke({ color: 0x41dfff, width: 1, alpha: .06 + effectBoost * .06 });
      aura.ellipse(layout.cx, layout.cy, layout.scale * .64 * auraSpread, layout.scale * .18 * (1 + (spread - 1) * .3))
        .stroke({ color: 0xffc968, width: .7, alpha: .10 + profile.coherence * .08 });

      const edgePaths = EDGES.map((edge, edgeIndex) => {
        const a = projected[edge.i];
        const b = projected[edge.j];
        const depth = (a.depth + b.depth) / 2;
        const color = mixColor(0x4f6bff, 0x41dfff, depth);
        mesh.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
          color,
          width: lerp(.5, 1.35, depth) + profile.coherence * .30,
          alpha: lerp(.10, .52, depth) * lerp(.7, 1, profile.coherence),
          cap: 'round',
        });
        return {
          id: `dodeca-edge-${edgeIndex}`,
          color: COLORS[edgeIndex % COLORS.length],
          sample(t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; },
          depth(t) { return lerp(a.depth, b.depth, t); },
          frontThreshold: .53,
        };
      });

      // Opposite vertices route a subset of live signals directly through the
      // prompt sphere. Their interpolated depth feeds the shared back/front
      // particle pass, so traffic disappears behind the core and re-emerges
      // over the emoji on the near side.
      const relayPaths = OPPOSITE_PAIRS.map(([from, to], pathIndex) => {
        const a = projected[from];
        const b = projected[to];
        const color = COLORS[(pathIndex + 1) % COLORS.length];
        return {
          id: `core-relay-${from}-${to}`,
          color,
          centralRelay: true,
          frontThreshold: .50,
          sample(t) {
            if (t < .5) return { x: lerp(a.x, layout.cx, t * 2), y: lerp(a.y, layout.cy, t * 2) };
            return { x: lerp(layout.cx, b.x, (t - .5) * 2), y: lerp(layout.cy, b.y, (t - .5) * 2) };
          },
          depth(t) { return lerp(a.depth, b.depth, t); },
        };
      });

      projected.forEach((point, index) => {
        const radius = lerp(1.3, 3.1, point.depth) * (1 + effect('insight') * .35);
        verticesGraphic.circle(point.x, point.y, radius * 2.6).fill({ color: 0x41dfff, alpha: .025 + point.depth * .03 });
        verticesGraphic.circle(point.x, point.y, radius).fill({ color: point.depth > .5 ? 0xecfdff : 0x4f6bff, alpha: .40 + point.depth * .5 });
      });

      const nodes = ICON_VERTICES.map((vertexIndex, iconIndex) => {
        const point = projected[vertexIndex];
        return {
          id: `relay-${iconIndex}`,
          x: point.x,
          y: point.y,
          radius: layout.scale * lerp(.038, .052, point.depth),
          icon: ICONS[iconIndex],
          color: COLORS[iconIndex % COLORS.length],
          alpha: lerp(.58, 1, point.depth),
          phase: iconIndex * TAU / ICONS.length,
          iconScale: .82,
        };
      });

      return {
        paths: [...edgePaths, ...relayPaths],
        nodes,
        prompt: { style: 'orb', radius: .17, accent: 0x41dfff, secondary: 0xffc968 },
        debug: {
          spread,
          maxNodeDistance: Number(Math.max(...projected.map(point => Math.hypot(point.x - layout.cx, point.y - layout.cy))).toFixed(2)),
          depthSpread: Number(depthSpread.toFixed(3)),
        },
      };
    },
  };
}

export const dodecahedronConfig = {
  id: 'dodecahedron',
  name: 'Dodecahedral Relay',
  index: '01',
  accent: 0x41dfff,
  secondary: 0xffc968,
  ambientColor: 0x4f9dff,
  accentCss: '#41dfff',
  seed: 1009,
  particles: 98,
};
