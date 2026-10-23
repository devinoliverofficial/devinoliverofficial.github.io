// The lock-screen day bar (Greenroom, Devin's idea 20): what one Live Activity carries.
//
// Compiled into BOTH the app (which starts, moves on and ends the bar through DayBarPlugin) and the DayBar widget
// extension (which draws it on the lock screen and in the Dynamic Island). The page works out every value
// (src/core.js dayBarState). The server's pushes (migration 0198 and the day bar tick in supabase/functions/notify,
// which sends "attributes-type": "DayBarAttributes") send the same names. bus and said (0206, the alarms) are the
// page's and the server's own additions at Bus Call.
// Times are whole seconds since 1970.

import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct DayBarAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// The big words: the step the day is on ("Load In", a band's name for its set).
        var now: String = ""
        /// The small words under them: a sound check's band, "Your set".
        var nowSub: String = ""
        /// The step is our band's set.
        var mine: Bool = false
        /// When the step began (the bar's left end).
        var since: Double = 0
        /// The step the bar fills toward, as one line ("Sound Check · Icon For Hire"), and its time (0: none, the day's
        /// last step).
        var next: String = ""
        var nextAt: Double = 0
        /// That step's own big and small words, for when the lock screen moves on to it by itself (no update came in
        /// time): "Sound Check" over "Icon For Hire", a band's set over "Your set".
        var nextLabel: String = ""
        var nextSub: String = ""
        /// The step after that (the bar fills toward it once the lock screen has moved on by itself).
        var then: String = ""
        var thenAt: Double = 0
        /// Which kind of step the day is on, and the next one ("buscall" at Bus Call): at Bus Call the lock screen shows
        /// On bus and Off bus (Devin, Oct 22; 0206).
        var nowKey: String = ""
        var nextKey: String = ""
        /// This person answers Bus Check from this phone (on the bus list, not muted, and the phone may answer for them).
        var bus: Bool = false
        /// Their word today ("on", "off" or none), so the button they tapped stays lit.
        var said: String = ""

        init(now: String, nowSub: String, mine: Bool, since: Double, next: String, nextAt: Double,
             nextLabel: String, nextSub: String, then: String, thenAt: Double,
             nowKey: String = "", nextKey: String = "", bus: Bool = false, said: String = "") {
            self.now = now; self.nowSub = nowSub; self.mine = mine; self.since = since
            self.next = next; self.nextAt = nextAt; self.nextLabel = nextLabel; self.nextSub = nextSub
            self.then = then; self.thenAt = thenAt
            self.nowKey = nowKey; self.nextKey = nextKey; self.bus = bus; self.said = said
        }

        // Every field may be missing (a push from an older server): it is then empty.
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            now = (try? c.decodeIfPresent(String.self, forKey: .now)) ?? ""
            nowSub = (try? c.decodeIfPresent(String.self, forKey: .nowSub)) ?? ""
            mine = (try? c.decodeIfPresent(Bool.self, forKey: .mine)) ?? false
            since = (try? c.decodeIfPresent(Double.self, forKey: .since)) ?? 0
            next = (try? c.decodeIfPresent(String.self, forKey: .next)) ?? ""
            nextAt = (try? c.decodeIfPresent(Double.self, forKey: .nextAt)) ?? 0
            nextLabel = (try? c.decodeIfPresent(String.self, forKey: .nextLabel)) ?? ""
            nextSub = (try? c.decodeIfPresent(String.self, forKey: .nextSub)) ?? ""
            then = (try? c.decodeIfPresent(String.self, forKey: .then)) ?? ""
            thenAt = (try? c.decodeIfPresent(Double.self, forKey: .thenAt)) ?? 0
            nowKey = (try? c.decodeIfPresent(String.self, forKey: .nowKey)) ?? ""
            nextKey = (try? c.decodeIfPresent(String.self, forKey: .nextKey)) ?? ""
            bus = (try? c.decodeIfPresent(Bool.self, forKey: .bus)) ?? false
            said = (try? c.decodeIfPresent(String.self, forKey: .said)) ?? ""
        }
    }

    /// Which show: "<tour id>|<show id>". One bar at a time; a different show's bar is ended first.
    var key: String
    /// Venue and city, the small line on top.
    var place: String
    /// Where a tap goes: greenroom://daysheet?tour=...&show=... (the page opens that day's day sheet).
    var url: String
}
#endif
