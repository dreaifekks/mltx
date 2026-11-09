# Build and release

```
npm ci
npm test            # end-to-end against a fake x.com; needs `npx playwright-core install chromium`
npm run build       # dist/chrome, dist/firefox, dist/safari
npm run package     # the zips in packages/; add scripts/package-safari.sh for the dmg
```

Pushing a tag `v<version>`, matching `manifest.json`, builds all three and publishes a
GitHub Release. Running the Release workflow by hand only builds, leaving the packages as
artifacts. Without Apple signing secrets the Safari dmg is ad-hoc signed, so Safari needs
"Allow Unsigned Extensions" turned on; set `MACOS_SIGNING_P12`, `MACOS_SIGNING_PASSWORD`
and `APPLE_API_*` to sign and notarize.

Needs Chrome, Firefox 128 or Safari 18.4 and up. The Firefox zip isn't signed: load it from
`about:debugging`, or submit it to AMO to get an installable package.
