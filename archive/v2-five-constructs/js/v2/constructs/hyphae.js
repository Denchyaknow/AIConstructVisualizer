import { TAU, cubic, drawPolyline, lerp, mulberry32, polar, samplePath } from '../core.js';

const random = mulberry32(3319);
const BRANCHES = Array.from({ length: 8 }, (_, index) => {
  const angle = -Math.PI / 2 + index / 8 * TAU + (random() - .5) * .20;
  const length = lerp(.68, .95, random());
  const bend = (random() - .5) * .42;
  return { angle, length, bend, seed: random() * TAU };
});
const ICONS = ['psychology_alt', 'memory', 'route', 'water_drop', 'device_hub', 'eco', 'auto_awesome', 'neurology'];
const COLORS = [0xa4ff9b, 0x35e0bc, 0xffd166, 0xff6f61, 0xeffff8];

function branchGeometry(branch, index, ctx) {
  const { layout, time, profile } = ctx;
  const breathe = 1 + Math.sin(time * .31 + branch.seed) * (.025 + profile.creativity * .035);
  const length = branch.length * breathe;
  const start = { x: layout.cx, y: layout.cy };
  const p1n = polar(length * .24, branch.angle + branch.bend * .75);
  const p2n = polar(length * .60, branch.angle - branch.bend * .35 + Math.sin(time * .19 + index) * .035 * profile.curiosity);
  const endn = polar(length, branch.angle + branch.bend * .16);
  return {
    start,
    c1: { x: layout.cx + p1n.x * layout.scale, y: layout.cy + p1n.y * layout.scale },
    c2: { x: layout.cx + p2n.x * layout.scale, y: layout.cy + p2n.y * layout.scale },
    end: { x: layout.cx + endn.x * layout.scale, y: layout.cy + endn.y * layout.scale },
  };
}

export function createHyphae(PIXI) {
  const container = new PIXI.Container();
  const bed = new PIXI.Graphics();
  const vessels = new PIXI.Graphics();
  const highlights = new PIXI.Graphics();
  const spores = new PIXI.Graphics();
  vessels.blendMode = 'add';
  highlights.blendMode = 'add';
  spores.blendMode = 'add';
  container.addChild(bed, vessels, highlights, spores);
  const sporeRandom = mulberry32(3931);
  const sporeSeeds = Array.from({ length: 38 }, () => ({
    branch: Math.floor(sporeRandom() * BRANCHES.length),
    t: sporeRandom(),
    offset: (sporeRandom() - .5) * .06,
    phase: sporeRandom() * TAU,
    size: lerp(.35, 1.55, sporeRandom() ** 2),
  }));

  return {
    container,
    render(ctx) {
      const { layout, time, profile, effect, effectBoost } = ctx;
      const geometries = BRANCHES.map((branch, index) => branchGeometry(branch, index, ctx));
      bed.clear();
      vessels.clear();
      highlights.clear();
      spores.clear();
      bed.circle(layout.cx, layout.cy, layout.scale * (.80 + profile.curiosity * .04))
        .fill({ color: 0x0a2a21, alpha: .022 + profile.warmth * .012 });

      const paths = [];
      geometries.forEach((geometry, index) => {
        const color = COLORS[index % COLORS.length];
        const path = {
          id: `hypha-main-${index}`,
          color,
          sample(t) { return cubic(geometry.start, geometry.c1, geometry.c2, geometry.end, t); },
        };
        paths.push(path);
        const points = samplePath(path, 34);
        drawPolyline(vessels, points, {
          color: 0x103c30,
          width: layout.scale * lerp(.022, .036, profile.energy),
          alpha: .15 + profile.coherence * .09,
          cap: 'round',
          join: 'round',
        });
        drawPolyline(vessels, points, {
          color,
          width: layout.scale * lerp(.004, .009, profile.energy),
          alpha: .23 + profile.energy * .22,
          cap: 'round',
          join: 'round',
        });
        drawPolyline(highlights, points, { color: 0xeffff8, width: .55, alpha: .10 + profile.coherence * .10, cap: 'round' });

        for (let side = -1; side <= 1; side += 2) {
          const splitT = .46 + ((index + side + 8) % 3) * .09;
          const origin = path.sample(splitT);
          const endAngle = BRANCHES[index].angle + side * lerp(.24, .52, profile.curiosity);
          const length = layout.scale * (.20 + (index % 3) * .025);
          const control = {
            x: origin.x + Math.cos(endAngle - side * .18) * length * .52,
            y: origin.y + Math.sin(endAngle - side * .18) * length * .52,
          };
          const end = { x: origin.x + Math.cos(endAngle) * length, y: origin.y + Math.sin(endAngle) * length };
          const secondary = {
            id: `hypha-secondary-${index}-${side}`,
            color: COLORS[(index + (side > 0 ? 2 : 1)) % COLORS.length],
            sample(t) {
              const u = 1 - t;
              return {
                x: u * u * origin.x + 2 * u * t * control.x + t * t * end.x,
                y: u * u * origin.y + 2 * u * t * control.y + t * t * end.y,
              };
            },
          };
          paths.push(secondary);
          drawPolyline(vessels, samplePath(secondary, 16), { color: secondary.color, width: 1.2 + profile.energy * 1.8, alpha: .16 + profile.coherence * .13, cap: 'round' });
          spores.circle(end.x, end.y, 1.5 + effect('insight') * 3).fill({ color: secondary.color, alpha: .48 });
        }
      });

      for (const spore of sporeSeeds) {
        const point = paths[spore.branch].sample(spore.t);
        const angle = spore.phase + time * .12;
        const offset = spore.offset * layout.scale * (1 + profile.curiosity * .4);
        spores.circle(point.x + Math.cos(angle) * offset, point.y + Math.sin(angle) * offset, spore.size)
          .fill({ color: COLORS[spore.branch % COLORS.length], alpha: .10 + profile.energy * .16 });
      }
      if (effect('recall')) {
        const amount = effect('recall');
        vessels.circle(layout.cx, layout.cy, layout.scale * (.22 + amount * .54))
          .stroke({ color: 0xa4ff9b, width: 2 + amount * 2, alpha: amount * .23 });
      }

      const nodes = geometries.map((geometry, index) => ({
        id: `organelle-${index}`,
        x: geometry.end.x,
        y: geometry.end.y,
        radius: layout.scale * lerp(.037, .053, profile.energy),
        icon: ICONS[index],
        color: COLORS[index % COLORS.length],
        kind: 'organelle',
        phase: index * .72,
        iconScale: .78,
      }));

      return {
        paths,
        nodes,
        prompt: { style: 'membrane', radius: .17, accent: 0xa4ff9b, secondary: 0x35e0bc },
      };
    },
  };
}

export const hyphaeConfig = {
  id: 'hyphae',
  name: 'Hyphae Intelligence',
  index: '03',
  accent: 0xa4ff9b,
  secondary: 0x35e0bc,
  ambientColor: 0x58e8bd,
  accentCss: '#9cff98',
  seed: 3319,
  particles: 102,
};
