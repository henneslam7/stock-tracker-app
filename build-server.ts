import * as esbuild from "esbuild";
esbuild.build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  external: ["express", "yahoo-finance2", "@google/genai", "vite"],
}).catch(() => process.exit(1));
