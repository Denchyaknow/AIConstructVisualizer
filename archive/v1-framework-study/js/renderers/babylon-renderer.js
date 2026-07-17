function waitForBabylon() {
  if (window.BABYLON) return Promise.resolve(window.BABYLON);
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const poll = () => {
      if (window.BABYLON) {
        resolve(window.BABYLON);
      } else if (performance.now() - started > 20000) {
        reject(new Error("Babylon.js did not load."));
      } else {
        window.setTimeout(poll, 60);
      }
    };
    poll();
  });
}

export async function createBabylonRenderer(host, simulation) {
  const BABYLON = await waitForBabylon();
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);

  const engine = new BABYLON.Engine(
    canvas,
    true,
    {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      stencil: false,
    },
    true,
  );
  engine.setHardwareScalingLevel(
    1 / Math.min(window.devicePixelRatio || 1, 1.8),
  );

  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
  scene.autoClear = true;
  scene.skipPointerMovePicking = true;

  const camera = new BABYLON.FreeCamera(
    "camera",
    new BABYLON.Vector3(0, 0, -3.55),
    scene,
  );
  camera.setTarget(BABYLON.Vector3.Zero());
  camera.fov = 0.72;

  const field = new BABYLON.TransformNode("field", scene);
  let latestSnapshot = simulation.snapshot();

  const pointSystem = new BABYLON.PointsCloudSystem("nodes", 1, scene);
  pointSystem.computeParticleColor = true;
  pointSystem.addPoints(simulation.nodes.length, (particle, index) => {
    particle.idx = index;
    particle.position = BABYLON.Vector3.Zero();
    particle.color = new BABYLON.Color4(0.16, 0.82, 1, 1);
  });
  pointSystem.updateParticle = (particle) => {
    const node = latestSnapshot.nodes[particle.idx];
    particle.position.set(node.x, -node.y, node.z);
    particle.color.set(
      node.color[0],
      node.color[1],
      node.color[2],
      Math.max(node.kind === "dust" ? 0.12 : 0.3, node.alpha),
    );
    return particle;
  };
  const pointMesh = await pointSystem.buildMeshAsync();
  pointMesh.parent = field;
  pointMesh.alwaysSelectAsActiveMesh = true;
  pointMesh.hasVertexAlpha = true;
  const pointMaterial = new BABYLON.StandardMaterial("point-material", scene);
  pointMaterial.disableLighting = true;
  pointMaterial.emissiveColor = BABYLON.Color3.White();
  pointMaterial.pointsCloud = true;
  pointMaterial.pointSize = 3.7 * Math.min(window.devicePixelRatio || 1, 1.6);
  pointMaterial.alphaMode = BABYLON.Engine.ALPHA_ADD;
  pointMaterial.disableDepthWrite = true;
  pointMesh.material = pointMaterial;

  const signalSystem = new BABYLON.PointsCloudSystem("signals", 2, scene);
  signalSystem.computeParticleColor = true;
  signalSystem.addPoints(simulation.signals.length, (particle, index) => {
    particle.idx = index;
    particle.position = BABYLON.Vector3.Zero();
    particle.color = new BABYLON.Color4(0.8, 0.98, 1, 1);
  });
  signalSystem.updateParticle = (particle) => {
    const signal = latestSnapshot.signals[particle.idx];
    particle.position.set(signal.x, -signal.y, signal.z);
    particle.color.set(
      signal.color[0],
      signal.color[1],
      signal.color[2],
      signal.alpha,
    );
    return particle;
  };
  const signalMesh = await signalSystem.buildMeshAsync();
  signalMesh.parent = field;
  signalMesh.alwaysSelectAsActiveMesh = true;
  signalMesh.hasVertexAlpha = true;
  const signalMaterial = pointMaterial.clone("signal-material");
  signalMaterial.pointSize = 6.4 * Math.min(window.devicePixelRatio || 1, 1.6);
  signalMesh.material = signalMaterial;

  const lineVectors = simulation.edges.map(() => [
    BABYLON.Vector3.Zero(),
    BABYLON.Vector3.Zero(),
  ]);
  const lineColors = simulation.edges.map(() => [
    new BABYLON.Color4(0.1, 0.7, 1, 0.3),
    new BABYLON.Color4(0.1, 0.7, 1, 0.3),
  ]);
  let lineMesh = BABYLON.MeshBuilder.CreateLineSystem(
    "connections",
    {
      lines: lineVectors,
      colors: lineColors,
      updatable: true,
      useVertexAlpha: true,
    },
    scene,
  );
  lineMesh.parent = field;
  lineMesh.alwaysSelectAsActiveMesh = true;
  lineMesh.alphaIndex = 1;

  const ringPoints = (radius) =>
    Array.from({ length: 97 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return new BABYLON.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0,
      );
    });
  const aperture = BABYLON.MeshBuilder.CreateLines(
    "aperture",
    { points: ringPoints(0.17), updatable: false },
    scene,
  );
  aperture.parent = field;
  aperture.color = new BABYLON.Color3(0.1, 0.76, 1);
  aperture.alpha = 0.52;
  const outerAperture = BABYLON.MeshBuilder.CreateLines(
    "outer-aperture",
    { points: ringPoints(0.25), updatable: false },
    scene,
  );
  outerAperture.parent = field;
  outerAperture.color = new BABYLON.Color3(0.1, 0.76, 1);
  outerAperture.alpha = 0.16;

  const glow = new BABYLON.GlowLayer("field-glow", scene, {
    blurKernelSize: 26,
  });
  glow.intensity = 0.48;

  const resize = () => engine.resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  return {
    render(snapshot, pointer) {
      latestSnapshot = snapshot;
      pointSystem.setParticles();
      signalSystem.setParticles();

      snapshot.edges.forEach((edge, index) => {
        const a = snapshot.nodes[edge.a];
        const b = snapshot.nodes[edge.b];
        lineVectors[index][0].set(a.x, -a.y, a.z);
        lineVectors[index][1].set(b.x, -b.y, b.z);
        for (let vertex = 0; vertex < 2; vertex += 1) {
          lineColors[index][vertex].set(
            edge.color[0],
            edge.color[1],
            edge.color[2],
            edge.intensity * 0.48,
          );
        }
      });
      lineMesh = BABYLON.MeshBuilder.CreateLineSystem(
        "connections",
        {
          lines: lineVectors,
          colors: lineColors,
          instance: lineMesh,
          useVertexAlpha: true,
        },
        scene,
      );

      const color = snapshot.aperture.color;
      aperture.color.set(color[0], color[1], color[2]);
      aperture.alpha = snapshot.aperture.intensity * 0.64;
      outerAperture.color.set(color[0], color[1], color[2]);
      outerAperture.alpha = snapshot.aperture.intensity * 0.18;
      const apertureScale = snapshot.aperture.radius / 0.17;
      aperture.scaling.setAll(apertureScale);
      outerAperture.scaling.setAll(apertureScale);

      field.rotation.y = pointer.x * 0.17 + snapshot.time * 0.024;
      field.rotation.x = -pointer.y * 0.1;
      scene.render();
    },
    destroy() {
      resizeObserver.disconnect();
      scene.dispose();
      engine.dispose();
    },
  };
}
