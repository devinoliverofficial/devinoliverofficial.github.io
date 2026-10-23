// The DayBar widget extension: how the lock-screen day bar looks (Greenroom, Devin's idea 20).
//
// Devin (2026-10-15): "it should say 'Load In' and a bar that represents the time until the next thing,
// 'Soundcheck' in this case." On the lock screen: the venue and city on top, the step the day is on in big
// letters, and a bar filling toward the next step with its name, its time and the time left. The bar and the
// clock move by themselves (ProgressView(timerInterval:) and Text(timerInterval:)), with no updates.
// When the next step's time comes and no update has arrived (the phone is locked and the server's pushes are not
// live yet, or a push is a few seconds behind the minute), iOS marks the bar stale and it moves on to that step by
// itself, with its own words and a bar toward the one after. Only one step: after that it waits for the app or a push.
// A tap opens that day's day sheet in the app (greenroom://daysheet?...).
// At Bus Call (Devin, Oct 22): two buttons, On bus and Off bus, for someone who answers Bus Check from this phone; the
// answer goes straight into Bus Check (DayBarBusIntent, ios-app/native/App/BusAnswer.swift; iOS 17 or newer), without
// opening the app. The word said today stays lit.
// Greenroom's look: black, with the chartreuse green (#CCF80A).

import ActivityKit
import SwiftUI
import WidgetKit
#if canImport(AppIntents)
import AppIntents
#endif

@main
struct DayBarBundle: WidgetBundle {
    var body: some Widget {
        DayBarLiveActivity()
    }
}

private let lime = Color(red: 0.8, green: 0.973, blue: 0.039)

/// What is on screen: the state as sent, or (stale) moved on one step by itself.
private struct Shown {
    var now: String
    var sub: String
    var from: Date
    var next: String
    var to: Date?
    /// The step's kind ("buscall": the On bus / Off bus buttons), whether this person answers Bus Check from here, and
    /// their word today.
    var key: String
    var bus: Bool
    var said: String

    init(_ s: DayBarAttributes.ContentState, stale: Bool) {
        bus = s.bus
        said = s.said
        if stale && !s.next.isEmpty && s.nextAt > 0 {
            key = s.nextKey
            // That step's own big and small words ("Sound Check" over the band, a band's set over "Your set"), as
            // the app draws it; a push from an older server has only the one-line name.
            now = s.nextLabel.isEmpty ? s.next : s.nextLabel
            sub = s.nextSub
            from = Date(timeIntervalSince1970: s.nextAt)
            next = s.then
            to = s.thenAt > s.nextAt ? Date(timeIntervalSince1970: s.thenAt) : nil
        } else {
            key = s.nowKey
            now = s.now
            sub = s.nowSub
            from = Date(timeIntervalSince1970: s.since)
            next = s.next
            to = s.nextAt > s.since ? Date(timeIntervalSince1970: s.nextAt) : nil
        }
    }

    /// The bar's span, only when it runs forward (a reversed range would stop the view).
    var span: ClosedRange<Date>? {
        guard let to = to, to > from, !next.isEmpty else { return nil }
        return from...to
    }
}

struct DayBarLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DayBarAttributes.self) { context in
            DayBarLockView(place: context.attributes.place, tour: tourOf(context.attributes.key),
                           shown: Shown(context.state, stale: context.isStale))
                .activityBackgroundTint(Color.black)
                .activitySystemActionForegroundColor(lime)
                .widgetURL(URL(string: context.attributes.url))
        } dynamicIsland: { context in
            let shown = Shown(context.state, stale: context.isStale)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(shown.now)
                            .font(.headline)
                            .foregroundStyle(lime)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        if !shown.sub.isEmpty {
                            Text(shown.sub).font(.caption).foregroundStyle(.white.opacity(0.8)).lineLimit(1)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let span = shown.span {
                        Text(timerInterval: span, countsDown: true)
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 80)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let span = shown.span {
                        VStack(alignment: .leading, spacing: 4) {
                            ProgressView(timerInterval: span, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(lime)
                            HStack(spacing: 4) {
                                Text(shown.next).lineLimit(1)
                                Text("\u{00B7}")
                                Text(span.upperBound, style: .time)
                            }
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.85))
                        }
                    }
                }
            } compactLeading: {
                Text(shown.now)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(lime)
                    .lineLimit(1)
                    .frame(maxWidth: 72)
            } compactTrailing: {
                if let span = shown.span {
                    Text(timerInterval: span, countsDown: true)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 48)
                }
            } minimal: {
                if let span = shown.span {
                    ProgressView(timerInterval: span, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                        .progressViewStyle(.circular)
                        .tint(lime)
                } else {
                    Image(systemName: "music.note").foregroundStyle(lime)
                }
            }
            .widgetURL(URL(string: context.attributes.url))
            .keylineTint(lime)
        }
    }
}

/// The tour of a bar ("<tour id>|<show id>").
private func tourOf(_ key: String) -> String {
    String(key.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
}

/// On bus and Off bus at Bus Call (iOS 17 or newer: a button in a Live Activity). Each says the word for this phone's
/// account without opening the app; the word said today is lit.
@available(iOS 17.0, *)
private struct BusButtons: View {
    let tour: String
    let said: String

    var body: some View {
        HStack(spacing: 10) {
            word("on", "On bus")
            word("off", "Off bus")
        }
    }

    private func word(_ state: String, _ label: String) -> some View {
        let lit = said == state
        return Button(intent: DayBarBusIntent(tour: tour, state: state)) {
            Text(label)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(lit ? Color.black : Color.white)
                .frame(maxWidth: .infinity, minHeight: 34)
                .background(Capsule().fill(lit ? lime : Color.white.opacity(0.16)))
        }
        .buttonStyle(.plain)
    }
}

private struct DayBarLockView: View {
    let place: String
    let tour: String
    let shown: Shown

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !place.isEmpty {
                Text(place)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
            Text(shown.now)
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(lime)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if !shown.sub.isEmpty {
                Text(shown.sub)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(1)
            }
            if let span = shown.span {
                ProgressView(timerInterval: span, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                    .tint(lime)
                HStack(spacing: 6) {
                    Text(shown.next)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Text(span.upperBound, style: .time)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.7))
                    Spacer(minLength: 4)
                    Text(timerInterval: span, countsDown: true)
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                .foregroundStyle(.white)
            }
            if shown.key == "buscall" && shown.bus && !tour.isEmpty {
                if #available(iOS 17.0, *) {
                    BusButtons(tour: tour, said: shown.said)
                }
            }
        }
        .padding(16)
    }
}
