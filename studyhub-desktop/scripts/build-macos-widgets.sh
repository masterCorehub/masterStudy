#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NATIVE_DIR="$PROJECT_DIR/native/macos"
BUILD_DIR="$NATIVE_DIR/build"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/campusflow-widgets.XXXXXX")"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
ARCHS="${CAMPUSFLOW_MAC_ARCHS:-arm64 x86_64}"
SIGN_IDENTITY="${CAMPUSFLOW_CODESIGN_IDENTITY:--}"
trap 'rm -rf "$STAGING_DIR"' EXIT

mkdir -p "$STAGING_DIR/CampusFlowWidgets.appex/Contents/MacOS" "$STAGING_DIR/architectures"
cp "$NATIVE_DIR/CampusFlowWidgets/Info.plist" "$STAGING_DIR/CampusFlowWidgets.appex/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable CampusFlowWidgets" "$STAGING_DIR/CampusFlowWidgets.appex/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.studyhub.desktop.widgets" "$STAGING_DIR/CampusFlowWidgets.appex/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundlePackageType XPC!" "$STAGING_DIR/CampusFlowWidgets.appex/Contents/Info.plist"

widget_bins=()
bridge_bins=()
journal_bridge_bins=()
for arch in $ARCHS; do
  widget_bin="$STAGING_DIR/architectures/CampusFlowWidgets-$arch"
  bridge_bin="$STAGING_DIR/architectures/CampusFlowWidgetBridge-$arch"
  journal_bridge_bin="$STAGING_DIR/architectures/StudyHubJournalBridge-$arch"
  xcrun swiftc -sdk "$SDK_PATH" -target "$arch-apple-macos14.0" -parse-as-library -O \
    "$NATIVE_DIR/Shared/CampusFlowWidgetState.swift" \
    "$NATIVE_DIR/CampusFlowWidgets/CampusFlowWidgets.swift" \
    -framework SwiftUI -framework WidgetKit -o "$widget_bin"
  xcrun swiftc -sdk "$SDK_PATH" -target "$arch-apple-macos14.0" -O \
    "$NATIVE_DIR/Shared/CampusFlowWidgetState.swift" \
    "$NATIVE_DIR/CampusFlowWidgetBridge/main.swift" \
    -framework WidgetKit -o "$bridge_bin"
  xcrun swiftc -sdk "$SDK_PATH" -target "$arch-apple-macos14.0" -O \
    "$NATIVE_DIR/StudyHubJournalBridge/main.swift" \
    -framework AppKit -o "$journal_bridge_bin"
  widget_bins+=("$widget_bin")
  bridge_bins+=("$bridge_bin")
  journal_bridge_bins+=("$journal_bridge_bin")
done

xcrun lipo -create "${widget_bins[@]}" -output "$STAGING_DIR/CampusFlowWidgets.appex/Contents/MacOS/CampusFlowWidgets"
xcrun lipo -create "${bridge_bins[@]}" -output "$STAGING_DIR/CampusFlowWidgetBridge"
xcrun lipo -create "${journal_bridge_bins[@]}" -output "$STAGING_DIR/StudyHubJournalBridge"
chmod +x "$STAGING_DIR/CampusFlowWidgets.appex/Contents/MacOS/CampusFlowWidgets" "$STAGING_DIR/CampusFlowWidgetBridge" "$STAGING_DIR/StudyHubJournalBridge"
xattr -cr "$STAGING_DIR/CampusFlowWidgets.appex" "$STAGING_DIR/CampusFlowWidgetBridge" "$STAGING_DIR/StudyHubJournalBridge"

codesign --force --sign "$SIGN_IDENTITY" --entitlements "$NATIVE_DIR/CampusFlowWidgetBridge/CampusFlowWidgetBridge.entitlements" "$STAGING_DIR/CampusFlowWidgetBridge"
codesign --force --sign "$SIGN_IDENTITY" "$STAGING_DIR/StudyHubJournalBridge"
codesign --force --sign "$SIGN_IDENTITY" --entitlements "$NATIVE_DIR/CampusFlowWidgets/CampusFlowWidgets.entitlements" "$STAGING_DIR/CampusFlowWidgets.appex"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
ditto "$STAGING_DIR/CampusFlowWidgets.appex" "$BUILD_DIR/CampusFlowWidgets.appex"
cp "$STAGING_DIR/CampusFlowWidgetBridge" "$BUILD_DIR/CampusFlowWidgetBridge"
cp "$STAGING_DIR/StudyHubJournalBridge" "$BUILD_DIR/StudyHubJournalBridge"

echo "Widgets compilados em $BUILD_DIR"
