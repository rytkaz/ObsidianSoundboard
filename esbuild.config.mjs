import esbuild from "esbuild";
import { builtinModules } from "module";
import { copyFileSync, mkdirSync, rmSync } from "fs";

const prod = process.argv[2] === "production";
const outDir = "dist";

// Files Obsidian needs next to main.js.
const staticFiles = ["manifest.json", "styles.css"];
const copyStatic = () => staticFiles.forEach((f) => copyFileSync(f, `${outDir}/${f}`));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  minify: prod,
  outfile: `${outDir}/main.js`,
});

if (prod) {
  await ctx.rebuild();
  copyStatic();
  await ctx.dispose();
} else {
  copyStatic();
  await ctx.watch();
}
