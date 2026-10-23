// Alarms: Greenroom's own small Capacitor plugin for the stage, bus call and guest list last call alarms (Devin, Oct 22,
// all "Yes").
//
//   (1) Stage alarm: 30 minutes before your band's set, the phone rings and vibrates like an alarm; tap Stop.
//   (2) Bus call alarm: at bus call the phone goes off like an alarm; the alarm screen has one more button, "I'm on the
//       bus", which says On bus in Bus Check without unlocking the phone or opening the app.
//   (3) Guest list last call alarm ("GUEST LIST LAST CALL", "15min earlier"): 15 minutes before the day's last call
//       (the day sheet's, else the tour's LAST CALL TIME), like the stage alarm; tap Stop.
//   iPhone asks once "Allow Greenroom to set alarms?" (NSAlarmKitUsageDescription, set by prepare.sh). No snooze. An
//   iPhone older than iOS 26 (no AlarmKit), or one where alarms are not allowed, gets a normal notification at the same
//   moment instead (only when this phone does not already get the server's own alert for it).
//
// The page reaches it as window.Capacitor.Plugins.Alarms (registered by GreenroomViewController; no npm package, no
// bundler):
//   status()      -> { alarmKit, auth, notify }     alarmKit: iOS 26 or newer; auth: "authorized" | "denied" |
//                                                    "notDetermined" (AlarmKit), "" without it; notify: "granted" |
//                                                    "denied" | "prompt" (normal notifications)
//   sync(plan)    -> { ok, mode, auth, set, pending }   plan: { uid, stage, bus, lastcall (the three switches), fbStage,
//                    fbBus, fbLastcall (a normal notification may stand in), items: [{ id, kind ("stage" | "bus" |
//                    "lastcall"), at (seconds), tour, title, body }], busAnswer: { url, key, device, secret, uid } | null, ask (may put up iOS's one
//                    question now) }. Sets every alarm switched on that is still to come, takes away every one that is
//                    gone (never one ringing right now), and keeps the plan on the phone. mode: "alarm" | "notify" |
//                    "none". pending: words said from the lock screen with no signal, for the page to say (once).
//   clear()       -> { ok }                          signing out: every alarm and stand-in notification off this phone,
//                                                    the plan and where Bus Check is answered forgotten.
//   (A sync for an account other than the one the phone answers Bus Check for forgets where to answer: an account that
//   left without signing out never has a word said for it from this phone.)
// The page decides every time (src/core.js showAlarms, src/app.js alarmItems); this file only hands them to iOS.
//
// The server's quiet hand-over (the notify function's alarm nudge: a day sheet saved, a mute tapped, set times
// carried): Apple wakes the app in the background with { alarms: { u, t, v, i } } (the AppDelegate's
// didReceiveRemoteNotification, added by prepare.sh). For the account signed in on this phone only, that tour's items are
// replaced and set again with the same switches, without asking anything. Syncs, hand-overs and signing out run one at
// a time, in the order they came (AlarmDesk), and a hand-over reads the plan only when its turn comes. v: the tour's
// version (when it was last saved); a hand-over older than the last one set for its tour is never set (HandOverMarks).

import Foundation
import UIKit
import Capacitor
import CryptoKit
import UserNotifications
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif
#if canImport(AppIntents)
import AppIntents
#endif
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(AlarmsPlugin)
public class AlarmsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlarmsPlugin"
    public let jsName = "Alarms"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        GreenroomAlarms.launch()
    }

    @objc func status(_ call: CAPPluginCall) {
        Task {
            let st = await GreenroomAlarms.desk.status()
            call.resolve(st.js)
        }
    }

    @objc func sync(_ call: CAPPluginCall) {
        let raw = (call.getArray("items") ?? []).compactMap { $0 as? [String: Any] }
        var plan = AlarmPlan(uid: call.getString("uid") ?? "", stage: call.getBool("stage") ?? true, bus: call.getBool("bus") ?? true,
                             fbStage: call.getBool("fbStage") ?? true, fbBus: call.getBool("fbBus") ?? true, items: [],
                             lastcall: call.getBool("lastcall") ?? true, fbLastcall: call.getBool("fbLastcall") ?? true)
        plan.items = raw.compactMap { AlarmItem(js: $0) }
        if let b = call.getObject("busAnswer") {
            var v: [String: String] = [:]
            for k in ["url", "key", "device", "secret", "uid"] { v[k] = DayBarJS.str(b[k]) }
            BusAnswer.save(v)
        }
        // Where to answer, kept for another account (one that left without signing out): forgotten, so an answer from
        // the lock screen is never said for someone else. The words still waiting stay (the page says only its own).
        if let had = BusAnswer.saved(), had["uid"] != plan.uid { BusAnswer.forgetWhere() }
        let ask = call.getBool("ask") ?? false
        guard !plan.uid.isEmpty else { call.reject("The alarms need the account signed in"); return }
        Task {
            let out = await GreenroomAlarms.desk.apply(plan, ask: ask)
            var js = out.js
            js["pending"] = BusAnswer.takePending()
            call.resolve(js)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        BusAnswer.save(nil)
        Task {
            await GreenroomAlarms.desk.clear()
            call.resolve(["ok": true])
        }
    }
}

/// One alarm the page (or the server's hand-over) asked for.
struct AlarmItem: Codable, Equatable {
    var id: String
    var kind: String
    var at: Double
    var tour: String
    var title: String
    var body: String

    init?(js o: [String: Any]) {
        id = DayBarJS.str(o["id"]); kind = DayBarJS.str(o["kind"]); at = DayBarJS.num(o["at"])
        tour = DayBarJS.str(o["tour"]); title = DayBarJS.str(o["title"]); body = DayBarJS.str(o["body"])
        guard !id.isEmpty, id.count <= 200, kind == "stage" || kind == "bus" || kind == "lastcall", at > 0, !tour.isEmpty else { return nil }
        if title.isEmpty { title = kind == "bus" ? "BUS CALL" : kind == "lastcall" ? "GUEST LIST LAST CALL" : "30 MIN UNTIL STAGE TIME" }
        title = String(title.prefix(60)); body = String(body.prefix(120))
    }

    var date: Date { Date(timeIntervalSince1970: at) }
    /// The same alarm always gets the same id (AlarmKit and the notifications want one): a moved time or new words make a
    /// new one, so the old one is taken away and the new one set.
    var uuid: UUID {
        let digest = SHA256.hash(data: Data([kind, id, String(Int(at)), title].joined(separator: "\n").utf8))
        var b = Array(digest.prefix(16))
        b[6] = (b[6] & 0x0F) | 0x50
        b[8] = (b[8] & 0x3F) | 0x80
        return UUID(uuid: (b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]))
    }
}

/// What the page last asked for, kept on the phone (for the server's hand-over, which may come with the app closed).
struct AlarmPlan: Codable {
    var uid: String
    var stage: Bool
    var bus: Bool
    var fbStage: Bool
    var fbBus: Bool
    var items: [AlarmItem]
    // The guest list last call alarm's switch and stand-in (Oct 22). Optional, so a plan kept on the phone by an older
    // build (without them) still reads: missing is on, as the page's switch starts.
    var lastcall: Bool? = nil
    var fbLastcall: Bool? = nil

    func wants(_ it: AlarmItem) -> Bool { it.kind == "bus" ? bus : it.kind == "lastcall" ? (lastcall ?? true) : stage }
    // A day off's bus call (its id "bus|<tour>|off:<date>", from the page and the server's hand-over alike) always gets its
    // stand-in: Ari sends no BUS CALL alert on a day off, so there is nothing for it to double.
    func standIn(_ it: AlarmItem) -> Bool {
        it.kind == "bus" ? (fbBus || it.id.hasPrefix("bus|" + it.tour + "|off:")) : it.kind == "lastcall" ? (fbLastcall ?? true) : fbStage
    }

    private static let name = "greenroom.alarms.plan"
    static func load() -> AlarmPlan? {
        guard let d = UserDefaults.standard.data(forKey: name) else { return nil }
        return try? JSONDecoder().decode(AlarmPlan.self, from: d)
    }
    func keep() { if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: AlarmPlan.name) } }
    static func forget() { UserDefaults.standard.removeObject(forKey: name) }
}

struct AlarmStatus {
    var alarmKit = false
    var auth = ""
    var notify = ""
    var js: [String: Any] { ["alarmKit": alarmKit, "auth": auth, "notify": notify] }
}

struct AlarmOutcome {
    var mode = "none"
    var auth = ""
    var set = 0
    var js: [String: Any] { ["ok": true, "mode": mode, "auth": auth, "set": set] }
}

enum GreenroomAlarms {
    static let desk = AlarmDesk()
    /// The stand-in notifications are Greenroom's own by this start of their id.
    static let notePrefix = "gr-alarm-"

    /// At launch (the AppDelegate through DayBarLaunch.start, and when the plugin loads): what the app does once a word
    /// from the day bar's buttons is said (the bar shows it).
    static func launch() {
        guard BusAnswer.onSaid == nil else { return }
        BusAnswer.onSaid = { tour, state in
            #if canImport(ActivityKit)
            if #available(iOS 16.2, *) {
                for a in Activity<DayBarAttributes>.activities
                where a.attributes.key.hasPrefix(tour + "|") && a.activityState == .active {
                    var st = a.content.state
                    st.said = state
                    await a.update(ActivityContent(state: st, staleDate: a.content.staleDate))
                }
            }
            #endif
        }
    }

    /// The server's quiet hand-over: { alarms: { u: account, t: tour, v: version, i: [items] } }. Answers whether anything
    /// was set.
    /// The plan kept on the phone is read in the desk's own line (handOver), so a page sync queued just before it (a Save
    /// with a switch turned off) is never undone by an older copy.
    static func remote(_ info: [AnyHashable: Any], _ done: @escaping (UIBackgroundFetchResult) -> Void) {
        guard let a = info["alarms"] as? [String: Any], let u = a["u"] as? String, let t = a["t"] as? String,
              !u.isEmpty, !t.isEmpty else {
            done(.noData)
            return
        }
        // (The server sends to the account signed in on this phone, and the page's last plan says the same: where to
        // answer, kept for another account, is forgotten.)
        if AlarmPlan.load()?.uid == u, let had = BusAnswer.saved(), had["uid"] != u { BusAnswer.forgetWhere() }
        let fresh = ((a["i"] as? [Any]) ?? []).compactMap { ($0 as? [String: Any]).flatMap { AlarmItem(js: $0) } }
            .filter { $0.tour == t }
        let v = DayBarJS.num(a["v"])
        Task {
            let set = await desk.handOver(u: u, t: t, v: v, fresh: fresh)
            done(set ? .newData : .noData)
        }
    }
}

/// The version of the last hand-over set for each tour (review of rc-1, Oct 22). Each hand-over carries the tour's
/// version (v: when it was last saved, in ms, read by the server just before sending). Two saves close together (mute
/// one person, unmute another) can finish on the server, or reach this phone, in either order: the older one is never
/// set over the newer one. Kept on the phone; forgotten when signing out.
enum HandOverMarks {
    private static let name = "greenroom.alarms.versions"

    /// Whether a hand-over of version v may be set over the last one set for its tour (had). One with no version (0:
    /// from a server before versions) always may, as before.
    static func newer(_ v: Double, than had: Double?) -> Bool {
        guard v > 0, let had = had else { return true }
        return v >= had
    }

    static func had(_ tour: String) -> Double? {
        (UserDefaults.standard.dictionary(forKey: name)?[tour] as? NSNumber)?.doubleValue
    }

    static func mark(_ tour: String, _ v: Double) {
        guard v > 0 else { return }
        var all = UserDefaults.standard.dictionary(forKey: name) ?? [:]
        all[tour] = v
        UserDefaults.standard.set(all, forKey: name)
    }

    static func forget() { UserDefaults.standard.removeObject(forKey: name) }
}

/// One at a time: the page's sync, the server's hand-over and signing out never set alarms over each other. An actor
/// alone would let two of them interleave at every await (asking iOS, scheduling, reading the notifications), so each
/// job waits for the one queued before it to finish (tail), in the order they came.
actor AlarmDesk {
    private var tail: Task<Void, Never>? = nil

    /// Queue a job behind the last one; answers its result once it has run.
    private func inLine<T: Sendable>(_ job: @escaping @Sendable () async -> T) async -> T {
        let prev = tail
        let t = Task { () -> T in
            _ = await prev?.value
            return await job()
        }
        tail = Task { _ = await t.value }
        return await t.value
    }

    func status() async -> AlarmStatus {
        var st = AlarmStatus()
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            st.alarmKit = true
            st.auth = Self.word(AlarmManager.shared.authorizationState)
        }
        #endif
        st.notify = await Self.noteWord()
        return st
    }

    /// The page's sync: the plan it sends is kept and set, in line.
    func apply(_ plan: AlarmPlan, ask: Bool) async -> AlarmOutcome {
        await inLine { await self.applyNow(plan, ask: ask) }
    }

    /// The server's hand-over, in line: the plan kept on the phone (as the jobs before it left it), for the same account
    /// only, gets tour t's items replaced by fresh, and is set again without asking anything. Answers whether it was.
    /// Never one older (v) than the last set for that tour (HandOverMarks), checked and kept in line too.
    func handOver(u: String, t: String, v: Double, fresh: [AlarmItem]) async -> Bool {
        await inLine { () -> Bool in
            guard var plan = AlarmPlan.load(), plan.uid == u, HandOverMarks.newer(v, than: HandOverMarks.had(t)) else { return false }
            HandOverMarks.mark(t, v)
            plan.items = plan.items.filter { $0.tour != t } + fresh
            _ = await self.applyNow(plan, ask: false)
            return true
        }
    }

    /// Every alarm the plan has switched on and still to come is set; every one that is gone is taken away (never one
    /// ringing, or due within the minute, that the plan still has).
    private func applyNow(_ plan: AlarmPlan, ask: Bool) async -> AlarmOutcome {
        plan.keep()
        let now = Date()
        let on = plan.items.filter { plan.wants($0) }
        let keepIds = Set(on.filter { $0.at > now.timeIntervalSince1970 - 300 }.map { $0.uuid })
        let toSet = on.filter { $0.at > now.timeIntervalSince1970 + 30 }
        var out = AlarmOutcome()
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            var auth = AlarmManager.shared.authorizationState
            if auth == .notDetermined && ask && !toSet.isEmpty {
                auth = (try? await AlarmManager.shared.requestAuthorization()) ?? AlarmManager.shared.authorizationState
            }
            out.auth = Self.word(auth)
            if auth == .authorized {
                out.set = await setAlarms(toSet, keep: keepIds)
                await setNotes([], keep: [])
                out.mode = "alarm"
                return out
            }
            await setAlarms([], keep: [])
        }
        #endif
        // No alarms on this iPhone: a normal notification at the same moment, where one may stand in.
        let notes = toSet.filter { plan.standIn($0) }
        if await Self.noteWord() == "granted" {
            out.set = await setNotes(notes, keep: Set(on.filter { plan.standIn($0) }.map { $0.uuid }))
            out.mode = "notify"
        } else {
            await setNotes([], keep: [])
        }
        return out
    }

    /// Signing out, in line: every alarm and stand-in off this phone, the plan (and the hand-overs' versions) forgotten.
    func clear() async {
        await inLine { await self.clearNow() }
    }

    private func clearNow() async {
        AlarmPlan.forget()
        HandOverMarks.forget()
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            for a in (try? AlarmManager.shared.alarms) ?? [] { try? AlarmManager.shared.cancel(id: a.id) }
        }
        #endif
        await setNotes([], keep: [])
    }

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    static func word(_ a: AlarmManager.AuthorizationState) -> String {
        switch a {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default: return ""
        }
    }

    /// The alarms themselves. Answers how many were set now.
    @available(iOS 26.0, *)
    @discardableResult
    private func setAlarms(_ items: [AlarmItem], keep: Set<UUID>) async -> Int {
        let m = AlarmManager.shared
        let have = (try? m.alarms) ?? []
        let want = Dictionary(items.map { ($0.uuid, $0) }, uniquingKeysWith: { a, _ in a })
        for a in have where want[a.id] == nil && !keep.contains(a.id) && a.state != .alerting {
            try? m.cancel(id: a.id)
        }
        let had = Set(have.map { $0.id })
        var n = 0
        for (id, it) in want where !had.contains(id) {
            if (try? await m.schedule(id: id, configuration: Self.config(it, id: id))) != nil { n += 1 }
        }
        return n
    }

    /// How one alarm looks and sounds: the system's own alarm sound, Stop, and for the bus call one more button, "I'm on
    /// the bus" (custom: it runs AlarmOnBusIntent; never a snooze).
    @available(iOS 26.0, *)
    private static func config(_ it: AlarmItem, id: UUID) -> AlarmManager.AlarmConfiguration<GreenroomAlarmMeta> {
        let title = LocalizedStringResource(String.LocalizationValue(it.title))
        let lime = Color(red: 0.8, green: 0.973, blue: 0.039)
        let onBus = AlarmButton(text: "I’m on the bus", textColor: .black, systemImageName: "bus.fill")
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = it.kind == "bus"
                ? AlarmPresentation.Alert(title: title, secondaryButton: onBus, secondaryButtonBehavior: .custom)
                : AlarmPresentation.Alert(title: title)
        } else {
            let stop = AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
            alert = it.kind == "bus"
                ? AlarmPresentation.Alert(title: title, stopButton: stop, secondaryButton: onBus, secondaryButtonBehavior: .custom)
                : AlarmPresentation.Alert(title: title, stopButton: stop)
        }
        let attrs = AlarmAttributes<GreenroomAlarmMeta>(presentation: AlarmPresentation(alert: alert),
                                                        metadata: GreenroomAlarmMeta(kind: it.kind, tour: it.tour), tintColor: lime)
        if it.kind == "bus" {
            return AlarmManager.AlarmConfiguration<GreenroomAlarmMeta>.alarm(
                schedule: .fixed(it.date), attributes: attrs,
                secondaryIntent: AlarmOnBusIntent(alarm: id.uuidString, tour: it.tour))
        }
        return AlarmManager.AlarmConfiguration<GreenroomAlarmMeta>.alarm(schedule: .fixed(it.date), attributes: attrs)
    }
    #endif

    /// The stand-in notifications (Greenroom's own ids only). Answers how many were added now.
    @discardableResult
    private func setNotes(_ items: [AlarmItem], keep: Set<UUID>) async -> Int {
        let c = UNUserNotificationCenter.current()
        let pending = await c.pendingNotificationRequests().map { $0.identifier }.filter { $0.hasPrefix(GreenroomAlarms.notePrefix) }
        let want = Dictionary(items.map { (GreenroomAlarms.notePrefix + $0.uuid.uuidString, $0) }, uniquingKeysWith: { a, _ in a })
        let keepIds = Set(keep.map { GreenroomAlarms.notePrefix + $0.uuidString })
        let gone = pending.filter { want[$0] == nil && !keepIds.contains($0) }
        if !gone.isEmpty { c.removePendingNotificationRequests(withIdentifiers: gone) }
        var n = 0
        for (id, it) in want where !pending.contains(id) {
            let content = UNMutableNotificationContent()
            content.title = it.title
            content.body = it.body
            content.sound = .default
            let wait = it.at - Date().timeIntervalSince1970
            guard wait > 1 else { continue }
            let req = UNNotificationRequest(identifier: id, content: content,
                                            trigger: UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false))
            if (try? await c.add(req)) != nil { n += 1 }
        }
        return n
    }

    /// Normal notifications for Greenroom on this iPhone: "granted", "denied" or "prompt".
    static func noteWord() async -> String {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        switch s.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }
}

#if canImport(AlarmKit)
/// What each alarm carries for itself: which kind, and which tour.
@available(iOS 26.0, *)
struct GreenroomAlarmMeta: AlarmMetadata {
    var kind: String = ""
    var tour: String = ""
}
#endif

#if canImport(AlarmKit) && canImport(AppIntents)
/// The bus call alarm's "I'm on the bus" (Devin, Oct 22): the alarm stops, and On bus goes into Bus Check for this
/// phone's account, without opening the app (0206's daybar_bus, with the phone's day bar secret). No signal: the word
/// waits on the phone and the app says it the next time it opens, today.
@available(iOS 26.0, *)
struct AlarmOnBusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "I’m on the bus"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Alarm")
    var alarm: String
    @Parameter(title: "Tour")
    var tour: String

    init() {
        self.alarm = ""
        self.tour = ""
    }
    init(alarm: String, tour: String) {
        self.alarm = alarm
        self.tour = tour
    }

    func perform() async throws -> some IntentResult {
        if let id = UUID(uuidString: alarm) { try? AlarmManager.shared.stop(id: id) }
        _ = await BusAnswer.send(tour: tour, state: "on")
        return .result()
    }
}
#endif
