import { mountLab } from "../lab.js";
import { createBabylonRenderer } from "../renderers/babylon-renderer.js";

mountLab({
  engineKey: "babylon",
  engineName: "Babylon.js · 9.17",
  renderMode: "volumetric point system",
  createRenderer: createBabylonRenderer,
});
