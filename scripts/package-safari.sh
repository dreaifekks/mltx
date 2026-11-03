#!/usr/bin/env bash
# 把 dist/safari 打包成 macOS App 的 dmg，需要 macOS 和 Xcode，先运行 `npm run build`。
# 用法：scripts/package-safari.sh <输出的 dmg 路径>
#
# 默认用钥匙串里第一个 Developer ID Application 证书签名，用户下载后可以直接安装和启用。
# CODESIGN_IDENTITY 可以指定证书，设为 - 则强制 ad-hoc。
# 同时设置了下面三个环境变量时再做公证，否则跳过公证：
#   APPLE_API_KEY_P8_BASE64  App Store Connect API Key 文件的 base64
#   APPLE_API_KEY_ID         API Key 的 ID
#   APPLE_API_ISSUER_ID      API Key 的 Issuer ID
#
# 没有证书时只做 ad-hoc 签名：Apple 芯片要求至少有这个签名才能运行，
# 但 Safari 不认它，需要在 Safari 里开启“允许未签名的扩展”才能启用。
set -euo pipefail

OUTPUT_DMG="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
APP_NAME="mltx"
BUNDLE_ID="com.dreaifekks.mltx"
# Xcode 默认用当前 SDK 的版本作最低系统版本，不固定的话旧系统打不开
MACOS_DEPLOYMENT_TARGET="14.0"
# App 的版本号跟随扩展清单，转换器默认写成 1.0
VERSION="$(node -p "require('./dist/safari/manifest.json').version")"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

IDENTITY="${CODESIGN_IDENTITY:-}"
if [ -z "$IDENTITY" ]; then
  IDENTITY="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application: .*\)"$/\1/p' | head -n 1)"
fi

if [ -n "$IDENTITY" ] && [ "$IDENTITY" != "-" ]; then
  # 证书名结尾的括号里是团队 ID
  TEAM_ID="$(printf '%s' "$IDENTITY" | sed -n 's/.*(\([A-Z0-9]\{10\}\))$/\1/p')"
  # Xcode 注入的基础权限里有调试用的 get-task-allow，公证不允许，所以关掉注入。
  # 转换器生成的工程靠注入写入沙盒权限，关掉后要显式给出，Safari 扩展必须开沙盒
  ENTITLEMENTS_PATH="$WORK_DIR/release.entitlements"
  cat > "$ENTITLEMENTS_PATH" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-only</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
</dict>
</plist>
PLIST
  # 公证要求开启 hardened runtime 并带可信时间戳
  SIGN_SETTINGS=(
    CODE_SIGN_IDENTITY="$IDENTITY"
    DEVELOPMENT_TEAM="$TEAM_ID"
    ENABLE_HARDENED_RUNTIME=YES
    OTHER_CODE_SIGN_FLAGS=--timestamp
    CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO
    CODE_SIGN_ENTITLEMENTS="$ENTITLEMENTS_PATH"
  )
else
  IDENTITY=""
  echo "没有 Developer ID 证书，只做 ad-hoc 签名"
  SIGN_SETTINGS=(
    CODE_SIGN_IDENTITY="-"
    DEVELOPMENT_TEAM=""
  )
fi

xcrun safari-web-extension-converter ./dist/safari \
  --project-location "$WORK_DIR/project" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --copy-resources \
  --swift \
  --no-open \
  --no-prompt \
  --force

xcodebuild \
  -project "$WORK_DIR/project/$APP_NAME/$APP_NAME.xcodeproj" \
  -scheme "$APP_NAME" \
  -configuration Release \
  -derivedDataPath "$WORK_DIR/build" \
  ARCHS="arm64 x86_64" \
  ONLY_ACTIVE_ARCH=NO \
  MACOSX_DEPLOYMENT_TARGET="$MACOS_DEPLOYMENT_TARGET" \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$VERSION" \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER="" \
  "${SIGN_SETTINGS[@]}" \
  -quiet \
  build

APP_PATH="$WORK_DIR/build/Build/Products/Release/$APP_NAME.app"
codesign --verify --deep --strict "$APP_PATH"

mkdir "$WORK_DIR/dmg"
cp -R "$APP_PATH" "$WORK_DIR/dmg/"
ln -s /Applications "$WORK_DIR/dmg/Applications"
hdiutil create \
  -volname "$APP_NAME" \
  -srcfolder "$WORK_DIR/dmg" \
  -fs HFS+ \
  -format UDZO \
  -ov \
  "$OUTPUT_DMG"

if [ -z "$IDENTITY" ]; then
  exit 0
fi

codesign --force --timestamp --sign "$IDENTITY" "$OUTPUT_DMG"

if [ -z "${APPLE_API_KEY_P8_BASE64:-}" ] || [ -z "${APPLE_API_KEY_ID:-}" ] || [ -z "${APPLE_API_ISSUER_ID:-}" ]; then
  echo "没有配置公证用的 API Key，跳过公证"
  exit 0
fi

API_KEY_PATH="$WORK_DIR/AuthKey.p8"
printf '%s' "$APPLE_API_KEY_P8_BASE64" | base64 --decode > "$API_KEY_PATH"
NOTARY_AUTH=(--key "$API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID")
NOTARY_RESULT="$(xcrun notarytool submit "$OUTPUT_DMG" "${NOTARY_AUTH[@]}" --wait --output-format json)"
NOTARY_STATUS="$(printf '%s' "$NOTARY_RESULT" | node -p "JSON.parse(require('fs').readFileSync(0)).status")"
if [ "$NOTARY_STATUS" != "Accepted" ]; then
  echo "公证没有通过：$NOTARY_STATUS"
  xcrun notarytool log "$(printf '%s' "$NOTARY_RESULT" | node -p "JSON.parse(require('fs').readFileSync(0)).id")" "${NOTARY_AUTH[@]}"
  exit 1
fi
xcrun stapler staple "$OUTPUT_DMG"
spctl --assess --type open --context context:primary-signature --verbose "$OUTPUT_DMG"
