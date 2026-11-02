// Calendar: Greenroom's own small Capacitor plugin for the iPhone's calendars (MODELXOFFTOUR, Devin, Oct 30: merge Google and
// Apple calendar into your own day; Nov 1: "I would ideally like you to be able to add things to your calendar in the greenroom app
// and vis versa and they sync and add to one another"). It reads the iPhone's Calendar database, every calendar: a Google account
// added in iPhone Settings comes through, Google's own app on its own does not.
//
// One book, two windows: Greenroom keeps no copy. The phone's calendar is the book, and iOS, iCloud and Google do the syncing, as
// they already do. The one thing this file writes is a NEW event, and the page asks for that only from a person's tap on Add. To
// change or delete an event Apple's own event sheet opens over the app, so the page has no way to do either: a bug or a bad script
// cannot wipe a calendar. There is no remove and no update here, and ios-app/selftest.sh holds that. Apple has no read-only level,
// so iOS's question says Full Access, which covers all of this; the words under it are prepare.sh CAL_WORDS.
//
// The page reaches it as window.Capacitor.Plugins.Calendar (registered by GreenroomViewController; no npm package, no bundler):
//   status()              -> { auth }           never asks anything. auth: "full" | "writeOnly" | "denied" | "restricted" | "notDetermined"
//   connect()             -> { auth }           iOS's one question. Called only from the button under the app's own words.
//   read({ from, to })    -> { auth, events }   seconds. Empty unless full. At most 100 days are read, 600 events handed over, nearest
//                                                to now first. Bad numbers reject, so a failed read is never taken for an empty day.
//                                                An event: { id, title, start, end, allDay, place, canEdit }.
//   calendars()           -> { auth, pick, list }  the calendars an event can be added to: { id, title, account }. pick: the phone's
//                                                default, which can be missing, and then the page offers no calendar at all.
//   add({ title, start, end, allDay, calendar }) -> an event, as read hands one   the one write. Rejects on any failure and on a
//                                                calendar it cannot write to, so the sheet stays open with your words in it.
//   editor({ id })        -> { action }         Apple's own event sheet, iOS 17 and later. action: "saved" | "deleted" | "canceled".
//                                                Rejects if the event has gone or the sheet cannot open.
//   refresh()             -> { ok }             asks iOS to fetch from the accounts now, if it is due. When the app comes back.
//   openSettings()        -> { ok }             Greenroom's page in iPhone Settings.
//   morning({ on, uid, device, hide, names }) -> { ok }   what the morning wake may do, kept on the phone. on false forgets it.
//   listener "changed"                          the calendar changed.
// The page decides everything (src/core.js homeCalEvents, homeEventAt, homeBarLine). Nothing is written to disk except the morning
// marker. Never read: notes, URLs, the organiser, alarms. The attendees are read only to find this person's own answer, and nothing
// about anyone else leaves here. Reminders are not touched.
//
// The server's quiet morning push (the notify function's HOME_WAKE): Apple wakes the app in the background with
// { homeday: { u, names } } (the AppDelegate's didReceiveRemoteNotification, through GreenroomAlarms.remote). With no page running,
// and only if every gate below holds, today's timed events go to the server (daybar_home, with the phone's secret) so the bar can
// start on a phone nobody has opened. Such a post only adds: the server leaves a plan that is there alone (0230).

import Foundation
import UIKit
import Capacitor
import CryptoKit
import EventKit
import EventKitUI
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(CalendarPlugin)
public class CalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalendarPlugin"
    public let jsName = "Calendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "calendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "add", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "editor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "morning", returnType: CAPPluginReturnPromise)
    ]

    /// Who hears Apple's sheet close, for as long as it is open: Apple holds its delegate weakly.
    private var editing: CalendarSheetWatch?

    override public func load() {
        // (object: nil: the new store made after the first yes needs no second observer.)
        NotificationCenter.default.addObserver(self, selector: #selector(calendarChanged), name: .EKEventStoreChanged, object: nil)
    }

    @objc private func calendarChanged() {
        notifyListeners("changed", data: [:])
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["auth": GreenroomCalendar.word()])
    }

    @objc func connect(_ call: CAPPluginCall) {
        GreenroomCalendar.connect { word in call.resolve(["auth": word]) }
    }

    @objc func read(_ call: CAPPluginCall) {
        let from = call.getDouble("from") ?? 0, to = call.getDouble("to") ?? 0
        guard from > 0, to > from else {
            call.reject("The calendar needs a from and a to")
            return
        }
        GreenroomCalendar.read(from: from, to: to) { word, events in
            call.resolve(["auth": word, "events": events])
        }
    }

    @objc func calendars(_ call: CAPPluginCall) {
        GreenroomCalendar.calendars { word, pick, list in
            var out: [String: Any] = ["auth": word, "list": list]
            if let pick = pick { out["pick"] = pick }
            call.resolve(out)
        }
    }

    @objc func add(_ call: CAPPluginCall) {
        let start = call.getDouble("start") ?? 0, end = call.getDouble("end") ?? 0
        guard start > 0, end >= start else {
            call.reject("An event needs a start and an end")
            return
        }
        GreenroomCalendar.add(title: call.getString("title"), start: start, end: end, allDay: call.getBool("allDay") ?? false,
                              calendar: call.getString("calendar") ?? "") { event in
            if let event = event { call.resolve(event) } else { call.reject("The event was not saved") }
        }
    }

    /// Apple's own event sheet, over the app. It handles repeats, invites, alerts, moving calendars and a confirmed delete, so nothing
    /// here does. iOS 17 and later only: below that Apple says EventKit UI needs NSContactsUsageDescription, which this app does not
    /// have, so read answers canEdit false there and the page offers no tap. Those phones add, and edit in Apple's Calendar.
    @objc func editor(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("Apple's event sheet needs iOS 17")
            return
        }
        GreenroomCalendar.spot(call.getString("id") ?? "") { spot in
            DispatchQueue.main.async { [weak self] in
                guard let self = self, let top = self.bridge?.viewController, top.presentedViewController == nil,
                      let spot = spot, let found = GreenroomCalendar.occurrence(spot) else {
                    call.reject("The event could not be opened")
                    return
                }
                let sheet = EKEventEditViewController()
                sheet.eventStore = found.store
                sheet.event = found.event
                sheet.overrideUserInterfaceStyle = .dark
                // (Its Cancel is the way out, so the page always hears how it closed.)
                sheet.isModalInPresentation = true
                let watch = CalendarSheetWatch { [weak self] word in
                    self?.editing = nil
                    call.resolve(["action": word])
                }
                sheet.editViewDelegate = watch
                self.editing = watch
                top.present(sheet, animated: true)
            }
        }
    }

    @objc func refresh(_ call: CAPPluginCall) {
        GreenroomCalendar.refresh { call.resolve(["ok": true]) }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.resolve(["ok": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in call.resolve(["ok": ok]) }
        }
    }

    @objc func morning(_ call: CAPPluginCall) {
        if call.getBool("on") ?? false {
            let hide = (call.getArray("hide") ?? []).compactMap { $0 as? String }
            MorningMarker(uid: call.getString("uid") ?? "", device: call.getString("device") ?? "", hide: Array(hide.prefix(200)),
                          names: call.getBool("names") ?? false).keep()
        } else {
            MorningMarker.forget()
        }
        call.resolve(["ok": true])
    }
}

/// Hears Apple's event sheet close, closes it, and says how it closed.
final class CalendarSheetWatch: NSObject, EKEventEditViewDelegate {
    private let closed: (String) -> Void
    init(_ closed: @escaping (String) -> Void) { self.closed = closed }

    func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        let word: String
        switch action {
        case .saved: word = "saved"
        case .deleted: word = "deleted"
        default: word = "canceled"
        }
        controller.dismiss(animated: true) { self.closed(word) }
    }
}

/// What the page last said the morning wake may do. Kept on the phone; a phone's copy of what is the account's, so the server asks
/// the account too (0230, the notify function). No names here: names is only whether to send them.
struct MorningMarker: Codable {
    var uid: String
    var device: String
    var hide: [String]
    var names: Bool

    private static let name = "greenroom.calendar.morning"
    static func load() -> MorningMarker? {
        guard let d = UserDefaults.standard.data(forKey: name) else { return nil }
        return try? JSONDecoder().decode(MorningMarker.self, from: d)
    }
    func keep() { if let d = try? JSONEncoder().encode(self) { UserDefaults.standard.set(d, forKey: MorningMarker.name) } }
    static func forget() { UserDefaults.standard.removeObject(forKey: name) }
}

/// One event: an identifier and, because occurrences of a repeat share one, which occurrence.
struct EventSpot {
    let ident: String
    let start: Date
}

enum GreenroomCalendar {
    /// All store use runs here, one at a time, so the new store made after the first yes cannot land in the middle of a read.
    private static let queue = DispatchQueue(label: "com.greenroomtour.calendar")
    private static var store = EKEventStore()
    /// Where the events the page was handed really are, by the id it was given: the real identifier never reaches the page. In memory only.
    private static var known: [String: EventSpot] = [:]
    private static let wokenName = "greenroom.calendar.woken"
    private static let dayWords: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// What iOS lets Greenroom do with the calendars, in the page's words. A word this build does not know counts as no.
    static func word() -> String {
        let st = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            switch st {
            case .fullAccess: return "full"
            case .writeOnly: return "writeOnly"
            case .restricted: return "restricted"
            case .notDetermined: return "notDetermined"
            default: return "denied"
            }
        }
        switch st {
        case .authorized: return "full"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        default: return "denied"
        }
    }

    /// iOS's one question. On a yes a new store: a store made before the grant has been reported to stay empty.
    static func connect(_ done: @escaping (String) -> Void) {
        queue.async {
            let answered: (Bool, Error?) -> Void = { _, _ in
                queue.async {
                    let w = word()
                    if w == "full" { store = EKEventStore() }
                    done(w)
                }
            }
            if #available(iOS 17.0, *) {
                store.requestFullAccessToEvents(completion: answered)
            } else {
                store.requestAccess(to: .event, completion: answered)
            }
        }
    }

    /// One line of plain words, at most max characters. Control characters and every run of white space become one space, so a title
    /// can never break the bar or be refused by the database (\u{0} is). Only control characters: format characters join emoji.
    static func clean(_ s: String?, _ max: Int) -> String {
        var scalars = String.UnicodeScalarView()
        for u in (s ?? "").unicodeScalars { scalars.append(u.properties.generalCategory == .control ? " " : u) }
        return String(String(scalars).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").prefix(max))
    }

    /// Occurrences of a repeat share an identifier, so the start goes in too. Only a hash leaves here, and only the phone keeps it.
    static func eventId(_ e: EKEvent, start: Date) -> String {
        let ident: String? = e.eventIdentifier
        let digest = SHA256.hash(data: Data(((ident ?? "") + "|" + String(Int(start.timeIntervalSince1970))).utf8))
        return String(digest.map { String(format: "%02x", $0) }.joined().prefix(32))
    }

    /// Called off, or you said no to it, is no event of yours.
    private static func counts(_ e: EKEvent) -> Bool {
        if e.status == .canceled { return false }
        if let mine = e.attendees?.first(where: { $0.isCurrentUser }), mine.participantStatus == .declined { return false }
        return true
    }

    /// The store's events in that span. events(matching:) has no order and blocks, so this stays on the queue.
    private static func events(from: Date, to: Date) -> [EKEvent] {
        store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: nil)).filter { counts($0) }
    }

    /// One event as the page sees it, and its place kept here. nil: an event missing a start or an end is skipped, never a crash.
    private static func handed(_ e: EKEvent) -> (at: Double, js: [String: Any])? {
        // (Apple declares these implicitly unwrapped.)
        guard let a = e.startDate as Date?, let b = e.endDate as Date? else { return nil }
        let id = eventId(e, start: a)
        let ident: String? = e.eventIdentifier
        if let ident = ident { known[id] = EventSpot(ident: ident, start: a) }
        // Apple's sheet can open it: iOS 17 and later (CalendarPlugin.editor), and a calendar you can change. A birthday cannot.
        let book: EKCalendar? = e.calendar
        var canEdit = false
        if #available(iOS 17.0, *) { canEdit = ident != nil && book?.allowsContentModifications == true }
        return (at: a.timeIntervalSince1970, js: [
            "id": id, "title": clean(e.title, 120), "start": Int(a.timeIntervalSince1970), "end": Int(b.timeIntervalSince1970),
            "allDay": e.isAllDay, "place": clean(e.location, 120), "canEdit": canEdit
        ])
    }

    static func read(from: Double, to: Double, _ done: @escaping (String, [[String: Any]]) -> Void) {
        queue.async {
            let w = word()
            guard w == "full" else { done(w, []); return }
            // (The Day sheet's rail, 7 days back to 90 on, and room for a clock change.)
            let end = min(to, from + 100 * 24 * 3600)
            let now = Date().timeIntervalSince1970
            known.removeAll()
            var found: [(at: Double, js: [String: Any])] = []
            for e in events(from: Date(timeIntervalSince1970: from), to: Date(timeIntervalSince1970: end)) {
                if let one = handed(e) { found.append(one) }
            }
            // Nearest to now first, then cut: an unsorted cut could drop today.
            found.sort { abs($0.at - now) < abs($1.at - now) }
            done(w, found.prefix(600).map { $0.js })
        }
    }

    /// The calendars an event can be added to, each with the account it syncs through, and the phone's default. Writable ones only: a
    /// birthday or a subscribed calendar takes nothing. A default that cannot be written to counts as none.
    static func calendars(_ done: @escaping (String, String?, [[String: Any]]) -> Void) {
        queue.async {
            let w = word()
            guard w == "full" else { done(w, nil, []); return }
            let books = store.calendars(for: .event).filter { $0.allowsContentModifications }
            let list: [[String: Any]] = books.map { book in
                let source: EKSource? = book.source
                return ["id": book.calendarIdentifier, "title": clean(book.title, 60),
                        "account": source?.sourceType == .local ? "On My iPhone" : clean(source?.title, 60)]
            }
            let first: EKCalendar? = store.defaultCalendarForNewEvents
            done(w, first.flatMap { c in books.contains { $0.calendarIdentifier == c.calendarIdentifier } ? c.calendarIdentifier : nil }, list)
        }
    }

    /// The one write: a new event, in a calendar that takes one. The event comes back as read hands one, so the page has it at once.
    /// An all-day event has no clock; a timed one is saved in the phone's current time zone, as Apple's Calendar saves one.
    static func add(title: String?, start: Double, end: Double, allDay: Bool, calendar: String, _ done: @escaping ([String: Any]?) -> Void) {
        queue.async {
            let name = clean(title, 120)
            guard word() == "full", !name.isEmpty, let book = store.calendar(withIdentifier: calendar), book.allowsContentModifications else {
                done(nil)
                return
            }
            let e = EKEvent(eventStore: store)
            e.calendar = book
            e.title = name
            e.isAllDay = allDay
            e.startDate = Date(timeIntervalSince1970: start)
            e.endDate = Date(timeIntervalSince1970: end)
            if !allDay { e.timeZone = TimeZone.current }
            do {
                try store.save(e, span: .thisEvent, commit: true)
            } catch {
                done(nil)
                return
            }
            done(handed(e)?.js)
        }
    }

    /// Where an event the page was handed lives. Asked on the queue, which is what keeps known.
    static func spot(_ id: String, _ done: @escaping (EventSpot?) -> Void) {
        queue.async { done(known[id]) }
    }

    /// The very occurrence the page tapped, for Apple's sheet: fetching by identifier alone answers a repeat's first one, and a tap on
    /// the fifth must not open the first. On the main thread, in a store of its own that the sheet holds and nothing else touches,
    /// so it can never meet a read on the queue, or the new store made after the first yes. nil: it has gone or moved since it was read.
    static func occurrence(_ spot: EventSpot) -> (store: EKEventStore, event: EKEvent)? {
        guard word() == "full" else { return nil }
        let own = EKEventStore()
        let around = own.predicateForEvents(withStart: spot.start.addingTimeInterval(-1), end: spot.start.addingTimeInterval(1), calendars: nil)
        let hit = own.events(matching: around).first { e in
            let ident: String? = e.eventIdentifier
            let at: Date? = e.startDate
            return ident == spot.ident && at == spot.start
        }
        return hit.map { (store: own, event: $0) }
    }

    /// Asks iOS to fetch from the accounts now, if it is due. Google down to the phone is the slow leg, and whether this helps is
    /// unproven: what comes in arrives as a change, which reads again.
    static func refresh(_ done: @escaping () -> Void) {
        queue.async {
            if word() == "full" { store.refreshSourcesIfNecessary() }
            done()
        }
    }

    /// Can the server start a bar here? Only it can, on a phone nobody opened, and that takes iOS 17.2 (a push to start). Below that a
    /// wake's names would sit on the server until midnight for nothing.
    private static func barsAllowed() -> Bool {
        #if canImport(ActivityKit)
        if #available(iOS 17.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
        #endif
        return false
    }

    /// The next 5:05 AM on this phone's clock (the five minutes are room, so a slow clock does not trip the hour gate and break the
    /// chain), spread over half an hour by the phone's id so a zone's phones do not land in one second. As the page's homeWakeAt.
    static func nextWake(_ device: String, now: Date = Date()) -> Int {
        let cal = Calendar.current
        var c = cal.dateComponents([.year, .month, .day], from: now)
        c.hour = 5
        c.minute = 5
        var at = cal.date(from: c) ?? now
        if at <= now { at = cal.date(byAdding: .day, value: 1, to: at) ?? at }
        return Int(at.timeIntervalSince1970) + ((Int(device.prefix(4), radix: 16) ?? 0) % 1800)
    }

    /// The server's quiet morning push. Answers false for any other push, which goes on to the alarms as before. Posts only if every
    /// gate holds; a push for someone else, or a phone that has moved on, gets .noData. Words stay plain when the marker kept here
    /// or the push says so. A push already on its way when a switch moved keeps nothing on the server either (0230).
    static func morning(_ info: [AnyHashable: Any], _ done: @escaping (UIBackgroundFetchResult) -> Void) -> Bool {
        guard let h = info["homeday"] as? [String: Any] else { return false }
        let now = Date()
        let today = dayWords.string(from: now)
        let cal = Calendar.current
        // (An account can leave without signing out, and the saved report then holds someone else's secret: the phone id must agree.)
        guard let m = MorningMarker.load(), !m.uid.isEmpty, m.uid == DayBarJS.str(h["u"]),
              let r = DayBarReport.saved(), !m.device.isEmpty, r["device"] == m.device, let secret = r["secret"], let key = r["key"],
              let report = r["url"], let to = URL(string: report)?.deletingLastPathComponent().appendingPathComponent("daybar_home"),
              word() == "full", barsAllowed(),
              cal.component(.hour, from: now) >= 5,                               // his midnight: nothing goes between midnight and 5 AM
              UserDefaults.standard.string(forKey: wokenName) != today,           // Apple may deliver twice
              let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: now)) else {
            done(.noData)
            return true
        }
        UserDefaults.standard.set(today, forKey: wokenName)
        let names = m.names && (h["names"] as? Bool) != false
        queue.async {
            var steps: [(at: Int, js: [String: Any])] = []
            for e in events(from: now, to: midnight) where !e.isAllDay {
                guard let a = e.startDate as Date?, a >= now, a < midnight, !m.hide.contains(eventId(e, start: a)) else { continue }
                let title = clean(e.title, 60)
                steps.append((at: Int(a.timeIntervalSince1970),
                              js: ["ts": Int(a.timeIntervalSince1970), "key": "event", "label": names && !title.isEmpty ? title : "Event", "sub": "Calendar"]))
            }
            steps.sort { $0.at < $1.at }
            var req = URLRequest(url: to)
            req.httpMethod = "POST"
            req.timeoutInterval = 20
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue(key, forHTTPHeaderField: "apikey")
            req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
            let day: [String: Any] = ["tz": TimeZone.current.identifier, "wake": true, "steps": steps.prefix(40).map { $0.js }]
            let body: [String: Any] = ["p_device": m.device, "p_secret": secret, "p_day": day, "p_wake": nextWake(m.device, now: now)]
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
            URLSession.shared.dataTask(with: req) { _, resp, _ in
                done((resp as? HTTPURLResponse)?.statusCode == 200 ? .newData : .failed)
            }.resume()
        }
        return true
    }
}
