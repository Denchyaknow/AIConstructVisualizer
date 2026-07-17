import {
  TAU,
  clamp,
  cubic,
  drawPolyline,
  lerp,
  mixColor,
  mulberry32,
  polar,
  quadratic,
  samplePath,
} from '../core.js';

const MAX_SHARDS = 32;
const MAX_FRACTAL_DEPTH = 4;
const ICONS = ['neurology', 'memory', 'hub', 'data_object', 'flare', 'schema', 'route', 'auto_awesome'];

export const CORONA_PALETTES = [
  {
    id: 'reactor', label: 'Arc reactor', accentCss: '#68f4ff', ambientColor: 0x3478ff,
    swatches: ['#68f4ff', '#3478ff', '#ffd166'],
    hsl: [[184, 96, 70], [222, 100, 61], [43, 100, 70], [198, 45, 96]],
  },
  {
    id: 'nebula', label: 'Nebula bloom', accentCss: '#f26dff', ambientColor: 0x834dff,
    swatches: ['#f26dff', '#8257ff', '#55e6ff'],
    hsl: [[295, 100, 71], [255, 100, 67], [188, 100, 67], [327, 100, 76]],
  },
  {
    id: 'solar', label: 'Solar forge', accentCss: '#ffb347', ambientColor: 0xff593d,
    swatches: ['#fff07a', '#ff9e42', '#ff4d5f'],
    hsl: [[54, 100, 74], [31, 100, 63], [354, 100, 65], [18, 100, 79]],
  },
  {
    id: 'viridian', label: 'Viridian ghost', accentCss: '#7dffb2', ambientColor: 0x1ccf9a,
    swatches: ['#b6ff89', '#38e8b0', '#59a7ff'],
    hsl: [[95, 100, 77], [160, 78, 57], [213, 100, 67], [175, 50, 94]],
  },
  {
    id: 'monolith', label: 'White monolith', accentCss: '#f4fbff', ambientColor: 0x7c96ad,
    swatches: ['#ffffff', '#a9c5da', '#62758a'],
    hsl: [[196, 100, 98], [204, 33, 76], [211, 17, 46], [190, 22, 90]],
  },
];

const PALETTE_MAP = new Map(CORONA_PALETTES.map(palette => [palette.id, palette]));
const random = mulberry32(4421);
const REVEAL_RANK = new Array(MAX_SHARDS);
for (let rank = 0; rank < MAX_SHARDS; rank++) REVEAL_RANK[(rank * 13) % MAX_SHARDS] = rank;

const SHARDS = Array.from({ length: MAX_SHARDS }, (_, slot) => ({
  slot,
  rank: REVEAL_RANK[slot],
  jitter: (random() - .5) * .055,
  radius: lerp(.68, .94, random()),
  thickness: lerp(.075, .17, random()),
  width: lerp(.42, .86, random()),
  skew: (random() - .5) * .11,
  bend: (random() - .5) * .48,
  flutter: random() * TAU,
  depthSeed: random() * TAU,
}));

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
  const rate = tuning.colorRate ?? .65;
  const orbit = tuning.chromaticOrbit === false ? 0 : time * rate * 24;
  const ripple = rate ? Math.sin(time * rate * .9 + index * 1.71) * (3 + rate * 3.5) : 0;
  return hslColor(
    base[0] + (tuning.hueOffset ?? 0) + orbit + ripple,
    base[1] * ((tuning.saturation ?? 100) / 100),
    base[2],
  );
}

function pointFrom(center, radius, angle) {
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function flatPoints(points) {
  return points.flatMap(point => [point.x, point.y]);
}

export function createFractalCorona(PIXI) {
  const container = new PIXI.Container();
  const aura = new PIXI.Graphics();
  const fractals = new PIXI.Graphics();
  const tendrils = new PIXI.Graphics();
  const shardFaces = new PIXI.Graphics();
  const highlights = new PIXI.Graphics();
  aura.blendMode = 'add';
  fractals.blendMode = 'add';
  tendrils.blendMode = 'add';
  highlights.blendMode = 'add';
  container.addChild(aura, fractals, tendrils, shardFaces, highlights);

  const shardVisibility = SHARDS.map(shard => shard.rank < 22 ? 1 : 0);
  const fractalLevelVisibility = [1, 1, 1, 0];
  let fractalVisibility = 1;

  return {
    container,
    render(ctx) {
      const {
        layout, time, dt, pointer, profile, effect, effectBoost, reducedMotion,
        tuning: fieldTuning, constructTuning = {},
      } = ctx;
      const palette = PALETTE_MAP.get(constructTuning.palette) || CORONA_PALETTES[0];
      const density = Math.round(constructTuning.shardDensity ?? 22);
      const breathing = constructTuning.breathing ?? 1;
      const flutter = constructTuning.fragmentFlutter ?? 1;
      const rotationSpeed = constructTuning.rotationSpeed ?? .65;
      const spread = 1 + ((fieldTuning?.spread ?? 1) - 1) * .19;
      const fractalEnabled = constructTuning.fractal !== false;
      const requestedDepth = Math.round(constructTuning.fractalDepth ?? 3);
      const activeDepth = reducedMotion ? Math.min(2, requestedDepth) : requestedDepth;
      const cursorEnabled = constructTuning.cursorField !== false;
      const symmetryLock = Boolean(constructTuning.symmetryLock);
      const cursorReach = constructTuning.pointerReach ?? 1;
      const cursorGravity = constructTuning.cursorGravity ?? .35;
      const motionScale = reducedMotion ? .22 : 1;
      const recallDirection = lerp(1, -1.2, effect('recall'));
      const rotation = time * .105 * rotationSpeed * motionScale * recallDirection + pointer.x * .055;
      const breathingWave = Math.sin(time * (.48 + profile.tempo * .22)) * .055 * breathing * (.5 + profile.energy * .5);
      const recognitionCompression = 1 - effect('recognition') * .08;
      const baseRadiusScale = (1 + breathingWave + effect('insight') * .055) * recognitionCompression * spread;
      const center = { x: layout.cx, y: layout.cy };
      const mouse = {
        x: layout.width * (pointer.x * .5 + .5),
        y: layout.height * (pointer.y * .5 + .5),
      };
      const pointerRadius = layout.scale * lerp(.30, 1.08, clamp((cursorReach - .25) / 1.75));
      const pointerPresence = cursorEnabled ? pointer.presence : 0;

      fractalVisibility = lerp(fractalVisibility, fractalEnabled ? 1 : 0, 1 - Math.exp(-dt * (fractalEnabled ? 5.5 : 3.2)));
      for (let level = 0; level < MAX_FRACTAL_DEPTH; level++) {
        const target = level < activeDepth ? 1 : 0;
        fractalLevelVisibility[level] = lerp(fractalLevelVisibility[level], target, 1 - Math.exp(-dt * (target ? 5 : 3)));
      }
      for (let index = 0; index < SHARDS.length; index++) {
        const target = SHARDS[index].rank < density ? 1 : 0;
        shardVisibility[index] = lerp(shardVisibility[index], target, 1 - Math.exp(-dt * (target ? 6.5 : 2.8)));
      }

      aura.clear();
      fractals.clear();
      tendrils.clear();
      shardFaces.clear();
      highlights.clear();

      const primary = paletteColor(palette, 0, time, constructTuning);
      const secondary = paletteColor(palette, 1, time, constructTuning);
      const tertiary = paletteColor(palette, 2, time, constructTuning);
      aura.circle(center.x, center.y, layout.scale * (.82 + breathingWave * .6) * spread)
        .fill({ color: primary, alpha: .010 + profile.energy * .009 });
      aura.circle(center.x, center.y, layout.scale * (.62 + breathingWave * .35) * spread)
        .stroke({ color: primary, width: .8 + profile.coherence * .7, alpha: .08 + effectBoost * .05 });
      aura.ellipse(center.x, center.y, layout.scale * .72 * spread, layout.scale * (.17 + breathingWave * .2))
        .stroke({ color: tertiary, width: .75, alpha: .08 + profile.coherence * .06 });
      aura.ellipse(center.x, center.y, layout.scale * (.29 + breathingWave * .2), layout.scale * .66 * spread)
        .stroke({ color: secondary, width: .65, alpha: .06 + profile.curiosity * .05 });

      let maxPointerInfluence = 0;
      const fragments = SHARDS.map((shard, slot) => {
        const mirror = symmetryLock && slot >= MAX_SHARDS / 2 ? SHARDS[slot - MAX_SHARDS / 2] : shard;
        const mirroredJitter = symmetryLock && slot >= MAX_SHARDS / 2 ? -mirror.jitter : mirror.jitter;
        const angle = slot / MAX_SHARDS * TAU + mirroredJitter + rotation
          + Math.sin(time * .31 * motionScale + shard.flutter) * .012 * flutter;
        const radialBreath = Math.sin(time * .67 * motionScale + shard.flutter) * .018 * breathing;
        const radius = layout.scale * (mirror.radius + radialBreath) * baseRadiusScale;
        let x = center.x + Math.cos(angle) * radius;
        let y = center.y + Math.sin(angle) * radius;
        const dx = mouse.x - x;
        const dy = mouse.y - y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const proximity = Math.pow(1 - clamp(distance / pointerRadius), 2) * pointerPresence;
        maxPointerInfluence = Math.max(maxPointerInfluence, proximity);
        const displacement = layout.scale * .17 * cursorGravity * proximity;
        x += dx / distance * displacement;
        y += dy / distance * displacement;
        const localAngle = angle + cursorGravity * proximity * .11;
        const halfWidth = TAU / MAX_SHARDS * mirror.width * (1 + proximity * .45);
        const halfDepth = layout.scale * mirror.thickness * baseRadiusScale * (1 + proximity * .28);
        const localCenter = { x, y };
        const inner = Math.max(layout.scale * .20, radius - halfDepth);
        const outer = radius + halfDepth;
        const offset = { x: x - (center.x + Math.cos(angle) * radius), y: y - (center.y + Math.sin(angle) * radius) };
        const at = (r, a) => {
          const point = pointFrom(center, r, a);
          return { x: point.x + offset.x, y: point.y + offset.y };
        };
        const points = [
          at(inner, localAngle - halfWidth * 1.05),
          at(outer * (1 + mirror.skew * .22), localAngle - halfWidth * .62),
          at(outer * (1 - mirror.skew * .18), localAngle + halfWidth * .78),
          at(lerp(inner, outer, .42), localAngle + halfWidth * 1.10),
          at(inner * (1 + mirror.skew * .10), localAngle + halfWidth * .12),
        ];
        const depth = clamp(.5 + Math.sin(angle + shard.depthSeed * .12) * .44);
        return {
          ...shard,
          x, y, angle: localAngle, depth, points, proximity, localCenter,
          visibility: shardVisibility[slot],
          color: paletteColor(palette, slot, time, constructTuning),
        };
      });

      const mainPaths = fragments.map((fragment, index) => {
        const startRadius = layout.scale * (.19 + Math.sin(time * .8 + index) * .007 * breathing);
        const start = pointFrom(center, startRadius, fragment.angle);
        const c1n = polar(layout.scale * .34, fragment.angle + fragment.bend * .62 + pointer.y * .025);
        const c2n = polar(layout.scale * fragment.radius * .72 * baseRadiusScale, fragment.angle - fragment.bend * .36);
        const c1 = { x: center.x + c1n.x, y: center.y + c1n.y };
        const c2 = {
          x: center.x + c2n.x + (fragment.x - (center.x + Math.cos(fragment.angle) * layout.scale * fragment.radius * baseRadiusScale)) * .65,
          y: center.y + c2n.y + (fragment.y - (center.y + Math.sin(fragment.angle) * layout.scale * fragment.radius * baseRadiusScale)) * .65,
        };
        const path = {
          id: `corona-spoke-${index}`,
          color: fragment.color,
          alpha: fragment.visibility,
          frontThreshold: .53,
          sample(t) { return cubic(start, c1, c2, fragment.localCenter, t); },
          depth(t) { return lerp(.48, fragment.depth, t); },
        };
        if (fragment.visibility > .01) {
          drawPolyline(tendrils, samplePath(path, 26), {
            color: fragment.color,
            width: layout.scale * lerp(.0025, .0075, profile.energy) * (1 + fragment.proximity * .45),
            alpha: fragment.visibility * (.13 + profile.coherence * .17),
            cap: 'round',
          });
          drawPolyline(highlights, samplePath(path, 26), {
            color: paletteColor(palette, index + 3, time, constructTuning),
            width: .45 + fragment.proximity * .65,
            alpha: fragment.visibility * (.13 + profile.energy * .13),
            cap: 'round',
          });
        }
        return path;
      });

      const chordPaths = Array.from({ length: 8 }, (_, index) => {
        const a = fragments[index * 2];
        const b = fragments[index * 2 + MAX_SHARDS / 2];
        const visibility = Math.min(a.visibility, b.visibility);
        const path = {
          id: `corona-relay-${index}`,
          color: paletteColor(palette, index + 1, time, constructTuning),
          alpha: visibility * .76,
          centralRelay: true,
          frontThreshold: .50,
          sample(t) {
            if (t < .5) return { x: lerp(a.x, center.x, t * 2), y: lerp(a.y, center.y, t * 2) };
            return { x: lerp(center.x, b.x, (t - .5) * 2), y: lerp(center.y, b.y, (t - .5) * 2) };
          },
          depth(t) { return lerp(a.depth, b.depth, t); },
        };
        if (visibility > .02) drawPolyline(tendrils, samplePath(path, 34), { color: path.color, width: .55, alpha: visibility * .07, cap: 'round' });
        return path;
      });

      let fractalSegments = 0;
      let branchSerial = 0;
      const fractalPaths = [];
      const drawBranch = (start, angle, length, level, rootIndex, side, rootVisibility, depth) => {
        const levelVisibility = fractalLevelVisibility[level - 1];
        const alpha = rootVisibility * fractalVisibility * levelVisibility * Math.pow(.78, level - 1);
        const sway = Math.sin(time * (.42 + level * .08) * motionScale + rootIndex * 1.3 + side) * .10 * breathing;
        const end = pointFrom(start, length, angle + sway);
        const perpendicular = angle + Math.PI / 2;
        const control = {
          x: lerp(start.x, end.x, .48) + Math.cos(perpendicular) * length * .18 * side,
          y: lerp(start.y, end.y, .48) + Math.sin(perpendicular) * length * .18 * side,
        };
        const color = paletteColor(palette, rootIndex + level + (side > 0 ? 1 : 2), time, constructTuning);
        const serial = branchSerial++;
        const branchPath = {
          id: `fractal-${rootIndex}-${serial}`,
          color,
          alpha,
          direction: side,
          sample(t) { return quadratic(start, control, end, t); },
          depth: () => depth,
          frontThreshold: .53,
        };
        if (level === 1) fractalPaths.push(branchPath);
        if (alpha > .008) {
          fractalSegments += 1;
          const branchWidth = Math.max(.42, layout.scale * .0052 * Math.pow(.66, level - 1));
          drawPolyline(fractals, samplePath(branchPath, 12), {
            color,
            width: branchWidth * 3.4,
            alpha: alpha * .055,
            cap: 'round',
          });
          drawPolyline(fractals, samplePath(branchPath, 12), {
            color,
            width: branchWidth,
            alpha: alpha * (.40 + profile.creativity * .24),
            cap: 'round',
          });
          const tip = Math.max(.7, layout.scale * .009 * Math.pow(.68, level - 1));
          const left = pointFrom(end, tip, angle + 2.45);
          const right = pointFrom(end, tip, angle - 2.45);
          fractals.circle(end.x, end.y, tip * .72).fill({ color, alpha: alpha * .13 });
          fractals.poly([end.x, end.y, left.x, left.y, right.x, right.y]).fill({ color, alpha: alpha * .60 });
        }
        if (level >= MAX_FRACTAL_DEPTH) return;
        const split = .38 / (1 + level * .16);
        const nextLength = length * .58;
        drawBranch(end, angle - split, nextLength, level + 1, rootIndex, -1, rootVisibility, clamp(depth - .025));
        drawBranch(end, angle + split, nextLength, level + 1, rootIndex, 1, rootVisibility, clamp(depth + .025));
      };

      for (let rootIndex = 0; rootIndex < 8; rootIndex++) {
        const slot = rootIndex * 4;
        const fragment = fragments[slot];
        const origin = mainPaths[slot].sample(.53);
        const rootLength = layout.scale * (.17 + profile.curiosity * .035) * spread;
        drawBranch(origin, fragment.angle - .52, rootLength, 1, rootIndex, -1, fragment.visibility, fragment.depth);
        drawBranch(origin, fragment.angle + .52, rootLength, 1, rootIndex, 1, fragment.visibility, fragment.depth);
      }

      for (const fragment of [...fragments].sort((a, b) => a.depth - b.depth)) {
        if (fragment.visibility < .006) continue;
        const alpha = fragment.visibility;
        const faceColor = mixColor(0x03050a, fragment.color, .24 + fragment.depth * .20 + fragment.proximity * .10);
        shardFaces.poly(flatPoints(fragment.points)).fill({ color: faceColor, alpha: alpha * (.46 + fragment.depth * .26) });
        shardFaces.poly(flatPoints(fragment.points)).stroke({ color: fragment.color, width: .55 + fragment.depth * 1.0, alpha: alpha * (.27 + fragment.depth * .35), join: 'round' });
        const inner = fragment.points[0];
        const far = fragment.points[2];
        highlights.moveTo(inner.x, inner.y).lineTo(far.x, far.y).stroke({ color: fragment.color, width: .45, alpha: alpha * .20 });
        highlights.circle(fragment.x, fragment.y, 1.1 + fragment.proximity * 2.4).fill({ color: fragment.color, alpha: alpha * (.36 + fragment.proximity * .42) });
        if (fragment.proximity > .02) {
          highlights.poly(flatPoints(fragment.points)).stroke({ color: 0xffffff, width: 1 + fragment.proximity * 1.8, alpha: alpha * fragment.proximity * .34 });
        }
        const arcRadius = Math.hypot(fragment.x - center.x, fragment.y - center.y);
        const arcWidth = TAU / MAX_SHARDS * fragment.width * .72;
        aura.moveTo(center.x + Math.cos(fragment.angle - arcWidth) * arcRadius, center.y + Math.sin(fragment.angle - arcWidth) * arcRadius)
          .arc(center.x, center.y, arcRadius, fragment.angle - arcWidth, fragment.angle + arcWidth)
          .stroke({ color: fragment.color, width: .45, alpha: alpha * .14 });
      }

      const nodeSlots = [0, 4, 8, 12, 16, 20, 24, 28];
      const nodes = nodeSlots.map((slot, index) => {
        const fragment = fragments[slot];
        return {
          id: `corona-capability-${index}`,
          x: fragment.x,
          y: fragment.y,
          radius: layout.scale * (.035 + fragment.proximity * .011),
          icon: ICONS[index],
          color: fragment.color,
          alpha: fragment.visibility,
          kind: index % 2 ? 'diamond' : 'knot',
          phase: index * .73,
          iconScale: .76,
        };
      });

      return {
        paths: [...mainPaths, ...chordPaths, ...fractalPaths],
        nodes,
        prompt: {
          style: 'lens',
          radius: .165 + Math.sin(time * .6) * .004 * breathing,
          accent: primary,
          secondary: tertiary,
        },
        debug: {
          palette: palette.id,
          activeShards: Number(shardVisibility.reduce((sum, visibility) => sum + visibility, 0).toFixed(2)),
          targetShards: density,
          stablePathCount: mainPaths.length + chordPaths.length + fractalPaths.length,
          fractalEnabled,
          fractalDepth: activeDepth,
          fractalSegments,
          maxPointerInfluence: Number(maxPointerInfluence.toFixed(3)),
          pointerPresence: Number(pointer.presence.toFixed(3)),
          pointerPosition: { x: Number(pointer.x.toFixed(3)), y: Number(pointer.y.toFixed(3)) },
          pointerRadius: Number(pointerRadius.toFixed(2)),
          cursorField: cursorEnabled,
          symmetryLock,
          rotationSpeed,
          breathing,
          colors: [primary, secondary, tertiary],
        },
      };
    },
  };
}

export const fractalCoronaConfig = {
  id: 'fractal-corona',
  name: 'Fractal Corona',
  index: '04',
  accent: 0x68f4ff,
  secondary: 0xffd166,
  ambientColor: 0x3478ff,
  accentCss: '#68f4ff',
  seed: 4421,
  particles: 118,
  customControls: {
    defaultPalette: 'reactor',
    palettes: CORONA_PALETTES,
    groups: [
      {
        id: 'geometry',
        controls: [
          { id: 'breathing', type: 'range', label: 'Breathing amplitude', min: 0, max: 2, step: .05, value: 1, scale: ['still', 'native', 'deep'] },
          { id: 'rotationSpeed', type: 'range', label: 'Orbital rotation', min: -2, max: 2, step: .05, value: .65, format: 'signed', scale: ['reverse', 'still', 'forward'] },
          { id: 'fragmentFlutter', type: 'range', label: 'Fragment flutter', min: 0, max: 2, step: .05, value: 1, scale: ['locked', 'native', 'volatile'] },
          { id: 'shardDensity', type: 'range', label: 'Shard density', min: 8, max: 32, step: 1, value: 22, format: 'integer', scale: ['8 sparse', '20', '32 dense'] },
          { id: 'pointerReach', type: 'range', label: 'Cursor field reach', min: .25, max: 2, step: .05, value: 1, scale: ['local', 'native', 'wide'] },
          { id: 'cursorGravity', type: 'range', label: 'Cursor gravity', min: -1, max: 1, step: .05, value: .35, format: 'signed', scale: ['repel', 'neutral', 'attract'] },
          { id: 'fractalDepth', type: 'range', label: 'Fractal depth', min: 1, max: 4, step: 1, value: 3, format: 'integer', scale: ['1 generation', '2', '4 generations'] },
          { id: 'cursorField', type: 'toggle', label: 'Proximity cursor field', description: 'Nearby shards bend and react by distance.', value: true },
          { id: 'fractal', type: 'toggle', label: 'Recursive fractal mode', description: 'Spokes divide into self-similar signal ferns.', value: true },
          { id: 'symmetryLock', type: 'toggle', label: 'Oppositional symmetry', description: 'Mirror the fracture seeds across the core.', value: false },
        ],
      },
      {
        id: 'chromatic',
        palettes: true,
        controls: [
          { id: 'hueOffset', type: 'range', label: 'Hue offset', min: -180, max: 180, step: 1, value: 0, format: 'degree', scale: ['-180°', 'native', '+180°'] },
          { id: 'saturation', type: 'range', label: 'Saturation', min: 0, max: 150, step: 1, value: 100, format: 'percent', scale: ['mono', '100%', 'hyper'] },
          { id: 'colorRate', type: 'range', label: 'Color drift rate', min: 0, max: 3, step: .05, value: .65, format: 'rate', scale: ['frozen', '1.5×', '3×'] },
          { id: 'chromaticOrbit', type: 'toggle', label: 'Chromatic orbit', description: 'Rotate fragment and particle hue through time.', value: true },
        ],
      },
    ],
  },
};
