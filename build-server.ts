import * as esbuild from "esbuild";
esbuild.build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  external: ["express", "yahoo-finance2", "@google/genai", "vite", "dotenv", "stripe", "firebase-admin", "firebase-admin/*"],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
}).catch(() => process.exit(1));
