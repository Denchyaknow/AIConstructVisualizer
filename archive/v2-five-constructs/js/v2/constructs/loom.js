import { TAU, drawPolyline, lerp, samplePath } from '../core.js';

const RIBBONS = [
  { color: 0xff718d, phase: 0.0, base: -.30, amplitude: .22, tilt: -.08 },
  { color: 0x6f7cff, phase: 1.1, base: -.15, amplitude: .29, tilt: .06 },
  { color: 0x65f7c5, phase: 2.2, base: 0, amplitude: .34, tilt: -.04 },
  { color: 0xffe38a, phase: 3.3, base: .15, amplitude: .29, tilt: .07 },
  { color: 0xf5f1ff, phase: 4.4, base: .30, amplitude: .22, tilt: -.06 },
];
const ICONS = ['translate', 'format_quote', 'code', 'history', 'gesture', 'difference', 'auto_awesome'];

function ribbonPoint(ribbon, index, t, ctx) {
  const { layout, time, profile } = ctx;
  const angle = t * TAU;
  const tension = lerp(1.22, .72, profile.creativity);
  const width = layout.scale * lerp(.76, .91, profile.outward);
  const wave = Math.sin(angle * 2 * tension + ribbon.phase + time * (.10 + index * .008)) * ribbon.amplitude;
  const braid = Math.sin(angle * 3 - time * .07 + index) * .04 * profile.curiosity;
  const x0 = Math.cos(angle) * width;
  const y0 = (ribbon.base + wave + braid) * layout.scale * lerp(.70, .98, profile.energy);
  const cos = Math.cos(ribbon.tilt);
  const sin = Math.sin(ribbon.tilt);
  return {
    x: layout.cx + x0 * cos - y0 * sin,
    y: layout.cy + x0 * sin + y0 * cos,
  };
}

export function createLoom(PIXI) {
  const container = new PIXI.Container();
  const haze = new PIXI.Graphics();
  const ribbonsGraphic = new PIXI.Graphics();
  const threads = new PIXI.Graphics();
  const intersections = new PIXI.Graphics();
  haze.blendMode = 'add';
  threads.blendMode = 'add';
  intersections.blendMode = 'add';
  container.addChild(haze, ribbonsGraphic, threads, intersections);

  return {
    container,
    render(ctx) {
      const { layout, time, profile, effect, effectBoost } = ctx;
      haze.clear();
      ribbonsGraphic.clear();
      threads.clear();
      intersections.clear();
      haze.roundRect(layout.cx - layout.scale * .90, layout.cy - layout.scale * .56, layout.scale * 1.8, layout.scale * 1.12, layout.scale * .28)
        .fill({ color: 0x272b78, alpha: .012 + profile.creativity * .014 });

      const paths = RIBBONS.map((ribbon, index) => {
        const path = {
          id: `semantic-ribbon-${index}`,
          color: ribbon.color,
          direction: index % 2 ? -1 : 1,
          sample(t) { return ribbonPoint(ribbon, index, t, ctx); },
        };
        const points = samplePath(path, 110);
        drawPolyline(ribbonsGraphic, points, {
          color: ribbon.color,
          width: layout.scale * lerp(.030, .050, profile.energy),
          alpha: .025 + profile.energy * .025,
          cap: 'round', join: 'round',
        }, true);
        drawPolyline(ribbonsGraphic, points, {
          color: ribbon.color,
          width: layout.scale * lerp(.009, .017, profile.creativity),
          alpha: .13 + profile.coherence * .10,
          cap: 'round', join: 'round',
        }, true);
        drawPolyline(threads, points, {
          color: 0xffffff,
          width: .6,
          alpha: .07 + profile.coherence * .08,
          cap: 'round',
        }, true);
        return path;
      });

      for (let index = 0; index < 14; index++) {
        const ribbonIndex = index % RIBBONS.length;
        const point = paths[ribbonIndex].sample((index * .163 + .07) % 1);
        intersections.circle(point.x, point.y, 1.1 + (index % 3) * .45).fill({
          color: RIBBONS[ribbonIndex].color,
          alpha: .22 + profile.energy * .24,
        });
      }
      if (effect('recognition')) {
        const amount = effect('recognition');
        for (let index = 0; index < RIBBONS.length; index++) {
          const point = paths[index].sample((time * .24 + index * .17) % 1);
          intersections.circle(point.x, point.y, 5 + amount * 11).stroke({ color: RIBBONS[index].color, width: 1.2, alpha: amount * .40 });
        }
      }
      if (effect('recall')) {
        const amount = effect('recall');
        intersections.moveTo(layout.cx - layout.scale * .86, layout.cy)
          .bezierCurveTo(layout.cx - layout.scale * .3, layout.cy - layout.scale * amount * .32, layout.cx + layout.scale * .3, layout.cy + layout.scale * amount * .32, layout.cx + layout.scale * .86, layout.cy)
          .stroke({ color: 0xf5f1ff, width: 1.4, alpha: amount * .34 });
      }

      const knotPhases = [.08, .22, .37, .52, .66, .80, .93];
      const nodes = knotPhases.map((phase, index) => {
        const pathIndex = index % paths.length;
        const point = paths[pathIndex].sample(phase + Math.sin(time * .12 + index) * .005);
        return {
          id: `meaning-knot-${index}`,
          x: point.x,
          y: point.y,
          radius: layout.scale * lerp(.030, .043, index % 2),
          icon: ICONS[index],
          color: RIBBONS[pathIndex].color,
          kind: 'knot',
          phase: index * .76,
          iconScale: .74,
        };
      });

      return {
        paths,
        nodes,
        prompt: { style: 'shuttle', radius: .165, accent: 0xff718d, secondary: 0x65f7c5 },
      };
    },
  };
}

export const loomConfig = {
  id: 'loom',
  name: 'Semantic Loom',
  index: '05',
  accent: 0xff718d,
  secondary: 0x65f7c5,
  ambientColor: 0x7d86ff,
  accentCss: '#ff718d',
  seed: 5503,
  particles: 112,
};
