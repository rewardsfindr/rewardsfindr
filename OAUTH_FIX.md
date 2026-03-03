# OAuth Fix - Development Build Required

## Problem Identified

**Root cause:** Google OAuth doesn't allow `exp://` redirect URIs (Expo Go scheme). You must use a development build with the proper `https://auth.expo.io/@rewardsfindr/rewardsfindr` redirect URI.

**Current (Expo Go - broken):** `exp://192.168.0.103:8081` ❌  
**Required:** `https://auth.expo.io/@rewardsfindr/rewardsfindr` ✅

## Solution: Build Local Development APK

I've added the necessary configuration. Follow these steps:

### Step 1: Install Dependencies

```bash
cd mobile
npm install
```

This installs `expo-dev-client` which enables development builds.

### Step 2: Build Local Development APK

You can build locally without EAS cloud (faster, no account needed):

```bash
# Option A: Local build (faster, ~5 minutes)
npm run build:dev

# OR Option B: If above fails, use npx directly
npx expo run:android
```

**What happens:**
- Builds a debug APK with development client
- Automatically installs on your emulator
- Takes ~5-10 minutes first time
- Uses gradle to compile locally

### Step 3: Start Dev Server

```bash
npm run start:dev
# OR: npx expo start --dev-client
```

### Step 4: Open App

- The development build will automatically open
- It looks like Expo Go but respects your `app.json` settings
- OAuth will now use the correct redirect URI: `https://auth.expo.io/@rewardsfindr/rewardsfindr`

## Alternative: Use EAS Cloud Build

If local build doesn't work:

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login (create free account if needed)
eas login

# 3. Initialize project
eas init

# 4. Build development APK
eas build --profile development --platform android

# Wait 10-15 minutes, then download and install the APK
```

## Why This is Necessary

**Expo Go limitations:**
- Always uses `exp://` scheme
- Cannot customize redirect URIs
- Google blocks non-HTTPS schemes
- Fine for simple apps, not OAuth

**Development build:**
- Custom native code (including WebView)
- Respects `owner` and `scheme` in app.json
- Uses Expo's auth proxy: `https://auth.expo.io`
- Required for production anyway

## What Changed Today

The OAuth probably worked before if:
- You tested on web (uses `http://localhost:8081`)
- Used a previous Expo SDK that handled this differently
- Had different Google OAuth settings

Today it broke because:
- Testing on Android with Expo Go for the first time
- Google's OAuth policies reject `exp://` schemes

## Next Steps

1. ✅ Pull the latest branch: `git pull origin fix/oauth-webview-conflict`
2. ✅ Install dependencies: `cd mobile && npm install`
3. 🛠️ Build development APK: `npm run build:dev` or `npx expo run:android`
4. 🚀 Start dev server: `npm run start:dev`
5. ✅ Test OAuth login - should work now!

## Troubleshooting

**If `npm run build:dev` fails:**
```bash
# Make sure Android SDK is installed
# Set ANDROID_HOME environment variable
# Then try:
npx expo run:android
```

**If build takes too long:**
```bash
# Use EAS cloud build instead (free tier available)
eas build --profile development --platform android
```

**If OAuth still fails:**
- Check Metro logs for the redirect URI being used
- Verify `app.json` has `owner: "rewardsfindr"` and `scheme: "rewardsfindr"`
- Confirm Google Console has `https://auth.expo.io/@rewardsfindr/rewardsfindr`

---

**Current branch:** `fix/oauth-webview-conflict`  
**Ready to build:** Yes, all config added
