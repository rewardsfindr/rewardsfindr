# OAuth Fix - Switch to Development Build

## Problem Identified

The OAuth redirect URI mismatch is caused by using **Expo Go**, which always uses `exp://` scheme regardless of `app.json` configuration.

**Current (broken):** `exp://192.168.0.103:8081`  
**Expected:** `https://auth.expo.io/@rewardsfindr/rewardsfindr`

Expo Go cannot use the proxy redirect URI because it doesn't respect `owner` and `scheme` in `app.json`.

## Solution Options

### Option 1: Use Development Build (Recommended)

A development build respects `app.json` settings and will use the correct redirect URI.

**Steps:**

1. **Install EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo:**
   ```bash
   eas login
   ```

3. **Configure EAS project:**
   ```bash
   cd mobile
   eas init
   ```
   - This will create an EAS project ID and update `app.json`

4. **Build development build for Android:**
   ```bash
   eas build --profile development --platform android
   ```
   - This takes 10-15 minutes
   - You'll get a download link when done

5. **Install on emulator:**
   ```bash
   # Download the APK from the link
   adb install path/to/downloaded.apk
   ```

6. **Start dev server:**
   ```bash
   npx expo start --dev-client
   ```

7. **Open app on emulator** - it will connect and use the correct redirect URI

### Option 2: Add Local Redirect URI (Quick Workaround)

Add your local `exp://` URL to Google Cloud Console as an authorized redirect URI.

**Steps:**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project: `rewardsfindr-dev`
3. Go to: **APIs & Services** → **Credentials**
4. Click on your OAuth 2.0 Client ID: `963869613685-7u94c53t5grma47e1qnt5b0hucfa3bi5`
5. Under **Authorized redirect URIs**, add:
   ```
   exp://192.168.0.103:8081
   ```
   ⚠️ **Note:** You'll need to update this every time your IP changes

6. Click **Save**

7. Restart the app and try login again

### Option 3: Use Web Testing (Temporary)

Test OAuth on web instead of mobile temporarily.

```bash
cd mobile
npx expo start
# Press 'w' to open in browser
```

Web uses `http://localhost:8081` which is already in your redirect URIs.

## Recommended Approach

**For development:** Use Option 2 (add local redirect URI) - quickest fix  
**For production:** Use Option 1 (development build) - proper solution

## Why This Happened

The OAuth was working before because:
- You were likely using a different setup (web browser, or different IP)
- Or your previous Google OAuth config had a wildcard/different redirect URI

It broke today because:
- Adding `react-native-webview` didn't break OAuth directly
- But you may have cleared app data / restarted emulator
- The `exp://` URL changed or was never properly configured

## Next Steps

1. Choose Option 2 (quick fix) to unblock development
2. Continue working on the WebView sync feature
3. Later, set up EAS development build for proper testing

---

**Current Status:** Waiting for you to add `exp://192.168.0.103:8081` to Google Cloud Console redirect URIs.
