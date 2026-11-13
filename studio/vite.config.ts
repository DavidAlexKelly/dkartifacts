/// <reference types="vitest/config" />
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Serve a local terrain-gen output folder at /data/ during development, so
 * the studio can be worked on without Foundry: `STUDIO_DATA=../terrain-gen/out`.
 * It is the same layout the Foundry datasets have, one folder per dataset.
 */
function localData(dir: string | undefined): Plugin {
  const types: Record<string, string> = {
    ".json": "application/json",
    ".pmtiles": "application/octet-stream",
    ".pbf": "application/x-protobuf",
    ".png": "image/png",
    ".tif": "image/tiff",
  };
  return {
    name: "studio-local-data",
    configureServer(server) {
      if (!dir) {return;}
      const root = resolve(dir);
      server.middlewares.use("/data", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
        const file = resolve(root, "." + rel);
        if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        res.setHeader("Content-Length", statSync(file).size);
        createReadStream(file).pipe(res).on("error", next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), localData(env.STUDIO_DATA)],
    server: { port: 8080 },
    build: { chunkSizeWarningLimit: 2000 },
    test: { environment: "jsdom" },
  };
});
