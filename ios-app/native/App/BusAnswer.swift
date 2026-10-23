// Answering Bus Check from the lock screen (Greenroom, the alarms; Devin, Oct 22): the bus call alarm's "I'm on the bus"
// button, and the day bar's On bus / Off bus at Bus Call. Both run with the app closed (iOS starts the app's process in
// the background to run them, without opening it), so they cannot use the person's sign-in: they use this phone's own
// day bar id and secret (migration 0198), through ONE narrow server call that can only say "on" or "off" in Bus Check
// for the phone's own account (0206's daybar_bus). The page hands this file where and how (src/app.js alarmBusCreds,
// through the Alarms plugin), only once the server has let this phone answer for the account signed in on it.
//
// Compiled into BOTH the app and the DayBar widget extension: the extension draws the bar's buttons, which name
// DayBarBusIntent; iOS runs a Live Activity intent in the APP's process (Apple: "If you adopt the LiveActivityIntent ...
// protocol, the system runs the app intent in the app's process"), where the page left its words. In the extension this
// code is only compiled, never run.

import Foundation
#if canImport(AppIntents)
import AppIntents
#endif
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Where and how this phone answers Bus Check, kept on the phone (UserDefaults, like the day bar's own report address):
/// { url, key, device, secret, uid }. And the words that could not be said (no signal), for the app to say later.
enum BusAnswer {
    private static let name = "greenroom.bus.answer"
    private static let pendingName = "greenroom.bus.pending"
    /// What the app does once a word from the bar is said (set at launch by the app: the bar shows it, GreenroomAlarms).
    static var onSaid: ((String, String) async -> Void)? = nil

    /// Keep where to answer (a good one only). nil forgets it, and any word still waiting (signing out).
    static func save(_ v: [String: String]?) {
        let store = UserDefaults.standard
        guard let v = v else {
            store.removeObject(forKey: name)
            store.removeObject(forKey: pendingName)
            return
        }
        guard (v["url"] ?? "").hasPrefix("https://"), !(v["key"] ?? "").isEmpty, (v["device"] ?? "").count == 32,
              (v["secret"] ?? "").count == 64, !(v["uid"] ?? "").isEmpty else { return }
        store.set(v, forKey: name)
    }
    static func saved() -> [String: String]? { UserDefaults.standard.dictionary(forKey: name) as? [String: String] }
    /// Forget where to answer only (kept for another account): the words still waiting stay, each with its own account,
    /// and the page says only those of the account signed in.
    static func forgetWhere() { UserDefaults.standard.removeObject(forKey: name) }

    /// The tour day Bus Check keys a word by (the app's busDay: this phone's calendar, the day runs to 5 AM).
    static func tourDay(_ at: Date = Date()) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents(in: TimeZone.current, from: at.addingTimeInterval(-5 * 3600))
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Say "on" or "off" for this phone's account on this tour, today. Tried twice; when no answer came at all (no
    /// signal) the word waits on the phone and the app says it the next time it opens (for the same account, the same
    /// day only). Answers the server's word ("ok", or why not: "no", "day", "not_rider", "muted"), "error" for any
    /// other answer (before 0206), or "" when it could not be asked.
    static func send(tour: String, state: String) async -> String {
        guard let r = saved(), let u = r["url"], let url = URL(string: u), let key = r["key"],
              state == "on" || state == "off", !tour.isEmpty, tour.count <= 80 else { return "" }
        let day = tourDay()
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 12
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "apikey")
        req.setValue("Bearer " + key, forHTTPHeaderField: "Authorization")
        let body: [String: Any] = ["p_device": r["device"] ?? "", "p_secret": r["secret"] ?? "", "p_tour": tour,
                                   "p_day": day, "p_state": state]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        for attempt in 0..<2 {
            if let got = try? await URLSession.shared.data(for: req), let http = got.1 as? HTTPURLResponse {
                if http.statusCode == 200,
                   let word = (try? JSONSerialization.jsonObject(with: got.0, options: [.fragmentsAllowed])) as? String {
                    return word
                }
                return "error"
            }
            if attempt == 0 { try? await Task.sleep(nanoseconds: 1_500_000_000) }
        }
        keep(["uid": r["uid"] ?? "", "tour": tour, "day": day, "state": state,
              "at": String(Int(Date().timeIntervalSince1970))])
        return ""
    }

    /// A word that could not be said: the newest per tour and day, at most 10.
    private static func keep(_ p: [String: String]) {
        let store = UserDefaults.standard
        var list = (store.array(forKey: pendingName) as? [[String: String]]) ?? []
        list.removeAll { $0["tour"] == p["tour"] && $0["day"] == p["day"] && $0["uid"] == p["uid"] }
        list.append(p)
        store.set(Array(list.suffix(10)), forKey: pendingName)
    }
    /// The words still waiting, handed to the app once (it says them for the account signed in, today only).
    static func takePending() -> [[String: String]] {
        let store = UserDefaults.standard
        let list = (store.array(forKey: pendingName) as? [[String: String]]) ?? []
        store.removeObject(forKey: pendingName)
        return list
    }
}

#if canImport(AppIntents) && canImport(ActivityKit)
/// The day bar's On bus and Off bus (Devin, Oct 22: "At Bus Call the lock-screen bar shows two buttons, On bus and Off
/// bus; the answer goes straight into Bus Check"). Runs in the app's process, without opening the app.
@available(iOS 17.0, *)
struct DayBarBusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Answer Bus Check"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Tour")
    var tour: String
    @Parameter(title: "Answer")
    var state: String

    init() {
        self.tour = ""
        self.state = ""
    }
    init(tour: String, state: String) {
        self.tour = tour
        self.state = state
    }

    func perform() async throws -> some IntentResult {
        let word = await BusAnswer.send(tour: tour, state: state)
        // (The app sets this at launch: the bar then shows the word said. The extension never runs this.)
        if word == "ok", let said = BusAnswer.onSaid { await said(tour, state) }
        return .result()
    }
}
#endif
