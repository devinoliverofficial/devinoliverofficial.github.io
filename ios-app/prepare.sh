#!/bin/bash
# prepare.sh: the readable recipe that turns Greenroom's built website into an iPhone app project.
#
#   prepare.sh names   settle the app's names and numbers and hand them to the next workflow steps
#   prepare.sh web     copy the built website (docs/) into www/ and write capacitor.config.json
#   prepare.sh ios     customise the Xcode project that `npx cap add ios` has just made
#   prepare.sh check   confirm the project came out the way we expect (stops loudly if not)
#
# It only touches files inside ios-app/ (never the website itself), and it holds no secrets:
# the names and numbers come from the environment, with the defaults below.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
cd "$HERE"

# ---- the one place the app's names and numbers are settled -------------------------------
# Set these as GitHub "Variables" (Settings > Secrets and variables > Actions > Variables)
# to change them; left empty, the defaults here apply.
: "${APP_ID:=com.greenroomtour.app}"               # the bundle ID. It can NEVER change after the first upload.
: "${APP_NAME:=Greenroom Live}"           # the App Store name (30 characters at most)
: "${APP_DISPLAY_NAME:=Greenroom}"                  # the name under the icon on the Home Screen
: "${MARKETING_VERSION:=1.0.0}"                     # the version people see
# The build number must go up on every upload (Apple rejects an equal or lower one). In GitHub's cloud
# it is the run number plus 100 (build 42 is already on TestFlight); anywhere else it defaults to 1.
if [ -z "${BUILD_NUMBER:-}" ]; then BUILD_NUMBER=$(( ${GITHUB_RUN_NUMBER:-1} + 100 )); [ -n "${GITHUB_RUN_NUMBER:-}" ] || BUILD_NUMBER=1; fi
: "${URL_SCHEME:=greenroom}"                        # greenroom:// brings the person back from the bank (Plaid) sign-in: greenroom://plaid-done
                                                    # (and a tap on the lock-screen day bar opens a day sheet: greenroom://daysheet?...)
# The lock-screen day bar (Devin's idea 20) is a Live Activity drawn by a widget extension inside the app. Its bundle ID is
# the app's plus ".DayBar" (registered with Apple; the signing step makes its profile).
DAYBAR_ID="$APP_ID.DayBar"
# 1 = the app asks Apple for push permission, so the server can move the day bar on while the phone is locked
# (ios-app/README.md, "The day bar's pushes": migration 0198, the notify function's day bar tick). In the cloud build it
# comes from the GitHub variable DAYBAR_PUSH, set to 1 on Oct 22 (unset = 0): the app target gets aps-environment =
# production, and the signing step (fastlane/Fastfile) switches Push Notifications on, and makes the signing profile
# again, for the app's bundle ID only. The DayBar extension needs neither (the app asks for and reports the Live
# Activity's tokens; the extension only draws the bar). With 0 (the default anywhere else) the bar still works, without
# pushes. The same permission carries the app's phone alerts (0201, @capacitor/push-notifications): with 0, iOS gives the
# app no push token, so no phone alert reaches it (nothing else changes).
: "${DAYBAR_PUSH:=0}"

# The alarms (Devin, Oct 22): the words iOS shows under its one question, "Allow Greenroom to set alarms?" (AlarmKit
# refuses to set any alarm for an app without them). iOS 26 and newer only; older iPhones never see it. (Oct 22: and the
# guest list's last call, 15 minutes before it: the day sheet's, else the tour's LAST CALL TIME.)
ALARM_WORDS="Greenroom rings an alarm 30 minutes before your band’s set, 20 minutes before bus call, at bus call, and 15 minutes before the guest list’s last call, from your tour’s day sheet and last call time. You can turn each one off in Greenroom’s Settings, Notifications."

PB=/usr/libexec/PlistBuddy
IOS_DIR="$HERE/ios/App"
APP_DIR="$IOS_DIR/App"
PLIST="$APP_DIR/Info.plist"
PBXPROJ="$IOS_DIR/App.xcodeproj/project.pbxproj"

die() { echo "prepare.sh: $*" >&2; exit 1; }
say() { echo "prepare.sh: $*"; }

validate_names() {
  [[ "$APP_ID" =~ ^[A-Za-z0-9]+(\.[A-Za-z0-9-]+)+$ ]] || die "APP_ID '$APP_ID' is not a bundle ID like com.greenroomtour.app"
  [ "${#APP_NAME}" -ge 2 ] && [ "${#APP_NAME}" -le 30 ] || die "APP_NAME must be 2 to 30 characters (the App Store limit); it is ${#APP_NAME}"
  [[ "$APP_NAME$APP_DISPLAY_NAME" != *'"'* && "$APP_NAME$APP_DISPLAY_NAME" != *'\'* ]] || die "the names may not contain a double quote or a backslash"
  [[ "$MARKETING_VERSION" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]] || die "MARKETING_VERSION '$MARKETING_VERSION' is not like 1.0.0"
  [[ "$BUILD_NUMBER" =~ ^[0-9]+$ ]] || die "BUILD_NUMBER '$BUILD_NUMBER' is not a whole number"
  [[ "$URL_SCHEME" =~ ^[a-z][a-z0-9+.-]*$ ]] || die "URL_SCHEME '$URL_SCHEME' is not a valid scheme"
  [ "$DAYBAR_PUSH" = "0" ] || [ "$DAYBAR_PUSH" = "1" ] || die "DAYBAR_PUSH must be 0 or 1"
  DAYBAR_ID="$APP_ID.DayBar"
}

# ---- PlistBuddy helpers ---------------------------------------------------------------------
pb()      { "$PB" -c "$1" "$PLIST" >/dev/null; }
pb_has()  { "$PB" -c "Print :$1" "$PLIST" >/dev/null 2>&1; }
pb_drop() { "$PB" -c "Delete :$1" "$PLIST" >/dev/null 2>&1 || true; }
pb_text() { # key value: a string, added or replaced
  if pb_has "$1"; then pb "Set :$1 \"$2\""; else pb "Add :$1 string \"$2\""; fi
}
pb_bool() { # key true|false
  if pb_has "$1"; then pb "Set :$1 $2"; else pb "Add :$1 bool $2"; fi
}
pb_list() { # key value...: an array of strings, rebuilt from scratch
  local key="$1"; shift
  pb_drop "$key"
  pb "Add :$key array"
  local i=0 v
  for v in "$@"; do pb "Add :$key:$i string \"$v\""; i=$((i + 1)); done
}

# ============================================================================================
cmd_names() {
  validate_names
  say "app id            $APP_ID"
  say "App Store name    $APP_NAME"
  say "name on Home Screen $APP_DISPLAY_NAME"
  say "version / build   $MARKETING_VERSION ($BUILD_NUMBER)"
  say "day bar extension $DAYBAR_ID (pushes: $([ "$DAYBAR_PUSH" = 1 ] && echo on || echo off))"
  # Hand the settled values to the later workflow steps (the fastlane step reads them).
  if [ -n "${GITHUB_ENV:-}" ]; then
    {
      echo "APP_ID=$APP_ID"
      echo "DAYBAR_ID=$DAYBAR_ID"
      echo "APP_NAME=$APP_NAME"
      echo "APP_DISPLAY_NAME=$APP_DISPLAY_NAME"
      echo "MARKETING_VERSION=$MARKETING_VERSION"
      echo "BUILD_NUMBER=$BUILD_NUMBER"
    } >> "$GITHUB_ENV"
  fi
}

# ============================================================================================
cmd_web() {
  validate_names
  [ -f "$REPO/docs/index.html" ] || die "docs/index.html is missing: run 'python3 build.py' in the repository first"

  # 1. A COPY of the built website goes inside the app, so the app is self-contained
  #    (Apple 2.5.2: no code is downloaded to change what the app does).
  rm -rf www
  mkdir www
  cp -R "$REPO/docs/." www/
  (
    cd www
    # Pages that only exist to add the website to a Home Screen, and the old "Classic" skin.
    rm -f app.html classic.html icontest.html icon-test.png add-*.html
    rm -f manifest-classic.webmanifest icon-classic-*.png logo-full-classic.png
    # The website's service worker has no place in the app: the app itself is the offline copy.
    rm -f sw.js .nojekyll
    # The app's file server may not know that ".mjs" means JavaScript, and a module that comes
    # back with the wrong type will not load. So the PDF reader's two files get a plain ".js"
    # name, in this copy only; the website keeps its own names.
    for f in vendor/*.mjs; do [ -e "$f" ] && mv "$f" "${f%.mjs}.js"; done
    [ -f vendor/pdf.min.js ] && [ -f vendor/pdf.worker.min.js ] || die "the PDF reader files are not where they were"
    n=$(grep -c -E 'vendor/pdf\.min\.mjs|vendor/pdf\.worker\.min\.mjs' app.js || true)
    [ "$n" = "2" ] || die "expected 2 lines in app.js naming the PDF reader files, found $n"
    sed -e 's#vendor/pdf\.min\.mjs#vendor/pdf.min.js#g' -e 's#vendor/pdf\.worker\.min\.mjs#vendor/pdf.worker.min.js#g' app.js > app.js.tmp
    mv app.js.tmp app.js
    ! grep -q "\\.mjs" app.js || die "app.js still names a .mjs file"
  )

  # 2. The page's Content-Security-Policy says 'self' for scripts, styles, images and connections.
  #    Inside the app the page's own address is capacitor://localhost; naming it outright makes
  #    sure the policy cannot misread 'self' there and block the app's own files. (This copy
  #    only; the website's policy is not touched. The policy's inline-script hashes are not
  #    affected, because only the meta tag's own text changes.)
  python3 - <<'PY'
import re, sys
path = 'www/index.html'
html = open(path, encoding='utf-8').read()
m = re.search(r'(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)', html)
if not m:
    sys.exit('prepare.sh: www/index.html has no Content-Security-Policy meta tag to extend')
policy = m.group(2)
extended = policy.replace("'self'", "'self' capacitor://localhost")
count = extended.count('capacitor://localhost')
if count < 8:
    sys.exit('prepare.sh: expected the policy to say \'self\' at least 8 times, found %d' % count)
html = html[:m.start(2)] + extended + html[m.end(2):]
open(path, 'w', encoding='utf-8').write(html)
print('prepare.sh: Content-Security-Policy names capacitor://localhost in %d places' % count)
PY

  # 3. The page must carry the "skip the service worker inside the app" guard (see build.py).
  grep -q "Capacitor.isNativePlatform" www/index.html || die "www/index.html lacks the app guard: build the website from this branch"
  [ -f www/index.html ] && [ -f www/app.js ] && [ -f www/backend.js ] && [ -f www/core.js ] || die "the website copy is incomplete"

  # 4. capacitor.config.json: the committed file holds the defaults; the names settled above go in.
  python3 - "$APP_ID" "$APP_NAME" <<'PY'
import json, sys
app_id, app_name = sys.argv[1], sys.argv[2]
with open('capacitor.config.json', encoding='utf-8') as fh:
    cfg = json.load(fh)
cfg['appId'] = app_id
cfg['appName'] = app_name
cfg['webDir'] = 'www'
# The app runs from its own bundled copy. A remote address here would turn it back into a bare website.
cfg.pop('server', None)
with open('capacitor.config.json', 'w', encoding='utf-8') as fh:
    json.dump(cfg, fh, indent=2, ensure_ascii=False)
    fh.write('\n')
PY
  say "www/ holds $(find www -type f | wc -l | tr -d ' ') files; capacitor.config.json says $APP_ID / $APP_NAME"
}

# ============================================================================================
cmd_ios() {
  validate_names
  [ -f "$PLIST" ] || die "no $PLIST: run 'npx cap add ios' first"
  [ -f "$PBXPROJ" ] || die "no $PBXPROJ: run 'npx cap add ios' first"
  [ -x "$PB" ] || die "PlistBuddy is not at $PB (this step runs on a Mac)"

  # ---- Info.plist -------------------------------------------------------------------------
  pb_text CFBundleDisplayName "$APP_DISPLAY_NAME"

  # iPhone only, upright only (the website is built for a phone held upright).
  pb_list UIRequiredDeviceCapabilities arm64
  pb_list UISupportedInterfaceOrientations UIInterfaceOrientationPortrait
  pb_drop "UISupportedInterfaceOrientations~ipad"

  # Greenroom uses only standard encryption (https), which needs no export paperwork.
  # (The key's real name is ITSAppUsesNonExemptEncryption.) With this, TestFlight and
  # App Store Connect stop asking the export question on every build.
  pb_bool ITSAppUsesNonExemptEncryption false

  # Why the phone asks for each permission, in plain words (Apple shows these to the person).
  # Camera and photos: the website's "add a picture" buttons open the phone's own picker.
  # Saving to Photos: holding a finger on a picture (a tour flyer, a profile picture) brings up iOS's own menu with its
  # save button (the web view's link previews are on, Capacitor's default); without these words that tap closes the app.
  # Location: used only on the phone to say how far a spot is; never saved or sent.
  # There is no microphone string because nothing in Greenroom listens.
  pb_text NSCameraUsageDescription "Greenroom uses the camera only when you tap to take a photo, such as a settlement, a receipt, a flyer or your profile picture. It never uses the camera in the background."
  pb_text NSPhotoLibraryUsageDescription "Greenroom opens your photos only when you choose a picture to add, such as a settlement, a flyer or your profile picture. It sees only the pictures you pick."
  pb_text NSPhotoLibraryAddUsageDescription "Greenroom saves a picture to your Photos only when you choose Save, such as a tour flyer. It never adds anything on its own."
  pb_text NSLocationWhenInUseUsageDescription "Greenroom uses where you are only to show how far a food or coffee spot is from you. Your location is not saved or sent anywhere."
  # The alarms (AlarmKit, iOS 26+): the stage alarm, the bus call alarm and the guest list last call alarm. And the server's quiet hand-over of them
  # (a day sheet saved, a mute tapped): Apple wakes the app in the background with a push that shows nothing
  # (remote-notification), so the phone sets its alarms again without being opened.
  pb_text NSAlarmKitUsageDescription "$ALARM_WORDS"
  pb_list UIBackgroundModes remote-notification

  # greenroom:// is how the bank (Plaid) sign-in sends the person back to the app when it is done
  # (Plaid's completion_redirect_uri, greenroom://plaid-done). iOS opens the app for any address that starts
  # with a scheme named here; the page hears it through the App plugin (@capacitor/app, appUrlOpen).
  # The address carries no data: the app only asks the server how the sign-in went.
  pb_drop CFBundleURLTypes
  pb "Add :CFBundleURLTypes array"
  pb "Add :CFBundleURLTypes:0 dict"
  pb "Add :CFBundleURLTypes:0:CFBundleURLName string \"$APP_ID\""
  pb "Add :CFBundleURLTypes:0:CFBundleTypeRole string Editor"
  pb "Add :CFBundleURLTypes:0:CFBundleURLSchemes array"
  pb "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string \"$URL_SCHEME\""
  plutil -lint "$PLIST" >/dev/null || die "Info.plist is no longer a valid plist"

  # ---- app icon: the 1024x1024 art the Home Screen icon already uses ------------------------
  ICONSET="$APP_DIR/Assets.xcassets/AppIcon.appiconset"
  [ -d "$ICONSET" ] || die "no AppIcon.appiconset in the generated project"
  ICON_FILE="$(plutil -extract images.0.filename raw -o - "$ICONSET/Contents.json" 2>/dev/null || true)"
  [ -n "$ICON_FILE" ] || ICON_FILE="AppIcon-512@2x.png"
  [ -f "$ICONSET/$ICON_FILE" ] || die "the icon set does not hold $ICON_FILE as expected"
  cp "$HERE/assets/AppIcon-1024.png" "$ICONSET/$ICON_FILE"

  # ---- launch screen: plain black, the app's own theme --------------------------------------
  SPLASH="$APP_DIR/Assets.xcassets/Splash.imageset"
  [ -d "$SPLASH" ] || die "no Splash.imageset in the generated project"
  count=0
  for f in "$SPLASH"/*.png; do
    [ -e "$f" ] || continue
    cp "$HERE/assets/launch-black.png" "$f"
    count=$((count + 1))
  done
  [ "$count" -ge 1 ] || die "the Splash image set held no pictures to replace"
  STORYBOARD="$APP_DIR/Base.lproj/LaunchScreen.storyboard"
  if [ -f "$STORYBOARD" ] && grep -q 'systemColor="systemBackgroundColor"' "$STORYBOARD"; then
    sed 's#<color key="backgroundColor" systemColor="systemBackgroundColor"/>#<color key="backgroundColor" red="0.0" green="0.0" blue="0.0" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>#' \
      "$STORYBOARD" > "$STORYBOARD.tmp"
    mv "$STORYBOARD.tmp" "$STORYBOARD"
  else
    say "note: the launch storyboard has no system background colour to change (the black picture still fills the screen)"
  fi

  # ---- privacy manifest ----------------------------------------------------------------------
  cp "$HERE/assets/PrivacyInfo.xcprivacy" "$APP_DIR/PrivacyInfo.xcprivacy"
  plutil -lint "$APP_DIR/PrivacyInfo.xcprivacy" >/dev/null || die "PrivacyInfo.xcprivacy is not a valid plist"
  # (A valid plist can still hide a type inside another type's purposes: this reads it the way Apple does.)
  python3 "$HERE/tools/check_privacy.py" "$APP_DIR/PrivacyInfo.xcprivacy" >/dev/null || die "PrivacyInfo.xcprivacy does not read the way Apple reads it (see the WRONG line above)"

  # ---- the lock-screen day bar (Devin's idea 20): a Live Activity --------------------------------
  # From ios-app/native: the app's own Capacitor plugin (DayBarPlugin.swift, reached by the page as
  # window.Capacitor.Plugins.DayBar), the web view controller that registers it (GreenroomViewController.swift), the
  # bar's state that the app and the extension share (DayBarAttributes.swift), and the widget extension that draws
  # the bar on the lock screen and in the Dynamic Island (DayBar/).
  cp "$HERE/native/App/DayBarAttributes.swift" "$HERE/native/App/DayBarPlugin.swift" \
     "$HERE/native/App/GreenroomViewController.swift" "$APP_DIR/"
  # The alarms (Devin, Oct 22): the app's own Alarms plugin and the bus call alarm's "I'm on the bus" (AlarmsPlugin.swift,
  # the app only), and answering Bus Check from the lock screen (BusAnswer.swift, compiled into the app AND the DayBar
  # extension, whose On bus / Off bus buttons name its intent).
  cp "$HERE/native/App/AlarmsPlugin.swift" "$HERE/native/App/BusAnswer.swift" "$APP_DIR/"
  mkdir -p "$IOS_DIR/DayBar"
  # (The extension has its own privacy manifest: Apple reads each binary, and BusAnswer.swift uses UserDefaults there.)
  cp "$HERE/native/DayBar/DayBarWidgets.swift" "$HERE/native/DayBar/Info.plist" "$HERE/native/DayBar/PrivacyInfo.xcprivacy" \
     "$IOS_DIR/DayBar/"
  plutil -lint "$IOS_DIR/DayBar/Info.plist" >/dev/null || die "the DayBar Info.plist is not a valid plist"
  plutil -lint "$IOS_DIR/DayBar/PrivacyInfo.xcprivacy" >/dev/null || die "the DayBar PrivacyInfo.xcprivacy is not a valid plist"
  # The scene makes the app's web view controller in code (Capacitor 8's SceneDelegate): it makes Greenroom's own,
  # which registers the DayBar plugin. (Main.storyboard names the same class, for the same reason.)
  SCENE="$APP_DIR/SceneDelegate.swift"
  [ -f "$SCENE" ] || die "no SceneDelegate.swift in the generated project (the template changed): the day bar plugin cannot be registered"
  if ! grep -q "GreenroomViewController()" "$SCENE"; then
    n=$(grep -c "CAPBridgeViewController()" "$SCENE" || true)
    [ "$n" = "1" ] || die "expected SceneDelegate.swift to make one CAPBridgeViewController(), found $n"
    sed 's#CAPBridgeViewController()#GreenroomViewController()#' "$SCENE" > "$SCENE.tmp"
    mv "$SCENE.tmp" "$SCENE"
  fi
  MAIN_SB="$APP_DIR/Base.lproj/Main.storyboard"
  if [ -f "$MAIN_SB" ] && grep -q 'customClass="CAPBridgeViewController" customModule="Capacitor"' "$MAIN_SB"; then
    sed 's#customClass="CAPBridgeViewController" customModule="Capacitor"#customClass="GreenroomViewController" customModule="App" customModuleProvider="target"#' \
      "$MAIN_SB" > "$MAIN_SB.tmp"
    mv "$MAIN_SB.tmp" "$MAIN_SB"
  fi
  # The app's launch starts the day bar's token listener (DayBarLaunch.start): when the server's pushes are live and iOS
  # starts the app in the background only to hand it a bar's token (a bar the server started), no page or plugin may
  # load, so the AppDelegate starts it. It does nothing on a phone that never switched the pushes on.
  APPDEL="$APP_DIR/AppDelegate.swift"
  [ -f "$APPDEL" ] || die "no AppDelegate.swift in the generated project (the template changed)"
  if ! grep -q "DayBarLaunch.start()" "$APPDEL"; then
    n=$(grep -c "// Override point for customization after application launch." "$APPDEL" || true)
    [ "$n" = "1" ] || die "expected AppDelegate.swift to have Capacitor's one 'Override point' line, found $n"
    sed 's#// Override point for customization after application launch.#DayBarLaunch.start()  // Greenroom: the lock-screen day bar listens for its push tokens (ios-app/native/App/DayBarPlugin.swift)#' \
      "$APPDEL" > "$APPDEL.tmp"
    mv "$APPDEL.tmp" "$APPDEL"
  fi
  # Phone alerts (0201, ios-app/README.md "Phone alerts"): iOS hands the app this phone's push token (or why it could not)
  # through the AppDelegate; these two lines pass it to the push plugin (@capacitor/push-notifications), as Capacitor's
  # own instructions say. Without them the page never hears a token and no alert reaches the app (nothing else breaks).
  if ! grep -q "capacitorDidRegisterForRemoteNotifications" "$APPDEL"; then
    python3 - "$APPDEL" <<'PY'
import sys
path = sys.argv[1]
src = open(path, encoding='utf-8').read()
mark = '    func applicationWillResignActive(_ application: UIApplication) {\n'
if src.count(mark) != 1:
    sys.exit("prepare.sh: expected AppDelegate.swift to have one applicationWillResignActive, found %d" % src.count(mark))
add = (
    '    // Greenroom: phone alerts (Apple push). iOS hands the app this phone\'s token here, and the push plugin\n'
    '    // (@capacitor/push-notifications) passes it to the page (ios-app/README.md, "Phone alerts").\n'
    '    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {\n'
    '        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)\n'
    '    }\n'
    '\n'
    '    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {\n'
    '        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)\n'
    '    }\n'
    '\n')
open(path, 'w', encoding='utf-8').write(src.replace(mark, add + mark))
PY
  fi
  # The alarms: the server's quiet hand-over (a background push that shows nothing, {"alarms": ...}) reaches the app here
  # and the Alarms plugin's own code sets that tour's alarms again (AlarmsPlugin.swift, GreenroomAlarms.remote). Any other
  # push is left to the push plugin, as before (answered "no data" here).
  if ! grep -q "GreenroomAlarms.remote" "$APPDEL"; then
    python3 - "$APPDEL" <<'PY'
import sys
path = sys.argv[1]
src = open(path, encoding='utf-8').read()
mark = '    func applicationWillResignActive(_ application: UIApplication) {\n'
if src.count(mark) != 1:
    sys.exit("prepare.sh: expected AppDelegate.swift to have one applicationWillResignActive, found %d" % src.count(mark))
add = (
    '    // Greenroom: the alarms. The server hands this phone its alarms again with a push that shows nothing; the app\'s own\n'
    '    // Alarms plugin sets them (ios-app/native/App/AlarmsPlugin.swift, ios-app/README.md "The alarms").\n'
    '    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any],\n'
    '                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {\n'
    '        GreenroomAlarms.remote(userInfo, completionHandler)\n'
    '    }\n'
    '\n')
open(path, 'w', encoding='utf-8').write(src.replace(mark, add + mark))
PY
  fi
  # iOS shows Live Activities only for an app that says it has them.
  pb_bool NSSupportsLiveActivities true
  # DAYBAR_PUSH=1 (the cloud build since Oct 22): Apple's push permission, for the server's day bar pushes; the app target only.
  ENTITLEMENTS=""
  if [ "$DAYBAR_PUSH" = "1" ]; then
    cat > "$APP_DIR/App.entitlements" <<'ENT'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
ENT
    plutil -lint "$APP_DIR/App.entitlements" >/dev/null || die "App.entitlements is not a valid plist"
    ENTITLEMENTS="App/App.entitlements"
  fi
  plutil -lint "$PLIST" >/dev/null || die "Info.plist is no longer a valid plist"

  # ---- the Xcode project: names, numbers, iPhone only, the privacy manifest and the day bar filed in -----
  python3 "$HERE/tools/edit_xcodeproj.py" "$PBXPROJ" \
    --bundle-id "$APP_ID" --marketing-version "$MARKETING_VERSION" --build-number "$BUILD_NUMBER" \
    --iphone-only --add-resource PrivacyInfo.xcprivacy --add-daybar "$DAYBAR_ID" \
    --weak-framework AlarmKit --weak-framework AppIntents --weak-framework ActivityKit \
    ${ENTITLEMENTS:+--app-entitlements "$ENTITLEMENTS"}
  say "the iOS project is ready: $APP_ID (day bar $DAYBAR_ID), version $MARKETING_VERSION ($BUILD_NUMBER), iPhone only"
}

# ============================================================================================
cmd_check() {
  validate_names
  local bad=0
  want() { # description actual expected
    if [ "$2" = "$3" ]; then say "ok    $1"; else say "WRONG $1: got '$2', wanted '$3'"; bad=1; fi
  }
  get() { "$PB" -c "Print :$1" "$PLIST" 2>/dev/null || echo "(missing)"; }

  want "display name" "$(get CFBundleDisplayName)" "$APP_DISPLAY_NAME"
  want "encryption exemption" "$(get ITSAppUsesNonExemptEncryption)" "false"
  want "orientation" "$(get UISupportedInterfaceOrientations:0)" "UIInterfaceOrientationPortrait"
  want "only one orientation" "$("$PB" -c 'Print :UISupportedInterfaceOrientations' "$PLIST" | grep -c UIInterfaceOrientation)" "1"
  want "no iPad orientations" "$(get 'UISupportedInterfaceOrientations~ipad')" "(missing)"
  want "URL scheme" "$(get CFBundleURLTypes:0:CFBundleURLSchemes:0)" "$URL_SCHEME"
  want "URL type is named for the app" "$(get CFBundleURLTypes:0:CFBundleURLName)" "$APP_ID"
  want "exactly one URL scheme" "$("$PB" -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes' "$PLIST" 2>/dev/null | grep -c '^    [a-z]')" "1"
  want "exactly one URL type" "$("$PB" -c 'Print :CFBundleURLTypes' "$PLIST" 2>/dev/null | grep -c 'CFBundleURLSchemes = Array')" "1"
  [ -n "$(get NSCameraUsageDescription)" ] && [ "$(get NSCameraUsageDescription)" != "(missing)" ] || { say "WRONG camera usage string is missing"; bad=1; }
  [ "$(get NSPhotoLibraryUsageDescription)" != "(missing)" ] || { say "WRONG photo library usage string is missing"; bad=1; }
  [ "$(get NSPhotoLibraryAddUsageDescription)" != "(missing)" ] || { say "WRONG the save-to-Photos usage string is missing (choosing Save on a held picture would close the app)"; bad=1; }
  [ "$(get NSMicrophoneUsageDescription)" = "(missing)" ] || { say "WRONG a microphone string is present, but nothing uses the microphone"; bad=1; }

  local icon="$APP_DIR/Assets.xcassets/AppIcon.appiconset/$(plutil -extract images.0.filename raw -o - "$APP_DIR/Assets.xcassets/AppIcon.appiconset/Contents.json" 2>/dev/null || echo AppIcon-512@2x.png)"
  want "icon size" "$(sips -g pixelWidth -g pixelHeight "$icon" 2>/dev/null | awk '/pixel/{printf "%s ", $2}')" "1024 1024 "
  want "icon has no transparency" "$(sips -g hasAlpha "$icon" 2>/dev/null | awk '/hasAlpha/{print $2}')" "no"

  grep -q "PrivacyInfo.xcprivacy in Resources" "$PBXPROJ" || grep -q PBXFileSystemSynchronizedRootGroup "$PBXPROJ" || { say "WRONG the privacy manifest is not filed into the project"; bad=1; }
  # (Every collected type its own dict, named the way Apple spells it, every purpose a string.)
  python3 "$HERE/tools/check_privacy.py" "$APP_DIR/PrivacyInfo.xcprivacy" || bad=1
  grep -q 'TARGETED_DEVICE_FAMILY = 1;' "$PBXPROJ" || { say "WRONG the project is not iPhone only"; bad=1; }
  grep -q "PRODUCT_BUNDLE_IDENTIFIER = $APP_ID;" "$PBXPROJ" || { say "WRONG the bundle ID in the project is not $APP_ID"; bad=1; }

  [ -f "$APP_DIR/public/index.html" ] || { say "WRONG the website copy is not inside the iOS project (npx cap sync ios)"; bad=1; }
  [ ! -f "$APP_DIR/public/sw.js" ] || { say "WRONG a service worker file is inside the app"; bad=1; }
  if grep -q '"url"' "$APP_DIR/capacitor.config.json" 2>/dev/null; then say "WRONG capacitor.config.json names a server URL; the app must run from its bundled copy"; bad=1; fi
  [ -f "$APP_DIR/capacitor.config.json" ] || { say "WRONG capacitor.config.json is not inside the iOS project"; bad=1; }
  # The App plugin (@capacitor/app) is what tells the page the app was opened by greenroom://plaid-done.
  # `npx cap sync ios` lists every plugin it found in packageClassList; the app registers only those, so a
  # missing AppPlugin would make the return silently never arrive (the bank sign-in would then work as it
  # did before, with the person switching back by hand).
  # The Filesystem and Share plugins (@capacitor/filesystem, @capacitor/share) are how Budget History's PDF and
  # Spreadsheet buttons work in the app: the file is written into the app's cache, then the phone's share sheet
  # opens with it (Save to Files, AirDrop, Mail). Without them the buttons can only say they cannot.
  if [ -f "$APP_DIR/capacitor.config.json" ]; then
    # Phone alerts (0201): the push plugin (@capacitor/push-notifications) must be registered the same way.
    for plugin in AppPlugin FilesystemPlugin SharePlugin PushNotificationsPlugin; do
      want "${plugin%Plugin} plugin is registered (cap sync listed $plugin)" "$(python3 -c '
import json, sys
try:
    print(sys.argv[2] in json.load(open(sys.argv[1])).get("packageClassList", []))
except Exception:
    print("unreadable")
' "$APP_DIR/capacitor.config.json" "$plugin")" "True"
    done
  fi
  # ...and the AppDelegate hands it Apple's token (once each), or no phone alert ever reaches the app.
  want "the AppDelegate hands Apple's token to the push plugin" \
    "$(grep -c 'NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)' "$APP_DIR/AppDelegate.swift" 2>/dev/null || true)" "1"
  want "...and says when iOS could not give one" \
    "$(grep -c 'NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)' "$APP_DIR/AppDelegate.swift" 2>/dev/null || true)" "1"

  # The lock-screen day bar: the Live Activity switch, the app's own plugin registered by the scene, the extension's
  # files, and the project wiring (check_daybar.py follows every link in the project file, the way Xcode reads it).
  want "Live Activities allowed (the day bar)" "$(get NSSupportsLiveActivities)" "true"
  # The alarms: iOS's question has its words (without them AlarmKit sets nothing), the app may be woken by the server's
  # quiet hand-over, the AppDelegate passes that to the Alarms plugin (once), and the scene registers the plugin.
  want "the alarm question's words (NSAlarmKitUsageDescription)" "$(get NSAlarmKitUsageDescription)" "$ALARM_WORDS"
  want "the app may be woken by a quiet push (UIBackgroundModes remote-notification)" \
    "$("$PB" -c 'Print :UIBackgroundModes' "$PLIST" 2>/dev/null | grep -c '^    remote-notification$')" "1"
  want "the AppDelegate hands the server's alarms to the Alarms plugin" \
    "$(grep -c 'GreenroomAlarms.remote(userInfo, completionHandler)' "$APP_DIR/AppDelegate.swift" 2>/dev/null || true)" "1"
  grep -q "registerPluginInstance(AlarmsPlugin())" "$APP_DIR/GreenroomViewController.swift" 2>/dev/null \
    || { say "WRONG the web view controller does not register the Alarms plugin"; bad=1; }
  grep -q "GreenroomViewController()" "$APP_DIR/SceneDelegate.swift" 2>/dev/null \
    || { say "WRONG the scene does not make GreenroomViewController (the DayBar plugin would never be registered)"; bad=1; }
  grep -q "DayBarLaunch.start()" "$APP_DIR/AppDelegate.swift" 2>/dev/null \
    || { say "WRONG the AppDelegate does not start the day bar's token listener (DayBarLaunch.start)"; bad=1; }
  for f in DayBarAttributes.swift DayBarPlugin.swift GreenroomViewController.swift AlarmsPlugin.swift BusAnswer.swift; do
    [ -f "$APP_DIR/$f" ] || { say "WRONG $f is not in the app's folder"; bad=1; }
  done
  [ -f "$IOS_DIR/DayBar/DayBarWidgets.swift" ] || { say "WRONG the DayBar extension's DayBarWidgets.swift is missing"; bad=1; }
  # (Its own privacy manifest, declaring UserDefaults (CA92.1): Apple reports ITMS-91053 for an extension without one.)
  want "the DayBar extension's privacy manifest declares UserDefaults (CA92.1)" \
    "$("$PB" -c 'Print :NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPIType' "$IOS_DIR/DayBar/PrivacyInfo.xcprivacy" 2>/dev/null || echo '(missing)') $("$PB" -c 'Print :NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPITypeReasons:0' "$IOS_DIR/DayBar/PrivacyInfo.xcprivacy" 2>/dev/null || echo '(missing)')" \
    "NSPrivacyAccessedAPICategoryUserDefaults CA92.1"
  want "the DayBar extension is a widget extension" \
    "$("$PB" -c 'Print :NSExtension:NSExtensionPointIdentifier' "$IOS_DIR/DayBar/Info.plist" 2>/dev/null || echo '(missing)')" \
    "com.apple.widgetkit-extension"
  python3 "$HERE/tools/check_daybar.py" "$PBXPROJ" "$APP_ID" "$MARKETING_VERSION" "$BUILD_NUMBER" || bad=1
  if [ "$DAYBAR_PUSH" = "1" ]; then
    grep -q "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;" "$PBXPROJ" \
      && [ "$("$PB" -c 'Print :aps-environment' "$APP_DIR/App.entitlements" 2>/dev/null)" = "production" ] \
      || { say "WRONG DAYBAR_PUSH=1 but the app does not carry aps-environment"; bad=1; }
  else
    ! grep -q "CODE_SIGN_ENTITLEMENTS" "$PBXPROJ" \
      || { say "WRONG an entitlements file is set while DAYBAR_PUSH=0 (signing would ask for a capability the profile lacks)"; bad=1; }
  fi

  [ "$bad" = 0 ] || die "the project is not as expected (see WRONG lines above)"
  say "all checks passed"
}

case "${1:-}" in
  names) cmd_names ;;
  web)   cmd_web ;;
  ios)   cmd_ios ;;
  check) cmd_check ;;
  *) die "usage: prepare.sh names|web|ios|check" ;;
esac
