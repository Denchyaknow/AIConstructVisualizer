import { TAU, drawPolyline, lerp, samplePath } from '../core.js';

const ORBITS = [
  { radius: .29, squash: .30, tilt: -.28, speed: .23 },
  { radius: .39, squash: .54, tilt: .48, speed: -.15 },
  { radius: .50, squash: .25, tilt: -.78, speed: .11 },
  { radius: .61, squash: .66, tilt: .18, speed: -.08 },
  { radius: .71, squash: .37, tilt: .92, speed: .065 },
  { radius: .79, squash: .78, tilt: -.42, speed: -.05 },
  { radius: .88, squash: .49, tilt: .64, speed: .04 },
];
const ICONS = ['public', 'travel_explore', 'radar', 'terminal', 'shield', 'visibility', 'campaign'];
const COLORS = [0xff6a2b, 0xffd35a, 0x388bff, 0xef3d73, 0xfff2da];

function orbitPoint(orbit, phase, ctx, orbitIndex) {
  const { layout, time, profile } = ctx;
  const angle = phase * TAU + orbitIndex * .37;
  const breathing = 1 + Math.sin(time * .28 + orbitIndex) * .018 + profile.energy * .025;
  const radius = orbit.radius * layout.scale * breathing;
  const squash = orbit.squash * lerp(.86, 1.08, profile.coherence);
  const x0 = Math.cos(angle) * radius;
  const y0 = Math.sin(angle) * radius * squash;
  const tilt = orbit.tilt + Math.sin(time * .07 + orbitIndex) * .035 * profile.curiosity;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const lens = 1 + Math.sin(angle * 2 + time * .25) * .018 * profile.creativity;
  return {
    x: layout.cx + (x0 * cos - y0 * sin) * lens,
    y: layout.cy + (x0 * sin + y0 * cos) * lens,
  };
}

export function createSingularity(PIXI) {
  const container = new PIXI.Container();
  const corona = new PIXI.Graphics();
  const orbitsGraphic = new PIXI.Graphics();
  const photonRing = new PIXI.Graphics();
  corona.blendMode = 'add';
  orbitsGraphic.blendMode = 'add';
  photonRing.blendMode = 'add';
  container.addChild(corona, orbitsGraphic, photonRing);

  return {
    container,
    render(ctx) {
      const { layout, time, profile, effect, effectBoost } = ctx;
      corona.clear();
      orbitsGraphic.clear();
      photonRing.clear();
      const coronaRadius = layout.scale * (.20 + profile.energy * .035 + effect('insight') * .05);
      corona.circle(layout.cx, layout.cy, coronaRadius * 1.7).fill({ color: 0xff6a2b, alpha: .018 + profile.warmth * .018 });
      corona.ellipse(layout.cx, layout.cy, coronaRadius * 1.62, coronaRadius * .36)
        .stroke({ color: 0xffd35a, width: 3.2 + effectBoost * 2.4, alpha: .20 + profile.energy * .18 });
      corona.ellipse(layout.cx, layout.cy, coronaRadius * 1.46, coronaRadius * .22)
        .stroke({ color: 0xfff2da, width: .9, alpha: .38 });

      const paths = ORBITS.map((orbit, index) => {
        const path = {
          id: `orbit-${index}`,
          color: COLORS[index % COLORS.length],
          direction: lerp(-.42, 1, profile.outward),
          sample(t) {
            const spiral = Math.sin(t * TAU * 2 + time * .32 + index) * .018 * profile.curiosity;
            const point = orbitPoint({ ...orbit, radius: orbit.radius + spiral }, t, ctx, index);
            return point;
          },
        };
        drawPolyline(orbitsGraphic, samplePath(path, 76), {
          color: path.color,
          width: index % 2 ? .65 : 1,
          alpha: .07 + profile.coherence * .12 + (index === 0 ? .10 : 0),
          cap: 'round',
        }, true);
        return path;
      });

      const guard = profile.guard;
      if (guard > .08) {
        photonRing.circle(layout.cx, layout.cy, layout.scale * (.92 + Math.sin(time * .38) * .008))
          .stroke({ color: 0x388bff, width: .8 + guard * 2.2, alpha: guard * .25 });
        for (let index = 0; index < 18; index++) {
          const angle = index / 18 * TAU + time * .06;
          const radius = layout.scale * .92;
          photonRing.circle(layout.cx + Math.cos(angle) * radius, layout.cy + Math.sin(angle) * radius, .55 + guard * .9)
            .fill({ color: index % 2 ? 0x388bff : 0xfff2da, alpha: guard * .32 });
        }
      }
      if (effect('completion')) {
        const amount = effect('completion');
        const completionRadius = layout.scale * .94;
        photonRing.moveTo(layout.cx, layout.cy - completionRadius)
          .arc(layout.cx, layout.cy, completionRadius, -Math.PI / 2, -Math.PI / 2 + TAU * amount)
          .stroke({ color: 0xffd35a, width: 3, alpha: amount * .58, cap: 'round' });
      }

      const nodes = ORBITS.map((orbit, index) => {
        const phase = time * orbit.speed * lerp(.35, 1, profile.tempo) + index / ORBITS.length;
        const point = orbitPoint(orbit, phase, ctx, index);
        return {
          id: `satellite-${index}`,
          x: point.x,
          y: point.y,
          radius: layout.scale * lerp(.032, .045, index / ORBITS.length),
          icon: ICONS[index],
          color: COLORS[index % COLORS.length],
          kind: 'satellite',
          phase: index * .8,
          iconScale: .74,
        };
      });

      return {
        paths,
        nodes,
        prompt: { style: 'lens', radius: .18, accent: 0xff6a2b, secondary: 0x388bff },
      };
    },
  };
}

export const singularityConfig = {
  id: 'singularity',
  name: 'Thought Singularity',
  index: '04',
  accent: 0xff6a2b,
  secondary: 0x388bff,
  ambientColor: 0xff8948,
  accentCss: '#ff7a36',
  seed: 4409,
  particles: 110,
};
