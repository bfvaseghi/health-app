import WidgetKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
#if canImport(CoreText)
import CoreText
#endif

// The record card: Baseline's header mark and date line, the rule with the
// green reference mark, one serif figure for last night, a 14-night line and a
// short ledger of today's facts. It prints only what the record on this device
// holds (numbers, dates, category words), stamped with the day the page built
// it; a missing value is a dash, a day the app has not seen is said to be that.

// MARK: - Feed model (what App/BaselineFeed.swift's script posts)
//
// Every field is optional on purpose: one absent or renamed key must not throw
// away the whole decode and leave the widget claiming there is no record while
// a full feed sits on disk. Nothing in here is free text.

struct BaselineFeed: Decodable {
    var v: Int?
    var app: String?
    var builtAt: String?            // ISO timestamp: when the page last built it
    var builtOn: String?            // local yyyy-MM-dd at build: the stale test
    var status: String?             // "ok" | "empty" | "signed-out" | "denied"
    var goals: Goals?
    var meds: [Med]?
    var days: [Day]?
    var nights: [Night]?
    var latestNight: Night?
    var weights: [Weight]?
    var training: Training?
    var latest: String?             // newest dated entry across the record

    struct Goals: Decodable {
        var sleepHours: Double?
        var waterTargetMl: Double?
        var proteinTargetG: Double?
        var trackMedication: Bool?
    }

    /// One active medication, anonymous: its schedule and its answers.
    struct Med: Decodable {
        var schedule: String?       // "daily" | "weekly"
        var dueDay: Int?            // weekly: 0 = Sunday
        var doses: [String: Bool]?  // yyyy-MM-dd → taken, last 14 days
    }

    struct Day: Decodable {
        var d: String?
        var w: Double?              // weight, lb
        var p: Double?              // protein, g
        var wa: Double?             // water, mL
        var med: Double?            // meditation, minutes
        var j: Bool?                // journaled, or a journal entry that day
    }

    struct Night: Decodable {
        var d: String?              // the morning the night ended
        var h: Double?              // hours asleep
        var bed: String?            // "HH:MM"
        var wake: String?
    }

    struct Weight: Decodable {
        var d: String?
        var w: Double?
    }

    struct Training: Decodable {
        var lastWorkout: String?
        var thisWeek: Int?
        var weekStart: String?      // the Monday `thisWeek` was counted from
        var streakWeeks: Int?
        var importedAt: String?
        var days: [String]?         // dates with a workout, last 14 days
    }
}

extension BaselineFeed {
    /// The gallery preview and the placeholder, anchored to a day so the
    /// placeholder is never stale: two daily medications, fourteen nights, a
    /// morning's check-in. Round, fictional figures.
    static func sample(today: String) -> BaselineFeed {
        func day(_ back: Int) -> String { DayMath.addDays(today, -back) }
        var a: [String: Bool] = [:], b: [String: Bool] = [:]
        for back in 1...13 {
            a[day(back)] = back != 8     // one miss, eight days ago
            b[day(back)] = true
        }
        a[day(0)] = true                 // B is still unanswered today
        let hours: [Double] = [7.0, 7.5, 7.8, 7.2, 8.0, 7.6, 7.1, 7.9, 7.4, 7.7, 7.3, 8.0, 7.5, 7.4]
        var nights: [Night] = []
        for back in 0...13 where back != 6 {   // one night missing
            nights.append(Night(d: day(back), h: hours[13 - back],
                                bed: back == 0 ? "23:30" : "23:15", wake: back == 0 ? "07:00" : "06:45"))
        }
        let days: [Day] = [
            Day(d: day(0), w: 190.0, p: 120, wa: 750, med: 10, j: true),
            Day(d: day(1), w: nil, p: 165, wa: 2500, med: 15, j: false),
            Day(d: day(2), w: 190.2, p: 170, wa: 2200, med: 10, j: true),
            Day(d: day(3), w: nil, p: 180, wa: 2500, med: nil, j: true),
            Day(d: day(4), w: 190.4, p: 150, wa: 1800, med: 10, j: false),
            Day(d: day(5), w: nil, p: 175, wa: 2500, med: 12, j: true),
            Day(d: day(6), w: 190.6, p: 160, wa: 2500, med: nil, j: false),
            Day(d: day(7), w: nil, p: 180, wa: 2400, med: 10, j: true),
            Day(d: day(8), w: 190.8, p: 140, wa: 2000, med: 5, j: true),
            Day(d: day(9), w: nil, p: 185, wa: 2500, med: 10, j: false),
            Day(d: day(10), w: 191.0, p: 170, wa: 2500, med: 10, j: true),
            Day(d: day(11), w: nil, p: 165, wa: 2100, med: nil, j: true),
            Day(d: day(12), w: nil, p: 180, wa: 2500, med: 10, j: true),
            Day(d: day(13), w: nil, p: 150, wa: 2500, med: 10, j: false),
        ]
        let weights = days.compactMap { entry in entry.w.map { Weight(d: entry.d, w: $0) } }
        let monday = DayMath.mondayOfWeek(today)
        let workouts = [day(2), day(4), day(7), day(9), day(11)].filter { $0 <= today }
        return BaselineFeed(
            v: 1, app: "baseline", builtAt: nil, builtOn: today, status: "ok",
            goals: Goals(sleepHours: 9, waterTargetMl: 2500, proteinTargetG: 180, trackMedication: true),
            meds: [Med(schedule: "daily", dueDay: nil, doses: a), Med(schedule: "daily", dueDay: nil, doses: b)],
            days: days, nights: nights, latestNight: nights.first, weights: weights,
            training: Training(lastWorkout: workouts.first, thisWeek: workouts.filter { $0 >= monday }.count,
                               weekStart: monday, streakWeeks: 3, importedAt: workouts.first, days: workouts),
            latest: today
        )
    }
}

// MARK: - The day (device-local, the same rules as the page)

enum DayMath {
    static var calendar: Calendar {
        var calendar = Calendar.current
        calendar.timeZone = .current
        return calendar
    }

    private static let keyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// "2026-09-20", the key the page writes (todayLocal in health-model.ts).
    static func key(for date: Date) -> String { keyFormatter.string(from: date) }

    static func date(from key: String) -> Date? {
        guard key.count == 10 else { return nil }
        return keyFormatter.date(from: key)
    }

    static func isKey(_ value: String?) -> Bool {
        guard let value else { return false }
        return date(from: value) != nil
    }

    static func addDays(_ key: String, _ amount: Int) -> String {
        guard let start = date(from: key),
              let moved = calendar.date(byAdding: .day, value: amount, to: start) else { return key }
        return self.key(for: moved)
    }

    /// Whole days from `a` to `b` (positive when `b` is later).
    static func daysBetween(_ a: String, _ b: String) -> Int? {
        guard let from = date(from: a), let to = date(from: b) else { return nil }
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: from), to: calendar.startOfDay(for: to)).day
    }

    /// 0 = Sunday, matching `isDue` in health-model.ts.
    static func weekday(_ key: String) -> Int? {
        date(from: key).map { calendar.component(.weekday, from: $0) - 1 }
    }

    /// The Monday of the week a day falls in (weekStart in training/coach.ts).
    static func mondayOfWeek(_ key: String) -> String {
        guard let weekday = weekday(key) else { return key }
        return addDays(key, -((weekday + 6) % 7))
    }

    /// Five past midnight: "today" moves, and every fact about it with it.
    static func nextMidnight(after date: Date) -> Date {
        calendar.nextDate(after: date, matching: DateComponents(hour: 0, minute: 5), matchingPolicy: .nextTime)
            ?? date.addingTimeInterval(6 * 3600)
    }

    /// The first moment of the next local day.
    static func startOfNextDay(after date: Date) -> Date {
        calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date))
            ?? date.addingTimeInterval(24 * 3600)
    }

    /// "Sep 20" — the app's short date label.
    static func shortDate(_ key: String) -> String {
        guard let date = date(from: key) else { return key }
        return localized("MMMd", date)
    }

    /// "Thursday", for spoken labels.
    static func weekdayName(_ key: String) -> String {
        guard let date = date(from: key) else { return key }
        return localized("EEEE", date)
    }

    /// The header's date line: "SAT · SEP 20", or "SEP 20" on the small card
    /// (the app's `.tl-caps` idiom: uppercase, tracked).
    static func dateLine(_ date: Date, long: Bool) -> String {
        let day = localized("MMMd", date).uppercased()
        return long ? "\(localized("EEE", date).uppercased()) · \(day)" : day
    }

    private static func localized(_ template: String, _ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.timeZone = .current
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }
}

// MARK: - The app's words (ports of the page's own formatters)

enum Copy {
    /// hoursLabel (app/ui/format.ts): "7h 24m", "9h".
    static func hoursLabel(_ value: Double) -> String {
        let whole = Int(value.rounded(.down))
        let minutes = Int(((value - Double(whole)) * 60).rounded())
        if minutes == 60 { return "\(whole + 1)h" }
        return minutes > 0 ? "\(whole)h \(minutes < 10 ? "0" : "")\(minutes)m" : "\(whole)h"
    }

    /// "7 hours 24 minutes", for spoken labels.
    static func spokenHours(_ value: Double) -> String {
        let whole = Int(value.rounded(.down))
        let minutes = Int(((value - Double(whole)) * 60).rounded())
        let hours = count(whole, "hour", "hours")
        return minutes > 0 ? "\(hours) \(count(minutes, "minute", "minutes"))" : hours
    }

    /// litres (app/ui/water-tracker.tsx): "2.5 L", "750 mL".
    static func litres(_ ml: Double) -> String {
        if ml >= 1000 { return "\(trimmed((ml / 1000 * 100).rounded() / 100)) L" }
        return "\(Int(ml.rounded())) mL"
    }

    /// "750 millilitres of 2.5 litres", for spoken labels.
    static func spokenLitres(_ ml: Double) -> String {
        if ml >= 1000 { return "\(trimmed((ml / 1000 * 100).rounded() / 100)) litres" }
        return "\(Int(ml.rounded())) millilitres"
    }

    /// Up to two decimals, trailing zeros dropped (Number(x.toFixed(2))).
    static func trimmed(_ value: Double) -> String {
        var text = String(format: "%.2f", value)
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text
    }

    /// formatClock (app/health-model.ts): "23:30" → "11:30 PM".
    static func clock(_ value: String?) -> String? {
        guard let value else { return nil }
        let parts = value.split(separator: ":")
        guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]),
              (0...23).contains(hour), (0...59).contains(minute) else { return nil }
        let twelve = hour % 12 == 0 ? 12 : hour % 12
        return "\(twelve):\(minute < 10 ? "0" : "")\(minute) \(hour >= 12 ? "PM" : "AM")"
    }

    /// sinceLabel (app/training/recommend.ts): "today", "yesterday", "9 days ago", "never".
    static func sinceLabel(_ days: Int?) -> String {
        guard let days else { return "never" }
        if days <= 0 { return "today" }
        if days == 1 { return "yesterday" }
        return "\(days) days ago"
    }

    static func count(_ n: Int, _ singular: String, _ plural: String) -> String {
        "\(n) \(n == 1 ? singular : plural)"
    }

    static func grams(_ value: Double) -> String { "\(Int(value.rounded()))" }

    static func pounds(_ value: Double) -> String { String(format: "%.1f", value) }

    static func capitalized(_ text: String) -> String {
        guard let first = text.first else { return text }
        return first.uppercased() + text.dropFirst()
    }
}

// MARK: - Colour tokens (app/globals.css, overridden by app/baseline.css)

struct Palette {
    let dark: Bool
    private func c(_ light: String, _ night: String) -> Color { Color(hex: dark ? night : light) }

    var paper: Color { c("#ffffff", "#152734") }         // --paper: the widget background
    var ink: Color { c("#182e40", "#edf2ef") }           // --ink
    var muted: Color { c("#596a76", "#b0c0ca") }         // --muted
    var faint: Color { c("#626f78", "#9baebc") }         // --faint
    var line: Color { dark ? Color(hex: "#cbdde7").opacity(0.22) : Color(hex: "#182e40").opacity(0.13) }
    var lineStrong: Color { dark ? Color(hex: "#cbdde7").opacity(0.38) : Color(hex: "#182e40").opacity(0.28) }
    var accent: Color { c("#285789", "#b5c9f0") }        // --accent: the sparkline
    var signal: Color { Color(hex: "#d7ed8d") }          // --signal: a mark, never text
    var signalInk: Color { Color(hex: "#182e40") }       // --signal-ink
    var warn: Color { c("#875214", "#efca91") }          // --warn
    var stripOn: Color { c("#577ca3", "#92a5c7") }       // color-mix(accent 78%, paper)
    var stripHalf: Color { c("#93abc3", "#657b97") }     // color-mix(accent 45%, soft)
}

extension Color {
    /// '#rrggbb' → Color; anything unparseable falls back to the page's ink.
    init(hex: String) {
        var value: UInt64 = 0
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        if Scanner(string: cleaned).scanHexInt64(&value), cleaned.count == 6 {
            self.init(
                red: Double((value >> 16) & 0xFF) / 255.0,
                green: Double((value >> 8) & 0xFF) / 255.0,
                blue: Double(value & 0xFF) / 255.0
            )
        } else {
            self.init(red: 0.094, green: 0.180, blue: 0.251) // #182e40
        }
    }
}

// MARK: - Typography (the site's two families; system fonts when a file is missing)

enum Fonts {
    /// Hanken Grotesk: labels and captions (Medium), values (SemiBold), the
    /// brand word (Bold). Static instances, so weights resolve on iOS 17.
    static func ui(_ size: CGFloat, _ weight: Font.Weight) -> Font {
        let name: String
        switch weight {
        case .bold: name = "HankenGrotesk-Bold"
        case .semibold: name = "HankenGrotesk-SemiBold"
        default: name = "HankenGrotesk-Medium"
        }
        return custom(name, size: size) ?? .system(size: size, weight: weight)
    }

    /// Instrument Serif, for the hero figures only.
    static func serif(_ size: CGFloat) -> Font {
        custom("InstrumentSerif-Regular", size: size) ?? .system(size: size, weight: .regular, design: .serif)
    }

    /// SF Mono: the date line and the Lock Screen's BASELINE (the app's --font-data).
    static func mono(_ size: CGFloat, _ weight: Font.Weight) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    private static func custom(_ name: String, size: CGFloat) -> Font? {
        isAvailable(name) ? Font.custom(name, size: size) : nil
    }

    private static func isAvailable(_ name: String) -> Bool {
        #if canImport(UIKit)
        if UIFont(name: name, size: 12) != nil { return true }
        _ = registerBundledFonts
        return UIFont(name: name, size: 12) != nil
        #else
        return false
        #endif
    }

    /// The extension registers its fonts through UIAppFonts; the preview test
    /// bundle has no such plist, so the files are registered by hand once.
    /// Registering a font the system already knows is harmless.
    private static let registerBundledFonts: Void = {
        #if canImport(CoreText)
        let bundle = Bundle(for: FontBundleToken.self)
        for name in ["InstrumentSerif-Regular", "HankenGrotesk-Medium", "HankenGrotesk-SemiBold", "HankenGrotesk-Bold"] {
            guard let url = bundle.url(forResource: name, withExtension: "ttf") else { continue }
            _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        #endif
    }()
}

private final class FontBundleToken {}

// MARK: - The facts of the day (every rule of the brief's states lives here)

enum CellState { case on, half, miss, open, notDue }

struct LedgerRow {
    let label: String
    let value: String
    let isMiss: Bool
    let cells: [CellState]
    let accessibilityLabel: String
}

struct DayFacts {
    enum State {
        case noFeed, empty, signedOut, denied

        var title: String {
            switch self {
            case .noFeed: return "Baseline"
            case .empty: return "Nothing recorded yet"
            case .signedOut: return "Signed out"
            case .denied: return "Baseline is private"
            }
        }

        var line: String {
            switch self {
            case .noFeed: return "Open Baseline once and today's record appears here."
            case .empty: return "Your nights, doses and check-ins appear here as you log them."
            case .signedOut: return "Sign in to Baseline to bring the record back."
            case .denied: return "Account access denied."
            }
        }
    }

    enum Hero {
        case sleep(BaselineFeed.Night)
        case weight(BaselineFeed.Weight)
        case meds
        case none
    }

    enum StaleStyle { case short, medium, large, lock, inline }

    let feed: BaselineFeed
    let state: State?
    let now: Date
    let todayKey: String

    init(feed: BaselineFeed?, now: Date) {
        self.now = now
        todayKey = DayMath.key(for: now)
        self.feed = feed ?? BaselineFeed()
        if feed == nil { state = .noFeed }
        else if feed?.status == "empty" { state = .empty }
        else if feed?.status == "signed-out" { state = .signedOut }
        else if feed?.status == "denied" { state = .denied }
        else { state = nil }
    }

    // MARK: Stale

    /// The app has not run today: anything about today is unknown.
    var isStale: Bool {
        guard let built = feed.builtOn, DayMath.isKey(built) else { return false }
        return built != todayKey
    }

    var staleDays: Int? { feed.builtOn.flatMap { DayMath.daysBetween($0, todayKey) } }

    func staleNote(_ style: StaleStyle) -> String {
        let since = Copy.sinceLabel(staleDays)
        switch style {
        case .short, .lock: return "Opened \(since)"
        case .inline: return "Baseline · opened \(since)"
        case .medium: return "Last opened \(since) · open Baseline to update."
        case .large: return "Last opened \(since) · open Baseline to bring the record up to date."
        }
    }

    // MARK: The window

    /// Fourteen days ending today, oldest first.
    var windowKeys: [String] { (0..<14).map { DayMath.addDays(todayKey, $0 - 13) } }

    func day(_ key: String) -> BaselineFeed.Day? { feed.days?.first { $0.d == key } }
    var today: BaselineFeed.Day? { day(todayKey) }

    // MARK: Medications

    var meds: [BaselineFeed.Med] { feed.meds ?? [] }
    var medsApply: Bool { (feed.goals?.trackMedication ?? true) && !meds.isEmpty }

    func isDue(_ med: BaselineFeed.Med, on key: String) -> Bool {
        guard med.schedule == "weekly" else { return true }
        guard let dueDay = med.dueDay, let weekday = DayMath.weekday(key) else { return false }
        return dueDay == weekday
    }

    var dueToday: [BaselineFeed.Med] { medsApply ? meds.filter { isDue($0, on: todayKey) } : [] }
    var dueCount: Int { dueToday.count }
    var takenCount: Int { dueToday.filter { $0.doses?[todayKey] == true }.count }
    var missedCount: Int { dueToday.filter { $0.doses?[todayKey] == false }.count }
    var unansweredCount: Int { max(0, dueCount - takenCount - missedCount) }

    // MARK: Targets and latest readings

    var waterTarget: Double? { (feed.goals?.waterTargetMl).flatMap { $0 > 0 ? $0 : nil } }
    var proteinTarget: Double? { (feed.goals?.proteinTargetG).flatMap { $0 > 0 ? $0 : nil } }
    var sleepGoal: Double { (feed.goals?.sleepHours).flatMap { $0 > 0 ? $0 : nil } ?? 9 }

    var latestNight: BaselineFeed.Night? {
        if let night = feed.latestNight, DayMath.isKey(night.d) { return night }
        return feed.nights?.first { DayMath.isKey($0.d) }
    }

    var latestWeight: BaselineFeed.Weight? {
        if let weight = feed.weights?.first(where: { $0.w != nil && DayMath.isKey($0.d) }) { return weight }
        return feed.days?.first { $0.w != nil && DayMath.isKey($0.d) }.map { BaselineFeed.Weight(d: $0.d, w: $0.w) }
    }

    var training: BaselineFeed.Training? { feed.training }
    var trainingApplies: Bool {
        guard let training else { return false }
        return DayMath.isKey(training.lastWorkout) || (training.thisWeek ?? 0) > 0 || !(training.days ?? []).isEmpty
    }

    // MARK: The ledger (§6.3: priority order, rows that do not apply are skipped)

    var rows: [LedgerRow] { [medsRow, waterRow, proteinRow, trainingRow, meditationRow, journalRow].compactMap { $0 } }

    private var medsRow: LedgerRow? {
        guard medsApply else { return nil }
        let value: String
        let spoken: String
        if isStale {
            value = "—"
            spoken = "Meds, not updated today"
        } else if dueCount == 0 {
            value = "No doses due"
            spoken = "Meds, no doses due today"
        } else {
            value = "\(takenCount) of \(dueCount)"
            spoken = "Meds, \(takenCount) of \(Copy.count(dueCount, "dose", "doses")) taken today"
                + (missedCount > 0 ? ", \(missedCount) missed" : "")
        }
        let cells = windowKeys.map { key -> CellState in
            let due = meds.filter { isDue($0, on: key) }
            if due.isEmpty { return .notDue }
            if isStale && key == todayKey { return .open }
            let answers = due.map { $0.doses?[key] }
            if answers.contains(false) { return .miss }
            if answers.allSatisfy({ $0 == true }) { return .on }
            return .open
        }
        return LedgerRow(label: "Meds", value: value, isMiss: !isStale && missedCount > 0, cells: cells, accessibilityLabel: spoken)
    }

    private var waterRow: LedgerRow {
        let value: String
        let spoken: String
        if isStale {
            value = "—"
            spoken = "Water, not updated today"
        } else if let ml = today?.wa {
            if let target = waterTarget {
                value = "\(Copy.litres(ml)) of \(Copy.litres(target))"
                spoken = "Water, \(Copy.spokenLitres(ml)) of \(Copy.spokenLitres(target))"
            } else {
                value = Copy.litres(ml)
                spoken = "Water, \(Copy.spokenLitres(ml))"
            }
        } else {
            value = "Not logged"
            spoken = "Water, not logged today"
        }
        let cells = windowKeys.map { key -> CellState in
            if isStale && key == todayKey { return .open }
            guard let ml = day(key)?.wa else { return .open }
            guard let target = waterTarget else { return .on }
            return ml >= target ? .on : .half
        }
        return LedgerRow(label: "Water", value: value, isMiss: false, cells: cells, accessibilityLabel: spoken)
    }

    private var proteinRow: LedgerRow? {
        let logged = windowKeys.contains { day($0)?.p != nil }
        guard proteinTarget != nil || logged else { return nil }
        let value: String
        let spoken: String
        if isStale {
            value = "—"
            spoken = "Protein, not updated today"
        } else if let grams = today?.p {
            if let target = proteinTarget {
                value = "\(Copy.grams(grams)) of \(Copy.grams(target)) g"
                spoken = "Protein, \(Copy.grams(grams)) of \(Copy.grams(target)) grams"
            } else {
                value = "\(Copy.grams(grams)) g"
                spoken = "Protein, \(Copy.grams(grams)) grams"
            }
        } else {
            value = "Not logged"
            spoken = "Protein, not logged today"
        }
        let cells = windowKeys.map { key -> CellState in
            if isStale && key == todayKey { return .open }
            guard let grams = day(key)?.p else { return .open }
            guard let target = proteinTarget else { return .on }
            return grams >= target ? .on : .half
        }
        return LedgerRow(label: "Protein", value: value, isMiss: false, cells: cells, accessibilityLabel: spoken)
    }

    /// `thisWeek` is trusted only while the feed's week is this week; after
    /// that the last workout's date is the only fact that still holds.
    private var trainingRow: LedgerRow? {
        guard trainingApplies, let training else { return nil }
        let sameWeek = training.weekStart == DayMath.mondayOfWeek(todayKey)
        let sinceLast = training.lastWorkout.flatMap { DayMath.daysBetween($0, todayKey) }
        let value: String
        var spoken = "Training"
        if sameWeek, let count = training.thisWeek, count > 0 {
            value = "\(count) this week"
            spoken += ", \(Copy.count(count, "workout", "workouts")) this week"
        } else {
            value = Copy.capitalized(Copy.sinceLabel(sinceLast))
            spoken += ", last workout \(Copy.sinceLabel(sinceLast))"
        }
        if let last = training.lastWorkout, DayMath.isKey(last), sameWeek, (training.thisWeek ?? 0) > 0 {
            spoken += ", last on \(DayMath.weekdayName(last))"
        }
        let workoutDays = Set(training.days ?? [])
        let cells = windowKeys.map { key -> CellState in workoutDays.contains(key) ? .on : .open }
        return LedgerRow(label: "Training", value: value, isMiss: false, cells: cells, accessibilityLabel: spoken)
    }

    private var meditationRow: LedgerRow {
        let minutes = today?.med ?? 0
        let value = isStale ? "—" : minutes > 0 ? "\(Int(minutes.rounded())) min" : "Not today"
        let spoken = isStale ? "Meditation, not updated today"
            : minutes > 0 ? "Meditation, \(Copy.count(Int(minutes.rounded()), "minute", "minutes")) today" : "Meditation, not today"
        let cells = windowKeys.map { key -> CellState in
            if isStale && key == todayKey { return .open }
            let minutes = day(key)?.med ?? 0
            return minutes >= 10 ? .on : minutes > 0 ? .half : .open
        }
        return LedgerRow(label: "Meditation", value: value, isMiss: false, cells: cells, accessibilityLabel: spoken)
    }

    private var journalRow: LedgerRow {
        let written = today?.j == true
        let value = isStale ? "—" : written ? "Written" : "Not today"
        let spoken = isStale ? "Journal, not updated today" : written ? "Journal, written today" : "Journal, not today"
        let cells = windowKeys.map { key -> CellState in
            if isStale && key == todayKey { return .open }
            return day(key)?.j == true ? .on : .open
        }
        return LedgerRow(label: "Journal", value: value, isMiss: false, cells: cells, accessibilityLabel: spoken)
    }

    // MARK: The "what's left" line (§6.4: first true rule wins, one fact only)

    func whatsLeft(short: Bool) -> String {
        let today = short ? "" : " today"
        if medsApply && dueCount > 0 {
            if unansweredCount > 0 { return "\(Copy.count(unansweredCount, "dose", "doses")) left\(today)" }
            if missedCount > 0 { return "\(Copy.count(missedCount, "dose", "doses")) missed\(today)" }
        }
        if let target = waterTarget {
            if let ml = self.today?.wa {
                if ml < target { return "Water \(Copy.litres(target - ml)) to go" }
            } else {
                return "Water not logged"
            }
        }
        if let target = proteinTarget {
            if let grams = self.today?.p {
                if grams < target { return "Protein \(Copy.grams(target - grams)) g to go" }
            } else {
                return "Protein not logged"
            }
        }
        return short ? "All logged" : "All logged for today"
    }

    /// "last entry today" / "yesterday" / "3 days ago", from `feed.latest`.
    var lastEntry: String? {
        guard let latest = feed.latest, DayMath.isKey(latest) else { return nil }
        return "last entry \(Copy.sinceLabel(DayMath.daysBetween(latest, todayKey)))"
    }

    // MARK: Heroes (§6.5: sleep, else weight, else meds, else a dash)

    var hero: Hero {
        if let night = latestNight { return .sleep(night) }
        if let weight = latestWeight { return .weight(weight) }
        if medsApply { return .meds }
        return .none
    }

    /// The large card's left hero: sleep leads; weight has its own column.
    var largeLeftHero: Hero {
        if let night = latestNight { return .sleep(night) }
        if medsApply { return .meds }
        return .none
    }

    func heroFigure(_ hero: Hero) -> String {
        switch hero {
        case .sleep(let night): return night.h.map(Copy.hoursLabel) ?? "—"
        case .weight(let weight): return weight.w.map(Copy.pounds) ?? "—"
        case .meds: return isStale || dueCount == 0 ? "—" : "\(takenCount) of \(dueCount)"
        case .none: return "—"
        }
    }

    func heroUnit(_ hero: Hero) -> String? {
        if case .weight(let weight) = hero, weight.w != nil { return "lb" }
        return nil
    }

    /// "Last night" for a night that ended this morning, else "Latest · Sep 19"
    /// (app/ui/sleep-view.tsx); medium adds the clock times, large the goal.
    func heroCaption(_ hero: Hero, family: WidgetFamily) -> String {
        switch hero {
        case .sleep(let night):
            let key = night.d ?? ""
            var caption = key == todayKey ? "Last night" : "Latest · \(DayMath.shortDate(key))"
            let times = Copy.clock(night.bed).flatMap { bed in Copy.clock(night.wake).map { "\(bed) – \($0)" } }
            let goal = "goal \(Copy.hoursLabel(sleepGoal))"
            switch family {
            case .systemSmall: break
            case .systemLarge: caption += " · \(times ?? goal)" + (times == nil ? "" : " · \(goal)")
            default: caption += " · \(times ?? goal)"
            }
            return caption
        case .weight(let weight):
            return "Weight · \(DayMath.shortDate(weight.d ?? ""))"
        case .meds:
            return dueCount == 0 && !isStale ? "No doses due" : "Doses today"
        case .none:
            return "Nothing recorded yet"
        }
    }

    /// The large card's weight column: the latest reading and its change over
    /// the last 14 days, in the words of buildHealthReport.
    var weightCaption: String {
        guard let weight = latestWeight, let latestLb = weight.w else { return "Weight not recorded" }
        let from = DayMath.addDays(todayKey, -13)
        let recent = (feed.weights ?? []).filter { reading in
            guard let d = reading.d, DayMath.isKey(d), reading.w != nil else { return false }
            return d >= from && d <= todayKey
        }
        var caption = "Weight · \(DayMath.shortDate(weight.d ?? ""))"
        if recent.count >= 2, let earliest = recent.min(by: { ($0.d ?? "") < ($1.d ?? "") })?.w {
            let change = latestLb - earliest
            caption += " · \(change < 0 ? "−" : "+")\(Copy.pounds(abs(change))) lb over 14 days"
        } else if recent.count == 1 {
            caption += " · 1 reading"
        }
        return caption
    }

    var weightSpoken: String {
        guard let weight = latestWeight, let lb = weight.w else { return "Weight, not recorded" }
        return "Weight, \(Copy.pounds(lb)) pounds on \(DayMath.shortDate(weight.d ?? ""))"
    }

    /// "Sleep, 7 hours 24 minutes last night, bedtime 11:30 PM, woke 7:00 AM,
    /// goal 9 hours, 14-night average 7 hours 40 minutes".
    func heroSpoken(_ hero: Hero) -> String {
        switch hero {
        case .sleep(let night):
            var parts = ["Sleep"]
            let when = night.d == todayKey ? "last night" : "latest, \(DayMath.shortDate(night.d ?? ""))"
            parts.append(night.h.map { "\(Copy.spokenHours($0)) \(when)" } ?? "duration not recorded, \(when)")
            if let bed = Copy.clock(night.bed) { parts.append("bedtime \(bed)") }
            if let wake = Copy.clock(night.wake) { parts.append("woke \(wake)") }
            parts.append("goal \(Copy.spokenHours(sleepGoal))")
            if let average = averageNight { parts.append("14-night average \(Copy.spokenHours(average))") }
            return parts.joined(separator: ", ")
        case .weight:
            return weightSpoken
        case .meds:
            return isStale ? "Doses today, not updated" : dueCount == 0 ? "No doses due today" : "Doses today, \(takenCount) of \(dueCount) taken"
        case .none:
            return "Nothing recorded yet"
        }
    }

    // MARK: The 14-night line

    /// One slot per calendar day ending today, oldest first; nil where no
    /// night was recorded.
    var nightSlots: [Double?] {
        let nights = feed.nights ?? []
        return windowKeys.map { key in nights.first { $0.d == key }?.h }
    }

    var averageNight: Double? {
        let hours = nightSlots.compactMap { $0 }
        guard !hours.isEmpty else { return nil }
        return hours.reduce(0, +) / Double(hours.count)
    }

    // MARK: Lock Screen

    /// Circular: the sleep figure, else today's doses as "1/2" with "meds".
    var circular: (figure: String, caption: String?)? {
        if let night = latestNight, let hours = night.h { return (Copy.hoursLabel(hours), nil) }
        if medsApply, !isStale, dueCount > 0 { return ("\(takenCount)/\(dueCount)", "meds") }
        return nil
    }

    /// Rectangular line 2: the hero in one short phrase.
    var rectangularHeadline: String {
        if let state { return state.title }
        switch hero {
        case .sleep(let night):
            let figure = night.h.map(Copy.hoursLabel) ?? "—"
            return night.d == todayKey ? "\(figure) last night" : "\(figure) · \(DayMath.shortDate(night.d ?? ""))"
        case .weight(let weight):
            return "\(weight.w.map(Copy.pounds) ?? "—") lb · \(DayMath.shortDate(weight.d ?? ""))"
        case .meds:
            return isStale || dueCount == 0 ? "No doses due" : "\(takenCount) of \(Copy.count(dueCount, "dose", "doses")) today"
        case .none:
            return "Nothing recorded yet"
        }
    }

    /// Rectangular line 3: doses and water, or the stale note; nothing in a state.
    var rectangularDetail: String? {
        if state != nil { return nil }
        if isStale { return staleNote(.lock) }
        var parts: [String] = []
        if medsApply {
            parts.append(dueCount == 0 ? "No doses due" : "\(takenCount) of \(Copy.count(dueCount, "dose", "doses"))")
        }
        if let ml = today?.wa {
            parts.append(waterTarget.map { "\(Copy.litres(ml)) of \(Copy.litres($0))" } ?? Copy.litres(ml))
        } else {
            parts.append("Water not logged")
        }
        return parts.joined(separator: " · ")
    }

    /// "Baseline · 1 dose left · 7h 24m"; the facts drop from the right as
    /// the system truncates.
    var inline: String {
        if let state { return state == .noFeed ? "Baseline" : "Baseline · \(state.title)" }
        if isStale { return staleNote(.inline) }
        var parts = ["Baseline", whatsLeft(short: true)]
        if let hours = latestNight?.h { parts.append(Copy.hoursLabel(hours)) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Timeline

struct BaselineEntry: TimelineEntry {
    var date: Date
    var feed: BaselineFeed?   // nil: the app has not written a feed yet
}

struct BaselineProvider: TimelineProvider {
    static let appGroup = "group.com.bardia.baseline"

    func placeholder(in context: Context) -> BaselineEntry {
        let now = Date()
        return BaselineEntry(date: now, feed: .sample(today: DayMath.key(for: now)))
    }

    func getSnapshot(in context: Context, completion: @escaping (BaselineEntry) -> Void) {
        // The gallery shows the sample record; anywhere else, the real feed or
        // the invitation to open the app once.
        let now = Date()
        completion(BaselineEntry(date: now, feed: loadFeed() ?? (context.isPreview ? .sample(today: DayMath.key(for: now)) : nil)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BaselineEntry>) -> Void) {
        let feed = loadFeed()
        let now = Date()
        // One entry now; one at the first moment of the next local day, when
        // "today" rolls (due doses reset, "Last night" becomes "Latest", the
        // stale test flips); and, for a feed built today, one more at the
        // following midnight so a card the app does not refresh for two days
        // still turns stale on time. Every in-app write reloads the timeline
        // at once (WidgetFeed.save).
        let nextDay = DayMath.startOfNextDay(after: now)
        var entries = [BaselineEntry(date: now, feed: feed), BaselineEntry(date: nextDay, feed: feed)]
        if feed?.builtOn == DayMath.key(for: now) {
            entries.append(BaselineEntry(date: DayMath.startOfNextDay(after: nextDay), feed: feed))
        }
        completion(Timeline(entries: entries, policy: .after(DayMath.nextMidnight(after: now))))
    }

    /// Only ever `widget-feed.json`; the mirror in the same folder is never opened.
    private func loadFeed() -> BaselineFeed? {
        guard let data = WidgetFeed.load(appGroup: Self.appGroup) else { return nil }
        return try? JSONDecoder().decode(BaselineFeed.self, from: data)
    }
}

// MARK: - Views

/// The real widget: reads the family WidgetKit chose and hands it on. The
/// layout takes the family as a value so the preview renderer can ask for
/// every size (WidgetKit's environment value is read-only).
struct BaselineWidgetEntryView: View {
    var entry: BaselineEntry
    @Environment(\.widgetFamily) private var family

    var body: some View { BaselineWidgetView(entry: entry, family: family) }
}

struct BaselineWidgetView: View {
    var entry: BaselineEntry
    var family: WidgetFamily

    var body: some View {
        switch family {
        case .accessoryCircular: CircularView(entry: entry)
        case .accessoryRectangular: RectangularView(entry: entry)
        case .accessoryInline: InlineView(entry: entry)
        case .systemSmall: RecordSmallView(entry: entry)
        case .systemMedium: RecordMediumView(entry: entry)
        default: RecordLargeView(entry: entry)
        }
    }
}

// MARK: Shared pieces

/// The brand mark: a rounded square in `signal` with the four rising strokes
/// of the app icon (app/ui/icons.tsx "baseline") in `signal-ink`.
struct BrandMark: View {
    let p: Palette
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3, style: .continuous).fill(p.signal)
            BarsShape()
                .stroke(p.signalInk, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                .frame(width: 10, height: 10)
        }
    }
}

/// "M3 18h18 M6 18v-6 M12 18V8 M18 18V4" in a 24-unit box, scaled to the rect.
struct BarsShape: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 24
        let originX = rect.minX + (rect.width - 24 * scale) / 2
        let originY = rect.minY + (rect.height - 24 * scale) / 2
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: originX + x * scale, y: originY + y * scale) }
        var path = Path()
        path.move(to: point(3, 18)); path.addLine(to: point(21, 18))
        path.move(to: point(6, 18)); path.addLine(to: point(6, 12))
        path.move(to: point(12, 18)); path.addLine(to: point(12, 8))
        path.move(to: point(18, 18)); path.addLine(to: point(18, 4))
        return path
    }
}

/// Header: the mark and the word `baseline` on the left, the date line on the right.
struct Header: View {
    let date: String
    let p: Palette
    var body: some View {
        HStack(alignment: .center, spacing: 5) {
            BrandMark(p: p).frame(width: 14, height: 14)
            Text("baseline").font(Fonts.ui(12, .bold)).tracking(-0.2).foregroundStyle(p.ink).lineLimit(1)
            Spacer(minLength: 8)
            Text(date).font(Fonts.mono(11, .medium)).tracking(0.8).foregroundStyle(p.muted).lineLimit(1)
        }
        .frame(height: 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Baseline, \(date)"))
    }
}

/// The record heading's rule: a hairline in `line-strong` with the 28 × 3
/// reference bar in `signal` over its left end (app/field-record.css,
/// app/baseline.css).
struct Rule: View {
    let p: Palette
    var body: some View {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(p.lineStrong).frame(height: 1)
            Rectangle().fill(p.signal).frame(width: 28, height: 3)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .frame(height: 3)
        .accessibilityHidden(true)
    }
}

/// Fourteen nights, oldest left: a round-capped polyline in `accent`, broken
/// across a missing night, an isolated night as a dot, the goal as a dashed
/// hairline (.strength-spark, app/baseline.css).
struct SleepSparkline: View {
    let slots: [Double?]
    let goal: Double
    let p: Palette

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .topLeading) {
                goalPath(in: geometry.size)
                    .stroke(p.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                linePath(in: geometry.size)
                    .stroke(p.accent, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                dotsPath(in: geometry.size)
                    .fill(p.accent)
            }
        }
        .accessibilityHidden(true)
    }

    private var low: Double { min(4, slots.compactMap { $0 }.min() ?? 4) }
    private var high: Double { max(goal + 0.5, slots.compactMap { $0 }.max() ?? goal + 0.5) }
    private let inset: CGFloat = 1.5

    private func x(_ index: Int, _ size: CGSize) -> CGFloat {
        inset + CGFloat(index) * (size.width - 2 * inset) / CGFloat(max(slots.count - 1, 1))
    }

    private func y(_ value: Double, _ size: CGSize) -> CGFloat {
        let span = max(high - low, 0.5)
        return inset + (size.height - 2 * inset) * CGFloat(1 - (value - low) / span)
    }

    private func goalPath(in size: CGSize) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: inset, y: y(goal, size)))
        path.addLine(to: CGPoint(x: size.width - inset, y: y(goal, size)))
        return path
    }

    private func linePath(in size: CGSize) -> Path {
        var path = Path()
        var previous = false
        for (index, slot) in slots.enumerated() {
            guard let value = slot else { previous = false; continue }
            let point = CGPoint(x: x(index, size), y: y(value, size))
            if previous { path.addLine(to: point) } else { path.move(to: point) }
            previous = true
        }
        return path
    }

    private func dotsPath(in size: CGSize) -> Path {
        var path = Path()
        for (index, slot) in slots.enumerated() {
            guard let value = slot else { continue }
            let before = index > 0 ? slots[index - 1] : nil
            let after = index + 1 < slots.count ? slots[index + 1] : nil
            guard before == nil && after == nil else { continue }
            let point = CGPoint(x: x(index, size), y: y(value, size))
            path.addEllipse(in: CGRect(x: point.x - 1.25, y: point.y - 1.25, width: 2.5, height: 2.5))
        }
        return path
    }
}

/// The app's DayStrip (app/ui/spark.tsx): 14 cells, oldest left, 2 pt gaps.
struct DayStrip: View {
    let cells: [CellState]
    let p: Palette

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                cellView(cell).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private func cellView(_ cell: CellState) -> some View {
        switch cell {
        case .on: RoundedRectangle(cornerRadius: 2, style: .continuous).fill(p.stripOn)
        case .half: RoundedRectangle(cornerRadius: 2, style: .continuous).fill(p.stripHalf)
        case .miss: RoundedRectangle(cornerRadius: 2, style: .continuous).fill(p.warn)
        case .open: RoundedRectangle(cornerRadius: 2, style: .continuous).strokeBorder(p.line, lineWidth: 1)
        case .notDue: RoundedRectangle(cornerRadius: 2, style: .continuous).strokeBorder(p.line, lineWidth: 1).opacity(0.4)
        }
    }
}

/// A whole-widget state below the rule: the title, and on medium and large
/// the line, in the app's own words.
struct StateBody: View {
    let state: DayFacts.State
    let showLine: Bool
    let p: Palette

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(state.title).font(Fonts.ui(13, .semibold)).foregroundStyle(p.ink).lineLimit(1)
            if showLine {
                Text(state.line).font(Fonts.ui(11, .medium)).foregroundStyle(p.muted).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

/// One ledger line: label left, value right (warn when the value is a miss).
struct LedgerLine: View {
    let row: LedgerRow
    let height: CGFloat
    let p: Palette

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(row.label).font(Fonts.ui(12, .medium)).foregroundStyle(p.ink).lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 8)
            Text(row.value).font(Fonts.ui(12, .semibold)).monospacedDigit()
                .foregroundStyle(row.isMiss ? p.warn : p.ink).lineLimit(1)
                .privacySensitive()
        }
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(row.accessibilityLabel))
    }
}

/// The hero figure: the serif at 30 pt in a 32 pt line, with an optional unit
/// in Hanken 11 pt SemiBold on the same baseline.
struct HeroFigure: View {
    let figure: String
    let unit: String?
    let p: Palette

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 3) {
            Text(figure).font(Fonts.serif(30)).foregroundStyle(p.ink).lineLimit(1).minimumScaleFactor(0.85)
            if let unit {
                Text(unit).font(Fonts.ui(11, .semibold)).foregroundStyle(p.muted).lineLimit(1)
            }
        }
        .frame(height: 32, alignment: .leading)
    }
}

// MARK: systemSmall (158 × 158)

struct RecordSmallView: View {
    var entry: BaselineEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(dark: scheme == .dark)
        let facts = DayFacts(feed: entry.feed, now: entry.date)
        return VStack(alignment: .leading, spacing: 0) {
            Header(date: DayMath.dateLine(entry.date, long: false), p: p)
            Rule(p: p).padding(.top, 6).padding(.bottom, 8)
            if let state = facts.state {
                StateBody(state: state, showLine: false, p: p)
            } else {
                hero(facts, p)
                ledger(facts, p).padding(.top, 8)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(p.paper, for: .widget)
    }

    private func hero(_ facts: DayFacts, _ p: Palette) -> some View {
        let hero = facts.hero
        return VStack(alignment: .leading, spacing: 0) {
            HeroFigure(figure: facts.heroFigure(hero), unit: facts.heroUnit(hero), p: p)
            Text(facts.heroCaption(hero, family: .systemSmall))
                .font(Fonts.ui(11, .medium)).foregroundStyle(p.muted).lineLimit(1).padding(.top, 2)
        }
        .privacySensitive()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(facts.heroSpoken(hero)))
    }

    /// The first two rows; when stale the second gives way to the note.
    private func ledger(_ facts: DayFacts, _ p: Palette) -> some View {
        let rows = Array(facts.rows.prefix(facts.isStale ? 1 : 2))
        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 { Rectangle().fill(p.line).frame(height: 1) }
                LedgerLine(row: row, height: 20, p: p)
            }
            if facts.isStale {
                if !rows.isEmpty { Rectangle().fill(p.line).frame(height: 1) }
                Text(facts.staleNote(.short))
                    .font(Fonts.ui(11, .medium)).foregroundStyle(p.warn).lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(height: 20)
            }
        }
    }
}

// MARK: systemMedium (338 × 158)

struct RecordMediumView: View {
    var entry: BaselineEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(dark: scheme == .dark)
        let facts = DayFacts(feed: entry.feed, now: entry.date)
        return VStack(alignment: .leading, spacing: 0) {
            Header(date: DayMath.dateLine(entry.date, long: true), p: p)
            Rule(p: p).padding(.top, 6).padding(.bottom, 8)
            if let state = facts.state {
                StateBody(state: state, showLine: true, p: p)
            } else {
                HStack(alignment: .top, spacing: 12) {
                    hero(facts, p).frame(width: 150, alignment: .topLeading)
                    Rectangle().fill(p.line).frame(width: 1)
                    ledger(facts, p).frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(p.paper, for: .widget)
    }

    private func hero(_ facts: DayFacts, _ p: Palette) -> some View {
        let hero = facts.hero
        return VStack(alignment: .leading, spacing: 0) {
            HeroFigure(figure: facts.heroFigure(hero), unit: facts.heroUnit(hero), p: p)
            Text(facts.heroCaption(hero, family: .systemMedium))
                .font(Fonts.ui(11, .medium)).foregroundStyle(p.muted).lineLimit(1).truncationMode(.tail).padding(.top, 2)
            SleepSparkline(slots: facts.nightSlots, goal: facts.sleepGoal, p: p)
                .frame(width: 150, height: 22).padding(.top, 6)
            Text(facts.isStale ? facts.staleNote(.medium) : facts.whatsLeft(short: false))
                .font(Fonts.ui(11, .medium))
                .foregroundStyle(facts.isStale ? p.warn : p.muted)
                .lineLimit(1).truncationMode(.tail).padding(.top, 6)
        }
        .privacySensitive()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(facts.heroSpoken(hero) + ". " + (facts.isStale ? facts.staleNote(.medium) : facts.whatsLeft(short: false))))
    }

    private func ledger(_ facts: DayFacts, _ p: Palette) -> some View {
        let rows = Array(facts.rows.prefix(4))
        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 { Rectangle().fill(p.line).frame(height: 1) }
                LedgerLine(row: row, height: 20, p: p)
            }
        }
    }
}

// MARK: systemLarge (338 × 354; iPad's extra-large uses the same layout)

struct RecordLargeView: View {
    var entry: BaselineEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(dark: scheme == .dark)
        let facts = DayFacts(feed: entry.feed, now: entry.date)
        return VStack(alignment: .leading, spacing: 0) {
            Header(date: DayMath.dateLine(entry.date, long: true), p: p)
            Rule(p: p).padding(.top, 6).padding(.bottom, 8)
            if let state = facts.state {
                StateBody(state: state, showLine: true, p: p)
            } else {
                heroes(facts, p).frame(height: 48)
                SleepSparkline(slots: facts.nightSlots, goal: facts.sleepGoal, p: p)
                    .frame(maxWidth: .infinity).frame(height: 24).padding(.top, 8)
                    .privacySensitive()
                ledger(facts, p).padding(.top, 10)
                footer(facts, p).padding(.top, 8)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .containerBackground(p.paper, for: .widget)
    }

    private func heroes(_ facts: DayFacts, _ p: Palette) -> some View {
        let left = facts.largeLeftHero
        return HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                HeroFigure(figure: facts.heroFigure(left), unit: facts.heroUnit(left), p: p)
                Text(facts.heroCaption(left, family: .systemLarge))
                    .font(Fonts.ui(11, .medium)).foregroundStyle(p.muted).lineLimit(1).truncationMode(.tail).padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .privacySensitive()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(facts.heroSpoken(left)))
            VStack(alignment: .leading, spacing: 0) {
                HeroFigure(figure: facts.latestWeight?.w.map(Copy.pounds) ?? "—",
                           unit: facts.latestWeight?.w == nil ? nil : "lb", p: p)
                Text(facts.weightCaption)
                    .font(Fonts.ui(11, .medium)).foregroundStyle(p.muted).lineLimit(1).truncationMode(.tail).padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .privacySensitive()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(facts.weightSpoken))
        }
    }

    /// Six rows at most: label (80), the 14-day strip, the value (88).
    private func ledger(_ facts: DayFacts, _ p: Palette) -> some View {
        let rows = Array(facts.rows.prefix(6))
        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if index > 0 { Rectangle().fill(p.line).frame(height: 1) }
                HStack(alignment: .center, spacing: 10) {
                    Text(row.label).font(Fonts.ui(12, .medium)).foregroundStyle(p.ink).lineLimit(1).truncationMode(.tail)
                        .frame(width: 80, alignment: .leading)
                    DayStrip(cells: row.cells, p: p)
                        .frame(maxWidth: .infinity).frame(height: 12)
                        .privacySensitive()
                    Text(row.value).font(Fonts.ui(12, .semibold)).monospacedDigit()
                        .foregroundStyle(row.isMiss ? p.warn : p.ink).lineLimit(1)
                        .frame(width: 88, alignment: .trailing)
                        .privacySensitive()
                }
                .frame(height: 28)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(row.accessibilityLabel))
            }
        }
    }

    private func footer(_ facts: DayFacts, _ p: Palette) -> some View {
        let text: String
        if facts.isStale {
            text = facts.staleNote(.large)
        } else if let last = facts.lastEntry {
            text = "\(facts.whatsLeft(short: false)) · \(last)"
        } else {
            text = facts.whatsLeft(short: false)
        }
        return Text(text)
            .font(Fonts.ui(11, .medium))
            .foregroundStyle(facts.isStale ? p.warn : p.muted)
            .lineLimit(1).truncationMode(.tail)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 14)
            .privacySensitive(!facts.isStale)
    }
}

// MARK: Lock Screen (vibrant monochrome, system fonts)

struct CircularView: View {
    var entry: BaselineEntry

    var body: some View {
        let facts = DayFacts(feed: entry.feed, now: entry.date)
        let content = facts.state == nil ? facts.circular : nil
        return ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                BarsShape()
                    .stroke(Color.primary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
                    .frame(width: 11, height: 11)
                    .widgetAccentable()
                if let content {
                    Text(content.figure).font(.system(size: 13, weight: .bold)).monospacedDigit()
                        .foregroundStyle(Color.primary).lineLimit(1).minimumScaleFactor(0.85)
                        .privacySensitive()
                    if let caption = content.caption {
                        Text(caption).font(.system(size: 11, weight: .medium)).foregroundStyle(Color.primary).lineLimit(1)
                    }
                }
            }
            .padding(4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(content.map { "Baseline, \($0.figure) \($0.caption ?? "asleep")" } ?? "Baseline"))
    }
}

struct RectangularView: View {
    var entry: BaselineEntry

    var body: some View {
        let facts = DayFacts(feed: entry.feed, now: entry.date)
        return ZStack {
            AccessoryWidgetBackground()
            VStack(alignment: .leading, spacing: 1) {
                Text("BASELINE").font(Fonts.mono(11, .semibold)).tracking(0.8).foregroundStyle(Color.primary).lineLimit(1)
                    .widgetAccentable()
                Text(facts.rectangularHeadline).font(.system(size: 15, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(Color.primary).lineLimit(1).truncationMode(.tail)
                    .privacySensitive(facts.state == nil)
                if let detail = facts.rectangularDetail {
                    Text(detail).font(.system(size: 12, weight: .medium)).monospacedDigit()
                        .foregroundStyle(Color.primary).lineLimit(1).truncationMode(.tail)
                        .privacySensitive(!facts.isStale)
                }
            }
            .padding(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(["Baseline", facts.rectangularHeadline, facts.rectangularDetail].compactMap { $0 }.joined(separator: ", ")))
    }
}

struct InlineView: View {
    var entry: BaselineEntry

    var body: some View {
        let facts = DayFacts(feed: entry.feed, now: entry.date)
        return Text(facts.inline).lineLimit(1).privacySensitive(facts.state == nil && !facts.isStale)
    }
}

// MARK: - Widget declaration

struct BaselineWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BaselineRecord", provider: BaselineProvider()) { entry in
            BaselineWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Record")
        .description("Last night, today's doses and what is left to log. Tap to open Baseline.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
        .contentMarginsDisabled()
    }
}

#if !WIDGET_PREVIEW
@main
#endif
struct BaselineWidgetBundle: WidgetBundle {
    var body: some Widget {
        BaselineWidget()
    }
}

// MARK: - Preview catalog (Tests/WidgetPreview renders these to PNG on CI)

#if WIDGET_PREVIEW
enum WidgetPreviewCatalog {
    static let app = "baseline"
    static let families: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline]
    /// The widget turns the system margins off and lays itself out to the edges.
    static func contentMargins(for family: WidgetFamily) -> EdgeInsets { EdgeInsets() }
    static func background(dark: Bool) -> Color { Palette(dark: dark).paper }

    /// A fixed clock, so renders are the same on every run: 20 September 2026.
    static func at(_ hour: Int, _ minute: Int = 0, day: Int = 20) -> Date {
        var parts = DateComponents()
        parts.year = 2026; parts.month = 9; parts.day = day; parts.hour = hour; parts.minute = minute
        return Calendar.current.date(from: parts) ?? Date()
    }

    static let today = "2026-09-20"
    static func day(_ back: Int) -> String { DayMath.addDays(today, -back) }

    static let morning = BaselineFeed.sample(today: today)

    static var eveningComplete: BaselineFeed {
        var feed = morning
        feed.meds = feed.meds?.map { med in
            var med = med; med.doses?[today] = true; return med
        }
        feed.days = feed.days?.map { day in
            guard day.d == today else { return day }
            var day = day; day.wa = 2500; day.p = 180; day.med = 15; return day
        }
        return feed
    }

    static var missedDose: BaselineFeed {
        var feed = morning
        feed.meds = feed.meds?.enumerated().map { index, med in
            var med = med; med.doses?[today] = index != 0; return med
        }
        return feed
    }

    /// The Apple lane case: sleep and weight arrive only through Health Auto
    /// Export, which is never in the browser-side copy.
    static var appleOnly: BaselineFeed {
        var feed = morning
        feed.nights = []
        feed.latestNight = nil
        feed.weights = []
        feed.days = feed.days?.map { day in var day = day; day.w = nil; return day }
        return feed
    }

    static var noTargets: BaselineFeed {
        var feed = morning
        feed.goals = BaselineFeed.Goals(sleepHours: 9, waterTargetMl: 0, proteinTargetG: nil, trackMedication: false)
        feed.meds = []
        feed.days = feed.days?.map { day in
            guard day.d == today else { return day }
            var day = day; day.wa = 1500; day.p = 120; return day
        }
        return feed
    }

    /// The clipping check: long values everywhere.
    static var longValues: BaselineFeed {
        var feed = morning
        feed.meds = (0..<12).map { _ in BaselineFeed.Med(schedule: "daily", dueDay: nil, doses: [:]) }
        feed.days = feed.days?.map { day in
            guard day.d == today else { return day }
            var day = day; day.wa = 19750; day.p = 1000; return day
        }
        let longAgo = day(999)
        feed.training = BaselineFeed.Training(lastWorkout: longAgo, thisWeek: 0, weekStart: DayMath.mondayOfWeek(today),
                                              streakWeeks: 0, importedAt: longAgo, days: [])
        feed.latest = longAgo
        return feed
    }

    static func status(_ status: String) -> BaselineFeed {
        BaselineFeed(v: 1, app: "baseline", builtAt: nil, builtOn: today, status: status)
    }

    static func scene(_ feed: BaselineFeed?, _ date: Date) -> (WidgetFamily) -> AnyView {
        { AnyView(BaselineWidgetView(entry: BaselineEntry(date: date, feed: feed), family: $0)) }
    }

    static let scenes: [(name: String, view: (WidgetFamily) -> AnyView)] = [
        ("morning", scene(morning, at(8, 30))),
        ("evening-complete", scene(eveningComplete, at(21, 10))),
        ("missed-dose", scene(missedDose, at(13, 0))),
        ("apple-only", scene(appleOnly, at(9, 0))),
        ("no-targets", scene(noTargets, at(9, 0))),
        ("stale-3-days", scene(morning, at(7, 15, day: 23))),
        ("stale-yesterday", scene(morning, at(8, 0, day: 21))),
        ("empty", scene(status("empty"), at(11, 0))),
        ("signed-out", scene(status("signed-out"), at(11, 0))),
        ("denied", scene(status("denied"), at(11, 0))),
        ("no-feed", scene(nil, at(11, 0))),
        ("long-values", scene(longValues, at(10, 0))),
    ]
}
#endif
