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

const MAX_DEPTH = 4;
const ROOT_COUNT = 8;
const SPARK_CAPACITY = 96;
const ICONS = ['neurology', 'memory', 'route', 'hub', 'bolt', 'input', 'output', 'dataset', 'psychology', 'terminal', 'api', 'conversion_path', 'shield', 'language'];

export const FRAME_PALETTES = [
  {
    id: 'signal-glass', label: 'Signal glass', accentCss: '#8df7ff', ambientColor: 0x3155a8,
    swatches: ['#8df7ff', '#5f8cff', '#d39cff'],
    hsl: [[184, 100, 78], [224, 100, 68], [277, 100, 80], [194, 100, 94]],
  },
  {
    id: 'synapse', label: 'Synapse bloom', accentCss: '#f39cff', ambientColor: 0x7a328c,
    swatches: ['#ff9de6', '#a879ff', '#65d9ff'],
    hsl: [[315, 100, 81], [263, 100, 74], [194, 100, 70], [344, 100, 75]],
  },
  {
    id: 'terminal-green', label: 'Terminal green', accentCss: '#82ffc3', ambientColor: 0x16765c,
    swatches: ['#9affcb', '#29d9a2', '#bcff73'],
    hsl: [[149, 100, 80], [161, 72, 51], [87, 100, 73], [190, 100, 76]],
  },
  {
    id: 'amber-data', label: 'Amber data', accentCss: '#ffd76e', ambientColor: 0xb05b2e,
    swatches: ['#ffe17e', '#ff9c58', '#ff6f91'],
    hsl: [[48, 100, 75], [25, 100, 67], [344, 100, 72], [7, 100, 79]],
  },
];

const PALETTE_MAP = new Map(FRAME_PALETTES.map(palette => [palette.id, palette]));
const random = mulberry32(7079);
const ROOTS = Array.from({ length: ROOT_COUNT }, (_, index) => ({
  angleJitter: (random() - .5) * .26,
  length: lerp(.78, 1.28, random()),
  curl: (random() - .5) * .82,
  phase: random() * TAU,
  colorIndex: index + Math.floor(random() * 4),
}));

const TERMINALS = [
  ...[-.78, -.28, .28, .78].map((slot, index) => ({ edge: 'left', slot, index })),
  ...[-.78, -.28, .28, .78].map((slot, index) => ({ edge: 'right', slot, index: index + 4 })),
  ...[-.62, 0, .62].map((slot, index) => ({ edge: 'top', slot, index: index + 8 })),
  ...[-.62, 0, .62].map((slot, index) => ({ edge: 'bottom', slot, index: index + 11 })),
].map((terminal, index) => ({
  ...terminal,
  id: `frame-edge-${index}`,
  jitter: (random() - .5),
  bend: (random() - .5) * 1.25,
  depth: lerp(.08, .94, random()),
  colorIndex: index + Math.floor(random() * 5),
  icon: ICONS[index],
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
  const rate = tuning.colorRate ?? .34;
  const shift = time * rate * 13 + Math.sin(time * rate + index * 1.19) * rate * 6;
  return hslColor(
    base[0] + (tuning.hueOffset ?? 0) + shift,
    base[1] * ((tuning.saturation ?? 100) / 100),
    base[2],
  );
}

function pointFrom(origin, radius, angle) {
  return { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
}

function mixPoint(a, b, amount) {
  return { x: lerp(a.x, b.x, amount), y: lerp(a.y, b.y, amount) };
}

function edgeDirection(edge) {
  if (edge === 'left') return { x: -1, y: 0 };
  if (edge === 'right') return { x: 1, y: 0 };
  if (edge === 'top') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

export function createNeuralFrame(PIXI) {
  const container = new PIXI.Container();
  const perimeter = new PIXI.Graphics();
  const wiring = new PIXI.Graphics();
  const fractalGlow = new PIXI.Graphics();
  const fractalLines = new PIXI.Graphics();
  const terminalMarks = new PIXI.Graphics();
  const sparkTrails = new PIXI.Graphics();
  const sparkDots = new PIXI.Graphics();
  for (const graphic of [perimeter, wiring, fractalGlow, fractalLines, terminalMarks, sparkTrails, sparkDots]) graphic.blendMode = 'add';
  container.addChild(perimeter, wiring, fractalGlow, fractalLines, terminalMarks, sparkTrails, sparkDots);

  const depthVisibility = [1, 1, 1, 1];
  const mode = {
    aspect: 1,
    side: 1,
    topBottom: 1,
    perimeter: 1,
    relay: 1,
    mirror: 0,
    mobile: 1,
  };
  let smoothedFracture = 1.15;
  let sparkAccumulator = 0;
  let sparkSpawnCount = 0;
  const sparkRandom = mulberry32(7081);
  const sparks = Array.from({ length: SPARK_CAPACITY }, (_, id) => ({
    id,
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    color: 0xffffff,
    history: [],
  }));
  let sparkCursor = 0;

  return {
    container,
    render(ctx) {
      const {
        layout, time, dt, pointer, profile, effect, effectBoost, reducedMotion,
        tuning: fieldTuning, constructTuning = {},
      } = ctx;
      const palette = PALETTE_MAP.get(constructTuning.palette) || FRAME_PALETTES[0];
      const smoothing = 1 - Math.exp(-dt * (constructTuning.layoutSpring ?? 6));
      const modeTargets = {
        aspect: constructTuning.aspectFill !== false ? 1 : 0,
        side: constructTuning.sideRails !== false ? 1 : 0,
        topBottom: constructTuning.topBottomRails !== false ? 1 : 0,
        perimeter: constructTuning.perimeterLinks !== false ? 1 : 0,
        relay: constructTuning.relayLanes !== false ? 1 : 0,
        mirror: constructTuning.mirrorFrame === true ? 1 : 0,
        mobile: constructTuning.mobileReflow !== false ? 1 : 0,
      };
      for (const key of Object.keys(mode)) mode[key] = lerp(mode[key], modeTargets[key], smoothing);

      const targetFracture = constructTuning.coreFracture ?? 1.15;
      smoothedFracture = lerp(smoothedFracture, targetFracture, 1 - Math.exp(-dt * 4.5));
      const fracture = smoothedFracture;
      const constructSpread = fieldTuning?.spread ?? 1;
      const requestedDepth = Math.round(constructTuning.fractalDepth ?? 4);
      const activeDepth = reducedMotion ? Math.min(3, requestedDepth) : requestedDepth;
      const coreScale = constructTuning.coreScale ?? 1;
      const modelScale = layout.height * .37 * coreScale;
      const branchPulse = constructTuning.branchPulse ?? 1;
      const motionScale = reducedMotion ? .15 : 1;
      const rotation = time * .018 * (constructTuning.coreRotation ?? .35) * motionScale + pointer.x * .018;
      const pulse = 1 + Math.sin(time * (.48 + profile.tempo * .16)) * .035 * branchPulse * motionScale;
      const edgePadding = constructTuning.edgePadding ?? .045;
      const horizontalCoverage = constructTuning.horizontalCoverage ?? .98;
      const verticalCoverage = constructTuning.verticalCoverage ?? .94;
      const canvasHalfX = Math.max(24, layout.width * (.5 - edgePadding)) * horizontalCoverage;
      const compactWidth = Math.min(layout.width, layout.height * 1.28);
      const compactHalfX = Math.max(24, compactWidth * (.5 - edgePadding)) * horizontalCoverage;
      const edgeHalfX = lerp(compactHalfX, canvasHalfX, mode.aspect);
      const edgeHalfY = Math.max(24, layout.height * (.5 - edgePadding)) * verticalCoverage;
      const portraitAmount = clamp((1.05 - layout.width / Math.max(1, layout.height)) / .45) * mode.mobile;
      const center = { x: layout.cx, y: layout.cy };
      const primary = paletteColor(palette, 0, time, constructTuning);
      const secondary = paletteColor(palette, 1, time, constructTuning);
      const tertiary = paletteColor(palette, 2, time, constructTuning);

      for (let level = 0; level < MAX_DEPTH; level++) {
        const target = level < activeDepth ? 1 : 0;
        depthVisibility[level] = lerp(depthVisibility[level], target, 1 - Math.exp(-dt * (target ? 8 : 24)));
      }

      perimeter.clear();
      wiring.clear();
      fractalGlow.clear();
      fractalLines.clear();
      terminalMarks.clear();
      sparkTrails.clear();
      sparkDots.clear();

      const rootAnchors = [];
      const leafTips = [];
      let fractalSegments = 0;
      let maxFractalRadius = 0;
      const renderBranch = (start, angle, length, level, rootIndex, serial) => {
        const levelAlpha = depthVisibility[level - 1] * Math.pow(.78, level - 1);
        const noise = hashNoise(rootIndex * 107 + serial * 29 + level * 13);
        const direction = angle
          + noise * fracture * .16
          + Math.sin(time * .28 * motionScale + ROOTS[rootIndex].phase + serial) * .052 * branchPulse;
        const end = pointFrom(start, length, direction);
        maxFractalRadius = Math.max(maxFractalRadius, Math.hypot(end.x - center.x, end.y - center.y));
        const control = pointFrom(
          { x: lerp(start.x, end.x, .5), y: lerp(start.y, end.y, .5) },
          length * (.09 + fracture * .045),
          direction + Math.PI / 2 * Math.sign(noise || 1),
        );
        const color = paletteColor(palette, ROOTS[rootIndex].colorIndex + level + serial, time, constructTuning);
        const branchPath = { sample(t) { return quadratic(start, control, end, t); } };
        const points = samplePath(branchPath, 8);
        const width = Math.max(.34, modelScale * .013 * Math.pow(.62, level - 1));
        drawPolyline(fractalGlow, points, { color, width: width * 3.8, alpha: levelAlpha * .05, cap: 'round' });
        drawPolyline(fractalLines, points, { color, width, alpha: levelAlpha * (.38 + profile.energy * .22), cap: 'round' });
        fractalSegments += levelAlpha > .01 ? 1 : 0;
        if (level >= MAX_DEPTH) {
          leafTips.push({ ...end, color, alpha: levelAlpha });
          return;
        }
        const nextLength = length * (.50 + fracture * .035);
        const split = .28 + fracture * .15;
        const rootCurl = ROOTS[rootIndex].curl * fracture * .10;
        renderBranch(end, direction - split + rootCurl, nextLength, level + 1, rootIndex, serial * 2 + 1);
        renderBranch(end, direction + split + rootCurl * .7, nextLength, level + 1, rootIndex, serial * 2 + 2);
      };

      for (let rootIndex = 0; rootIndex < ROOT_COUNT; rootIndex++) {
        const root = ROOTS[rootIndex];
        const angle = rotation + rootIndex / ROOT_COUNT * TAU + root.angleJitter * fracture;
        const anchor = pointFrom(center, modelScale * .18, angle);
        rootAnchors.push(anchor);
        renderBranch(anchor, angle, modelScale * .145 * root.length * pulse * lerp(.86, 1.14, constructSpread / 2), 1, rootIndex, 1);
      }
      for (const tip of leafTips) {
        fractalGlow.circle(tip.x, tip.y, 2.5).fill({ color: tip.color, alpha: tip.alpha * .08 });
        fractalLines.circle(tip.x, tip.y, .65).fill({ color: tip.color, alpha: tip.alpha * .64 });
      }

      const terminalPositions = TERMINALS.map((terminal, index) => {
        const isSide = terminal.edge === 'left' || terminal.edge === 'right';
        const sign = terminal.edge === 'left' || terminal.edge === 'top' ? -1 : 1;
        const jitter = terminal.jitter * modelScale * .09 * (1 - mode.mirror);
        let rail;
        let radialAngle;
        if (isSide) {
          const mobileSlot = lerp(terminal.slot, Math.sign(terminal.slot) * (.42 + Math.abs(terminal.slot) * .38), portraitAmount);
          rail = { x: center.x + sign * edgeHalfX, y: center.y + mobileSlot * edgeHalfY + jitter };
          radialAngle = (terminal.edge === 'left' ? Math.PI : 0) + terminal.slot * .72;
        } else {
          const mobileSlot = lerp(terminal.slot, terminal.slot * .82, portraitAmount);
          rail = { x: center.x + mobileSlot * edgeHalfX + jitter, y: center.y + sign * edgeHalfY };
          radialAngle = (terminal.edge === 'top' ? -Math.PI / 2 : Math.PI / 2) + terminal.slot * .62;
        }
        const radial = pointFrom(center, modelScale * (.88 + (index % 3) * .06), radialAngle);
        const railMix = isSide ? mode.side : mode.topBottom;
        return { ...mixPoint(radial, rail, railMix), edge: terminal.edge, railMix };
      });

      const perimeterOrder = [8, 9, 10, 4, 5, 6, 7, 13, 12, 11, 3, 2, 1, 0];
      if (mode.perimeter > .01) {
        for (let orderIndex = 0; orderIndex < perimeterOrder.length; orderIndex++) {
          if (orderIndex % 4 === 2) continue;
          const a = terminalPositions[perimeterOrder[orderIndex]];
          const b = terminalPositions[perimeterOrder[(orderIndex + 1) % perimeterOrder.length]];
          perimeter.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
            color: paletteColor(palette, orderIndex, time, constructTuning),
            width: .48,
            alpha: mode.perimeter * (.075 + profile.coherence * .045),
          });
        }
      }

      const paths = TERMINALS.map((terminal, index) => {
        const end = terminalPositions[index];
        const rootIndex = index % ROOT_COUNT;
        const root = rootAnchors[rootIndex];
        const outward = edgeDirection(terminal.edge);
        const axisDistance = Math.hypot(end.x - center.x, end.y - center.y);
        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
        const innerControl = pointFrom(center, modelScale * .08, endAngle - terminal.bend * .18);
        const curvature = (constructTuning.wireCurvature ?? 1) * lerp(.72, 1.28, constructSpread / 2);
        const exitControl = pointFrom(root, modelScale * (.26 + Math.abs(terminal.bend) * .08), endAngle + terminal.bend * .48 * curvature);
        const outerControl = {
          x: lerp(root.x, end.x, .68) - outward.y * modelScale * terminal.bend * .25 * curvature,
          y: lerp(root.y, end.y, .68) + outward.x * modelScale * terminal.bend * .25 * curvature,
        };
        const color = paletteColor(palette, terminal.colorIndex, time, constructTuning);
        const path = {
          id: `frame-route-${index}`,
          color,
          centralRelay: true,
          frontThreshold: .50,
          sample(t) {
            if (t <= .28) return quadratic(center, innerControl, root, t / .28);
            return cubic(root, exitControl, outerControl, end, (t - .28) / .72);
          },
          depth(t) { return lerp(.44, terminal.depth, t); },
        };
        const points = samplePath(path, 40);
        drawPolyline(wiring, points, { color: 0x12192b, width: modelScale * (.023 + profile.energy * .008), alpha: .16 + profile.coherence * .055, cap: 'round' });
        drawPolyline(wiring, points, { color, width: .72 + profile.energy * .82, alpha: .24 + profile.energy * .21, cap: 'round' });
        const tick = { x: end.x - outward.x * modelScale * .035, y: end.y - outward.y * modelScale * .035 };
        terminalMarks.moveTo(tick.x - outward.y * modelScale * .022, tick.y + outward.x * modelScale * .022)
          .lineTo(end.x, end.y)
          .lineTo(tick.x + outward.y * modelScale * .022, tick.y - outward.x * modelScale * .022)
          .stroke({ color, width: .8, alpha: .46 + effect('dispatch') * .28, cap: 'round' });
        terminalMarks.circle(end.x, end.y, 1.8 + effect('dispatch') * 3.2).fill({ color, alpha: .64 });
        return path;
      });

      const nodeScale = constructTuning.nodeScale ?? 1;
      const nodes = TERMINALS.map((terminal, index) => ({
        id: terminal.id,
        x: terminalPositions[index].x,
        y: terminalPositions[index].y,
        radius: modelScale * .043 * nodeScale,
        icon: terminal.icon,
        color: paths[index].color,
        kind: terminal.edge === 'left' || terminal.edge === 'right' ? 'diamond' : 'satellite',
        phase: index * .57,
        iconScale: .68,
        alpha: .92,
      }));
      if (mode.relay > .02) {
        for (let index = 0; index < paths.length; index++) {
          const relay = paths[index].sample(.58 + (index % 3) * .055);
          nodes.push({
            id: `frame-relay-${index}`,
            x: relay.x,
            y: relay.y,
            radius: modelScale * .023 * nodeScale,
            icon: index % 2 ? 'more_horiz' : 'data_object',
            color: paths[index].color,
            kind: 'diamond',
            phase: index * .71,
            iconScale: .48,
            alpha: mode.relay * .78,
          });
        }
      }

      const leakSparks = constructTuning.leakSparks !== false;
      const sparkRate = constructTuning.sparkRate ?? 1;
      const sparkReach = constructTuning.sparkReach ?? 1;
      const sparkScatter = constructTuning.sparkScatter ?? 1;
      const sparkSize = constructTuning.sparkSize ?? 1;
      const sparkBursts = constructTuning.sparkBursts !== false;
      const sparkAllEdges = constructTuning.sparkAllEdges !== false;
      const showSparkTrails = constructTuning.sparkTrails !== false;
      if (leakSparks) {
        const rate = (1.4 + profile.energy * 3.2 + effect('dispatch') * 4) * sparkRate * (reducedMotion ? .22 : 1);
        sparkAccumulator += dt * rate;
        while (sparkAccumulator >= 1) {
          sparkAccumulator -= 1;
          const burstCount = sparkBursts && sparkRandom() < .24 ? 2 + Math.floor(sparkRandom() * 2) : 1;
          for (let burst = 0; burst < burstCount; burst++) {
            const eligible = sparkAllEdges ? TERMINALS : TERMINALS.slice(0, 8);
            const source = eligible[Math.floor(sparkRandom() * eligible.length)];
            const sourceIndex = TERMINALS.indexOf(source);
            const origin = terminalPositions[sourceIndex];
            const outward = edgeDirection(source.edge);
            const tangent = { x: -outward.y, y: outward.x };
            const spark = sparks[sparkCursor++ % sparks.length];
            const velocity = modelScale * lerp(.28, .62, sparkRandom()) * sparkReach;
            const tangentVelocity = (sparkRandom() - .5) * modelScale * .34 * sparkScatter;
            spark.active = true;
            spark.x = origin.x + outward.x * modelScale * .025;
            spark.y = origin.y + outward.y * modelScale * .025;
            spark.vx = outward.x * velocity + tangent.x * tangentVelocity;
            spark.vy = outward.y * velocity + tangent.y * tangentVelocity;
            spark.life = 0;
            spark.maxLife = lerp(.65, 1.45, sparkRandom()) / Math.max(.65, sparkReach * .72);
            spark.size = lerp(.55, 2.2, sparkRandom() ** 1.8) * sparkSize;
            spark.color = paletteColor(palette, source.colorIndex + burst, time, constructTuning);
            spark.history = [{ x: spark.x, y: spark.y }];
            sparkSpawnCount += 1;
          }
        }
      }

      let activeSparks = 0;
      for (const spark of sparks) {
        if (!spark.active) continue;
        spark.life += dt;
        if (spark.life >= spark.maxLife) {
          spark.active = false;
          spark.history.length = 0;
          continue;
        }
        activeSparks += 1;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vx *= Math.exp(-dt * .55);
        spark.vy *= Math.exp(-dt * .55);
        spark.history.unshift({ x: spark.x, y: spark.y });
        if (spark.history.length > (reducedMotion ? 2 : 7)) spark.history.length = reducedMotion ? 2 : 7;
        const life = spark.life / spark.maxLife;
        const alpha = Math.sin(Math.PI * clamp(life)) * .78;
        if (showSparkTrails && spark.history.length > 1) {
          for (let index = 1; index < spark.history.length; index++) {
            const a = spark.history[index - 1];
            const b = spark.history[index];
            sparkTrails.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
              color: spark.color,
              width: Math.max(.32, spark.size * (1 - index / spark.history.length)),
              alpha: alpha * (1 - index / spark.history.length) * .34,
              cap: 'round',
            });
          }
        }
        sparkDots.circle(spark.x, spark.y, spark.size * 2.4).fill({ color: spark.color, alpha: alpha * .07 });
        sparkDots.circle(spark.x, spark.y, spark.size).fill({ color: spark.color, alpha });
        const speed = Math.max(1, Math.hypot(spark.vx, spark.vy));
        const direction = { x: spark.vx / speed, y: spark.vy / speed };
        const ray = spark.size * 2.4;
        sparkDots.moveTo(spark.x - direction.x * ray, spark.y - direction.y * ray)
          .lineTo(spark.x + direction.x * ray, spark.y + direction.y * ray)
          .stroke({ color: spark.color, width: Math.max(.35, spark.size * .42), alpha: alpha * .58, cap: 'round' });
        sparkDots.moveTo(spark.x + direction.y * ray * .45, spark.y - direction.x * ray * .45)
          .lineTo(spark.x - direction.y * ray * .45, spark.y + direction.x * ray * .45)
          .stroke({ color: 0xffffff, width: .35, alpha: alpha * .38, cap: 'round' });
      }

      const terminalBounds = terminalPositions.reduce((bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        maxX: Math.max(bounds.maxX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxY: Math.max(bounds.maxY, point.y),
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      terminalBounds.width = terminalBounds.maxX - terminalBounds.minX;
      terminalBounds.height = terminalBounds.maxY - terminalBounds.minY;

      return {
        paths,
        nodes,
        flow: {
          mode: 'one-way',
          speedScale: 4.55,
          respawnRate: constructTuning.signalCadence ?? 1,
        },
        prompt: { style: 'orb', radius: .148, accent: primary, secondary: tertiary },
        debug: {
          palette: palette.id,
          modelScale: Number(modelScale.toFixed(2)),
          canvasAspect: Number((layout.width / Math.max(1, layout.height)).toFixed(3)),
          horizontalCoverage: Number((edgeHalfX * 2 / layout.width).toFixed(3)),
          verticalCoverage: Number((edgeHalfY * 2 / layout.height).toFixed(3)),
          edgeHalfX: Number(edgeHalfX.toFixed(2)),
          edgeHalfY: Number(edgeHalfY.toFixed(2)),
          terminalBounds: {
            minX: Number(terminalBounds.minX.toFixed(2)),
            maxX: Number(terminalBounds.maxX.toFixed(2)),
            minY: Number(terminalBounds.minY.toFixed(2)),
            maxY: Number(terminalBounds.maxY.toFixed(2)),
            width: Number(terminalBounds.width.toFixed(2)),
            height: Number(terminalBounds.height.toFixed(2)),
            coverageX: Number((terminalBounds.width / layout.width).toFixed(3)),
            coverageY: Number((terminalBounds.height / layout.height).toFixed(3)),
          },
          portraitAmount: Number(portraitAmount.toFixed(3)),
          layoutModes: Object.fromEntries(Object.entries(mode).map(([key, value]) => [key, Number(value.toFixed(3))])),
          fractalDepth: activeDepth,
          fractalSegments,
          maxFractalRadius: Number(maxFractalRadius.toFixed(2)),
          wireCount: paths.length,
          terminalCount: TERMINALS.length,
          relayCount: nodes.length - TERMINALS.length,
          activeSparks,
          sparkSpawnCount,
          sparkPoolCount: sparks.length,
          leakSparks,
          flowMode: 'one-way',
          particleSpread: constructSpread,
        },
      };
    },
  };
}

export const neuralFrameConfig = {
  id: 'neural-frame',
  name: 'Neural Frame',
  index: '07',
  accent: 0x8df7ff,
  secondary: 0x5f8cff,
  ambientColor: 0x3155a8,
  accentCss: '#8df7ff',
  seed: 7079,
  particles: 132,
  flowMode: 'one-way',
  flowSpeedScale: 4.55,
  customControls: {
    defaultPalette: 'signal-glass',
    palettes: FRAME_PALETTES,
    groups: [
      {
        id: 'layout',
        controls: [
          { id: 'horizontalCoverage', type: 'range', label: 'Horizontal coverage', min: .55, max: 1, step: .01, value: .98, scale: ['contained', 'wide', 'edge fit'] },
          { id: 'verticalCoverage', type: 'range', label: 'Vertical coverage', min: .58, max: 1, step: .01, value: .94, scale: ['contained', 'tall', 'edge fit'] },
          { id: 'edgePadding', type: 'range', label: 'Canvas edge padding', min: .02, max: .16, step: .01, value: .045, format: 'percentUnit', scale: ['2%', 'safe area', '16%'] },
          { id: 'layoutSpring', type: 'range', label: 'Layout transition', min: 1.5, max: 12, step: .5, value: 6, format: 'rate', scale: ['drift', 'smooth', 'snap'] },
          { id: 'aspectFill', type: 'toggle', label: 'Canvas-width anchoring', description: 'Move side nodes with canvas width; sizes remain height-based.', value: true },
          { id: 'sideRails', type: 'toggle', label: 'Side edge rails', description: 'Anchor left and right neural nodes near the canvas margins.', value: true },
          { id: 'topBottomRails', type: 'toggle', label: 'Top / bottom rails', description: 'Complete the box with height-fitted upper and lower nodes.', value: true },
          { id: 'perimeterLinks', type: 'toggle', label: 'Perimeter nerve', description: 'Connect edge nodes with a broken rectangular neural boundary.', value: true },
          { id: 'relayLanes', type: 'toggle', label: 'Intermediate relays', description: 'Place additional nodes between the core and canvas edges.', value: true },
          { id: 'mirrorFrame', type: 'toggle', label: 'Mirror symmetry', description: 'Remove seeded offsets and align opposing edge rails.', value: false },
          { id: 'mobileReflow', type: 'toggle', label: 'Portrait-safe reflow', description: 'Restack rail spacing when the canvas becomes taller than wide.', value: true },
        ],
      },
      {
        id: 'cortex',
        controls: [
          { id: 'coreScale', type: 'range', label: 'Height-based model scale', min: .6, max: 1.35, step: .05, value: 1, scale: ['compact', 'fill height', 'large'] },
          { id: 'coreFracture', type: 'range', label: 'Core fracture', min: 0, max: 2.5, step: .05, value: 1.15, scale: ['radial', 'riven', 'feral'] },
          { id: 'fractalDepth', type: 'range', label: 'Fractal depth', min: 1, max: 4, step: 1, value: 4, format: 'integer', scale: ['1 generation', '2', '4 generations'] },
          { id: 'coreRotation', type: 'range', label: 'Cortex rotation', min: -1.5, max: 1.5, step: .05, value: .35, format: 'signed', scale: ['reverse', 'still', 'forward'] },
          { id: 'branchPulse', type: 'range', label: 'Branch breathing', min: 0, max: 2.5, step: .05, value: 1, scale: ['still', 'native', 'deep'] },
          { id: 'nodeScale', type: 'range', label: 'Node scale', min: .55, max: 1.8, step: .05, value: 1, scale: ['micro', 'native', 'large'] },
          { id: 'wireCurvature', type: 'range', label: 'Neural wire curvature', min: 0, max: 3, step: .05, value: 1, scale: ['direct', 'native', 'coiled'] },
          { id: 'signalCadence', type: 'range', label: 'Signal birth cadence', min: .25, max: 2.5, step: .05, value: 1, format: 'rate', scale: ['sparse', 'native', 'rapid'] },
        ],
      },
      {
        id: 'bleed',
        controls: [
          { id: 'sparkRate', type: 'range', label: 'Data bleed rate', min: .15, max: 3, step: .05, value: 1, format: 'rate', scale: ['rare', 'ambient', 'storm'] },
          { id: 'sparkReach', type: 'range', label: 'Spark escape reach', min: .4, max: 2.5, step: .05, value: 1, scale: ['short', 'native', 'far'] },
          { id: 'sparkScatter', type: 'range', label: 'Spark scatter', min: .1, max: 2.5, step: .05, value: 1, scale: ['straight', 'native', 'spray'] },
          { id: 'sparkSize', type: 'range', label: 'Spark size', min: .4, max: 2.2, step: .05, value: 1, scale: ['dust', 'native', 'embers'] },
          { id: 'leakSparks', type: 'toggle', label: 'Edge data bleed', description: 'Occasionally leak sparks from terminal nodes after signals arrive.', value: true },
          { id: 'sparkBursts', type: 'toggle', label: 'Clustered leakage', description: 'Emit occasional spark clusters instead of a uniform cadence.', value: true },
          { id: 'sparkAllEdges', type: 'toggle', label: 'Bleed from all edges', description: 'Use the full frame; disable for horizontal side leakage only.', value: true },
          { id: 'sparkTrails', type: 'toggle', label: 'Spark afterimages', description: 'Leave short fading traces behind escaped data.', value: true },
        ],
      },
      {
        id: 'chromatic',
        palettes: true,
        controls: [
          { id: 'hueOffset', type: 'range', label: 'Hue offset', min: -180, max: 180, step: 1, value: 0, format: 'degree', scale: ['-180°', 'native', '+180°'] },
          { id: 'saturation', type: 'range', label: 'Saturation', min: 0, max: 150, step: 1, value: 100, format: 'percent', scale: ['mono', '100%', 'hyper'] },
          { id: 'colorRate', type: 'range', label: 'Color drift rate', min: 0, max: 2, step: .05, value: .34, format: 'rate', scale: ['frozen', '1×', '2×'] },
        ],
      },
    ],
  },
};
