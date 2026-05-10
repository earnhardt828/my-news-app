import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";

const projectRoot = process.cwd();
const nextAppDir = join(projectRoot, ".next", "server", "app");
const nextStaticDir = join(projectRoot, ".next", "static");
const publicDir = join(projectRoot, "public");
const outputDir = join(projectRoot, "out");

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyDirIfExists(source, destination) {
  if (!existsSync(source)) {
    return;
  }

  ensureDir(dirname(destination));
  cpSync(source, destination, {
    recursive: true,
    force: true,
  });
}

function walk(dir, fileCallback) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath, fileCallback);
      continue;
    }

    fileCallback(fullPath);
  }
}

function writeRouteHtml(sourceFile) {
  const relativePath = relative(nextAppDir, sourceFile);
  const fileName = relativePath.replace(/\\/g, "/");

  if (!fileName.endsWith(".html")) {
    return;
  }

  const routeName = fileName.replace(/\.html$/, "");

  if (routeName.startsWith("_")) {
    if (routeName === "_not-found") {
      writeFileSync(join(outputDir, "404.html"), readFileSync(sourceFile));
    }
    return;
  }

  const destination =
    routeName === "index"
      ? join(outputDir, "index.html")
      : join(outputDir, routeName, "index.html");

  ensureDir(dirname(destination));
  writeFileSync(destination, readFileSync(sourceFile));
}

function writeBodyAsset(sourceFile) {
  const relativePath = relative(nextAppDir, sourceFile).replace(/\\/g, "/");

  if (!relativePath.endsWith(".body")) {
    return;
  }

  const destination = join(outputDir, relativePath.replace(/\.body$/, ""));
  ensureDir(dirname(destination));
  writeFileSync(destination, readFileSync(sourceFile));
}

rmSync(outputDir, { recursive: true, force: true });
ensureDir(outputDir);

copyDirIfExists(publicDir, outputDir);

if (!existsSync(nextAppDir)) {
  throw new Error(`Missing Next app output at ${nextAppDir}`);
}

walk(nextAppDir, (file) => {
  const extension = extname(file);

  if (extension === ".html") {
    writeRouteHtml(file);
    return;
  }

  if (file.endsWith(".body")) {
    writeBodyAsset(file);
  }
});

copyDirIfExists(nextStaticDir, join(outputDir, "_next", "static"));

console.log("Prepared Capacitor web assets in out/");
