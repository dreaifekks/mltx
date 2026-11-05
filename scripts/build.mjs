// Writes the extension for each browser into dist/. There's nothing to compile: it copies
// the files and adjusts the manifest. With --package it also zips them into packages/.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["common.js", "settings-bridge.js", "masonry.js", "masonry.css", "panel-frame.js", "panel-frame.css", "frame-rules.json", "popup.html", "popup.css", "popup.js"];
const ICONS = [16, 32, 48, 128, 512].map((size) => `icons/icon-${size}.png`);

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

const targets = {
  chrome: manifest,
  firefox: {
    ...manifest,
    browser_specific_settings: {
      gecko: {
        id: "mltx@dreaifekks",
        // Content scripts in the page's own world need 128.
        strict_min_version: "128.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
  safari: {
    ...manifest,
    // Content scripts in the page's own world need 18, and initiatorDomains in the frame
    // rule needs 18.4.
    browser_specific_settings: { safari: { strict_min_version: "18.4" } },
  },
};

rmSync(join(root, "dist"), { recursive: true, force: true });
for (const [name, content] of Object.entries(targets)) {
  const dir = join(root, "dist", name);
  mkdirSync(join(dir, "icons"), { recursive: true });
  for (const file of [...FILES, ...ICONS]) cpSync(join(root, file), join(dir, file));
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(content, null, 2)}\n`);
}

if (process.argv.includes("--package")) {
  const label = (process.env.RELEASE_TAG || "").replace(/^v/, "") || manifest.version;
  const out = join(root, "packages");
  mkdirSync(out, { recursive: true });
  for (const name of Object.keys(targets)) {
    const zip = join(out, `mltx-${label}-${name}.zip`);
    rmSync(zip, { force: true });
    execFileSync("zip", ["-qr", zip, "."], { cwd: join(root, "dist", name) });
    console.log(zip);
  }
}
