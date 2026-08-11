#!/bin/bash
set -e

WORKSPACE_DIR="/home/zarvis/Desktop/focus/KhetSmart"
TOOLS_DIR="$WORKSPACE_DIR/android-build-tools"
mkdir -p "$TOOLS_DIR"

echo "=== Setting up self-contained Android build environment in $TOOLS_DIR ==="

# 1. Download and Extract JDK 21
JDK_DIR="$TOOLS_DIR/jdk-21"
if [ ! -d "$JDK_DIR" ]; then
    echo "Downloading OpenJDK 21..."
    JDK_URL="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.3%2B9/OpenJDK21U-jdk_x64_linux_hotspot_21.0.3_9.tar.gz"
    wget -q --show-progress "$JDK_URL" -O "$TOOLS_DIR/jdk21.tar.gz"
    echo "Extracting OpenJDK 21..."
    mkdir -p "$JDK_DIR"
    tar -xzf "$TOOLS_DIR/jdk21.tar.gz" -C "$JDK_DIR" --strip-components=1
    rm "$TOOLS_DIR/jdk21.tar.gz"
    echo "OpenJDK 21 setup complete."
else
    echo "OpenJDK 21 already exists."
fi

# 2. Download and Extract Android Command Line Tools
SDK_DIR="$TOOLS_DIR/android-sdk"
if [ ! -d "$SDK_DIR/cmdline-tools/latest" ]; then
    echo "Downloading Android Command Line Tools..."
    CMD_LINE_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    wget -q --show-progress "$CMD_LINE_URL" -O "$TOOLS_DIR/cmdline-tools.zip"
    echo "Extracting Android Command Line Tools..."
    mkdir -p "$SDK_DIR/cmdline-tools"
    unzip -q "$TOOLS_DIR/cmdline-tools.zip" -d "$SDK_DIR/cmdline-tools"
    mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
    rm "$TOOLS_DIR/cmdline-tools.zip"
    echo "Android Command Line Tools setup complete."
else
    echo "Android Command Line Tools already exist."
fi

# 3. Export Environment Variables for Setup
export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$SDK_DIR"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Verify java and sdkmanager
echo "Java Version:"
java -version
echo "Sdkmanager Version:"
sdkmanager --version

# 4. Accept Android SDK Licenses
echo "Accepting Android SDK licenses..."
yes | sdkmanager --licenses

# 5. Install Android SDK platforms and build tools
echo "Installing platform-tools, build-tools;34.0.0, and platforms;android-34..."
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

echo "=== Android build environment setup complete! ==="
