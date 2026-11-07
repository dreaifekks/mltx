// What the Safari build's manifest adds to the one in the repository.
export function safariManifest(manifest) {
  return {
    ...manifest,
    // Content scripts in the page's own world need 18, and initiatorDomains in the frame
    // rule needs 18.4.
    browser_specific_settings: { safari: { strict_min_version: "18.4" } },
    // Right after common.js, before the scripts that read what it sets.
    content_scripts: manifest.content_scripts.map((entry) => ({ ...entry, js: entry.js.flatMap((file) => (file === "common.js" ? [file, "safari-entry.js"] : [file])) })),
  };
}
