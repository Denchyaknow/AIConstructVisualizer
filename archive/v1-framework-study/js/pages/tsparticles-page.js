import { mountLab } from "../lab.js";
import { createTsParticlesRenderer } from "../renderers/tsparticles-renderer.js";

mountLab({
  engineKey: "tsparticles",
  engineName: "tsParticles · 4.3",
  renderMode: "particle-native neural field",
  createRenderer: createTsParticlesRenderer,
});
