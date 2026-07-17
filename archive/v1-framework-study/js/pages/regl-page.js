import { mountLab } from "../lab.js";
import { createReglRenderer } from "../renderers/regl-renderer.js";

mountLab({
  engineKey: "regl",
  engineName: "regl · 2.1",
  renderMode: "raw shader field",
  createRenderer: createReglRenderer,
});
