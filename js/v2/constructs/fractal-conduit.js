import {
  TAU,
  clamp,
  cubic,
  drawPolyline,
  lerp,
  mulberry32,
  polar,
  quadratic,
  samplePath,
} from '../core.js';

const ROOT_COUNT = 12;
const WIRE_COUNT = 18;
const MAX_DEPTH = 5;
const ICONS = ['input', 'output', 'memory', 'neurology', 'route', 'bolt'];

export const CONDUIT_PALETTES = [
  {
    id: 'ion', label: 'Ion chamber', accentCss: '#7cf7ff', ambientColor: 0x356cff,
    swatches: ['#7cf7ff', '#496cff', '#e8fbff'],
    hsl: [[184, 100, 74], [230, 100, 65], [194, 100, 95], [45, 100, 68]],
  },
  {
    id: 'ultraviolet', label: 'Ultraviolet', accentCss: '#c885ff', ambientColor: 0x733dff,
    swatches: ['#d58cff', '#7158ff', '#ff71b8'],
    hsl: [[275, 100, 77], [248, 100, 67], [330, 100, 72], [190, 100, 76]],
  },
  {
    id: 'ember', label: 'Ember circuit', accentCss: '#ffbe62', ambientColor: 0xff5b35,
    swatches: ['#ffe072', '#ff9447', '#ff5368'],
    hsl: [[48, 100, 72], [27, 100, 64], [351, 100, 66], [8, 100, 82]],
  },
  {
    id: 'deepsea', label: 'Deep-sea nerve', accentCss: '#75ffc9', ambientColor: 0x128d93,
    swatches: ['#75ffc9', '#20c8d5', '#4488ff'],
    hsl: [[157, 100, 73], [185, 74, 48], [220, 100, 64], [91, 100, 77]],
  },
];

const PALETTE_MAP = new Map(CONDUIT_PALETTES.map(palette => [palette.id, palette]));
const random = mulberry32(5519);
const ROOTS = Array.from({ length: ROOT_COUNT }, (_, index) => ({
  angleJitter: (random() - .5) * .12,
  length: lerp(.88, 1.12, random()),
  curl: (random() - .5) * .55,
  phase: random() * TAU,
  colorIndex: index + Math.floor(random() * 3),
}));
const WIRES = Array.from({ length: WIRE_COUNT }, (_, index) => ({
  angleJitter: (random() - .5) * .16,
  fan: (random() - .5),
  bend: (random() - .5) * .72,
  reach: lerp(.78, 1.05, random()),
  depth: lerp(.08, .94, random()),
  terminal: Math.floor(random() * 3),
  colorIndex: index + Math.floor(random() * 4),
}));

function hashNoise(value) {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}

function hslColor(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation / 100);
  const l = clamp(lightness / 100);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = h / 60;
  const x = chroma * (1 - Math.abs(section % 2 - 1));
  let r = 0; let g = 0; let b = 0;
  if (section < 1) [r, g] = [chroma, x];
  else if (section < 2) [r, g] = [x, chroma];
  else if (section < 3) [g, b] = [chroma, x];
  else if (section < 4) [g, b] = [x, chroma];
  else if (section < 5) [r, b] = [x, chroma];
  else [r, b] = [chroma, x];
  const match = l - chroma / 2;
  return ((Math.round((r + match) * 255) & 255) << 16)
    | ((Math.round((g + match) * 255) & 255) << 8)
    | (Math.round((b + match) * 255) & 255);
}

function paletteColor(palette, index, time, tuning) {
  const base = palette.hsl[index % palette.hsl.length];
  const rate = tuning.colorRate ?? .35;
  const shift = time * rate * 13 + Math.sin(time * rate + index * 1.37) * rate * 6;
  return hslColor(
    base[0] + (tuning.hueOffset ?? 0) + shift,
    base[1] * ((tuning.saturation ?? 100) / 100),
    base[2],
  );
}

function pointFrom(origin, radius, angle) {
  return { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
}

export function createFractalConduit(PIXI) {
  const container = new PIXI.Container();
  const aura = new PIXI.Graphics();
  const wiring = new PIXI.Graphics();
  const fractalGlow = new PIXI.Graphics();
  const fractalLines = new PIXI.Graphics();
  const terminals = new PIXI.Graphics();
  for (const graphic of [aura, wiring, fractalGlow, fractalLines, terminals]) graphic.blendMode = 'add';
  container.addChild(aura, wiring, fractalGlow, fractalLines, terminals);

  const depthVisibility = [1, 1, 1, 1, 1];
  let smoothedVariation = 1.25;
  let smoothedCrossLinks = 1;

  return {
    container,
    render(ctx) {
      const {
        layout, time, dt, pointer, profile, effect, effectBoost, reducedMotion,
        tuning: fieldTuning, constructTuning = {},
      } = ctx;
      const palette = PALETTE_MAP.get(constructTuning.palette) || CONDUIT_PALETTES[0];
      const targetVariation = constructTuning.fractalVariation ?? 1.25;
      smoothedVariation = lerp(smoothedVariation, targetVariation, 1 - Math.exp(-dt * 5));
      const variation = smoothedVariation;
      const requestedDepth = Math.round(constructTuning.fractalDepth ?? 5);
      const activeDepth = reducedMotion ? Math.min(3, requestedDepth) : requestedDepth;
      const nucleusScale = constructTuning.nucleusScale ?? 1;
      const branchPulse = constructTuning.branchPulse ?? 1;
      const rotationSpeed = constructTuning.fractalRotation ?? .18;
      const recursiveMotion = constructTuning.recursiveMotion !== false;
      const crossLinks = constructTuning.crossLinks !== false;
      const wireReach = constructTuning.wireReach ?? 1;
      const wireFan = constructTuning.wireFan ?? 1;
      const wireCurvature = constructTuning.wireCurvature ?? 1;
      const terminalBranches = constructTuning.terminalBranches !== false;
      const cursorWiring = constructTuning.cursorWiring !== false;
      const cursorTension = constructTuning.cursorTension ?? .55;
      const motionScale = reducedMotion ? .18 : 1;
      const spread = 1 + ((fieldTuning?.spread ?? 1) - 1) * .22;
      const center = { x: layout.cx, y: layout.cy };
      const rotation = time * .08 * rotationSpeed * motionScale + pointer.x * .025;
      const pulse = 1 + Math.sin(time * (.55 + profile.tempo * .18)) * .035 * branchPulse * motionScale;
      const splitAngle = .18 + variation * .27;
      const lengthDecay = .48 + variation * .075;
      const primary = paletteColor(palette, 0, time, constructTuning);
      const secondary = paletteColor(palette, 1, time, constructTuning);
      const tertiary = paletteColor(palette, 2, time, constructTuning);

      for (let level = 0; level < MAX_DEPTH; level++) {
        const target = level < activeDepth ? 1 : 0;
        depthVisibility[level] = lerp(depthVisibility[level], target, 1 - Math.exp(-dt * (target ? 8 : 24)));
      }
      smoothedCrossLinks = lerp(smoothedCrossLinks, crossLinks ? 1 : 0, 1 - Math.exp(-dt * 5));

      aura.clear();
      wiring.clear();
      fractalGlow.clear();
      fractalLines.clear();
      terminals.clear();

      const nucleusRadius = layout.scale * .48 * nucleusScale * pulse;
      aura.circle(center.x, center.y, nucleusRadius * 1.08)
        .fill({ color: primary, alpha: .012 + profile.energy * .010 });
      aura.circle(center.x, center.y, nucleusRadius)
        .stroke({ color: primary, width: .8 + effectBoost * 1.2, alpha: .08 + profile.coherence * .07 });
      aura.circle(center.x, center.y, nucleusRadius * .69)
        .stroke({ color: secondary, width: .55, alpha: .07 + profile.curiosity * .05 });
      for (let segment = 0; segment < 18; segment++) {
        const start = rotation + segment / 18 * TAU + .035;
        const radius = nucleusRadius * (1.16 + (segment % 3) * .025);
        aura.moveTo(center.x + Math.cos(start) * radius, center.y + Math.sin(start) * radius)
          .arc(center.x, center.y, radius, start, start + TAU / 18 * .52)
          .stroke({ color: paletteColor(palette, segment, time, constructTuning), width: .65, alpha: .08 + profile.energy * .045 });
      }

      const leafTips = [];
      let fractalSegments = 0;
      let maxFractalRadius = 0;
      const renderBranch = (start, angle, length, level, rootIndex, serial) => {
        const levelAlpha = depthVisibility[level - 1] * Math.pow(.79, level - 1);
        const noise = hashNoise(rootIndex * 97 + serial * 19 + level * 7);
        const animatedCurl = recursiveMotion
          ? Math.sin(time * (.32 + level * .045) * motionScale + ROOTS[rootIndex].phase + serial) * .055 * branchPulse
          : 0;
        const direction = angle + noise * variation * .16 + animatedCurl;
        const end = pointFrom(start, length, direction);
        maxFractalRadius = Math.max(maxFractalRadius, Math.hypot(end.x - center.x, end.y - center.y));
        const control = pointFrom({ x: lerp(start.x, end.x, .5), y: lerp(start.y, end.y, .5) }, length * .12 * variation, direction + Math.PI / 2 * Math.sign(noise || 1));
        const color = paletteColor(palette, ROOTS[rootIndex].colorIndex + level + serial, time, constructTuning);
        const branchPath = { sample(t) { return quadratic(start, control, end, t); } };
        const points = samplePath(branchPath, 10);
        const branchWidth = Math.max(.35, layout.scale * .0062 * Math.pow(.64, level - 1));
        drawPolyline(fractalGlow, points, { color, width: branchWidth * 3.5, alpha: levelAlpha * .05, cap: 'round' });
        drawPolyline(fractalLines, points, { color, width: branchWidth, alpha: levelAlpha * (.38 + profile.energy * .20), cap: 'round' });
        fractalSegments += levelAlpha > .01 ? 1 : 0;

        if (level >= MAX_DEPTH) {
          leafTips.push({ ...end, color, alpha: levelAlpha, rootIndex });
          return;
        }
        const nextLength = length * lengthDecay;
        const rootCurl = ROOTS[rootIndex].curl * variation * .12;
        renderBranch(end, direction - splitAngle + rootCurl, nextLength, level + 1, rootIndex, serial * 2 + 1);
        renderBranch(end, direction + splitAngle + rootCurl, nextLength, level + 1, rootIndex, serial * 2 + 2);
      };

      for (let rootIndex = 0; rootIndex < ROOT_COUNT; rootIndex++) {
        const root = ROOTS[rootIndex];
        const baseAngle = rotation + rootIndex / ROOT_COUNT * TAU + root.angleJitter * variation;
        const variationAmount = clamp(variation / 2);
        const start = pointFrom(center, layout.scale * .17 * nucleusScale * lerp(.92, 1.08, variationAmount), baseAngle);
        const length = layout.scale * .125 * nucleusScale * root.length * pulse * lerp(.78, 1.34, variationAmount);
        renderBranch(start, baseAngle, length, 1, rootIndex, 1);
      }

      if (leafTips.length > 2 && smoothedCrossLinks > .01) {
        const ordered = [...leafTips].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
        for (let index = 0; index < ordered.length; index += Math.max(1, Math.round(5 - variation))) {
          const a = ordered[index];
          const b = ordered[(index + Math.max(2, Math.round(7 - variation * 2))) % ordered.length];
          fractalLines.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
            color: a.color,
            width: .45,
            alpha: Math.min(a.alpha, b.alpha) * smoothedCrossLinks * .12,
          });
        }
      }
      for (const tip of leafTips) {
        fractalGlow.circle(tip.x, tip.y, 2.6).fill({ color: tip.color, alpha: tip.alpha * .08 });
        fractalLines.circle(tip.x, tip.y, .7).fill({ color: tip.color, alpha: tip.alpha * .62 });
      }

      const mouse = {
        x: layout.width * (pointer.x * .5 + .5),
        y: layout.height * (pointer.y * .5 + .5),
      };
      let maxWireReach = 0;
      let maxCursorInfluence = 0;
      const paths = WIRES.map((wire, index) => {
        const baseAngle = rotation * .24 + index / WIRE_COUNT * TAU + wire.angleJitter;
        const fanAngle = baseAngle + wire.fan * .42 * wireFan + Math.sin(time * .18 * motionScale + index) * .015;
        const endRadius = layout.scale * wire.reach * wireReach * spread;
        let end = pointFrom(center, endRadius, fanAngle);
        if (cursorWiring && pointer.presence > .001) {
          const dx = mouse.x - end.x;
          const dy = mouse.y - end.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const influence = Math.pow(1 - clamp(distance / (layout.scale * .68)), 2) * pointer.presence;
          end = {
            x: end.x + dx / distance * layout.scale * .12 * cursorTension * influence,
            y: end.y + dy / distance * layout.scale * .12 * cursorTension * influence,
          };
          maxCursorInfluence = Math.max(maxCursorInfluence, influence);
        }
        maxWireReach = Math.max(maxWireReach, Math.hypot(end.x - center.x, end.y - center.y));
        const start = { ...center };
        const throughRadius = layout.scale * (.29 + (index % 3) * .035) * nucleusScale;
        const c1 = pointFrom(center, throughRadius, baseAngle + wire.bend * .20 * wireCurvature);
        const c2 = pointFrom(center, endRadius * .69, fanAngle - wire.bend * .34 * wireCurvature);
        const color = paletteColor(palette, wire.colorIndex, time, constructTuning);
        const path = {
          id: `outbound-conduit-${index}`,
          color,
          centralRelay: true,
          frontThreshold: .51,
          sample(t) { return cubic(start, c1, c2, end, t); },
          depth(t) { return lerp(.44, wire.depth, t); },
        };
        const points = samplePath(path, 34);
        drawPolyline(wiring, points, { color: 0x14233a, width: layout.scale * (.010 + profile.energy * .004), alpha: .18 + profile.coherence * .06, cap: 'round' });
        drawPolyline(wiring, points, { color, width: .7 + profile.energy * .8, alpha: .22 + profile.energy * .20, cap: 'round' });

        const tangent = Math.atan2(end.y - c2.y, end.x - c2.x);
        const terminalSize = layout.scale * .025;
        terminals.circle(end.x, end.y, 2.1 + effect('dispatch') * 3.4).fill({ color, alpha: .56 + effect('dispatch') * .28 });
        terminals.circle(end.x, end.y, terminalSize * .34).stroke({ color, width: .7, alpha: .28 });
        if (terminalBranches) {
          const side = tangent + Math.PI / 2;
          const back = pointFrom(end, terminalSize * .86, tangent + Math.PI);
          const left = pointFrom(back, terminalSize * (.72 + wire.terminal * .10), side);
          const right = pointFrom(back, terminalSize * (.72 + wire.terminal * .10), side + Math.PI);
          terminals.moveTo(left.x, left.y).lineTo(end.x, end.y).lineTo(right.x, right.y)
            .stroke({ color, width: .8 + wire.terminal * .25, alpha: .32 + profile.outward * .18, cap: 'round' });
        }
        return path;
      });

      const nodes = [0, 3, 6, 9, 12, 15].map((wireIndex, index) => {
        const end = paths[wireIndex].sample(1);
        return {
          id: `terminal-${index}`,
          x: end.x,
          y: end.y,
          radius: layout.scale * .032,
          icon: ICONS[index],
          color: paths[wireIndex].color,
          kind: 'satellite',
          phase: index * .8,
          iconScale: .72,
        };
      });

      return {
        paths,
        nodes,
        flow: {
          mode: 'one-way',
          speedScale: 4.6,
          respawnRate: constructTuning.signalCadence ?? 1,
        },
        prompt: { style: 'orb', radius: .155, accent: primary, secondary: tertiary },
        debug: {
          palette: palette.id,
          fractalVariation: Number(variation.toFixed(3)),
          targetVariation,
          fractalDepth: activeDepth,
          fractalSegments,
          splitAngle: Number(splitAngle.toFixed(3)),
          lengthDecay: Number(lengthDecay.toFixed(3)),
          maxFractalRadius: Number(maxFractalRadius.toFixed(2)),
          leafTips: leafTips.length,
          wireCount: paths.length,
          maxWireReach: Number(maxWireReach.toFixed(2)),
          maxCursorInfluence: Number(maxCursorInfluence.toFixed(3)),
          flowMode: 'one-way',
        },
      };
    },
  };
}

export const fractalConduitConfig = {
  id: 'fractal-conduit',
  name: 'Fractal Conduit',
  index: '05',
  accent: 0x7cf7ff,
  secondary: 0x496cff,
  ambientColor: 0x356cff,
  accentCss: '#7cf7ff',
  seed: 5519,
  particles: 126,
  flowMode: 'one-way',
  flowSpeedScale: 4.6,
  customControls: {
    defaultPalette: 'ion',
    palettes: CONDUIT_PALETTES,
    groups: [
      {
        id: 'nucleus',
        controls: [
          { id: 'fractalVariation', type: 'range', label: 'Fractal variation', min: 0, max: 2, step: .05, value: 1.25, scale: ['crystalline', 'balanced', 'feral'] },
          { id: 'fractalDepth', type: 'range', label: 'Fractal depth', min: 1, max: 5, step: 1, value: 5, format: 'integer', scale: ['1 generation', '3', '5 generations'] },
          { id: 'nucleusScale', type: 'range', label: 'Nucleus radius', min: .65, max: 1.35, step: .05, value: 1.05, scale: ['compressed', 'native', 'expanded'] },
          { id: 'fractalRotation', type: 'range', label: 'Fractal rotation', min: -1.5, max: 1.5, step: .05, value: .18, format: 'signed', scale: ['reverse', 'still', 'forward'] },
          { id: 'branchPulse', type: 'range', label: 'Branch breathing', min: 0, max: 2, step: .05, value: 1, scale: ['still', 'native', 'deep'] },
          { id: 'crossLinks', type: 'toggle', label: 'Neural cross-links', description: 'Connect recursive leaf tips inside the nucleus.', value: true },
          { id: 'recursiveMotion', type: 'toggle', label: 'Living recursion', description: 'Let every fractal generation curl and breathe.', value: true },
        ],
      },
      {
        id: 'wiring',
        controls: [
          { id: 'wireReach', type: 'range', label: 'Wire reach', min: .6, max: 1.4, step: .05, value: 1, scale: ['contained', 'native', 'far field'] },
          { id: 'wireFan', type: 'range', label: 'Outward fan', min: .4, max: 1.8, step: .05, value: 1, scale: ['radial', 'native', 'scattered'] },
          { id: 'wireCurvature', type: 'range', label: 'Wire curvature', min: 0, max: 2, step: .05, value: 1, scale: ['direct', 'native', 'coiled'] },
          { id: 'signalCadence', type: 'range', label: 'Signal birth cadence', min: .25, max: 2.5, step: .05, value: 1, format: 'rate', scale: ['sparse', 'native', 'rapid'] },
          { id: 'cursorTension', type: 'range', label: 'Cursor wire tension', min: 0, max: 1.5, step: .05, value: .55, scale: ['off', 'native', 'elastic'] },
          { id: 'terminalBranches', type: 'toggle', label: 'Terminal forks', description: 'Split outward wires into circuit contacts.', value: true },
          { id: 'cursorWiring', type: 'toggle', label: 'Proximity wiring', description: 'Nearby outputs bend toward the cursor.', value: true },
        ],
      },
      {
        id: 'chromatic',
        palettes: true,
        controls: [
          { id: 'hueOffset', type: 'range', label: 'Hue offset', min: -180, max: 180, step: 1, value: 0, format: 'degree', scale: ['-180°', 'native', '+180°'] },
          { id: 'saturation', type: 'range', label: 'Saturation', min: 0, max: 150, step: 1, value: 100, format: 'percent', scale: ['mono', '100%', 'hyper'] },
          { id: 'colorRate', type: 'range', label: 'Color drift rate', min: 0, max: 2, step: .05, value: .35, format: 'rate', scale: ['frozen', '1×', '2×'] },
        ],
      },
    ],
  },
};
