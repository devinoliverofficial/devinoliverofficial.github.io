// DayBar: Greenroom's own small Capacitor plugin for the lock-screen day bar (a Live Activity).
//
// The page reaches it as window.Capacitor.Plugins.DayBar (registered by GreenroomViewController; no npm package,
// no bundler):
//   status()      -> { supported, enabled, running }   supported: iOS 16.2 or newer; enabled: Live Activities are
//                                                       allowed for Greenroom in the iPhone's Settings
//   show(payload) -> { ok, started }                    start the bar, or move the one already up on (one at a time)
//                    payload: { key, place, url, state: {now, nowSub, mine, since, next, nextAt, nextLabel, nextSub,
//                               then, thenAt}, staleAt, endAt, push, report? }
//                    At the day's last step (state.next empty: Bus Call) the bar is ended, to come down by itself at
//                    endAt, so it goes even if the phone stays locked; it is not put up again after that.
//   end({forget}) -> { ok }                             take the bar down (forget: also forget where tokens go)
// The page decides everything the bar says (src/core.js dayBarState); this file only hands it to iOS.
//
// Pushes (switched on Oct 22: the GitHub variable DAYBAR_PUSH = 1 gives the app target aps-environment = production,
// and the signing step switches Push Notifications on, and remakes the profile, for the app's bundle ID only; the DayBar
// extension needs neither. The server half: migration 0198 and the day bar tick in supabase/functions/notify,
// ios-app/README.md "The day bar's pushes"): with push true the bar asks Apple for a push token, so the server can
// move it on while the phone is locked, and (iOS 17.2+) for a "push to start" token, so the server can start a new one
// before Apple's 8-hour limit. The tokens go straight to the server from here (report: the address, the public key,
// this phone's id and its secret), even when iOS wakes the app in the background with no page running
// (DayBarLaunch.start, called from the AppDelegate by prepare.sh). Without Apple's push permission in the app (the
// aps-environment entitlement) iOS gives no tokens, and the bar works as with push false.

import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(DayBarPlugin)
public class DayBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DayBarPlugin"
    public let jsName = "DayBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        // A phone whose bar uses pushes listens for its tokens (the AppDelegate already started this at launch).
        DayBarLaunch.start()
    }

    @objc func status(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            call.resolve([
                "supported": true,
                "enabled": ActivityAuthorizationInfo().areActivitiesEnabled,
                "running": !Activity<DayBarAttributes>.activities.isEmpty
            ])
            return
        }
        #endif
        call.resolve(["supported": false, "enabled": false, "running": false])
    }

    @objc func show(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { call.resolve(["ok": false, "why": "ios"]); return }
        guard let key = call.getString("key"), !key.isEmpty, let st = call.getObject("state") else {
            call.reject("The day bar needs a key and a state")
            return
        }
        let state = DayBarAttributes.ContentState(
            now: DayBarJS.str(st["now"]), nowSub: DayBarJS.str(st["nowSub"]), mine: DayBarJS.bool(st["mine"]),
            since: DayBarJS.num(st["since"]), next: DayBarJS.str(st["next"]), nextAt: DayBarJS.num(st["nextAt"]),
            nextLabel: DayBarJS.str(st["nextLabel"]), nextSub: DayBarJS.str(st["nextSub"]),
            then: DayBarJS.str(st["then"]), thenAt: DayBarJS.num(st["thenAt"]),
            nowKey: DayBarJS.str(st["nowKey"]), nextKey: DayBarJS.str(st["nextKey"]),
            bus: DayBarJS.bool(st["bus"]), said: DayBarJS.str(st["said"]))
        let attrs = DayBarAttributes(key: key, place: call.getString("place") ?? "", url: call.getString("url") ?? "")
        let staleAt = call.getDouble("staleAt") ?? 0
        let endAt = call.getDouble("endAt") ?? 0
        let push = call.getBool("push") ?? false
        var fresh = false
        if push, let r = call.getObject("report") {
            fresh = DayBarReport.save(url: DayBarJS.str(r["url"]), key: DayBarJS.str(r["key"]),
                                      device: DayBarJS.str(r["device"]), secret: DayBarJS.str(r["secret"]))
        } else if !push {
            DayBarReport.clear()
        }
        Task {
            let out = await DayBarRunner.shared.show(attrs: attrs, state: state,
                                                     staleAt: staleAt > 0 ? Date(timeIntervalSince1970: staleAt) : nil,
                                                     endAt: endAt > 0 ? Date(timeIntervalSince1970: endAt) : nil,
                                                     push: push, resend: fresh)
            call.resolve(out)
        }
        #else
        call.resolve(["ok": false, "why": "ios"])
        #endif
    }

    @objc func end(_ call: CAPPluginCall) {
        // Switched off, or signing out: where the tokens went is forgotten too.
        if call.getBool("forget") ?? false { DayBarReport.clear() }
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task {
                await DayBarRunner.shared.endAll()
                call.resolve(["ok": true])
            }
            return
        }
        #endif
        call.resolve(["ok": true])
    }
}

/// Started at launch (the AppDelegate, through prepare.sh) and when the plugin loads: a phone whose bar uses pushes
/// listens for Apple's tokens from the first moment, also when iOS starts the app in the background to hand it the
/// token of a bar the server started (push to start), when no page or plugin may ever load.
enum DayBarLaunch {
    static func start() {
        // (The alarms: what the app does when a word is said from the bar's On bus / Off bus. AlarmsPlugin.swift.)
        GreenroomAlarms.launch()
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *), DayBarReport.saved() != nil {
            DayBarRunner.shared.watchTokens()
        }
        #endif
    }
}

/// Plain values out of what the page sent (numbers arrive as NSNumber).
enum DayBarJS {
    static func str(_ v: Any?) -> String { (v as? String) ?? "" }
    static func num(_ v: Any?) -> Double {
        if let n = v as? NSNumber { return n.doubleValue }
        if let d = v as? Double { return d }
        if let s = v as? String, let d = Double(s) { return d }
        return 0
    }
    static func bool(_ v: Any?) -> Bool {
        if let b = v as? Bool { return b }
        if let n = v as? NSNumber { return n.boolValue }
        return false
    }
}

/// Where this phone reports its push tokens (the server's daybar_report), kept on the phone. The secret only lets
/// a token be written for this one phone.
enum DayBarReport {
    private static let store = UserDefaults.standard
    private static let name = "greenroom.daybar.report"

    /// Answers true when this is new (the tokens the phone already has are then reported again, to the new place).
    @discardableResult
    static func save(url: String, key: String, device: String, secret: String) -> Bool {
        guard url.hasPrefix("https://"), !key.isEmpty, !device.isEmpty, !secret.isEmpty else { return false }
        let next = ["url": url, "key": key, "device": device, "secret": secret]
        if saved() == next { return false }
        store.set(next, forKey: name)
        return true
    }
    static func clear() { store.removeObject(forKey: name) }
    static func saved() -> [String: String]? { store.dictionary(forKey: name) as? [String: String] }

    /// kind "start": the phone's push-to-start token; "activity": one bar's update token (show: its key). The request
    /// is given time to finish even when iOS woke the app in the background only for this.
    static func send(kind: String, token: String, show: String, started: Date?) {
        guard let r = saved(), let u = r["url"], let url = URL(string: u), let key = r["key"] else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        let body: [String: Any] = [
            "p_device": r["device"] ?? "", "p_secret": r["secret"] ?? "", "p_kind": kind, "p_token": token,
            "p_show": show, "p_started": started.map { Int($0.timeIntervalSince1970) } ?? 0
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        let request = req
        ProcessInfo.processInfo.performExpiringActivity(withReason: "Greenroom day bar token") { expired in
            if expired { return }
            let done = DispatchSemaphore(value: 0)
            URLSession.shared.dataTask(with: request) { _, _, _ in done.signal() }.resume()
            _ = done.wait(timeout: .now() + 25)
        }
    }
}

#if canImport(ActivityKit)
@available(iOS 16.2, *)
final class DayBarRunner {
    static let shared = DayBarRunner()
    private var watched = Set<String>()
    private var reported = Set<String>()
    private var watchingStart = false
    private let lock = NSLock()
    /// When each bar went up (Apple ends a bar 8 hours after), by its id.
    private let startedName = "greenroom.daybar.started"

    private func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
    private func live(_ a: Activity<DayBarAttributes>) -> Bool {
        a.activityState != .ended && a.activityState != .dismissed
    }
    private func startedAt(_ id: String) -> Date? {
        let all = UserDefaults.standard.dictionary(forKey: startedName) as? [String: Double] ?? [:]
        return all[id].map { Date(timeIntervalSince1970: $0) }
    }
    private func markStarted(_ id: String) {
        var all = UserDefaults.standard.dictionary(forKey: startedName) as? [String: Double] ?? [:]
        let now = Date().timeIntervalSince1970
        all = all.filter { now - $0.value < 24 * 3600 }
        all[id] = now
        UserDefaults.standard.set(all, forKey: startedName)
    }

    /// Start the bar, or move the one already up for this show on. Any other show's bar is ended first. At the day's
    /// last step the bar is ended, to come down by itself at endAt; a bar of this show ended that way is the bar (it is
    /// not started again). resend: where tokens go is new, so the tokens the phone has are reported again.
    func show(attrs: DayBarAttributes, state: DayBarAttributes.ContentState, staleAt: Date?, endAt: Date?, push: Bool,
              resend: Bool) async -> [String: Any] {
        let content = ActivityContent(state: state, staleDate: staleAt, relevanceScore: 50)
        let last = state.next.isEmpty
        let downAt: Date? = last ? endAt.flatMap { $0 > Date() ? $0 : nil } : nil
        // (Pushes on: listen for the phone's push-to-start token and for bars the server starts, from now on.)
        if push { watchTokens() }
        if resend { reportStartToken() }
        var same: Activity<DayBarAttributes>? = nil
        var done = false
        for a in Activity<DayBarAttributes>.activities {
            if a.attributes.key == attrs.key {
                if same == nil && live(a) { same = a; continue }
                if last && a.activityState == .ended { done = true; continue }
            }
            await a.end(nil, dismissalPolicy: .immediate)
        }
        if let a = same {
            if let down = downAt {
                await a.end(content, dismissalPolicy: .after(down))
            } else {
                await a.update(content)
            }
            // (A bar watched for the first time reports its token; one already watched reports it again only when
            // where tokens go is new.)
            if push && !watch(a) && resend { report(a) }
            return ["ok": true, "started": false]
        }
        if done { return ["ok": true, "started": false] }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return ["ok": false, "why": "off"] }
        do {
            var made: Activity<DayBarAttributes>
            if push {
                do {
                    made = try Activity.request(attributes: attrs, content: content, pushType: .token)
                } catch {
                    // No push permission in this app yet: the bar works without pushes.
                    made = try Activity.request(attributes: attrs, content: content, pushType: nil)
                }
            } else {
                made = try Activity.request(attributes: attrs, content: content, pushType: nil)
            }
            markStarted(made.id)
            if push { watch(made) }
            if let down = downAt { await made.end(content, dismissalPolicy: .after(down)) }
            return ["ok": true, "started": true]
        } catch {
            return ["ok": false, "why": String(describing: error)]
        }
    }

    func endAll() async {
        for a in Activity<DayBarAttributes>.activities {
            await a.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// One bar's update token, to the server. A token from iOS's updates (given) goes once; the bar's token as it is
    /// now (a bar just watched, or where tokens go is new) goes every time it is asked for.
    private func report(_ a: Activity<DayBarAttributes>, token given: Data? = nil) {
        guard let data = given ?? a.pushToken else { return }
        let tok = hex(data)
        lock.lock()
        let first = reported.insert(a.id + ":" + tok).inserted
        lock.unlock()
        if !first && given != nil { return }
        DayBarReport.send(kind: "activity", token: tok, show: a.attributes.key, started: startedAt(a.id))
    }

    /// The phone's push-to-start token (iOS 17.2+), as it is now.
    private func reportStartToken() {
        if #available(iOS 17.2, *), let data = Activity<DayBarAttributes>.pushToStartToken {
            DayBarReport.send(kind: "start", token: hex(data), show: "", started: nil)
        }
    }

    /// Report one bar's update token to the server, now and whenever iOS changes it. Answers true the first time.
    @discardableResult
    func watch(_ a: Activity<DayBarAttributes>) -> Bool {
        lock.lock()
        let fresh = watched.insert(a.id).inserted
        lock.unlock()
        guard fresh else { return false }
        report(a)
        Task { [weak self] in
            for await data in a.pushTokenUpdates {
                guard let self = self else { return }
                self.report(a, token: data)
            }
        }
        return true
    }

    /// The phone's push-to-start token (iOS 17.2+), and the update token of any bar the server started. A bar the
    /// server started (before Apple's 8 hours were up) takes the place of this show's older one at once.
    func watchTokens() {
        lock.lock()
        let first = !watchingStart
        watchingStart = true
        lock.unlock()
        guard first else { return }
        if #available(iOS 17.2, *) {
            Task { [weak self] in
                for await data in Activity<DayBarAttributes>.pushToStartTokenUpdates {
                    guard let self = self else { return }
                    DayBarReport.send(kind: "start", token: self.hex(data), show: "", started: nil)
                }
            }
        }
        Task { [weak self] in
            for await a in Activity<DayBarAttributes>.activityUpdates {
                guard let self = self else { return }
                if self.startedAt(a.id) == nil { self.markStarted(a.id) }
                for other in Activity<DayBarAttributes>.activities where other.id != a.id && other.attributes.key == a.attributes.key {
                    await other.end(nil, dismissalPolicy: .immediate)
                }
                self.watch(a)
            }
        }
        for a in Activity<DayBarAttributes>.activities where live(a) { watch(a) }
    }
}
#endif
