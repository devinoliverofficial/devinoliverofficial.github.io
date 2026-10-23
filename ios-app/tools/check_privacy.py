#!/usr/bin/env python3
"""Checks that the app's privacy manifest (PrivacyInfo.xcprivacy) says what it means to say.

    check_privacy.py PATH/TO/PrivacyInfo.xcprivacy

plutil -lint only proves the file is a property list. A dict dropped inside another type's purposes list still
lints, but Apple then reads fewer types than the file holds (Oct 22: three of them sat inside User ID's purposes).
So this reads the file the way Apple does and checks every collected type: it is its own dict directly in
NSPrivacyCollectedDataTypes, it is named the way Apple spells it, it says linked and tracking as true or false, and
its purposes are a list of Apple's purpose names, each one a string. Prints one "ok" line per type, or the first
thing that is wrong, and exits non-zero then. Only the Python standard library is used.
"""
import plistlib
import sys

# Apple's names (developer.apple.com, "NSPrivacyCollectedDataType" and "NSPrivacyCollectedDataTypePurposes").
TYPES = {
    'Name', 'EmailAddress', 'PhoneNumber', 'PhysicalAddress', 'OtherUserContactInfo',
    'Health', 'Fitness',
    'PaymentInfo', 'CreditInfo', 'OtherFinancialInfo',
    'PreciseLocation', 'CoarseLocation',
    'SensitiveInfo', 'Contacts',
    'EmailsOrTextMessages', 'PhotosorVideos', 'AudioData', 'GameplayContent', 'CustomerSupport', 'OtherUserContent',
    'BrowsingHistory', 'SearchHistory',
    'UserID', 'DeviceID',
    'PurchaseHistory',
    'ProductInteraction', 'AdvertisingData', 'OtherUsageData',
    'CrashData', 'PerformanceData', 'OtherDiagnosticData',
    'EnvironmentScanning', 'Hands', 'Head',
    'OtherDataTypes',
}
PURPOSES = {'ThirdPartyAdvertising', 'DeveloperAdvertising', 'Analytics', 'ProductPersonalization', 'AppFunctionality', 'Other'}
KEYS = {'NSPrivacyCollectedDataType', 'NSPrivacyCollectedDataTypeLinked', 'NSPrivacyCollectedDataTypeTracking',
        'NSPrivacyCollectedDataTypePurposes'}


def die(msg):
    sys.stderr.write('check_privacy: WRONG ' + msg + '\n')
    sys.exit(1)


def ok(msg):
    print('check_privacy: ok    ' + msg)


def main():
    if len(sys.argv) != 2:
        die('usage: check_privacy.py PrivacyInfo.xcprivacy')
    try:
        with open(sys.argv[1], 'rb') as f:
            doc = plistlib.load(f)
    except Exception as e:  # a missing file or one that is not a property list
        die('the privacy manifest cannot be read as a property list (%s)' % e)
    if not isinstance(doc, dict):
        die('the privacy manifest is not a dict at the top')
    if doc.get('NSPrivacyTracking') is not False:
        die('NSPrivacyTracking is not false')
    types = doc.get('NSPrivacyCollectedDataTypes')
    if not isinstance(types, list) or not types:
        die('NSPrivacyCollectedDataTypes is not a list of types')
    seen = set()
    for i, t in enumerate(types):
        if not isinstance(t, dict):
            die('collected type %d is not a dict' % i)
        name = t.get('NSPrivacyCollectedDataType')
        if not isinstance(name, str) or not name.startswith('NSPrivacyCollectedDataType') \
                or name[len('NSPrivacyCollectedDataType'):] not in TYPES:
            die('collected type %d is not one of Apple\'s names: %r' % (i, name))
        if name in seen:
            die('%s is listed twice' % name)
        seen.add(name)
        if set(t) != KEYS:
            die('%s holds %s, not exactly the four keys Apple reads' % (name, sorted(t)))
        if not isinstance(t['NSPrivacyCollectedDataTypeLinked'], bool) or not isinstance(t['NSPrivacyCollectedDataTypeTracking'], bool):
            die('%s: linked and tracking must each be true or false' % name)
        purposes = t['NSPrivacyCollectedDataTypePurposes']
        if not isinstance(purposes, list) or not purposes:
            die('%s has no list of purposes' % name)
        for p in purposes:
            if not isinstance(p, str):
                die('%s has a purpose that is not a string (a %s: a type dropped inside another type\'s purposes?)' % (name, type(p).__name__))
            if not p.startswith('NSPrivacyCollectedDataTypePurpose') or p[len('NSPrivacyCollectedDataTypePurpose'):] not in PURPOSES:
                die('%s has a purpose that is not one of Apple\'s names: %r' % (name, p))
        ok('%s (linked %s, tracking %s): %s' % (name[len('NSPrivacyCollectedDataType'):],
                                                 'yes' if t['NSPrivacyCollectedDataTypeLinked'] else 'no',
                                                 'yes' if t['NSPrivacyCollectedDataTypeTracking'] else 'no',
                                                 ', '.join(p[len('NSPrivacyCollectedDataTypePurpose'):] for p in purposes)))
    ok('%d collected types, each its own dict, every purpose a string' % len(types))


if __name__ == '__main__':
    main()
