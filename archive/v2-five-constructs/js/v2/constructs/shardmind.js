import { TAU, lerp, mixColor, mulberry32 } from '../core.js';

const random = mulberry32(2207);
const OUTER = Array.from({ length: 13 }, (_, index) => {
  const angle = -Math.PI / 2 + index / 13 * TAU + (random() - .5) * .16;
  const radius = lerp(.72, 1.02, random());
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: lerp(-.8, .9, random()) };
});
const INNER = Array.from({ length: 6 }, (_, index) => {
  const angle = index / 6 * TAU + .28;
  const radius = lerp(.23, .48, random());
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: lerp(-.4, 1, random()) };
});
const BASE_POINTS = [...OUTER, ...INNER];
const FACES = OUTER.map((_, index) => [index, (index + 1) % OUTER.length, OUTER.length + index % INNER.length]);
FACES.push(...INNER.map((_, index) => [OUTER.length + index, OUTER.length + (index + 1) % INNER.length, index * 2 % OUTER.length]));
const CONNECTIONS = [];
for (const face of FACES) {
  for (let i = 0; i < 3; i++) {
    const a = face[i];
    const b = face[(i + 1) % 3];
    if (!CONNECTIONS.some(edge => edge[0] === Math.min(a, b) && edge[1] === Math.max(a, b))) CONNECTIONS.push([Math.min(a, b), Math.max(a, b)]);
  }
}
const ICONS = ['deployed_code', 'data_object', 'filter_alt', 'neurology', 'experiment', 'schema', 'lightbulb'];
const ICON_POINTS = [0, 2, 5, 8, 11, 14, 17];
const PALETTE = [0x8f63ff, 0xff5da2, 0x2ef2d0, 0xf9f2ff];

export function createShardmind(PIXI) {
  const container = new PIXI.Container();
  const glow = new PIXI.Graphics();
  const facesGraphic = new PIXI.Graphics();
  const facets = new PIXI.Graphics();
  glow.blendMode = 'add';
  facets.blendMode = 'add';
  container.addChild(glow, facesGraphic, facets);

  return {
    container,
    render(ctx) {
      const { layout, time, profile, pointer, effect, effectBoost } = ctx;
      const stretchX = lerp(.72, 1.08, profile.curiosity) * (1 + Math.sin(time * .19) * .035);
      const stretchY = lerp(1.04, .82, profile.coherence) * (1 + Math.cos(time * .23) * .03);
      const tilt = -.13 + pointer.x * .09 + Math.sin(time * .08) * .05;
      const cos = Math.cos(tilt);
      const sin = Math.sin(tilt);
      const points = BASE_POINTS.map((point, index) => {
        const fracture = (profile.creativity * .09 + effect('correction') * .08) * Math.sin(time * .72 + index * 2.17);
        const x0 = point.x * stretchX * (1 + fracture);
        const y0 = point.y * stretchY * (1 - fracture * .45);
        const depth = point.z + Math.sin(time * .31 + index) * .09;
        return {
          x: layout.cx + (x0 * cos - y0 * sin) * layout.scale * .78 + pointer.x * depth * 5,
          y: layout.cy + (x0 * sin + y0 * cos) * layout.scale * .78 + pointer.y * depth * 4,
          depth: (depth + 1) / 2,
        };
      });

      glow.clear();
      facesGraphic.clear();
      facets.clear();
      glow.poly(points.slice(0, OUTER.length).flatMap(point => [point.x, point.y]))
        .fill({ color: 0x8f63ff, alpha: .018 + profile.energy * .018 });

      [...FACES].sort((a, b) => {
        const da = a.reduce((sum, index) => sum + points[index].depth, 0);
        const db = b.reduce((sum, index) => sum + points[index].depth, 0);
        return da - db;
      }).forEach((face, faceIndex) => {
        const depth = face.reduce((sum, index) => sum + points[index].depth, 0) / 3;
        const colorA = PALETTE[faceIndex % 3];
        const color = mixColor(0x090710, colorA, .35 + depth * .42);
        facesGraphic.poly(face.flatMap(index => [points[index].x, points[index].y]))
          .fill({ color, alpha: .055 + depth * .09 + effectBoost * .025 });
      });

      const paths = CONNECTIONS.map(([from, to], index) => {
        const a = points[from];
        const b = points[to];
        const depth = (a.depth + b.depth) / 2;
        const color = PALETTE[index % PALETTE.length];
        facets.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
          color,
          width: .45 + depth * .85,
          alpha: .09 + depth * .28 + profile.coherence * .08,
          cap: 'round',
        });
        return {
          id: `facet-${from}-${to}`,
          color,
          sample(t) {
            const bow = Math.sin(Math.PI * t) * layout.scale * .018 * (index % 2 ? 1 : -1) * profile.creativity;
            return { x: lerp(a.x, b.x, t) + bow, y: lerp(a.y, b.y, t) - bow * .35 };
          },
        };
      });

      for (let i = 0; i < OUTER.length; i++) {
        const point = points[i];
        const color = PALETTE[i % PALETTE.length];
        facets.circle(point.x, point.y, 1.2 + point.depth * 1.8).fill({ color, alpha: .30 + point.depth * .45 });
      }
      if (effect('insight')) {
        const amount = effect('insight');
        facets.poly(points.slice(0, OUTER.length).flatMap(point => [point.x, point.y]))
          .stroke({ color: 0xf9f2ff, width: 1.3 + amount * 1.5, alpha: amount * .34 });
      }

      const nodes = ICON_POINTS.map((pointIndex, index) => ({
        id: `inclusion-${index}`,
        x: points[pointIndex].x,
        y: points[pointIndex].y,
        radius: layout.scale * lerp(.034, .047, points[pointIndex].depth),
        icon: ICONS[index],
        color: PALETTE[index % PALETTE.length],
        kind: 'diamond',
        phase: index * .9,
        iconScale: .78,
      }));

      return {
        paths,
        nodes,
        prompt: { style: 'shard', radius: .165, accent: 0x8f63ff, secondary: 0x2ef2d0 },
      };
    },
  };
}

export const shardmindConfig = {
  id: 'shardmind',
  name: 'Shardmind',
  index: '02',
  accent: 0x8f63ff,
  secondary: 0x2ef2d0,
  ambientColor: 0xb27aff,
  accentCss: '#a879ff',
  seed: 2207,
  particles: 104,
};
