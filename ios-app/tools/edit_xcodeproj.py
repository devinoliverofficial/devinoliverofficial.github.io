#!/usr/bin/env python3
"""Small, readable edits to the Xcode project that `npx cap add ios` just made.

Only the Python standard library is used. Every edit checks what it finds and
stops with a plain message if the project does not look the way it expects, so
a change in Capacitor's template shows up as a clear error in the build log
instead of a half-edited project.

    edit_xcodeproj.py PATH/TO/project.pbxproj \
        --bundle-id com.greenroomtour.app \
        --marketing-version 1.0.0 \
        --build-number 7 \
        --iphone-only \
        --add-resource PrivacyInfo.xcprivacy

--add-resource files the named file (which must already sit in the app's own
folder, next to Info.plist) into the project as a bundled resource, the same
way Xcode's "Add Files" does. It works by copying the project's own lines for
Assets.xcassets, so it follows whatever style the template uses.

--add-daybar BUNDLE_ID adds the lock-screen day bar (Devin's idea 20): a
WidgetKit extension target "DayBar" (its files in ios/App/DayBar: the Live
Activity's look and its Info.plist) with that bundle ID, embedded in the app
(Embed Foundation Extensions) and built before it; and the app's own Swift
files for it (DayBarAttributes.swift, which both targets compile, DayBarPlugin.swift
and GreenroomViewController.swift, all next to Info.plist). The extension gets the
same version and build number as the app (Apple refuses a mismatch), iPhone only.
prepare.sh copies the files in first (from ios-app/native). Running it again
changes nothing.

It also files the alarms (Devin, Oct 22): AlarmsPlugin.swift (the app's own
Alarms plugin and the bus call alarm's "I'm on the bus", the app only) and
BusAnswer.swift (answering Bus Check from the lock screen: BOTH targets, since
the extension draws the bar's On bus / Off bus buttons that name its intent).

--app-entitlements PATH gives the app target an entitlements file (for Apple's
push permission, aps-environment; staged, see prepare.sh DAYBAR_PUSH).

--weak-framework NAME (repeatable) links that Apple framework weakly in the app
target (OTHER_LDFLAGS -weak_framework NAME): the app runs from iOS 15, and a
framework newer than that (AlarmKit is iOS 26, AppIntents iOS 16, ActivityKit
iOS 16.1) must not stop the app opening on an older iPhone. Running it again
changes nothing.

The app's bundle ID (--bundle-id) is set only in the app target's own build
settings (the ones that read App/Info.plist), never in the extension's.
"""
import argparse
import hashlib
import re
import sys


def die(message):
    sys.stderr.write('edit_xcodeproj: ' + message + '\n')
    sys.exit(1)


def fresh_id(text, seed):
    """A 24-character Xcode object id that is not used anywhere in the project yet."""
    n = 0
    while True:
        digest = hashlib.md5((seed + ':' + str(n)).encode('utf-8')).hexdigest().upper()[:24]
        if digest not in text:
            return digest
        n += 1


def set_every(text, key, value, quote, at_least=1):
    """Give every `KEY = something;` the same value (build settings repeat per configuration)."""
    pattern = re.compile(r'(\b' + re.escape(key) + r' = )("[^"]*"|[^;\s]+)(;)')
    found = len(pattern.findall(text))
    if found < at_least:
        die('expected at least %d "%s" settings, found %d' % (at_least, key, found))
    shown = '"' + value + '"' if quote else value
    return pattern.sub(lambda m: m.group(1) + shown + m.group(3), text)


def add_resource(text, filename):
    """File `filename` into the App group and the Resources build phase."""
    if 'PBXFileSystemSynchronizedRootGroup' in text:
        # Newer Xcode projects pick up every file in the folder by themselves.
        print('edit_xcodeproj: synchronized folders: %s is picked up by itself' % filename)
        return text
    # (Already in the App group. The DayBar extension files its own PrivacyInfo.xcprivacy in its own group, which does
    # not count; a project with no App group found falls back to any mention.)
    app_groups = [b for b in blocks(text) if 'isa = PBXGroup;' in b[2] and re.search(r'^\t+path = App;$', b[2], re.M)]
    if (any('/* ' + filename + ' */,' in b[2] for b in app_groups) if app_groups else '/* ' + filename + ' */' in text):
        print('edit_xcodeproj: %s is already in the project' % filename)
        return text

    lines = text.split('\n')

    def only(regex, what):
        hits = [i for i, ln in enumerate(lines) if re.search(regex, ln)]
        if len(hits) != 1:
            die('expected exactly one %s line, found %d (the template may have changed)' % (what, len(hits)))
        return hits[0]

    id_ = r'[0-9A-F]{24}'
    i_build = only(id_ + r' /\* Assets\.xcassets in Resources \*/ = \{isa = PBXBuildFile;', 'Assets build-file')
    i_ref = only(id_ + r' /\* Assets\.xcassets \*/ = \{isa = PBXFileReference;', 'Assets file-reference')
    i_group = only(r'^\s*' + id_ + r' /\* Assets\.xcassets \*/,\s*$', 'App-group Assets entry')
    i_phase = only(r'^\s*' + id_ + r' /\* Assets\.xcassets in Resources \*/,\s*$', 'Resources-phase Assets entry')

    ref_id = fresh_id(text, filename + ' file reference')
    build_id = fresh_id(text, filename + ' build file')

    indent = lambda ln: re.match(r'\s*', ln).group(0)
    new_build = '%s%s /* %s in Resources */ = {isa = PBXBuildFile; fileRef = %s /* %s */; };' % (
        indent(lines[i_build]), build_id, filename, ref_id, filename)
    new_ref = '%s%s /* %s */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = %s; sourceTree = "<group>"; };' % (
        indent(lines[i_ref]), ref_id, filename, filename)
    new_group = '%s%s /* %s */,' % (indent(lines[i_group]), ref_id, filename)
    new_phase = '%s%s /* %s in Resources */,' % (indent(lines[i_phase]), build_id, filename)

    # Insert from the bottom up so earlier line numbers stay true.
    for index, line in sorted([(i_build, new_build), (i_ref, new_ref), (i_group, new_group), (i_phase, new_phase)],
                              reverse=True):
        lines.insert(index + 1, line)
    print('edit_xcodeproj: filed %s into the project (build file %s, reference %s)' % (filename, build_id, ref_id))
    return '\n'.join(lines)


# ---- objects in the project file ----------------------------------------------------------
BLOCK = re.compile(r'^\t\t([0-9A-F]{24}) (?:/\* (.*?) \*/ )?= \{\n(.*?)^\t\t\};\n', re.M | re.S)


def blocks(text):
    """Every multi-line object: (id, comment, body, start, end)."""
    return [(m.group(1), m.group(2) or '', m.group(3), m.start(), m.end()) for m in BLOCK.finditer(text)]


def app_config_blocks(text):
    """The app target's own build configurations: the ones that read App/Info.plist."""
    return [b for b in blocks(text) if 'isa = XCBuildConfiguration;' in b[2] and 'INFOPLIST_FILE = App/Info.plist;' in b[2]]


def replace_body(text, block, body):
    oid, comment, old, start, end = block
    return text[:start] + text[start:end].replace(old, body, 1) + text[end:]


def set_in_app_configs(text, key, value, at_least=1):
    """`KEY = value;` in the app target's own build configurations only (never the extension's)."""
    found = app_config_blocks(text)
    pattern = re.compile(r'(\b' + re.escape(key) + r' = )("[^"]*"|[^;\s]+)(;)')
    hits = sum(len(pattern.findall(b[2])) for b in found)
    if hits < at_least:
        die('expected at least %d "%s" settings in the app target, found %d' % (at_least, key, hits))
    for b in sorted(found, key=lambda x: x[3], reverse=True):
        text = replace_body(text, b, pattern.sub(lambda m: m.group(1) + value + m.group(3), b[2]))
    return text


def one_block(text, test, what):
    hits = [b for b in blocks(text) if test(b)]
    if len(hits) != 1:
        die('expected exactly one %s, found %d (the template may have changed)' % (what, len(hits)))
    return hits[0]


def by_id(text, oid, what):
    return one_block(text, lambda b: b[0] == oid, what)


def add_to_list(text, block, key, item):
    """Add `item,` to the list `key = ( ... );` inside one object."""
    body = block[2]
    m = re.search(r'^(\t+)' + re.escape(key) + r' = \(\n(.*?)^\1\);\n', body, re.M | re.S)
    if not m:
        die('the object %s has no "%s" list' % (block[1] or block[0], key))
    line = m.group(1) + '\t' + item + ',\n'
    return replace_body(text, block, body[:m.end(2)] + line + body[m.end(2):])


def add_objects(text, chunks):
    """New objects go just before the end of the objects list, each under its own section comment."""
    i = text.rfind('\n\t};\n\trootObject = ')
    if i < 0:
        die('the project file does not end the way an Xcode project does')
    return text[:i + 1] + ''.join(chunks) + text[i + 1:]


def add_daybar(text, ext_id, marketing_version, build_number):
    """The lock-screen day bar: a WidgetKit extension target, embedded in the app, and the app's own Swift files."""
    if 'PBXFileSystemSynchronizedRootGroup' in text:
        die('this project uses synchronized folders; --add-daybar knows only the classic project format')
    if 'DayBar.appex' in text:
        print('edit_xcodeproj: the DayBar extension is already in the project')
        return text
    if not re.match(r'^[A-Za-z0-9]+(\.[A-Za-z0-9-]+)+$', ext_id):
        die('"%s" is not a bundle ID' % ext_id)

    root = re.search(r'\brootObject = ([0-9A-F]{24})', text)
    if not root:
        die('no rootObject in the project')
    root = root.group(1)
    proj = one_block(text, lambda b: b[0] == root and 'isa = PBXProject;' in b[2], 'project object')
    main_group = re.search(r'\bmainGroup = ([0-9A-F]{24})', proj[2])
    products = re.search(r'\bproductRefGroup = ([0-9A-F]{24})', proj[2])
    if not (main_group and products):
        die('the project object has no main group or Products group')
    app = one_block(text, lambda b: 'isa = PBXNativeTarget;' in b[2] and re.search(r'^\t+name = App;$', b[2], re.M),
                    'App target')
    app_group = one_block(text, lambda b: 'isa = PBXGroup;' in b[2] and re.search(r'^\t+path = App;$', b[2], re.M),
                          'App group')
    sources = re.search(r'([0-9A-F]{24}) /\* Sources \*/', app[2])
    if not sources:
        die('the App target has no Sources phase')
    by_id(text, sources.group(1), 'App Sources phase')

    made = []

    def make(seed):
        i = fresh_id(text + ' '.join(made), 'daybar:' + seed)
        made.append(i)
        return i

    f_attrs, f_plugin, f_vc = make('ref attrs'), make('ref plugin'), make('ref vc')
    f_alarms, f_bus = make('ref alarms'), make('ref bus answer')
    b_alarms, b_bus_app, b_bus_ext = make('bf alarms'), make('bf bus answer app'), make('bf bus answer ext')
    f_widgets, f_plist, f_appex = make('ref widgets'), make('ref plist'), make('ref appex')
    b_attrs_app, b_plugin, b_vc = make('bf attrs app'), make('bf plugin'), make('bf vc')
    b_attrs_ext, b_widgets, b_embed = make('bf attrs ext'), make('bf widgets'), make('bf embed')
    g_daybar, t_ext = make('group'), make('target')
    ph_src, ph_fw, ph_res, ph_embed = make('phase src'), make('phase fw'), make('phase res'), make('phase embed')
    proxy, dep = make('proxy'), make('dependency')
    cl, c_debug, c_release = make('config list'), make('config debug'), make('config release')
    # The extension's own privacy manifest (DayBar/PrivacyInfo.xcprivacy): Apple reads each binary, and the extension
    # compiles BusAnswer.swift (UserDefaults, a required-reason API).
    f_privacy, b_privacy = make('ref privacy'), make('bf privacy')

    T2, T3, T4, T5 = '\t\t', '\t\t\t', '\t\t\t\t', '\t\t\t\t\t'

    def section(isa, body):
        return '/* Begin %s section */\n%s/* End %s section */\n' % (isa, body, isa)

    def obj(oid, comment, lines):
        """A multi-line object; a line that is a (key, [items]) pair is a list."""
        out = T2 + '%s /* %s */ = {\n' % (oid, comment)
        for ln in lines:
            if isinstance(ln, tuple):
                out += T3 + ln[0] + ' = (\n' + ''.join(T4 + it + ',\n' for it in ln[1]) + T3 + ');\n'
            else:
                out += T3 + ln + '\n'
        return out + T2 + '};\n'

    def config(cid, name):
        settings = [
            ('APPLICATION_EXTENSION_API_ONLY', 'YES'),
            ('CODE_SIGN_STYLE', 'Automatic'),
            ('CURRENT_PROJECT_VERSION', build_number),
            ('GENERATE_INFOPLIST_FILE', 'NO'),
            ('INFOPLIST_FILE', 'DayBar/Info.plist'),
            ('IPHONEOS_DEPLOYMENT_TARGET', '16.2'),
            ('LD_RUNPATH_SEARCH_PATHS', ['"$(inherited)"', '"@executable_path/Frameworks"', '"@executable_path/../../Frameworks"']),
            ('MARKETING_VERSION', marketing_version),
            ('PRODUCT_BUNDLE_IDENTIFIER', ext_id),
            ('PRODUCT_NAME', '"$(TARGET_NAME)"'),
            ('SKIP_INSTALL', 'YES'),
            ('SWIFT_ACTIVE_COMPILATION_CONDITIONS', 'DEBUG' if name == 'Debug' else '""'),
            ('SWIFT_VERSION', '5.0'),
            ('TARGETED_DEVICE_FAMILY', '1'),
        ]
        out = T2 + '%s /* %s */ = {\n' % (cid, name) + T3 + 'isa = XCBuildConfiguration;\n' + T3 + 'buildSettings = {\n'
        for k, v in settings:
            if isinstance(v, list):
                out += T4 + k + ' = (\n' + ''.join(T5 + x + ',\n' for x in v) + T4 + ');\n'
            else:
                out += T4 + '%s = %s;\n' % (k, v)
        return out + T3 + '};\n' + T3 + 'name = %s;\n' % name + T2 + '};\n'

    def bf(oid, name, ref, phase, extra=''):
        return T2 + '%s /* %s in %s */ = {isa = PBXBuildFile; fileRef = %s /* %s */; %s};\n' % (oid, name, phase, ref, name, extra)

    def fref(oid, name, kind):
        return T2 + '%s /* %s */ = {isa = PBXFileReference; lastKnownFileType = %s; path = %s; sourceTree = "<group>"; };\n' % (
            oid, name, kind, name)

    chunks = [
        section('PBXBuildFile',
                bf(b_attrs_app, 'DayBarAttributes.swift', f_attrs, 'Sources') +
                bf(b_plugin, 'DayBarPlugin.swift', f_plugin, 'Sources') +
                bf(b_vc, 'GreenroomViewController.swift', f_vc, 'Sources') +
                bf(b_alarms, 'AlarmsPlugin.swift', f_alarms, 'Sources') +
                bf(b_bus_app, 'BusAnswer.swift', f_bus, 'Sources') +
                bf(b_bus_ext, 'BusAnswer.swift', f_bus, 'Sources') +
                bf(b_attrs_ext, 'DayBarAttributes.swift', f_attrs, 'Sources') +
                bf(b_widgets, 'DayBarWidgets.swift', f_widgets, 'Sources') +
                bf(b_privacy, 'PrivacyInfo.xcprivacy', f_privacy, 'Resources') +
                bf(b_embed, 'DayBar.appex', f_appex, 'Embed Foundation Extensions',
                   'settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; ')),
        section('PBXFileReference',
                fref(f_attrs, 'DayBarAttributes.swift', 'sourcecode.swift') +
                fref(f_plugin, 'DayBarPlugin.swift', 'sourcecode.swift') +
                fref(f_vc, 'GreenroomViewController.swift', 'sourcecode.swift') +
                fref(f_alarms, 'AlarmsPlugin.swift', 'sourcecode.swift') +
                fref(f_bus, 'BusAnswer.swift', 'sourcecode.swift') +
                fref(f_widgets, 'DayBarWidgets.swift', 'sourcecode.swift') +
                fref(f_plist, 'Info.plist', 'text.plist.xml') +
                fref(f_privacy, 'PrivacyInfo.xcprivacy', 'text.xml') +
                T2 + '%s /* DayBar.appex */ = {isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; '
                     'includeInIndex = 0; path = DayBar.appex; sourceTree = BUILT_PRODUCTS_DIR; };\n' % f_appex),
        section('PBXGroup', obj(g_daybar, 'DayBar', [
            'isa = PBXGroup;',
            ('children', ['%s /* DayBarWidgets.swift */' % f_widgets, '%s /* Info.plist */' % f_plist,
                          '%s /* PrivacyInfo.xcprivacy */' % f_privacy]),
            'path = DayBar;', 'sourceTree = "<group>";'])),
        section('PBXNativeTarget', obj(t_ext, 'DayBar', [
            'isa = PBXNativeTarget;',
            'buildConfigurationList = %s /* Build configuration list for PBXNativeTarget "DayBar" */;' % cl,
            ('buildPhases', ['%s /* Sources */' % ph_src, '%s /* Frameworks */' % ph_fw, '%s /* Resources */' % ph_res]),
            ('buildRules', []), ('dependencies', []),
            'name = DayBar;', 'productName = DayBar;',
            'productReference = %s /* DayBar.appex */;' % f_appex,
            'productType = "com.apple.product-type.app-extension";'])),
        section('PBXSourcesBuildPhase', obj(ph_src, 'Sources', [
            'isa = PBXSourcesBuildPhase;', 'buildActionMask = 2147483647;',
            ('files', ['%s /* DayBarWidgets.swift in Sources */' % b_widgets, '%s /* DayBarAttributes.swift in Sources */' % b_attrs_ext,
                       '%s /* BusAnswer.swift in Sources */' % b_bus_ext]),
            'runOnlyForDeploymentPostprocessing = 0;'])),
        section('PBXFrameworksBuildPhase', obj(ph_fw, 'Frameworks', [
            'isa = PBXFrameworksBuildPhase;', 'buildActionMask = 2147483647;', ('files', []),
            'runOnlyForDeploymentPostprocessing = 0;'])),
        section('PBXResourcesBuildPhase', obj(ph_res, 'Resources', [
            'isa = PBXResourcesBuildPhase;', 'buildActionMask = 2147483647;',
            ('files', ['%s /* PrivacyInfo.xcprivacy in Resources */' % b_privacy]),
            'runOnlyForDeploymentPostprocessing = 0;'])),
        section('PBXCopyFilesBuildPhase', obj(ph_embed, 'Embed Foundation Extensions', [
            'isa = PBXCopyFilesBuildPhase;', 'buildActionMask = 2147483647;', 'dstPath = "";', 'dstSubfolderSpec = 13;',
            ('files', ['%s /* DayBar.appex in Embed Foundation Extensions */' % b_embed]),
            'name = "Embed Foundation Extensions";', 'runOnlyForDeploymentPostprocessing = 0;'])),
        section('PBXContainerItemProxy', obj(proxy, 'PBXContainerItemProxy', [
            'isa = PBXContainerItemProxy;', 'containerPortal = %s /* Project object */;' % root, 'proxyType = 1;',
            'remoteGlobalIDString = %s;' % t_ext, 'remoteInfo = DayBar;'])),
        section('PBXTargetDependency', obj(dep, 'PBXTargetDependency', [
            'isa = PBXTargetDependency;', 'target = %s /* DayBar */;' % t_ext,
            'targetProxy = %s /* PBXContainerItemProxy */;' % proxy])),
        section('XCBuildConfiguration', config(c_debug, 'Debug') + config(c_release, 'Release')),
        section('XCConfigurationList', obj(cl, 'Build configuration list for PBXNativeTarget "DayBar"', [
            'isa = XCConfigurationList;',
            ('buildConfigurations', ['%s /* Debug */' % c_debug, '%s /* Release */' % c_release]),
            'defaultConfigurationIsVisible = 0;', 'defaultConfigurationName = Release;'])),
    ]

    # The existing objects: the app's own files, its embed phase and its dependency, the groups, the target list.
    for item in ('%s /* DayBarAttributes.swift in Sources */' % b_attrs_app, '%s /* DayBarPlugin.swift in Sources */' % b_plugin,
                 '%s /* GreenroomViewController.swift in Sources */' % b_vc,
                 '%s /* AlarmsPlugin.swift in Sources */' % b_alarms, '%s /* BusAnswer.swift in Sources */' % b_bus_app):
        text = add_to_list(text, by_id(text, sources.group(1), 'App Sources phase'), 'files', item)
    text = add_to_list(text, by_id(text, app[0], 'App target'), 'buildPhases', '%s /* Embed Foundation Extensions */' % ph_embed)
    text = add_to_list(text, by_id(text, app[0], 'App target'), 'dependencies', '%s /* PBXTargetDependency */' % dep)
    for item in ('%s /* DayBarAttributes.swift */' % f_attrs, '%s /* DayBarPlugin.swift */' % f_plugin,
                 '%s /* GreenroomViewController.swift */' % f_vc,
                 '%s /* AlarmsPlugin.swift */' % f_alarms, '%s /* BusAnswer.swift */' % f_bus):
        text = add_to_list(text, by_id(text, app_group[0], 'App group'), 'children', item)
    text = add_to_list(text, by_id(text, main_group.group(1), 'main group'), 'children', '%s /* DayBar */' % g_daybar)
    text = add_to_list(text, by_id(text, products.group(1), 'Products group'), 'children', '%s /* DayBar.appex */' % f_appex)
    text = add_to_list(text, by_id(text, root, 'project object'), 'targets', '%s /* DayBar */' % t_ext)
    text = add_objects(text, chunks)
    print('edit_xcodeproj: added the DayBar extension (%s), embedded in the app, version %s (%s)' % (
        ext_id, marketing_version, build_number))
    return text


def weak_frameworks(text, names):
    """OTHER_LDFLAGS -weak_framework NAME, for the app target's own build configurations (never the extension's)."""
    found = app_config_blocks(text)
    if len(found) < 2:
        die('expected the app target\'s two build configurations, found %d' % len(found))
    for b in sorted(found, key=lambda x: x[3], reverse=True):
        body = b[2]
        m = re.search(r'^(\t+)OTHER_LDFLAGS = (\(\n.*?^\1\);|[^;\n]+;)\n', body, re.M | re.S)
        if m:
            old = m.group(2)
            if old.startswith('('):
                items = [x.strip().rstrip(',') for x in old[1:-2].strip().split('\n') if x.strip()]
            else:
                items = [old[:-1].strip()]
        else:
            items = ['"$(inherited)"']
        for n in names:
            if not re.match(r'^[A-Za-z][A-Za-z0-9]*$', n):
                die('"%s" is not a framework name' % n)
            if n not in items:
                items += ['"-weak_framework"', n]
        ind = m.group(1) if m else '\t\t\t\t'
        block = ind + 'OTHER_LDFLAGS = (\n' + ''.join(ind + '\t' + x + ',\n' for x in items) + ind + ');\n'
        if m:
            body = body[:m.start()] + block + body[m.end():]
        else:
            body = body.replace('buildSettings = {\n', 'buildSettings = {\n' + block, 1)
        text = replace_body(text, b, body)
    print('edit_xcodeproj: the app target links %s weakly' % ', '.join(names))
    return text


def app_entitlements(text, path):
    """CODE_SIGN_ENTITLEMENTS for the app target's own build configurations."""
    found = app_config_blocks(text)
    if len(found) < 2:
        die('expected the app target\'s two build configurations, found %d' % len(found))
    for b in sorted(found, key=lambda x: x[3], reverse=True):
        if 'CODE_SIGN_ENTITLEMENTS = ' in b[2]:
            body = re.sub(r'CODE_SIGN_ENTITLEMENTS = [^;]+;', 'CODE_SIGN_ENTITLEMENTS = %s;' % path, b[2])
        else:
            body = b[2].replace('buildSettings = {\n', 'buildSettings = {\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = %s;\n' % path, 1)
        text = replace_body(text, b, body)
    print('edit_xcodeproj: the app target signs with %s' % path)
    return text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pbxproj')
    ap.add_argument('--bundle-id')
    ap.add_argument('--marketing-version')
    ap.add_argument('--build-number')
    ap.add_argument('--iphone-only', action='store_true')
    ap.add_argument('--add-resource', action='append', default=[])
    ap.add_argument('--add-daybar', metavar='BUNDLE_ID')
    ap.add_argument('--app-entitlements', metavar='PATH')
    ap.add_argument('--weak-framework', action='append', default=[], metavar='NAME')
    args = ap.parse_args()

    with open(args.pbxproj, encoding='utf-8') as fh:
        text = fh.read()
    before = text

    if args.bundle_id:
        text = set_in_app_configs(text, 'PRODUCT_BUNDLE_IDENTIFIER', args.bundle_id, at_least=2)
    if args.marketing_version:
        text = set_every(text, 'MARKETING_VERSION', args.marketing_version, quote=False, at_least=2)
    if args.build_number:
        text = set_every(text, 'CURRENT_PROJECT_VERSION', args.build_number, quote=False, at_least=2)
    if args.iphone_only:
        text = set_every(text, 'TARGETED_DEVICE_FAMILY', '1', quote=False, at_least=2)
    for name in args.add_resource:
        text = add_resource(text, name)
    if args.add_daybar:
        if not (args.marketing_version and args.build_number):
            die('--add-daybar needs --marketing-version and --build-number (the extension must match the app)')
        text = add_daybar(text, args.add_daybar, args.marketing_version, args.build_number)
    if args.app_entitlements:
        text = app_entitlements(text, args.app_entitlements)
    if args.weak_framework:
        text = weak_frameworks(text, args.weak_framework)

    if text != before:
        with open(args.pbxproj, 'w', encoding='utf-8') as fh:
            fh.write(text)


if __name__ == '__main__':
    main()
