import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js";

const pointVertexShader = `
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * (8.0 / -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const pointFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    float body = 1.0 - smoothstep(0.12, 0.5, distanceToCenter);
    float core = 1.0 - smoothstep(0.0, 0.16, distanceToCenter);
    float alpha = (body * 0.72 + core * 0.75) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor * (0.78 + core * 0.72), alpha);
  }
`;

function createPointCloud(count) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute(
    "aSize",
    new THREE.BufferAttribute(new Float32Array(count), 1),
  );
  geometry.setAttribute(
    "aAlpha",
    new THREE.BufferAttribute(new Float32Array(count), 1),
  );
  const material = new THREE.ShaderMaterial({
    vertexShader: pointVertexShader,
    fragmentShader: pointFragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

function createRing(segments, opacity) {
  const positions = new Float32Array(segments * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x29d9ff,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.LineLoop(geometry, material);
  line.userData.segments = segments;
  return line;
}

function updateRing(ring, radius, phase, wobble, color) {
  const positions = ring.geometry.attributes.position.array;
  for (let index = 0; index < ring.userData.segments; index += 1) {
    const angle = (index / ring.userData.segments) * Math.PI * 2 + phase;
    const variation = 1 + Math.sin(angle * 3 + phase * 2) * wobble;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radius * variation;
    positions[offset + 1] = Math.sin(angle) * radius * variation;
    positions[offset + 2] = Math.sin(angle * 2 + phase) * 0.018;
  }
  ring.geometry.attributes.position.needsUpdate = true;
  ring.material.color.setRGB(color[0], color[1], color[2]);
}

export async function createThreeRenderer(host, simulation) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
  camera.position.z = 3.55;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);

  const field = new THREE.Group();
  scene.add(field);

  const points = createPointCloud(simulation.nodes.length);
  field.add(points);

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(simulation.edges.length * 2 * 3),
      3,
    ),
  );
  lineGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(
      new Float32Array(simulation.edges.length * 2 * 3),
      3,
    ),
  );
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  field.add(lines);

  const signalPoints = createPointCloud(simulation.signals.length);
  field.add(signalPoints);

  const apertureGroup = new THREE.Group();
  const innerRing = createRing(96, 0.45);
  const outerRing = createRing(96, 0.16);
  apertureGroup.add(innerRing, outerRing);
  field.add(apertureGroup);

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  function updatePointCloud(cloud, items) {
    const positions = cloud.geometry.attributes.position.array;
    const colors = cloud.geometry.attributes.color.array;
    const sizes = cloud.geometry.attributes.aSize.array;
    const alphas = cloud.geometry.attributes.aAlpha.array;

    items.forEach((item, index) => {
      const positionOffset = index * 3;
      positions[positionOffset] = item.x;
      positions[positionOffset + 1] = item.y;
      positions[positionOffset + 2] = item.z;
      colors[positionOffset] = item.color[0];
      colors[positionOffset + 1] = item.color[1];
      colors[positionOffset + 2] = item.color[2];
      sizes[index] = item.size;
      alphas[index] = item.alpha;
    });

    Object.values(cloud.geometry.attributes).forEach((attribute) => {
      attribute.needsUpdate = true;
    });
  }

  return {
    render(snapshot, pointer) {
      updatePointCloud(points, snapshot.nodes);
      updatePointCloud(signalPoints, snapshot.signals);

      const positions = lines.geometry.attributes.position.array;
      const colors = lines.geometry.attributes.color.array;
      snapshot.edges.forEach((edge, index) => {
        const a = snapshot.nodes[edge.a];
        const b = snapshot.nodes[edge.b];
        const offset = index * 6;
        positions[offset] = a.x;
        positions[offset + 1] = a.y;
        positions[offset + 2] = a.z;
        positions[offset + 3] = b.x;
        positions[offset + 4] = b.y;
        positions[offset + 5] = b.z;
        for (let vertex = 0; vertex < 2; vertex += 1) {
          const colorOffset = offset + vertex * 3;
          colors[colorOffset] = edge.color[0] * edge.intensity;
          colors[colorOffset + 1] = edge.color[1] * edge.intensity;
          colors[colorOffset + 2] = edge.color[2] * edge.intensity;
        }
      });
      lines.geometry.attributes.position.needsUpdate = true;
      lines.geometry.attributes.color.needsUpdate = true;

      updateRing(
        innerRing,
        snapshot.aperture.radius,
        snapshot.aperture.phase,
        0.025,
        snapshot.aperture.color,
      );
      updateRing(
        outerRing,
        snapshot.aperture.radius * 1.48,
        -snapshot.aperture.phase * 0.63,
        0.07,
        snapshot.aperture.color,
      );
      innerRing.material.opacity = snapshot.aperture.intensity * 0.65;
      outerRing.material.opacity = snapshot.aperture.intensity * 0.22;

      field.rotation.y = pointer.x * 0.16 + snapshot.time * 0.025;
      field.rotation.x = pointer.y * 0.11;
      field.rotation.z = Math.sin(snapshot.time * 0.1) * 0.018;
      renderer.render(scene, camera);
    },
    destroy() {
      resizeObserver.disconnect();
      renderer.dispose();
    },
  };
}
