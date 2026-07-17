import {
  TAU,
  clamp,
  cubic,
  drawPolyline,
  lerp,
  mulberry32,
  quadratic,
  samplePath,
} from '../core.js';

const ROOT_COUNT = 10;
const WIRE_COUNT = 20;
const MAX_DEPTH = 5;
const ICONS = ['neurology', 'route', 'memory', 'bolt', 'hub'];

export const RIVEN_PALETTES = [
  {
    id: 'orchid', label: 'Ghost orchid', accentCss: '#8ff8ff', ambientColor: 0x593dba,
    swatches: ['#8ff8ff', '#aa78ff', '#f08bff'],
    hsl: [[184, 100, 78], [262, 100, 74], [301, 100, 77], [208, 100, 68]],
  },
  {
    id: 'verdigris', label: 'Verdigris nerve', accentCss: '#7dffd5', ambientColor: 0x127f75,
    swatches: ['#7dffd5', '#24d6bd', '#8dbbff'],
    hsl: [[160, 100, 75], [171, 71, 49], [218, 100, 78], [119, 100, 76]],
  },
  {
    id: 'solar-rift', label: 'Solar rift', accentCss: '#ffd76a', ambientColor: 0xc44e32,
    swatches: ['#ffe778', '#ff925b', '#ff5f9b'],
    hsl: [[51, 100, 73], [22, 100, 68], [338, 100, 69], [9, 100, 78]],
  },
  {
    id: 'cold-flame', label: 'Cold flame', accentCss: '#a8c8ff', ambientColor: 0x294fc7,
    swatches: ['#d9e6ff', '#6696ff', '#795cff'],
    hsl: [[218, 100, 88], [220, 100, 70], [249, 100, 68], [187, 100, 76]],
  },
];

const PALETTE_MAP = new Map(RIVEN_PALETTES.map(palette => [palette.id, palette]));
const random = mulberry32(6067);
const ROOTS = Array.from({ length: ROOT_COUNT }, (_, index) => ({
  angleJitter: (random() - .5) * .34,
  anchor: lerp(.72, 1.32, random()),
  length: lerp(.72, 1.34, random()),
  curl: (random() - .5) * .9,
  phase: random() * TAU,
  colorIndex: index + Math.floor(random() * 4),
  breakout: index === 1 || index === 4 || index === 8 ? lerp(.65, 1, random()) : random() * .22,
}));
const WIRES = Array.from({ length: WIRE_COUNT }, (_, index) => ({
  rootIndex: (index * 3 + Math.floor(index / 4)) % ROOT_COUNT,
  angleJitter: (random() - .5) * .28,
  fan: (random() - .5) * 1.35,
  bend: (random() - .5) * 1.3,
  reach: lerp(.66, 1.06, random()),
  depth: lerp(.06, .96, random()),
  terminal: Math.floor(random() * 3),
  colorIndex: index + Math.floor(random() * 5),
  escape: index % 5 === 1 || index % 7 === 0 ? lerp(.35, .76, random()) : random() * .12,
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
  const rate = tuning.colorRate ?? .42;
  const shift = time * rate * 14 + Math.sin(time * rate + index * 1.21) * rate * 7;
  return hslColor(
    base[0] + (tuning.hueOffset ?? 0) + shift,
    base[1] * ((tuning.saturation ?? 100) / 100),
    base[2],
  );
}

function pointFrom(origin, radius, angle, xScale = 1, yScale = 1) {
  return {
    x: origin.x + Math.cos(angle) * radius * xScale,
    y: origin.y + Math.sin(angle) * radius * yScale,
  };
}

export function createRivenConduit(PIXI) {
  const container = new PIXI.Container();
  const membrane = new PIXI.Graphics();
  const wiring = new PIXI.Graphics();
  const fractalGlow = new PIXI.Graphics();
  const fractalLines = new PIXI.Graphics();
  const terminals = new PIXI.Graphics();
  for (const graphic of [membrane, wiring, fractalGlow, fractalLines, terminals]) graphic.blendMode = 'add';
  container.addChild(membrane, wiring, fractalGlow, fractalLines, terminals);

  const depthVisibility = [1, 1, 1, 1, 1];
  let smoothedVariation = 1.45;
  let smoothedBreak = 1.35;
  let smoothedCrossLinks = 1;

  return {
    container,
    render(ctx) {
      const {
        layout, time, dt, pointer, profile, effect, effectBoost, reducedMotion,
        tuning: fieldTuning, constructTuning = {},
      } = ctx;
      const palette = PALETTE_MAP.get(constructTuning.palette) || RIVEN_PALETTES[0];
      const targetVariation = constructTuning.fractalVariation ?? 1.45;
      const targetBreak = constructTuning.silhouetteBreak ?? 1.35;
      smoothedVariation = lerp(smoothedVariation, targetVariation, 1 - Math.exp(-dt * 5));
      smoothedBreak = lerp(smoothedBreak, targetBreak, 1 - Math.exp(-dt * 4.5));
      const variation = smoothedVariation;
      const breakAmount = smoothedBreak;
      const requestedDepth = Math.round(constructTuning.fractalDepth ?? 5);
      const activeDepth = reducedMotion ? Math.min(3, requestedDepth) : requestedDepth;
      const nucleusScale = constructTuning.nucleusScale ?? 1;
      const lobeReach = constructTuning.lobeReach ?? 1.15;
      const branchPulse = constructTuning.branchPulse ?? 1;
      const rotationSpeed = constructTuning.fractalRotation ?? .14;
      const recursiveMotion = constructTuning.recursiveMotion !== false;
      const crossLinks = constructTuning.crossLinks !== false;
      const wireReach = constructTuning.wireReach ?? .92;
      const wireFan = constructTuning.wireFan ?? 1.15;
      const wireCurvature = constructTuning.wireCurvature ?? 1.2;
      const tendrilScatter = constructTuning.tendrilScatter ?? 1.2;
      const escapeBias = constructTuning.escapeBias ?? 1;
      const terminalBranches = constructTuning.terminalBranches !== false;
      const cursorWiring = constructTuning.cursorWiring !== false;
      const cursorTension = constructTuning.cursorTension ?? .65;
      const motionScale = reducedMotion ? .16 : 1;
      const spreadValue = fieldTuning?.spread ?? 1;
      const spreadDelta = spreadValue - 1;
      const spreadMultiplier = spreadDelta >= 0
        ? 1 + Math.pow(spreadDelta, 1.16) * .82
        : 1 + spreadDelta * .44;
      const fanBoost = 1 + Math.max(0, spreadDelta) * 1.4;
      const center = { x: layout.cx, y: layout.cy };
      const rotation = time * .075 * rotationSpeed * motionScale + pointer.x * .022;
      const pulse = 1 + Math.sin(time * (.48 + profile.tempo * .17)) * .038 * branchPulse * motionScale;
      const splitAngle = .16 + variation * .30;
      const lengthDecay = .46 + variation * .061;
      const primary = paletteColor(palette, 0, time, constructTuning);
      const secondary = paletteColor(palette, 1, time, constructTuning);
      const tertiary = paletteColor(palette, 2, time, constructTuning);

      for (let level = 0; level < MAX_DEPTH; level++) {
        const target = level < activeDepth ? 1 : 0;
        depthVisibility[level] = lerp(depthVisibility[level], target, 1 - Math.exp(-dt * (target ? 8 : 24)));
      }
      smoothedCrossLinks = lerp(smoothedCrossLinks, crossLinks ? 1 : 0, 1 - Math.exp(-dt * 5));

      membrane.clear();
      wiring.clear();
      fractalGlow.clear();
      fractalLines.clear();
      terminals.clear();

      const boundaryPoint = angle => {
        const wave = Math.sin(angle * 3 + .7) * .115
          + Math.sin(angle * 5 - 1.2) * .072
          + Math.sin(angle * 2 + 2.1) * .055;
        const radius = layout.scale * .34 * nucleusScale * pulse * (1 + wave * breakAmount);
        return pointFrom(center, radius, angle + rotation * .42, 1.05 + breakAmount * .035, .91 - breakAmount * .018);
      };
      const boundaryPoints = Array.from({ length: 64 }, (_, index) => boundaryPoint(index / 64 * TAU));
      membrane.poly(boundaryPoints.flatMap(point => [point.x, point.y]))
        .fill({ color: primary, alpha: .006 + profile.energy * .005 });
      for (let section = 0; section < 12; section++) {
        if (section === 2 || section === 7 || (section === 10 && breakAmount > 1)) continue;
        const start = section / 12 * TAU;
        const points = Array.from({ length: 7 }, (_, index) => boundaryPoint(start + index / 6 * TAU / 12 * .62));
        drawPolyline(membrane, points, {
          color: paletteColor(palette, section, time, constructTuning),
          width: .55 + effectBoost * .8,
          alpha: .07 + profile.coherence * .07,
          cap: 'round',
        });
      }

      const rootAnchors = [];
      const leafTips = [];
      const leafRadii = [];
      let fractalSegments = 0;
      let maxFractalRadius = 0;
      let minFractalRadius = Infinity;
      const renderBranch = (start, angle, length, level, rootIndex, serial) => {
        const levelAlpha = depthVisibility[level - 1] * Math.pow(.80, level - 1);
        const noise = hashNoise(rootIndex * 101 + serial * 23 + level * 11);
        const animatedCurl = recursiveMotion
          ? Math.sin(time * (.27 + level * .051) * motionScale + ROOTS[rootIndex].phase + serial * .7) * .064 * branchPulse
          : 0;
        const direction = angle + noise * variation * .19 + animatedCurl;
        const end = pointFrom(start, length, direction);
        const radius = Math.hypot(end.x - center.x, end.y - center.y);
        maxFractalRadius = Math.max(maxFractalRadius, radius);
        minFractalRadius = Math.min(minFractalRadius, radius);
        const control = pointFrom(
          { x: lerp(start.x, end.x, .48), y: lerp(start.y, end.y, .48) },
          length * (.10 + variation * .055),
          direction + Math.PI / 2 * Math.sign(noise || 1),
        );
        const color = paletteColor(palette, ROOTS[rootIndex].colorIndex + level + serial, time, constructTuning);
        const branchPath = { sample(t) { return quadratic(start, control, end, t); } };
        const points = samplePath(branchPath, 9);
        const branchWidth = Math.max(.32, layout.scale * .0065 * Math.pow(.63, level - 1));
        drawPolyline(fractalGlow, points, { color, width: branchWidth * 4.2, alpha: levelAlpha * .052, cap: 'round' });
        drawPolyline(fractalLines, points, { color, width: branchWidth, alpha: levelAlpha * (.40 + profile.energy * .21), cap: 'round' });
        fractalSegments += levelAlpha > .01 ? 1 : 0;

        if (level >= MAX_DEPTH) {
          leafTips.push({ ...end, color, alpha: levelAlpha, rootIndex });
          leafRadii.push(radius);
          return;
        }
        const root = ROOTS[rootIndex];
        const nextLength = length * lengthDecay * (1 + root.breakout * breakAmount * .028);
        const rootCurl = root.curl * variation * (.11 + root.breakout * .055);
        const unevenSplit = splitAngle * (1 + noise * breakAmount * .09);
        renderBranch(end, direction - unevenSplit + rootCurl, nextLength, level + 1, rootIndex, serial * 2 + 1);
        renderBranch(end, direction + unevenSplit + rootCurl * .65, nextLength * (1 + noise * .035 * breakAmount), level + 1, rootIndex, serial * 2 + 2);
      };

      for (let rootIndex = 0; rootIndex < ROOT_COUNT; rootIndex++) {
        const root = ROOTS[rootIndex];
        const baseAngle = rotation + rootIndex / ROOT_COUNT * TAU + root.angleJitter * breakAmount;
        const anchorRadius = layout.scale * (.125 + root.anchor * .052 * breakAmount) * nucleusScale;
        const anchor = pointFrom(center, anchorRadius, baseAngle, 1.04, .92);
        rootAnchors.push(anchor);
        const breakoutScale = 1 + root.breakout * breakAmount * .58;
        const length = layout.scale * .096 * nucleusScale * lobeReach * root.length * pulse * breakoutScale;
        renderBranch(anchor, baseAngle + root.curl * .12 * breakAmount, length, 1, rootIndex, 1);
        fractalGlow.circle(anchor.x, anchor.y, 3.2 + root.breakout * 2).fill({ color: paletteColor(palette, root.colorIndex, time, constructTuning), alpha: .07 });
      }

      if (leafTips.length > 2 && smoothedCrossLinks > .01) {
        const ordered = [...leafTips].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
        const step = Math.max(2, Math.round(6 - variation));
        for (let index = 0; index < ordered.length; index += step) {
          const a = ordered[index];
          const hop = 2 + ((index * 5 + a.rootIndex) % 9);
          const b = ordered[(index + hop) % ordered.length];
          const distance = Math.hypot(b.x - a.x, b.y - a.y);
          if (distance > layout.scale * .36) continue;
          fractalLines.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
            color: a.color,
            width: .42,
            alpha: Math.min(a.alpha, b.alpha) * smoothedCrossLinks * .13,
          });
        }
      }
      for (const tip of leafTips) {
        fractalGlow.circle(tip.x, tip.y, 2.8).fill({ color: tip.color, alpha: tip.alpha * .09 });
        fractalLines.circle(tip.x, tip.y, .72).fill({ color: tip.color, alpha: tip.alpha * .68 });
      }

      const mouse = {
        x: layout.width * (pointer.x * .5 + .5),
        y: layout.height * (pointer.y * .5 + .5),
      };
      let maxWireReach = 0;
      let minWireReach = Infinity;
      let maxCursorInfluence = 0;
      const paths = WIRES.map((wire, index) => {
        const root = ROOTS[wire.rootIndex];
        const baseAngle = rotation * .28 + wire.rootIndex / ROOT_COUNT * TAU + wire.angleJitter + root.angleJitter * .45;
        const fanAngle = baseAngle
          + wire.fan * .56 * wireFan * fanBoost * tendrilScatter
          + Math.sin(time * .17 * motionScale + index * 1.7) * .018;
        const escapeScale = 1 + wire.escape * escapeBias * (.28 + Math.max(0, spreadDelta) * .34);
        const endRadius = layout.scale * wire.reach * wireReach * spreadMultiplier * escapeScale;
        let end = pointFrom(center, endRadius, fanAngle, 1.02, .96);
        if (cursorWiring && pointer.presence > .001) {
          const dx = mouse.x - end.x;
          const dy = mouse.y - end.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const influence = Math.pow(1 - clamp(distance / (layout.scale * .82)), 2) * pointer.presence;
          end = {
            x: end.x + dx / distance * layout.scale * .16 * cursorTension * influence,
            y: end.y + dy / distance * layout.scale * .16 * cursorTension * influence,
          };
          maxCursorInfluence = Math.max(maxCursorInfluence, influence);
        }
        const actualReach = Math.hypot(end.x - center.x, end.y - center.y);
        maxWireReach = Math.max(maxWireReach, actualReach);
        minWireReach = Math.min(minWireReach, actualReach);
        const through = rootAnchors[wire.rootIndex];
        const innerControl = pointFrom(center, Math.hypot(through.x - center.x) * .34, baseAngle - wire.bend * .13);
        const exitControl = pointFrom(through, layout.scale * (.16 + root.breakout * .08), baseAngle + wire.bend * .48 * wireCurvature);
        const outerControl = pointFrom(center, endRadius * .70, fanAngle - wire.bend * .52 * wireCurvature * (1 + Math.max(0, spreadDelta) * .65));
        const color = paletteColor(palette, wire.colorIndex, time, constructTuning);
        const path = {
          id: `riven-tendril-${index}`,
          color,
          centralRelay: true,
          frontThreshold: .50,
          sample(t) {
            if (t <= .36) return quadratic(center, innerControl, through, t / .36);
            return cubic(through, exitControl, outerControl, end, (t - .36) / .64);
          },
          depth(t) { return lerp(.43, wire.depth, t); },
        };
        const points = samplePath(path, 38);
        drawPolyline(wiring, points, { color: 0x12192c, width: layout.scale * (.011 + profile.energy * .0045), alpha: .17 + profile.coherence * .06, cap: 'round' });
        drawPolyline(wiring, points, { color, width: .72 + profile.energy * .82, alpha: .24 + profile.energy * .20, cap: 'round' });

        const tangent = Math.atan2(end.y - outerControl.y, end.x - outerControl.x);
        const terminalSize = layout.scale * (.022 + wire.escape * .006);
        terminals.circle(end.x, end.y, 1.7 + effect('dispatch') * 3.2).fill({ color, alpha: .63 + effect('dispatch') * .25 });
        if (terminalBranches) {
          const back = pointFrom(end, terminalSize * .95, tangent + Math.PI);
          const side = tangent + Math.PI / 2;
          const left = pointFrom(back, terminalSize * (.56 + wire.terminal * .16), side);
          const right = pointFrom(back, terminalSize * (.56 + wire.terminal * .16), side + Math.PI);
          terminals.moveTo(left.x, left.y).lineTo(end.x, end.y).lineTo(right.x, right.y)
            .stroke({ color, width: .78 + wire.terminal * .22, alpha: .38 + profile.outward * .18, cap: 'round' });
        }
        return path;
      });

      const nodes = [1, 5, 9, 13, 17].map((wireIndex, index) => {
        const end = paths[wireIndex].sample(1);
        return {
          id: `riven-terminal-${index}`,
          x: end.x,
          y: end.y,
          radius: layout.scale * .028,
          icon: ICONS[index],
          color: paths[wireIndex].color,
          kind: 'satellite',
          phase: index * .91,
          iconScale: .68,
        };
      });

      const meanLeafRadius = leafRadii.length
        ? leafRadii.reduce((sum, radius) => sum + radius, 0) / leafRadii.length
        : 0;
      const radialDeviation = leafRadii.length
        ? Math.sqrt(leafRadii.reduce((sum, radius) => sum + (radius - meanLeafRadius) ** 2, 0) / leafRadii.length)
        : 0;

      return {
        paths,
        nodes,
        flow: {
          mode: 'one-way',
          speedScale: 4.7,
          respawnRate: constructTuning.signalCadence ?? 1,
        },
        prompt: { style: 'orb', radius: .148, accent: primary, secondary: tertiary },
        debug: {
          palette: palette.id,
          fractalVariation: Number(variation.toFixed(3)),
          silhouetteBreak: Number(breakAmount.toFixed(3)),
          fractalDepth: activeDepth,
          fractalSegments,
          splitAngle: Number(splitAngle.toFixed(3)),
          lengthDecay: Number(lengthDecay.toFixed(3)),
          maxFractalRadius: Number(maxFractalRadius.toFixed(2)),
          minFractalRadius: Number((Number.isFinite(minFractalRadius) ? minFractalRadius : 0).toFixed(2)),
          radialDeviation: Number(radialDeviation.toFixed(2)),
          leafTips: leafTips.length,
          wireCount: paths.length,
          spreadValue,
          spreadMultiplier: Number(spreadMultiplier.toFixed(3)),
          maxWireReach: Number(maxWireReach.toFixed(2)),
          minWireReach: Number((Number.isFinite(minWireReach) ? minWireReach : 0).toFixed(2)),
          maxCursorInfluence: Number(maxCursorInfluence.toFixed(3)),
          flowMode: 'one-way',
        },
      };
    },
  };
}

export const rivenConduitConfig = {
  id: 'riven-conduit',
  name: 'Riven Conduit',
  index: '06',
  accent: 0x8ff8ff,
  secondary: 0xaa78ff,
  ambientColor: 0x593dba,
  accentCss: '#8ff8ff',
  seed: 6067,
  particles: 132,
  flowMode: 'one-way',
  flowSpeedScale: 4.7,
  customControls: {
    defaultPalette: 'orchid',
    palettes: RIVEN_PALETTES,
    groups: [
      {
        id: 'cortex',
        controls: [
          { id: 'silhouetteBreak', type: 'range', label: 'Silhouette fracture', min: 0, max: 2.5, step: .05, value: 1.35, scale: ['soft orbit', 'riven', 'escaped'] },
          { id: 'fractalVariation', type: 'range', label: 'Fractal variation', min: 0, max: 2.5, step: .05, value: 1.45, scale: ['crystalline', 'wild', 'feral'] },
          { id: 'fractalDepth', type: 'range', label: 'Fractal depth', min: 1, max: 5, step: 1, value: 5, format: 'integer', scale: ['1 generation', '3', '5 generations'] },
          { id: 'nucleusScale', type: 'range', label: 'Cortex footprint', min: .6, max: 1.45, step: .05, value: 1, scale: ['compressed', 'native', 'expanded'] },
          { id: 'lobeReach', type: 'range', label: 'Fractal lobe reach', min: .55, max: 2.1, step: .05, value: 1.15, scale: ['contained', 'native', 'breakout'] },
          { id: 'fractalRotation', type: 'range', label: 'Cortex rotation', min: -1.5, max: 1.5, step: .05, value: .14, format: 'signed', scale: ['reverse', 'still', 'forward'] },
          { id: 'branchPulse', type: 'range', label: 'Branch breathing', min: 0, max: 2.5, step: .05, value: 1, scale: ['still', 'native', 'deep'] },
          { id: 'crossLinks', type: 'toggle', label: 'Neural cross-links', description: 'Stitch nearby tips across the fractured cortex.', value: true },
          { id: 'recursiveMotion', type: 'toggle', label: 'Living recursion', description: 'Let each uneven lobe curl independently.', value: true },
        ],
      },
      {
        id: 'tendrils',
        controls: [
          { id: 'wireReach', type: 'range', label: 'Tendril reach', min: .45, max: 2.25, step: .05, value: .92, scale: ['near field', 'native', 'beyond frame'] },
          { id: 'wireFan', type: 'range', label: 'Outward fan', min: .2, max: 2.8, step: .05, value: 1.15, scale: ['bundled', 'native', 'exploded'] },
          { id: 'tendrilScatter', type: 'range', label: 'Tendril scatter', min: .35, max: 3, step: .05, value: 1.2, scale: ['aligned', 'riven', 'chaotic'] },
          { id: 'wireCurvature', type: 'range', label: 'Wire curvature', min: 0, max: 3, step: .05, value: 1.2, scale: ['direct', 'native', 'coiled'] },
          { id: 'escapeBias', type: 'range', label: 'Breakout bias', min: 0, max: 2.5, step: .05, value: 1, scale: ['equal reach', 'seeded', 'runaway'] },
          { id: 'signalCadence', type: 'range', label: 'Signal birth cadence', min: .25, max: 2.5, step: .05, value: 1, format: 'rate', scale: ['sparse', 'native', 'rapid'] },
          { id: 'cursorTension', type: 'range', label: 'Cursor wire tension', min: 0, max: 2, step: .05, value: .65, scale: ['off', 'elastic', 'magnetic'] },
          { id: 'terminalBranches', type: 'toggle', label: 'Terminal forks', description: 'Split the escaped ends into circuit contacts.', value: true },
          { id: 'cursorWiring', type: 'toggle', label: 'Proximity wiring', description: 'Nearby tendrils lean toward the cursor.', value: true },
        ],
      },
      {
        id: 'chromatic',
        palettes: true,
        controls: [
          { id: 'hueOffset', type: 'range', label: 'Hue offset', min: -180, max: 180, step: 1, value: 0, format: 'degree', scale: ['-180°', 'native', '+180°'] },
          { id: 'saturation', type: 'range', label: 'Saturation', min: 0, max: 150, step: 1, value: 100, format: 'percent', scale: ['mono', '100%', 'hyper'] },
          { id: 'colorRate', type: 'range', label: 'Color drift rate', min: 0, max: 2, step: .05, value: .42, format: 'rate', scale: ['frozen', '1×', '2×'] },
        ],
      },
    ],
  },
};
