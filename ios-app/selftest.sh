#!/bin/bash
# selftest.sh: tries prepare.sh on a made-up copy of what `npx cap add ios` produces,
# in a temporary folder, so a mistake in the recipe shows up in seconds (and on any Mac)
# instead of in the middle of a 15-minute build. It touches nothing in the repository.
#
#   bash ios-app/selftest.sh
#
# The made-up project follows Capacitor 8's template (Info.plist, the app icon and
# launch-screen image sets, an Xcode project file in the older, line-by-line style).
# It is only as good as that copy: the real run is what proves the real template.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/greenroom-selftest.XXXXXX")"
trap '[ -n "${SELFTEST_KEEP:-}" ] && echo "selftest: kept $T" || rm -rf "$T"' EXIT   # SELFTEST_KEEP=1 keeps the folder to look at

mkdir -p "$T/repo/ios-app" "$T/repo/docs/vendor"
cp -R "$HERE/prepare.sh" "$HERE/capacitor.config.json" "$HERE/package.json" "$HERE/assets" "$HERE/tools" "$HERE/native" "$T/repo/ios-app/"

# ---- a made-up built website -----------------------------------------------------------
D="$T/repo/docs"
cat > "$D/index.html" <<'EOF'
<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'sha256-abc='; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' https://example.supabase.co wss://example.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self'; manifest-src 'self'">
<title>Greenroom</title></head><body>
<script>if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {}</script>
</body></html>
EOF
for f in core.js backend.js statements.js privacy.html config.js; do echo "// $f" > "$D/$f"; done
cat > "$D/app.js" <<'EOF'
var mod = await import('./vendor/pdf.min.mjs');
mod.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;
EOF
echo "// pdf" > "$D/vendor/pdf.min.mjs"; echo "// worker" > "$D/vendor/pdf.worker.min.mjs"
echo x > "$D/sw.js"; echo x > "$D/classic.html"; echo x > "$D/app.html"; echo x > "$D/add-20260101-000000.html"
echo x > "$D/add-classic-20260101-000000.html"; echo x > "$D/icontest.html"; echo x > "$D/icon-test.png"; touch "$D/.nojekyll"
echo x > "$D/logo-full.png"; echo x > "$D/manifest.webmanifest"

# ---- a made-up generated iOS project ---------------------------------------------------
A="$T/repo/ios-app/ios/App/App"
mkdir -p "$A/Assets.xcassets/AppIcon.appiconset" "$A/Assets.xcassets/Splash.imageset" "$A/Base.lproj" "$T/repo/ios-app/ios/App/App.xcodeproj"
cat > "$A/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CAPACITOR_DEBUG</key>
	<string>$(CAPACITOR_DEBUG)</string>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>My App</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>UIApplicationSceneManifest</key>
	<dict>
		<key>UIApplicationSupportsMultipleScenes</key>
    <false/>
    <key>UISceneConfigurations</key>
    <dict>
      <key>UIWindowSceneSessionRoleApplication</key>
      <array>
        <dict>
            <key>UISceneConfigurationName</key>
            <string>Default Configuration</string>
            <key>UISceneDelegateClassName</key>
            <string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
            <key>UISceneStoryboardFile</key>
            <string>Main</string>
        </dict>
      </array>
    </dict>
	</dict>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIMainStoryboardFile</key>
	<string>Main</string>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>armv7</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<true/>
</dict>
</plist>
EOF
cat > "$A/Assets.xcassets/AppIcon.appiconset/Contents.json" <<'EOF'
{"images":[{"filename":"AppIcon-512@2x.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}
EOF
echo old > "$A/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
for n in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do echo old > "$A/Assets.xcassets/Splash.imageset/$n"; done
cat > "$A/Base.lproj/LaunchScreen.storyboard" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0">
    <scenes><scene sceneID="EHf-IW-A2E"><objects>
        <viewController id="01J-lp-oVM"><view key="view" id="Ze5-6b-2t3">
            <color key="backgroundColor" systemColor="systemBackgroundColor"/>
        </view></viewController>
    </objects></scene></scenes>
</document>
EOF
# The project file, the scene and app delegates and the main storyboard are Capacitor 8.5.3's own (its iOS template,
# ios-app/tools/fixtures), so the day bar's project edit is tried on the real thing.
cp "$HERE/tools/fixtures/capacitor8-project.pbxproj" "$T/repo/ios-app/ios/App/App.xcodeproj/project.pbxproj"
cp "$HERE/tools/fixtures/capacitor8-SceneDelegate.swift" "$A/SceneDelegate.swift"
cp "$HERE/tools/fixtures/capacitor8-AppDelegate.swift" "$A/AppDelegate.swift"
cp "$HERE/tools/fixtures/capacitor8-Main.storyboard" "$A/Base.lproj/Main.storyboard"
# what `cap sync` would have put inside the project
mkdir -p "$A/public"; cp -R "$D/." "$A/public/" 2>/dev/null || true
cp "$T/repo/ios-app/capacitor.config.json" "$A/capacitor.config.json" 2>/dev/null || true

# ---- run the recipe ---------------------------------------------------------------------
cd "$T/repo/ios-app"
export APP_ID="com.example.selftest" APP_NAME="Self Test: Tour Crew" BUILD_NUMBER=42 MARKETING_VERSION=1.0.0
# (Pushes off unless a check below says otherwise, whatever the real build's DAYBAR_PUSH is.)
export DAYBAR_PUSH=0
bash prepare.sh names
bash prepare.sh web

fail=0
ok()  { echo "  ok    $1"; }
bad() { echo "  FAIL  $1"; fail=1; }
[ ! -e www/sw.js ] && [ ! -e www/classic.html ] && [ ! -e www/app.html ] && ! ls www/add-*.html >/dev/null 2>&1 && ok "web copy leaves out the Home Screen helper pages and the service worker" || bad "web copy kept a file it should drop"
[ -f www/vendor/pdf.min.js ] && [ -f www/vendor/pdf.worker.min.js ] && [ ! -e www/vendor/pdf.min.mjs ] && ok "PDF reader files renamed to .js" || bad "PDF reader files not renamed"
! grep -q '\.mjs' www/app.js && grep -q "vendor/pdf.min.js" www/app.js && grep -q "vendor/pdf.worker.min.js" www/app.js && ok "app.js copy names the renamed files" || bad "app.js copy not rewritten"
[ -f "$D/vendor/pdf.min.mjs" ] && grep -q "pdf.min.mjs" "$D/app.js" && ok "the website's own files are untouched" || bad "the website's files changed"
grep -q "default-src 'self' capacitor://localhost;" www/index.html && grep -q "connect-src 'self' capacitor://localhost https://example.supabase.co" www/index.html && ok "the app copy's policy names capacitor://localhost" || bad "policy not extended"
! grep -q "capacitor://localhost" "$D/index.html" && ok "the website's own policy is untouched" || bad "the website's policy changed"
python3 -c "import json;c=json.load(open('capacitor.config.json'));assert c['appId']=='com.example.selftest' and c['appName']=='Self Test: Tour Crew' and c['webDir']=='www' and 'server' not in c" && ok "capacitor.config.json carries the names" || bad "capacitor.config.json wrong"

# the "web" step's own checks need the copy to sit inside the iOS project too (cap sync does that)
rm -rf "$A/public" && mkdir -p "$A/public" && cp -R www/. "$A/public/"
cp capacitor.config.json "$A/capacitor.config.json"
# ...and `cap sync` lists the plugins it found in packageClassList (iOS registers only those). It would list the App plugin
# (@capacitor/app, which hears greenroom://plaid-done), the file and share plugins (@capacitor/filesystem and
# @capacitor/share: Budget History's PDF and Spreadsheet go to the phone's share sheet) and the status bar one.
python3 - "$A/capacitor.config.json" <<'PYX'
import json, sys
p = sys.argv[1]
c = json.load(open(p))
c['packageClassList'] = ['AppPlugin', 'FilesystemPlugin', 'PushNotificationsPlugin', 'SharePlugin', 'StatusBarPlugin']
json.dump(c, open(p, 'w'), indent='\t')
PYX

bash prepare.sh ios
bash prepare.sh check

PL="$A/Info.plist"
plutil -lint "$PL" >/dev/null && ok "Info.plist is a valid plist" || bad "Info.plist invalid"
# greenroom:// really is in the Info.plist (one URL type, one scheme), and `check` refuses a project that lost it
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0' "$PL")" = "greenroom" ] && ok "the greenroom:// scheme is in the Info.plist" || bad "greenroom:// scheme missing"
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleTypeRole' "$PL")" = "Editor" ] && ok "URL type role is Editor" || bad "URL type role"
cp "$PL" "$PL.keep"
/usr/libexec/PlistBuddy -c 'Delete :CFBundleURLTypes' "$PL" >/dev/null
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed on a project with no URL scheme" || ok "check refuses a project that lost the greenroom:// scheme"
mv "$PL.keep" "$PL"
# the App plugin (what delivers greenroom://plaid-done to the page) and the file and share plugins (the summary's PDF
# and Spreadsheet) are each pinned to an exact version on the Capacitor 8 line ...
for pkg in @capacitor/app @capacitor/filesystem @capacitor/share; do
python3 - "$pkg" <<'PYX' && ok "$pkg is pinned to an exact Capacitor 8 version" || bad "$pkg pin"
import json, re, sys
d = json.load(open('package.json'))['dependencies']
v = d.get(sys.argv[1], '')
assert re.match(r'^8\.\d+\.\d+$', v), 'not pinned to an exact 8.x.y: %r' % v
assert d['@capacitor/core'].split('.')[0] == '8'
PYX
done
# ... and must be listed by cap sync, or iOS never registers it
cp "$A/capacitor.config.json" "$A/capacitor.config.json.keep"
python3 - "$A/capacitor.config.json" <<'PYX'
import json, sys
p = sys.argv[1]
c = json.load(open(p))
c['packageClassList'] = ['StatusBarPlugin']
json.dump(c, open(p, 'w'))
PYX
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with the App plugin missing from cap sync's list" || ok "check refuses a project where cap sync did not list the App plugin"
# ... and so must the file and share plugins, each one (without either, the PDF and Spreadsheet buttons cannot hand a file over)
for gone in FilesystemPlugin SharePlugin; do
python3 - "$A/capacitor.config.json" "$gone" <<'PYX'
import json, sys
p = sys.argv[1]
c = json.load(open(p))
c['packageClassList'] = [x for x in ['AppPlugin', 'FilesystemPlugin', 'SharePlugin', 'StatusBarPlugin'] if x != sys.argv[2]]
json.dump(c, open(p, 'w'))
PYX
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with $gone missing from cap sync's list" || ok "check refuses a project where cap sync did not list $gone"
done
mv "$A/capacitor.config.json.keep" "$A/capacitor.config.json"
bash prepare.sh check >/dev/null && ok "check passes again once they are all back" || bad "check does not pass after restoring"
# ---- phone alerts (0201): the push plugin, pinned on the Capacitor 8 line, listed by cap sync, and handed Apple's token
python3 - <<'PYX' && ok "@capacitor/push-notifications is pinned to an exact Capacitor 8 version" || bad "@capacitor/push-notifications pin"
import json, re
d = json.load(open('package.json'))['dependencies']
assert re.match(r'^8\.\d+\.\d+$', d.get('@capacitor/push-notifications', '')), d
PYX
python3 -c "import json;c=json.load(open('capacitor.config.json'));assert c['plugins']['PushNotifications']['presentationOptions']==['banner','list','sound']" \
  && ok "an alert shows while the app is open (presentationOptions survive the web step)" || bad "push presentationOptions"
cp "$A/capacitor.config.json" "$A/capacitor.config.json.keep"
python3 - "$A/capacitor.config.json" <<'PYX'
import json, sys
p = sys.argv[1]
c = json.load(open(p))
c['packageClassList'] = ['AppPlugin', 'StatusBarPlugin']
json.dump(c, open(p, 'w'))
PYX
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with the push plugin missing from cap sync's list" || ok "check refuses a project where cap sync did not list the push plugin"
mv "$A/capacitor.config.json.keep" "$A/capacitor.config.json"
[ "$(grep -c 'post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)' "$A/AppDelegate.swift")" = "1" ] \
  && [ "$(grep -c 'post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)' "$A/AppDelegate.swift")" = "1" ] \
  && grep -A24 'didRegisterForRemoteNotificationsWithDeviceToken' "$A/AppDelegate.swift" | grep -q 'func applicationWillResignActive' \
  && ok "the AppDelegate hands Apple's token (or the failure) to the push plugin, inside the class" || bad "AppDelegate push hand-over"
cp "$A/AppDelegate.swift" "$A/AppDelegate.swift.keep"
grep -v 'capacitorDid' "$A/AppDelegate.swift.keep" > "$A/AppDelegate.swift"
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with an AppDelegate that never hands the token over" || ok "check refuses an AppDelegate without the push hand-over"
mv "$A/AppDelegate.swift.keep" "$A/AppDelegate.swift"
bash prepare.sh check >/dev/null && ok "check passes again" || bad "check after restoring the AppDelegate"
[ "$(/usr/libexec/PlistBuddy -c 'Print :UIRequiredDeviceCapabilities:0' "$PL")" = "arm64" ] && ok "arm64 only" || bad "device capabilities"
[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleURLName' "$PL")" = "com.example.selftest" ] && ok "URL type named for the app" || bad "URL type"
/usr/libexec/PlistBuddy -c 'Print :NSLocationWhenInUseUsageDescription' "$PL" | grep -q "not saved or sent" && ok "location string in place" || bad "location string"
# (Holding a finger on a flyer or a profile picture gives iOS's menu with its save button: without these words, that closes the app.)
/usr/libexec/PlistBuddy -c 'Print :NSPhotoLibraryAddUsageDescription' "$PL" | grep -q "only when you choose Save" && ok "save-to-Photos string in place" || bad "NSPhotoLibraryAddUsageDescription"
cp "$PL" "$PL.keep"
/usr/libexec/PlistBuddy -c 'Delete :NSPhotoLibraryAddUsageDescription' "$PL" >/dev/null
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with no save-to-Photos words" || ok "check refuses a project without the save-to-Photos words"
mv "$PL.keep" "$PL"
[ "$(sips -g pixelWidth "$A/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png" | awk '/pixelWidth/{print $2}')" = "1024" ] && ok "icon replaced with the 1024 art" || bad "icon not replaced"
[ "$(sips -g pixelWidth "$A/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png" | awk '/pixelWidth/{print $2}')" = "2732" ] && ok "launch pictures replaced with black" || bad "launch picture not replaced"
grep -q 'red="0.0" green="0.0" blue="0.0"' "$A/Base.lproj/LaunchScreen.storyboard" && ok "launch storyboard background is black" || bad "storyboard background"
P="$T/repo/ios-app/ios/App/App.xcodeproj/project.pbxproj"
[ "$(grep -c 'PrivacyInfo.xcprivacy' "$P")" = "8" ] && ok "privacy manifests filed in 8 places (the app's and the DayBar extension's: file reference, build file, group, Resources phase each)" || bad "privacy manifest lines: $(grep -c 'PrivacyInfo.xcprivacy' "$P")"
plutil -lint "$A/../DayBar/PrivacyInfo.xcprivacy" >/dev/null \
  && [ "$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPIType' "$A/../DayBar/PrivacyInfo.xcprivacy")" = "NSPrivacyAccessedAPICategoryUserDefaults" ] \
  && [ "$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPITypeReasons:0' "$A/../DayBar/PrivacyInfo.xcprivacy")" = "CA92.1" ] \
  && [ "$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyTracking' "$A/../DayBar/PrivacyInfo.xcprivacy")" = "false" ] \
  && ok "the DayBar extension's own privacy manifest is in its folder: UserDefaults (CA92.1), no tracking" || bad "DayBar privacy manifest"
# The app's privacy manifest reads the way Apple reads it (every type its own dict, every purpose a string), and declares
# Device ID (Apple's push tokens, kept with the account), linked, no tracking, to run the app.
python3 tools/check_privacy.py "$A/PrivacyInfo.xcprivacy" >/dev/null && ok "the app's privacy manifest parses: every collected type its own dict, every purpose a string" || bad "app privacy manifest"
python3 - "$A/PrivacyInfo.xcprivacy" <<'PYX' && ok "the app's privacy manifest declares Device ID (linked, no tracking, App Functionality)" || bad "Device ID in the privacy manifest"
import plistlib, sys
t = [x for x in plistlib.load(open(sys.argv[1], 'rb'))['NSPrivacyCollectedDataTypes'] if x['NSPrivacyCollectedDataType'] == 'NSPrivacyCollectedDataTypeDeviceID']
assert len(t) == 1 and t[0]['NSPrivacyCollectedDataTypeLinked'] is True and t[0]['NSPrivacyCollectedDataTypeTracking'] is False, t
assert t[0]['NSPrivacyCollectedDataTypePurposes'] == ['NSPrivacyCollectedDataTypePurposeAppFunctionality'], t
PYX
# (Oct 22: three types had slipped inside User ID's purposes list; the file still passed plutil -lint.)
cp "$A/PrivacyInfo.xcprivacy" "$T/app-privacy.keep"
python3 - "$A/PrivacyInfo.xcprivacy" <<'PYX'
import plistlib, sys
p = sys.argv[1]
d = plistlib.load(open(p, 'rb'))
ts = d['NSPrivacyCollectedDataTypes']
ts[-4]['NSPrivacyCollectedDataTypePurposes'] += ts[-3:]
del ts[-3:]
plistlib.dump(d, open(p, 'wb'))
PYX
plutil -lint "$A/PrivacyInfo.xcprivacy" >/dev/null && ! ( bash prepare.sh check ) >/dev/null 2>&1 \
  && ok "check refuses a privacy manifest with types dropped inside another type's purposes (though it lints)" || bad "check passed a mis-nested privacy manifest"
mv "$T/app-privacy.keep" "$A/PrivacyInfo.xcprivacy"
bash prepare.sh check >/dev/null && ok "check passes again once the manifest is put back" || bad "check after restoring the privacy manifest"
[ "$(grep -c 'TARGETED_DEVICE_FAMILY = 1;' "$P")" = "4" ] && ! grep -q 'TARGETED_DEVICE_FAMILY = "1,2";' "$P" && ok "iPhone only in both configurations of both targets (the app and the day bar)" || bad "device family"
grep -q 'PRODUCT_BUNDLE_IDENTIFIER = com.example.selftest;' "$P" && grep -q 'CURRENT_PROJECT_VERSION = 42;' "$P" && grep -q 'MARKETING_VERSION = 1.0.0;' "$P" && ok "bundle ID, version and build number set" || bad "ids/numbers"

# running the project edit a second time must not file the manifest twice
python3 tools/edit_xcodeproj.py "$P" --add-resource PrivacyInfo.xcprivacy >/dev/null
[ "$(grep -c 'PrivacyInfo.xcprivacy' "$P")" = "8" ] && ok "a second run changes nothing" || bad "second run duplicated lines"

# ---- the lock-screen day bar ------------------------------------------------------------
grep -q 'PRODUCT_BUNDLE_IDENTIFIER = com.example.selftest.DayBar;' "$P" && [ "$(grep -c 'PRODUCT_BUNDLE_IDENTIFIER = com.example.selftest;' "$P")" = "2" ] \
  && ok "the day bar extension has its own bundle ID (the app's plus .DayBar), the app keeps its own" || bad "day bar bundle IDs"
[ "$(grep -c 'CURRENT_PROJECT_VERSION = 42;' "$P")" = "4" ] && [ "$(grep -c 'MARKETING_VERSION = 1.0.0;' "$P")" = "4" ] \
  && ok "the extension carries the app's version and build number" || bad "extension version/build"
grep -q 'GreenroomViewController()' "$A/SceneDelegate.swift" && ! grep -q 'CAPBridgeViewController()' "$A/SceneDelegate.swift" \
  && ok "the scene makes GreenroomViewController (which registers the DayBar plugin)" || bad "scene delegate not pointed at GreenroomViewController"
grep -q 'customClass="GreenroomViewController" customModule="App"' "$A/Base.lproj/Main.storyboard" && ok "Main.storyboard names it too" || bad "storyboard"
[ "$(grep -c 'DayBarLaunch.start()' "$A/AppDelegate.swift")" = "1" ] && ! grep -q 'Override point for customization after application launch' "$A/AppDelegate.swift" \
  && grep -B2 'DayBarLaunch.start()' "$A/AppDelegate.swift" | grep -q 'didFinishLaunchingWithOptions' \
  && ok "the app's launch starts the day bar's token listener (once, in didFinishLaunching)" || bad "AppDelegate hook"
[ "$(/usr/libexec/PlistBuddy -c 'Print :NSSupportsLiveActivities' "$PL")" = "true" ] && ok "Info.plist allows Live Activities" || bad "NSSupportsLiveActivities"
[ -f "$A/DayBarPlugin.swift" ] && [ -f "$A/DayBarAttributes.swift" ] && [ -f "$A/GreenroomViewController.swift" ] && [ -f "$A/../DayBar/DayBarWidgets.swift" ] \
  && ok "the day bar's Swift files are in place" || bad "day bar files"
! grep -q 'CODE_SIGN_ENTITLEMENTS' "$P" && ok "no push permission asked for while DAYBAR_PUSH is off" || bad "entitlements set with pushes off"
appex_lines=$(grep -c 'DayBar.appex' "$P")
python3 tools/edit_xcodeproj.py "$P" --bundle-id com.example.selftest --marketing-version 1.0.0 --build-number 42 --add-daybar com.example.selftest.DayBar >/dev/null
[ "$(grep -c 'DayBar.appex' "$P")" = "$appex_lines" ] && python3 tools/check_daybar.py "$P" com.example.selftest 1.0.0 42 >/dev/null \
  && ok "adding the day bar a second time changes nothing, and the app's bundle ID never lands on the extension" || bad "second day bar run"
cp "$A/AppDelegate.swift" "$A/AppDelegate.swift.keep"
cp "$HERE/tools/fixtures/capacitor8-AppDelegate.swift" "$A/AppDelegate.swift"
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with an AppDelegate that never starts the token listener" || ok "check refuses an AppDelegate without the day bar's token listener"
mv "$A/AppDelegate.swift.keep" "$A/AppDelegate.swift"
cp "$A/SceneDelegate.swift" "$A/SceneDelegate.swift.keep"
cp "$HERE/tools/fixtures/capacitor8-SceneDelegate.swift" "$A/SceneDelegate.swift"
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with a scene that never registers the DayBar plugin" || ok "check refuses a scene that would not register the DayBar plugin"
mv "$A/SceneDelegate.swift.keep" "$A/SceneDelegate.swift"
cp "$P" "$P.keep"
python3 - "$P" <<'PYX'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace('PRODUCT_BUNDLE_IDENTIFIER = com.example.selftest.DayBar;', 'PRODUCT_BUNDLE_IDENTIFIER = com.example.selftest;', 1)
open(p, 'w').write(s)
PYX
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with the extension carrying the app's own bundle ID" || ok "check refuses an extension with the wrong bundle ID"
cp "$P.keep" "$P"
python3 - "$P" <<'PYX'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r'\n\t\t\t\t[0-9A-F]{24} /\* DayBar.appex in Embed Foundation Extensions \*/,', '', s, count=1)
open(p, 'w').write(s)
PYX
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with the extension not embedded in the app" || ok "check refuses an app that does not embed the extension"
cp "$P.keep" "$P"
# (The extension must bundle its own privacy manifest: Apple reads PlugIns/DayBar.appex on its own, ITMS-91053.)
python3 - "$P" <<'PYX'
import re, sys
p = sys.argv[1]
s = open(p).read()
m = re.search(r'\n\t\t[0-9A-F]{24} /\* Resources \*/ = \{\n\t\t\tisa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = \(\n(\t\t\t\t[0-9A-F]{24} /\* PrivacyInfo.xcprivacy in Resources \*/,\n)\t\t\t\);', s)
assert m, 'no Resources phase holding only PrivacyInfo.xcprivacy (the extension\'s)'
s = s[:m.start(1)] + s[m.end(1):]
open(p, 'w').write(s)
PYX
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with the extension not bundling its privacy manifest" || ok "check refuses an extension without its own privacy manifest"
cp "$P.keep" "$P"
cp "$A/../DayBar/PrivacyInfo.xcprivacy" "$T/daybar-privacy.keep"
/usr/libexec/PlistBuddy -c 'Delete :NSPrivacyAccessedAPITypes' "$A/../DayBar/PrivacyInfo.xcprivacy" >/dev/null
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with the extension's manifest not declaring UserDefaults" || ok "check refuses an extension manifest that does not declare UserDefaults"
mv "$T/daybar-privacy.keep" "$A/../DayBar/PrivacyInfo.xcprivacy"
mv "$P.keep" "$P"
bash prepare.sh check >/dev/null && ok "check passes again once the project is put back" || bad "check after restoring"
# ---- the alarms (Devin, Oct 22): iOS's question has its words, the quiet hand-over may wake the app, the AppDelegate passes
# it to the Alarms plugin, the scene registers the plugin, its files are in both targets as they should be, and the
# frameworks newer than iOS 15 are linked weakly (an older iPhone still opens the app).
/usr/libexec/PlistBuddy -c 'Print :NSAlarmKitUsageDescription' "$PL" | grep -q "30 minutes before your band’s set, 20 minutes before bus call, at bus call, and 15 minutes before the guest list’s last call" \
  && ok "the alarm question's words are in the Info.plist (all three alarms)" || bad "NSAlarmKitUsageDescription"
[ "$(/usr/libexec/PlistBuddy -c 'Print :UIBackgroundModes:0' "$PL")" = "remote-notification" ] && ok "the app may be woken by a quiet push" || bad "UIBackgroundModes"
[ "$(grep -c 'GreenroomAlarms.remote(userInfo, completionHandler)' "$A/AppDelegate.swift")" = "1" ] \
  && grep -A6 'didReceiveRemoteNotification userInfo' "$A/AppDelegate.swift" | grep -q 'func applicationWillResignActive' \
  && ok "the AppDelegate hands the server's alarms to the Alarms plugin, inside the class" || bad "AppDelegate alarms hand-over"
grep -q 'registerPluginInstance(AlarmsPlugin())' "$A/GreenroomViewController.swift" && [ -f "$A/AlarmsPlugin.swift" ] && [ -f "$A/BusAnswer.swift" ] \
  && ok "the Alarms plugin is registered, its files in place" || bad "Alarms plugin files"
# Only the app's own page reaches the plugins (2026-10-23): a spot card frames the website's place.html (Apple's place
# card), and Capacitor would hand a framed page's messages to the plugins too. The web view controller wraps the bridge's
# handler so a frame's message is dropped.
grep -q 'MainFrameOnlyBridge.install(on: bridge)' "$A/GreenroomViewController.swift" \
  && grep -q 'guard message.frameInfo.isMainFrame else { return }' "$A/GreenroomViewController.swift" \
  && grep -q 'content.removeScriptMessageHandler(forName: "bridge")' "$A/GreenroomViewController.swift" \
  && ok "only the app's own page reaches the plugins (a framed page's messages are dropped)" || bad "main-frame-only bridge guard"
[ "$(grep -c 'BusAnswer.swift in Sources' "$P")" = "4" ] && [ "$(grep -c 'AlarmsPlugin.swift in Sources' "$P")" = "2" ] \
  && ok "BusAnswer.swift is compiled by both targets, AlarmsPlugin.swift by the app alone" || bad "alarm files in the project: $(grep -c 'BusAnswer.swift in Sources' "$P") / $(grep -c 'AlarmsPlugin.swift in Sources' "$P")"
[ "$(grep -c '^					AlarmKit,$' "$P")" = "2" ] && [ "$(grep -c '^					AppIntents,$' "$P")" = "2" ] && [ "$(grep -c '^					ActivityKit,$' "$P")" = "2" ] \
  && ok "AlarmKit, AppIntents and ActivityKit are linked weakly in both app configurations" || bad "weak frameworks"
cp "$PL" "$PL.keep"
/usr/libexec/PlistBuddy -c 'Delete :NSAlarmKitUsageDescription' "$PL" >/dev/null
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with no alarm question words" || ok "check refuses a project without the alarm question's words"
mv "$PL.keep" "$PL"
cp "$A/AppDelegate.swift" "$A/AppDelegate.swift.keep"
grep -v 'GreenroomAlarms.remote' "$A/AppDelegate.swift.keep" > "$A/AppDelegate.swift"
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with an AppDelegate that never hands the alarms over" || ok "check refuses an AppDelegate without the alarms hand-over"
mv "$A/AppDelegate.swift.keep" "$A/AppDelegate.swift"
cp "$P" "$P.keep"
python3 - "$P" <<'PYX'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = re.sub(r'\n\t\t\t\t\t"-weak_framework",\n\t\t\t\t\tAlarmKit,', '', s, count=1)
open(p, 'w').write(s)
PYX
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check passed with AlarmKit linked strongly" || ok "check refuses an app that links AlarmKit strongly (it would not open below iOS 26)"
mv "$P.keep" "$P"
bash prepare.sh check >/dev/null && ok "check passes again" || bad "check after restoring the alarms"
# The stand-in rule (AlarmPlan.standIn), cut out of the plugin by its own text and run (plain Swift, no SDK) with stand-ins
# for its two structs: a phone that already gets the server's SHOW TIME and BUS CALL (fbStage, fbBus false, as the page
# hands over for prefs { stage30: true, buscall: true }) gets no second one, except at a day off's bus call (Ari sends no
# BUS CALL then); the guest list last call's always comes. The bus call warning (bus20, Oct 23: 20 minutes before bus
# call, where Ari sends nothing) comes as the page says (fbBus20: always yes; missing, from a plan an older build kept,
# yes too), and a day off's always, as the bus call's: even a plan saying no (strict) keeps a day off's.
if command -v swiftc >/dev/null; then
  if python3 - "$HERE/native/App/AlarmsPlugin.swift" "$T/standin.swift" <<'PYX'
import sys
s = open(sys.argv[1]).read()
i = s.index('\n    func standIn(_ it: AlarmItem) -> Bool {')
j, d = s.index('{', i), 0
while True:
    d += {'{': 1, '}': -1}.get(s[j], 0)
    if d == 0: break
    j += 1
open(sys.argv[2], 'w').write('''struct AlarmItem { var id: String; var kind: String; var tour: String }
struct AlarmPlan {
    var fbStage: Bool
    var fbBus: Bool
    var fbLastcall: Bool? = nil
    var fbBus20: Bool? = nil''' + s[i:j + 1] + '''
}
let items = [AlarmItem(id: "bus|t1|off:2026-10-23", kind: "bus", tour: "t1"), AlarmItem(id: "bus|t1|s22", kind: "bus", tour: "t1"),
             AlarmItem(id: "stage|t1|s22", kind: "stage", tour: "t1"), AlarmItem(id: "lastcall|t1|s22", kind: "lastcall", tour: "t1"),
             AlarmItem(id: "bus20|t1|off:2026-10-23", kind: "bus20", tour: "t1"), AlarmItem(id: "bus20|t1|s22", kind: "bus20", tour: "t1")]
let gets = AlarmPlan(fbStage: false, fbBus: false, fbLastcall: true), none = AlarmPlan(fbStage: true, fbBus: true, fbLastcall: true, fbBus20: true)
let strict = AlarmPlan(fbStage: false, fbBus: false, fbLastcall: false, fbBus20: false)
print([gets, none, strict].map { p in items.map { p.standIn($0) ? "1" : "0" }.joined() }.joined(separator: " "))
''')
PYX
  then
    [ "$(swiftc -o "$T/standin" "$T/standin.swift" 2>/dev/null && "$T/standin")" = "100111 111111 100010" ] \
      && ok "stand-ins: none where the server's alert comes at that minute, always at a day off's bus call (and its 20 minute warning), the guest list last call and the bus call warning" \
      || bad "AlarmPlan.standIn"
  else
    bad "AlarmPlan.standIn not found in AlarmsPlugin.swift"
  fi
else
  echo "  skip  the stand-in rule (no swiftc on this Mac)"
fi
# The kinds (Oct 23: the bus call warning, "bus20"), cut out the same way and run. AlarmItem(js:) takes "bus20" (its
# words when none came: BUS CALL - 20MIN WARNING) and leaves out a kind it does not know, that item alone; an older build
# (the same text with the allowlist it had before Oct 23) leaves out "bus20" and keeps every other alarm whole, from the
# page's sync and the server's hand-over alike (both read items one at a time with compactMap, and the hand-over then
# replaces only that tour's items). Its version check reads the tour's version alone, never the kinds. AlarmPlan.wants:
# the bus call warning follows the bus call alarm's switch (bus).
if command -v swiftc >/dev/null; then
  if python3 - "$HERE/native/App/AlarmsPlugin.swift" "$HERE/native/App/DayBarPlugin.swift" "$T/kinds.swift" <<'PYX'
import sys
s = open(sys.argv[1]).read()
js = open(sys.argv[2]).read()
def cut(text, head):
    i = text.index(head)
    j, d = text.index('{', i), 0
    while True:
        d += {'{': 1, '}': -1}.get(text[j], 0)
        if d == 0: break
        j += 1
    return text[i:j + 1]
init = cut(s, '\n    init?(js o: [String: Any]) {')
wants = cut(s, '\n    func wants(_ it: AlarmItem) -> Bool {')
now = 'kind == "stage" || kind == "bus" || kind == "lastcall" || kind == "bus20",'
assert init.count(now) == 1, 'the allowlist'
old = init.replace(now, 'kind == "stage" || kind == "bus" || kind == "lastcall",')
fields = 'var id: String; var kind: String; var at: Double; var tour: String; var title: String; var body: String'
open(sys.argv[3], 'w').write('enum DayBarJS {' + cut(js, '\n    static func str(_ v: Any?) -> String {') + '''
    // (The plugin's num also reads NSNumber, which needs Foundation; these checks are plain Swift, so plain numbers here.)
    static func num(_ v: Any?) -> Double { (v as? Double) ?? (v as? Int).map { Double($0) } ?? 0 }
}
struct AlarmItem { ''' + fields + init + '''
}
struct OldItem { ''' + fields + old + '''
}
struct AlarmPlan {
    var stage: Bool
    var bus: Bool
    var lastcall: Bool? = nil''' + wants + '''
}
let raw: [[String: Any]] = [
    ["id": "stage|t1|s22", "kind": "stage", "at": 1792711800, "tour": "t1", "title": "30 MIN UNTIL STAGE TIME", "body": "The Fillmore"],
    ["id": "bus20|t1|s22", "kind": "bus20", "at": 1792732200, "tour": "t1", "title": "", "body": "The Fillmore"],
    ["id": "bus|t1|s22", "kind": "bus", "at": 1792733400, "tour": "t1", "title": "BUS CALL", "body": "The Fillmore"],
    ["id": "lastcall|t1|s23", "kind": "lastcall", "at": 1792790100, "tour": "t1", "title": "GUEST LIST LAST CALL", "body": ""],
    ["id": "later|t1|s23", "kind": "later", "at": 1792800000, "tour": "t1", "title": "A KIND FROM LATER", "body": ""]]
let fresh = raw.compactMap { AlarmItem(js: $0) }
let older = raw.compactMap { OldItem(js: $0) }
// (The hand-over, as AlarmDesk.handOver keeps it: that tour's items replaced, another tour's left alone.)
let kept = [OldItem(js: ["id": "bus|t2|s22", "kind": "bus", "at": 1792733000, "tour": "t2"])!]
let after = kept.filter { $0.tour != "t1" } + older
let on = AlarmPlan(stage: true, bus: true), busOff = AlarmPlan(stage: true, bus: false)
print(fresh.map { $0.kind }.joined(separator: ",") + " " + fresh[1].title)
print(older.map { $0.id + "@" + String(Int($0.at)) }.joined(separator: ","))
print(after.map { $0.id }.joined(separator: ","))
print([on, busOff].map { p in fresh.map { p.wants($0) ? "1" : "0" }.joined() }.joined(separator: " "))
''')
PYX
  then
    want="stage,bus20,bus,lastcall BUS CALL - 20MIN WARNING
stage|t1|s22@1792711800,bus|t1|s22@1792733400,lastcall|t1|s23@1792790100
bus|t2|s22,stage|t1|s22,bus|t1|s22,lastcall|t1|s23
1111 1001"
    [ "$(swiftc -o "$T/kinds" "$T/kinds.swift" 2>/dev/null && "$T/kinds")" = "$want" ] \
      && ok "kinds: bus20 taken (its words when none came), a kind not known left out alone; an older build keeps every other alarm; the warning follows the bus call switch" \
      || bad "AlarmItem(js:) kinds / AlarmPlan.wants"
  else
    bad "AlarmItem(js:) or AlarmPlan.wants not found in AlarmsPlugin.swift"
  fi
else
  echo "  skip  the kinds (no swiftc on this Mac)"
fi
# ...and where the items are read: one at a time (compactMap) in the page's sync and the server's hand-over, the
# hand-over replacing only its own tour's, its version check on the version alone.
AP="$HERE/native/App/AlarmsPlugin.swift"
grep -qF 'plan.items = raw.compactMap { AlarmItem(js: $0) }' "$AP" \
  && grep -qF 'let fresh = ((a["i"] as? [Any]) ?? []).compactMap { ($0 as? [String: Any]).flatMap { AlarmItem(js: $0) } }' "$AP" \
  && grep -qF 'guard var plan = AlarmPlan.load(), plan.uid == u, HandOverMarks.newer(v, than: HandOverMarks.had(t)) else { return false }' "$AP" \
  && grep -qF 'plan.items = plan.items.filter { $0.tour != t } + fresh' "$AP" \
  && ok "the sync and the hand-over read items one at a time; the version check never reads a kind" || bad "where the plugin reads its items"
# The hand-overs' order (HandOverMarks.newer; review of rc-1, Oct 22), cut out the same way and run: the first one for a
# tour is set, a newer one or one at the same version is set, an older one never (mute A, then unmute B a moment later:
# if B's reaches the phone first, A's is dropped and B keeps the bus call alarm), and one with no version (a server from
# before versions) is set as before, the mark kept. Played as the desk keeps it: the mark moves only on one that is set.
if command -v swiftc >/dev/null; then
  if python3 - "$HERE/native/App/AlarmsPlugin.swift" "$T/handover.swift" <<'PYX'
import sys
s = open(sys.argv[1]).read()
i = s.index('\n    static func newer(_ v: Double, than had: Double?) -> Bool {')
j, d = s.index('{', i), 0
while True:
    d += {'{': 1, '}': -1}.get(s[j], 0)
    if d == 0: break
    j += 1
open(sys.argv[2], 'w').write('''enum HandOverMarks {''' + s[i:j + 1] + '''
}
let rules = [HandOverMarks.newer(5, than: nil), HandOverMarks.newer(5, than: 4), HandOverMarks.newer(5, than: 5),
             HandOverMarks.newer(4, than: 5), HandOverMarks.newer(0, than: 5)].map { $0 ? "1" : "0" }.joined()
var mark: Double? = nil
var played = ""
for v in [1000.0, 2600, 2000, 0, 3000, 2999, 3000] {
    let ok = HandOverMarks.newer(v, than: mark)
    if ok && v > 0 { mark = v }
    played += ok ? "1" : "0"
}
print(rules + " " + played)
''')
PYX
  then
    [ "$(swiftc -o "$T/handover" "$T/handover.swift" 2>/dev/null && "$T/handover")" = "11101 1101101" ] \
      && ok "hand-overs: an older one never set over a newer one for its tour; newer, the same version, or no version: set" \
      || bad "HandOverMarks.newer"
  else
    bad "HandOverMarks.newer not found in AlarmsPlugin.swift"
  fi
else
  echo "  skip  the hand-overs' order (no swiftc on this Mac)"
fi
# Pushes (DAYBAR_PUSH=1, the cloud build since Oct 22): asks for Apple's push permission (aps-environment) in the app target only.
DAYBAR_PUSH=1 bash prepare.sh ios >/dev/null
[ "$(grep -c 'DayBarLaunch.start()' "$A/AppDelegate.swift")" = "1" ] && ok "running the recipe again does not add the launch line twice" || bad "AppDelegate hook doubled"
[ "$(grep -c 'didRegisterForRemoteNotificationsWithDeviceToken' "$A/AppDelegate.swift")" = "1" ] && ok "...nor the push hand-over" || bad "push hand-over doubled"
[ "$(grep -c 'GreenroomAlarms.remote' "$A/AppDelegate.swift")" = "1" ] && [ "$(grep -c '^					AlarmKit,$' "$P")" = "2" ] \
  && ok "...nor the alarms hand-over, nor the weak links" || bad "alarms hand-over or weak links doubled"
DAYBAR_PUSH=1 bash prepare.sh check >/dev/null && [ "$(grep -c 'CODE_SIGN_ENTITLEMENTS = App/App.entitlements;' "$P")" = "2" ] \
  && [ "$(/usr/libexec/PlistBuddy -c 'Print :aps-environment' "$A/App.entitlements")" = "production" ] \
  && ok "DAYBAR_PUSH=1: the app (only) signs with aps-environment = production" || bad "DAYBAR_PUSH=1 entitlements"
( bash prepare.sh check ) >/dev/null 2>&1 && bad "check with pushes off passed on a project that asks for them" || ok "check with pushes off refuses a project that asks for push permission"
# ...and the signing step switches Push Notifications on, and remakes the profile, for the app's bundle ID only (the
# DayBar extension only draws the bar: the Live Activity's tokens are the app's).
F="$HERE/fastlane/Fastfile"
grep -q '^    push_capability.call(app_id) if pushes$' "$F" && ! grep -q 'push_capability.call(daybar_id)' "$F" \
  && grep -q '^      \[app_id\].each do |identifier|$' "$F" \
  && ok "pushes: the signing step switches Push Notifications on, and remakes the profile, for the app only" || bad "Fastfile pushes"

# the recipe refuses a bad name
( APP_ID="not a bundle id" bash prepare.sh names ) >/dev/null 2>&1 && bad "a bad bundle ID was accepted" || ok "a bad bundle ID is refused"
( APP_NAME="This name is much longer than thirty characters" bash prepare.sh names ) >/dev/null 2>&1 && bad "a 49-character name was accepted" || ok "an over-long App Store name is refused"

# ---- one check that is not the phone's (0216): every migration file says who may run or read what it makes ------
# (tools/check_migrations.js, the database's lock kept in the files. It reads the real repository, read-only.)
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
if [ -x "$JSC" ]; then
  if out=$(cd "$HERE/.." && "$JSC" tools/check_migrations.js -- supabase/migrations/*.sql 2>&1); then
    ok "$(echo "$out" | tail -1)"
  else
    echo "$out" | grep -E "PROBLEM|Error" | head -8 | sed 's/^/        /' || true
    bad "a migration leaves something open, or shut, without saying so (tools/check_migrations.js)"
  fi
else
  echo "  skip  the migration locks (no JavaScriptCore on this Mac)"
fi

if [ "$fail" = 0 ]; then echo "selftest: all good"; else echo "selftest: FAILED"; exit 1; fi
