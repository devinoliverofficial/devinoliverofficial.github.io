// ShareInbox: where the Share button's text waits for the app (MODELXOFFTOUR, Devin, Oct 30, on the Notes Share button: "Sounds good.
// But don't forget"). The ShareNote extension cannot open the app or hand it anything, so it leaves { text, at } in the App Group
// the two share, and the page takes it the next time it runs, and opens Paste a list with it. Nothing is added until the person
// saves, and nothing leaves the phone by itself.
//
// The page reaches it as window.Capacitor.Plugins.ShareInbox (registered by GreenroomViewController):
//   take()  -> { text }   the text waiting, and it is gone from here. Nothing when there is none, or it is more than a day old.
//   clear() -> { ok }     signing out: one account's shared text is never handed to the next. The day covers an account that left
//                         without signing out.

import Foundation
import Capacitor

@objc(ShareInboxPlugin)
public class ShareInboxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareInboxPlugin"
    public let jsName = "ShareInbox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    @objc func take(_ call: CAPPluginCall) {
        if let text = ShareInbox.take() { call.resolve(["text": text]) } else { call.resolve([:]) }
    }

    @objc func clear(_ call: CAPPluginCall) {
        ShareInbox.clear()
        call.resolve(["ok": true])
    }
}

enum ShareInbox {
    private static let name = "greenroom.share.inbox"
    private static let keepFor: TimeInterval = 24 * 3600
    /// The app's bundle ID with group. in front, as prepare.sh writes it in both entitlements files.
    private static var box: UserDefaults? { UserDefaults(suiteName: "group." + (Bundle.main.bundleIdentifier ?? "")) }

    static func take() -> String? {
        guard let d = box, let got = d.dictionary(forKey: name) else { return nil }
        d.removeObject(forKey: name)
        guard let text = got["text"] as? String, !text.isEmpty, let at = got["at"] as? Double,
              Date().timeIntervalSince1970 - at <= keepFor else { return nil }
        return text
    }

    static func clear() { box?.removeObject(forKey: name) }
}
