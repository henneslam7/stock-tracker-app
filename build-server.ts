import * as esbuild from "esbuild";
esbuild.build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: "dist/server.js",
  external: ["express", "@google/genai", "vite", "dotenv", "firebase-admin", "firebase-admin/*", "stripe"],
  banner: {
    js: [
      "import { createRequire } from 'module';",
      "const require = createRequire(import.meta.url);",
      "const __filename = require('url').fileURLToPath(import.meta.url);",
      "const __dirname = require('path').dirname(__filename);",
    ].join(" "),
  },
}).catch(() => process.exit(1));
