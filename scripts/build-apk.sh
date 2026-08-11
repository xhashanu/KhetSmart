#!/bin/bash
set -e

WORKSPACE_DIR="/home/zarvis/Desktop/focus/KhetSmart"
TOOLS_DIR="$WORKSPACE_DIR/android-build-tools"
ANDROID_PROJ_DIR="$WORKSPACE_DIR/frontend/android"

# 1. Set environment variables
export JAVA_HOME="$TOOLS_DIR/jdk-21"
export ANDROID_HOME="$TOOLS_DIR/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "=== System Info ==="
echo "Java path: $(which java)"
echo "Java version:"
java -version

echo "Android Home: $ANDROID_HOME"

# 2. Sync / copy assets to Android
echo "Syncing Capacitor assets..."
cd "$WORKSPACE_DIR/frontend"
npx cap sync android

# 3. Build APK using Gradle
echo "Building APK..."
cd "$ANDROID_PROJ_DIR"
chmod +x gradlew
./gradlew assembleDebug

# 4. Copy generated APK to root workspace directory
DEBUG_APK_SRC="$ANDROID_PROJ_DIR/app/build/outputs/apk/debug/app-debug.apk"
DEST_APK="$WORKSPACE_DIR/khetsmart.apk"

if [ -f "$DEBUG_APK_SRC" ]; then
    cp "$DEBUG_APK_SRC" "$DEST_APK"
    echo "=== APK Successfully Built! ==="
    echo "You can find your APK file at: $DEST_APK"
else
    echo "Error: APK file was not found at $DEBUG_APK_SRC"
    exit 1
fi
