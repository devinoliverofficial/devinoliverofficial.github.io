#!/usr/bin/env python3
"""Checks that the Xcode project carries the lock-screen day bar the way edit_xcodeproj.py --add-daybar adds it.

    check_daybar.py PATH/TO/project.pbxproj APP_ID [MARKETING_VERSION BUILD_NUMBER]

It reads the project the way Xcode does (macOS's plutil turns it into JSON) and follows every link, so a
project file that only looks right line by line, but points at something that is not there, is caught here
and not halfway through a cloud build. Prints one "ok" line per check, or the first thing that is wrong,
and exits non-zero then. Only the Python standard library and plutil are used.
"""
import json
import subprocess
import sys


def die(msg):
    sys.stderr.write('check_daybar: WRONG ' + msg + '\n')
    sys.exit(1)


def ok(msg):
    print('check_daybar: ok    ' + msg)


def main():
    if len(sys.argv) not in (3, 5):
        die('usage: check_daybar.py project.pbxproj APP_ID [MARKETING_VERSION BUILD_NUMBER]')
    path, app_id = sys.argv[1], sys.argv[2]
    want_version = sys.argv[3] if len(sys.argv) == 5 else None
    want_build = sys.argv[4] if len(sys.argv) == 5 else None
    try:
        raw = subprocess.run(['plutil', '-convert', 'json', '-o', '-', path], capture_output=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        die('the project file cannot be read as a property list (%s)' % e)
    proj = json.loads(raw)
    objs = proj['objects']
    ok('the project file reads as a property list (%d objects)' % len(objs))

    # Every id an object names must be an object.
    def ids_in(v):
        if isinstance(v, str):
            if len(v) == 24 and all(c in '0123456789ABCDEF' for c in v):
                yield v
        elif isinstance(v, list):
            for x in v:
                yield from ids_in(x)
        elif isinstance(v, dict):
            for k, x in v.items():
                if k in ('remoteGlobalIDString',):
                    yield x
                    continue
                yield from ids_in(x)
    missing = sorted({i for o in objs.values() for i in ids_in(o) if i not in objs})
    if missing:
        die('the project names objects that are not there: %s' % ', '.join(missing[:5]))
    ok('every object the project names is there')

    root = objs[proj['rootObject']]
    targets = {objs[t]['name']: (t, objs[t]) for t in root['targets']}
    if 'App' not in targets or 'DayBar' not in targets:
        die('the project lists the targets %s, not App and DayBar' % sorted(targets))
    app_id_, app = targets['App']
    ext_id_, ext = targets['DayBar']
    ok('two targets: App and DayBar')
    if ext.get('productType') != 'com.apple.product-type.app-extension':
        die('DayBar is a %s, not an app extension' % ext.get('productType'))
    if objs[ext['productReference']].get('path') != 'DayBar.appex':
        die('DayBar does not make DayBar.appex')
    ok('DayBar makes DayBar.appex, an app extension')

    deps = [objs[d] for d in app.get('dependencies', [])]
    if not any(d.get('target') == ext_id_ for d in deps):
        die('the App target does not build DayBar first')
    proxy = [objs[d['targetProxy']] for d in deps if d.get('target') == ext_id_][0]
    if proxy.get('remoteGlobalIDString') != ext_id_ or proxy.get('containerPortal') != proj['rootObject']:
        die('the dependency on DayBar points somewhere else')
    ok('the App target builds DayBar first')

    def files_of(phase):
        return [objs[objs[b]['fileRef']].get('path') for b in phase.get('files', [])]

    embeds = [objs[p] for p in app['buildPhases'] if objs[p].get('isa') == 'PBXCopyFilesBuildPhase']
    embed = [p for p in embeds if str(p.get('dstSubfolderSpec')) == '13' and 'DayBar.appex' in files_of(p)]
    if not embed:
        die('DayBar.appex is not copied into the app\'s PlugIns folder')
    ok('DayBar.appex is embedded in the app (PlugIns)')

    def sources(target):
        ph = [objs[p] for p in target['buildPhases'] if objs[p].get('isa') == 'PBXSourcesBuildPhase']
        return files_of(ph[0]) if ph else []
    app_src, ext_src = sources(app), sources(ext)
    for f in ('DayBarAttributes.swift', 'DayBarPlugin.swift', 'GreenroomViewController.swift', 'AppDelegate.swift',
              'AlarmsPlugin.swift', 'BusAnswer.swift'):
        if f not in app_src:
            die('the App target does not compile %s' % f)
    for f in ('DayBarAttributes.swift', 'DayBarWidgets.swift', 'BusAnswer.swift'):
        if f not in ext_src:
            die('DayBar does not compile %s' % f)
    if 'DayBarPlugin.swift' in ext_src or 'GreenroomViewController.swift' in ext_src or 'AlarmsPlugin.swift' in ext_src:
        die('DayBar compiles the app\'s own plugin files (an extension cannot use Capacitor)')
    ok('the app compiles the plugins, the extension compiles the look, both compile the shared state and Bus Check\'s answer')

    def configs(target):
        return [objs[c] for c in objs[target['buildConfigurationList']]['buildConfigurations']]
    ext_cfg, app_cfg = configs(ext), configs(app)
    for c in ext_cfg:
        s = c['buildSettings']
        expect = {'PRODUCT_BUNDLE_IDENTIFIER': app_id + '.DayBar', 'INFOPLIST_FILE': 'DayBar/Info.plist',
                  'TARGETED_DEVICE_FAMILY': '1', 'SKIP_INSTALL': 'YES', 'APPLICATION_EXTENSION_API_ONLY': 'YES'}
        for k, v in expect.items():
            if str(s.get(k)) != v:
                die('DayBar %s: %s is %r, wanted %r' % (c['name'], k, s.get(k), v))
    for c in app_cfg:
        if c['buildSettings'].get('PRODUCT_BUNDLE_IDENTIFIER') != app_id:
            die('App %s: the bundle ID is %r, wanted %r' % (c['name'], c['buildSettings'].get('PRODUCT_BUNDLE_IDENTIFIER'), app_id))
    ok('bundle IDs: %s and %s.DayBar' % (app_id, app_id))
    # The app runs from iOS 15: the frameworks newer than that are linked weakly, so an older iPhone still opens it.
    for c in app_cfg:
        flags = c['buildSettings'].get('OTHER_LDFLAGS', [])
        flags = flags if isinstance(flags, list) else str(flags).split()
        for fw in ('AlarmKit', 'AppIntents', 'ActivityKit'):
            if not any(flags[i] == '-weak_framework' and flags[i + 1] == fw for i in range(len(flags) - 1)):
                die('App %s: %s is not linked weakly (OTHER_LDFLAGS -weak_framework %s)' % (c['name'], fw, fw))
    ok('the app links AlarmKit, AppIntents and ActivityKit weakly (it still opens on iOS 15)')
    for c in ext_cfg:
        a = [x for x in app_cfg if x['name'] == c['name']]
        if not a:
            die('the App target has no %s configuration' % c['name'])
        for k in ('MARKETING_VERSION', 'CURRENT_PROJECT_VERSION'):
            if str(c['buildSettings'].get(k)) != str(a[0]['buildSettings'].get(k)):
                die('%s %s: DayBar says %r, the app %r (Apple refuses a mismatch)' % (
                    c['name'], k, c['buildSettings'].get(k), a[0]['buildSettings'].get(k)))
        if want_version and str(c['buildSettings'].get('MARKETING_VERSION')) != want_version:
            die('DayBar version %r, wanted %r' % (c['buildSettings'].get('MARKETING_VERSION'), want_version))
        if want_build and str(c['buildSettings'].get('CURRENT_PROJECT_VERSION')) != want_build:
            die('DayBar build %r, wanted %r' % (c['buildSettings'].get('CURRENT_PROJECT_VERSION'), want_build))
    ok('DayBar has the app\'s version and build number')

    groups = [o for o in objs.values() if o.get('isa') == 'PBXGroup' and o.get('path') == 'DayBar']
    if len(groups) != 1 or {objs[c].get('path') for c in groups[0]['children']} != {'DayBarWidgets.swift', 'Info.plist',
                                                                                      'PrivacyInfo.xcprivacy'}:
        die('the DayBar folder in the project does not hold DayBarWidgets.swift, Info.plist and PrivacyInfo.xcprivacy')
    ok('the DayBar folder holds its three files')

    # Each binary carries its own privacy manifest (Apple reads PlugIns/DayBar.appex on its own: the extension compiles
    # BusAnswer.swift, which uses UserDefaults). The extension's is the one in its folder; the app's is the app's.
    def resources(target):
        ph = [objs[p] for p in target['buildPhases'] if objs[p].get('isa') == 'PBXResourcesBuildPhase']
        return [objs[b]['fileRef'] for p in ph for b in p.get('files', [])]
    ext_res = [r for r in resources(ext) if objs[r].get('path') == 'PrivacyInfo.xcprivacy']
    if len(ext_res) != 1 or ext_res[0] not in groups[0]['children']:
        die('DayBar does not bundle its own PrivacyInfo.xcprivacy (from its folder) as a resource')
    app_res = [r for r in resources(app) if objs[r].get('path') == 'PrivacyInfo.xcprivacy']
    if len(app_res) != 1 or app_res[0] in groups[0]['children']:
        die('the App target does not bundle exactly its own privacy manifest (not the DayBar extension\'s)')
    ok('DayBar bundles its own privacy manifest (the app keeps its own)')
    print('check_daybar: all checks passed')


if __name__ == '__main__':
    main()
