import WidgetKit
import SwiftUI

// The training card: the record card's page (the mark, the date line, the
// rule with the green reference mark, one serif figure, a ledger with
// hairlines) turned to the week's training question. Sessions logged this
// week against the plan, the last session and what it held, the run of
// trained weeks, eight weeks of bars and the fourteen-day strip of training
// days. It prints only what the record on this device holds — the Strong
// sets the page imported — with exercise and workout names as Strong spells
// them and never a note. It reads the same widget-feed.json as the record
// card; everything here comes from the feed's `training` block.

// MARK: - The facts of the week (every rule of the states lives here)

struct TrainingFacts {
    enum State {
        case noFeed, empty, signedOut, denied

        var title: String {
            switch self {
            case .noFeed: return "Baseline"
            case .empty: return "No Strong export yet"           // record-stamp.tsx
            case .signedOut: return DayFacts.State.signedOut.title
            case .denied: return DayFacts.State.denied.title
            }
        }

        var line: String {
            switch self {
            case .noFeed: return "Open Baseline once and your training appears here."
            case .empty: return "Import from Strong and your sessions appear here."
            case .signedOut: return DayFacts.State.signedOut.line
            case .denied: return DayFacts.State.denied.line
            }
        }
    }

    /// One session of the large card's ledger: the day, what it was (the
    /// workout's name and its counts, in the wordings that fit), the volume.
    struct SessionRow {
        let date: String
        let details: [String]
        let values: [String]
        let spoken: String
    }

    /// One staple of the large card's ledger: the exercise and its best set.
    struct LiftRow {
        let name: String
        let values: [String]
        let spoken: String
    }

    /// The record card's reading of the same feed: today, stale, the states.
    let record: DayFacts
    let training: BaselineFeed.Training?
    let state: State?

    init(feed: BaselineFeed?, now: Date) {
        record = DayFacts(feed: feed, now: now)
        let training = record.feed.training
        self.training = training
        switch record.state {
        case .noFeed?: state = .noFeed
        case .empty?: state = .empty
        case .signedOut?: state = .signedOut
        case .denied?: state = .denied
        case nil: state = DayMath.isKey(training?.lastWorkout) ? nil : .empty
        }
    }

    var todayKey: String { record.todayKey }
    var isStale: Bool { record.isStale }
    var monday: String { DayMath.mondayOfWeek(todayKey) }

    // MARK: This week

    /// The feed counted this calendar week, so its count is a fact as of the
    /// last open (the stale note says when that was). Once the week has
    /// rolled with no open since, the count is unknown rather than zero.
    var weekKnown: Bool { training?.weekStart == monday }
    var thisWeek: Int? { weekKnown ? max(0, training?.thisWeek ?? 0) : nil }

    /// The plan's sessions for the week (Today's "2 of 4"), when the record
    /// holds enough to plan from; else nothing, and the usual cadence stands
    /// in for it in the caption.
    var planned: Int? { (training?.planned).flatMap { $0 > 0 ? $0 : nil } }
    var usual: Double? { (training?.usual).flatMap { $0 > 0 ? $0 : nil } }

    var heroFigure: String {
        guard let count = thisWeek else { return "—" }
        if let planned { return "\(count) of \(planned)" }
        return "\(count)"
    }

    /// "Logged this week · usually 3.5× a week" (trainingHabit's phrase), or
    /// what fits: the cadence matters most where there is no plan to read
    /// the figure against.
    var heroCaptions: [String] {
        let lead = "Logged this week"
        guard let usual else { return [lead] }
        let rate = Copy.trimmed(usual)
        let long = "\(lead) · usually \(rate)× a week"
        return planned != nil ? [long, lead] : [long, "This week · usually \(rate)×", lead]
    }

    var heroSpoken: String {
        var text = "Training, "
        if let count = thisWeek {
            text += planned.map { "\(count) of \($0) sessions" } ?? Copy.count(count, "session", "sessions")
            text += " logged this week"
        } else {
            text += "this week not updated"
        }
        if let usual { text += ", usually \(Copy.trimmed(usual)) a week" }
        return text
    }

    // MARK: The weeks

    var weeks: [BaselineFeed.Week] { (training?.weeks ?? []).filter { DayMath.isKey($0.s) } }
    var weekCounts: [Int] { weeks.map { max(0, $0.n ?? 0) } }

    /// workoutWeekStreak as the feed carried it while the week is the feed's;
    /// after the week rolls, counted back from last week over the eight
    /// weeks the feed holds (at most eight, honest rather than generous).
    var streak: Int {
        if weekKnown { return max(0, training?.streakWeeks ?? 0) }
        let trained = Set(weeks.filter { ($0.n ?? 0) > 0 }.compactMap { $0.s })
        var cursor = DayMath.addDays(monday, -7)
        var count = 0
        while trained.contains(cursor) { count += 1; cursor = DayMath.addDays(cursor, -7) }
        return count
    }

    /// The Monday the run began: this week when it already has a session,
    /// else last week, then back one week per week of the run.
    var streakSince: String? {
        guard weekKnown, streak > 0 else { return nil }
        let end = (thisWeek ?? 0) > 0 ? monday : DayMath.addDays(monday, -7)
        return DayMath.shortDate(DayMath.addDays(end, -7 * (streak - 1)))
    }

    var streakFigure: String { "\(streak)" }
    var streakUnit: String { streak == 1 ? "week" : "weeks" }
    var streakCaptions: [String] { streakSince.map { ["In a row · since \($0)", "In a row"] } ?? ["In a row"] }
    var streakSpoken: String { "\(Copy.count(streak, "week", "weeks")) in a row" + (streakSince.map { ", since \($0)" } ?? "") }

    // MARK: The last session

    var lastSession: BaselineFeed.Session? { training?.sessions?.first { DayMath.isKey($0.d) } }
    var lastDate: String? {
        if let date = lastSession?.d { return date }
        return DayMath.isKey(training?.lastWorkout) ? training?.lastWorkout : nil
    }
    var sinceLast: Int? { lastDate.flatMap { DayMath.daysBetween($0, todayKey) } }
    /// "yesterday", "2 days ago", "never" (sinceLabel, the app's phrase).
    var since: String { Copy.sinceLabel(sinceLast) }

    var workoutDays: Set<String> { Set((training?.days ?? []) + (training?.sessions ?? []).compactMap { $0.d }) }
    /// The 14-day strip: a day with a session is `on`; every other day is
    /// open, today included (a day off is not a miss).
    var strip: [CellState] { record.windowKeys.map { workoutDays.contains($0) ? .on : .open } }

    // MARK: The ledger (small: the first row; medium: all four)

    var rows: [LedgerRow] { [lastRow, exercisesRow, volumeRow, topRow] }

    var lastRow: LedgerRow {
        LedgerRow(label: "Last", values: [Copy.capitalized(since)], isMiss: false, cells: strip, accessibilityLabel: "Last workout, \(since)")
    }

    var exercisesRow: LedgerRow {
        guard let session = lastSession, let lifts = session.lifts else {
            return LedgerRow(label: "Exercises", values: ["—"], isMiss: false, cells: [], accessibilityLabel: "Exercises, not recorded")
        }
        let sets = Copy.count(session.sets ?? 0, "set", "sets")
        return LedgerRow(label: "Exercises", values: ["\(lifts) · \(sets)", "\(lifts)"], isMiss: false, cells: [],
                         accessibilityLabel: "Exercises, \(lifts), \(sets)")
    }

    /// The session's volume as the Workouts list prints it (`12,450 lb`); a
    /// bodyweight session has none, so its duration takes the row instead.
    var volumeRow: LedgerRow {
        if let volume = lastSession?.vol, volume > 0 {
            return LedgerRow(label: "Volume", values: ["\(Copy.grouped(volume)) lb"], isMiss: false, cells: [],
                             accessibilityLabel: "Volume, \(Copy.grouped(volume)) pounds")
        }
        if let minutes = lastSession?.min, minutes > 0 {
            return LedgerRow(label: "Duration", values: ["\(minutes) min"], isMiss: false, cells: [],
                             accessibilityLabel: "Duration, \(Copy.count(minutes, "minute", "minutes"))")
        }
        return LedgerRow(label: "Volume", values: ["—"], isMiss: false, cells: [], accessibilityLabel: "Volume, not recorded")
    }

    var topRow: LedgerRow {
        guard let top = lastSession?.top, let label = Copy.setLabel(w: top.w, reps: top.reps) else {
            return LedgerRow(label: "Top set", values: ["—"], isMiss: false, cells: [], accessibilityLabel: "Top set, not recorded")
        }
        let name = (top.lift ?? "").isEmpty ? "" : "\(top.lift ?? ""), "
        return LedgerRow(label: "Top set", values: [label], isMiss: false, cells: [],
                         accessibilityLabel: "Top set, \(name)\(Copy.spokenSet(w: top.w, reps: top.reps) ?? "")")
    }

    /// The medium card's line under the bars: the run of weeks (Today's
    /// "3 weeks in a row") with the last workout where it fits; the stale
    /// note when stale.
    var noteLines: [String] {
        if isStale { return record.staleNotes(.medium) }
        if streak > 0 {
            let run = "\(Copy.count(streak, "week", "weeks")) in a row"
            return ["\(run) · last workout \(since)", run]
        }
        return ["Last workout \(since)"]
    }

    // MARK: The large card's ledger

    var sessionRows: [SessionRow] {
        (training?.sessions ?? []).filter { DayMath.isKey($0.d) }.prefix(3).map { session -> SessionRow in
            let date = DayMath.shortDate(session.d ?? "")
            let sets = Copy.count(session.sets ?? 0, "set", "sets")
            let lifts = Copy.count(session.lifts ?? 0, "exercise", "exercises")
            var details: [String] = []
            if let label = session.label, !label.isEmpty {
                details += ["\(label) · \(lifts) · \(sets)", "\(label) · \(sets)"]
            }
            details += ["\(lifts) · \(sets)", sets]
            let values: [String]
            var spokenValue = ""
            if let volume = session.vol, volume > 0 {
                values = ["\(Copy.grouped(volume)) lb"]
                spokenValue = "\(Copy.grouped(volume)) pounds"
            } else if let minutes = session.min, minutes > 0 {
                values = ["\(minutes) min"]
                spokenValue = Copy.count(minutes, "minute", "minutes")
            } else {
                values = ["—"]
            }
            let spoken = [date, session.label ?? "", lifts, sets, spokenValue].filter { !$0.isEmpty }.joined(separator: ", ")
            return SessionRow(date: date, details: details, values: values, spoken: spoken)
        }
    }

    /// The staples with their best-ever set, as the Strength view prints a
    /// record: `185 lb × 5 · Sep 18`, and `record` when that set is one of
    /// the last 30 days' (the app's own word for it).
    var liftRows: [LiftRow] {
        (training?.lifts ?? []).compactMap { lift -> LiftRow? in
            guard let name = lift.lift, !name.isEmpty, let set = Copy.setLabel(w: lift.w, reps: lift.reps) else { return nil }
            let date = DayMath.isKey(lift.d) ? DayMath.shortDate(lift.d ?? "") : nil
            var values: [String] = []
            if lift.pr == true {
                if let date { values.append("\(set) · record · \(date)") }
                values.append("\(set) · record")
            } else if let date {
                values.append("\(set) · \(date)")
            }
            values.append(set)
            let spoken = "\(name), best \(Copy.spokenSet(w: lift.w, reps: lift.reps) ?? "")"
                + (date.map { " on \($0)" } ?? "") + (lift.pr == true ? ", a record" : "")
            return LiftRow(name: name, values: values, spoken: spoken)
        }
    }

    /// The large card's footer: the record stamp's own two facts ("Last
    /// workout 2 days ago", "Imported yesterday" / "Last import not
    /// recorded"), or the stale note in its three lengths.
    var footerLines: [String] {
        if isStale { return record.staleNotes(.large) }
        let last = "Last workout \(since)"
        if let imported = training?.importedAt, DayMath.isKey(imported) {
            let ago = Copy.sinceLabel(DayMath.daysBetween(imported, todayKey))
            return ["\(last) · imported \(ago)", last]
        }
        return ["\(last) · last import not recorded", last]
    }

    // MARK: Lock Screen

    /// Circular: this week's count, `2/4` with `this week`; the mark alone
    /// in a state or when the week is unknown.
    var circular: (figure: String, caption: String)? {
        guard state == nil, let count = thisWeek else { return nil }
        return (planned.map { "\(count)/\($0)" } ?? "\(count)", "this week")
    }

    var rectangularHeadline: String {
        if let state { return state.title }
        guard let count = thisWeek else { return "Last workout \(since)" }
        if let planned { return "\(count) of \(planned) this week" }
        return "\(count) logged this week"
    }

    /// Line 3 in every length: the last workout with its volume, then
    /// without, then the day alone; the stale note when stale; nothing in a
    /// state or when the headline already names the last workout.
    var rectangularDetails: [String] {
        if state != nil { return [] }
        if isStale { return [record.staleNote(.lock)] }
        guard thisWeek != nil else { return [] }
        let last = "Last workout \(since)"
        if let volume = lastSession?.vol, volume > 0 {
            return ["\(last) · \(Copy.grouped(volume)) lb", last, Copy.capitalized(since)]
        }
        return [last, Copy.capitalized(since)]
    }

    /// "Training · 2 of 4 this week · last workout yesterday"; the facts
    /// drop from the right as the system truncates.
    var inline: String {
        if let state { return state == .noFeed ? "Training" : "Training · \(state.title)" }
        if isStale { return "Training · opened \(Copy.sinceLabel(record.staleDays))" }
        return "Training · \(rectangularHeadline) · last workout \(since)"
    }
}

// MARK: - Views

struct BaselineTrainingEntryView: View {
    var entry: BaselineEntry
    @Environment(\.widgetFamily) private var family

    var body: some View { BaselineTrainingWidgetView(entry: entry, family: family) }
}

struct BaselineTrainingWidgetView: View {
    var entry: BaselineEntry
    var family: WidgetFamily

    var body: some View {
        switch family {
        case .accessoryCircular: TrainingCircularView(entry: entry)
        case .accessoryRectangular: TrainingRectangularView(entry: entry)
        case .accessoryInline: TrainingInlineView(entry: entry)
        case .systemSmall: TrainingSmallView(entry: entry)
        case .systemMedium: TrainingMediumView(entry: entry)
        default: TrainingLargeView(entry: entry)
        }
    }
}

/// Eight weeks of sessions, oldest left, as the app's weekly bar chart: a
/// bar per week in `strip-on`, this week's in `accent`, a week with nothing
/// a hairline stub (so it reads as zero, not as missing), and the plan's
/// sessions as the same dashed hairline the sleep goal uses.
struct WeekBars: View {
    let counts: [Int]
    let target: Int?
    let height: CGFloat
    let p: Palette

    private var top: Int { max(counts.max() ?? 0, target ?? 0, 1) }
    private var unit: CGFloat { (height - 1) / CGFloat(top) }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(Array(counts.enumerated()), id: \.offset) { index, count in
                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .fill(count > 0 ? (index == counts.count - 1 ? p.accent : p.stripOn) : p.line)
                        .frame(maxWidth: .infinity)
                        .frame(height: count > 0 ? max(2, CGFloat(count) * unit) : 1)
                }
            }
            if let target, target > 0 {
                GeometryReader { geometry in
                    targetPath(in: geometry.size)
                        .stroke(p.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }

    private func targetPath(in size: CGSize) -> Path {
        var path = Path()
        guard let target else { return path }
        let y = size.height - 0.5 - CGFloat(target) * unit
        path.move(to: CGPoint(x: 0, y: y))
        path.addLine(to: CGPoint(x: size.width, y: y))
        return path
    }
}

// MARK: systemSmall (158 × 158)

struct TrainingSmallView: View {
    var entry: BaselineEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(dark: scheme == .dark)
        let facts = TrainingFacts(feed: entry.feed, now: entry.date)
        return VStack(alignment: .leading, spacing: 0) {
            Header(date: DayMath.dateLine(entry.date, long: false), p: p, word: "training")
            Rule(p: p).padding(.top, 6).padding(.bottom, 8)
            if let state = facts.state {
                StateBody(title: state.title, line: nil, p: p)
            } else {
                // Figure and caption (48), the 14-day strip (12), one row (20).
                VStack(alignment: .leading, spacing: 0) {
                    HeroFigure(figure: facts.heroFigure, unit: nil, p: p)
                    FittingText(candidates: facts.heroCaptions, font: Fonts.ui(11, .medium), color: p.muted)
                        .padding(.top, 2)
                }
                .privacySensitive()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(facts.heroSpoken))
                DayStrip(cells: facts.strip, p: p)
                    .frame(height: 12).padding(.top, 8)
                    .privacySensitive()
                if facts.isStale {
                    Text(facts.record.staleNote(.short))
                        .font(Fonts.ui(11, .medium)).foregroundStyle(p.warn).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(height: 20).padding(.top, 8)
                } else {
                    LedgerLine(row: facts.lastRow, height: 20, p: p).padding(.top, 8)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(p.paper, for: .widget)
    }
}

// MARK: systemMedium (338 × 158)

struct TrainingMediumView: View {
    var entry: BaselineEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(dark: scheme == .dark)
        let facts = TrainingFacts(feed: entry.feed, now: entry.date)
        return VStack(alignment: .leading, spacing: 0) {
            Header(date: DayMath.dateLine(entry.date, long: true), p: p, word: "training")
            Rule(p: p).padding(.top, 6).padding(.bottom, 8)
            if let state = facts.state {
                StateBody(title: state.title, line: state.line, p: p)
            } else {
                // As the record card: a 96 pt hero column (figure, caption,
                // the eight-week bars, the run of weeks at its foot) beside
                // four 23 pt rows, both ending on one line.
                HStack(alignment: .top, spacing: 12) {
                    hero(facts, p).frame(width: 150, height: 96, alignment: .topLeading)
                    Rectangle().fill(p.line).frame(width: 1)
                    ledger(facts, p).frame(maxWidth: .infinity, alignment: .topLeading)
                }
                .frame(height: 96)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(p.paper, for: .widget)
    }

    private func hero(_ facts: TrainingFacts, _ p: Palette) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HeroFigure(figure: facts.heroFigure, unit: nil, p: p)
            FittingText(candidates: facts.heroCaptions, font: Fonts.ui(11, .medium), color: p.muted)
                .padding(.top, 2)
            if !facts.weekCounts.isEmpty {
                WeekBars(counts: facts.weekCounts, target: facts.planned, height: 22, p: p)
                    .frame(width: 150).padding(.top, 6)
            }
            Spacer(minLength: 6)
            FittingText(candidates: facts.noteLines, font: Fonts.ui(11, .medium), color: facts.isStale ? p.warn : p.muted)
        }
        .privacySensitive()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(facts.heroSpoken + ". " + (facts.noteLines.first ?? "")))
    }

    private func ledger(_ facts: TrainingFacts, _ p: Palette) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(facts.rows.enumerated()), id: \.offset) { index, row in
                if index > 0 { Rectangle().fill(p.line).frame(height: 1) }
                LedgerLine(row: row, height: 23, p: p)
            }
        }
    }
}

// MARK: systemLarge (338 × 354; iPad's extra-large uses the same layout)

struct TrainingLargeView: View {
    var entry: BaselineEntry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(dark: scheme == .dark)
        let facts = TrainingFacts(feed: entry.feed, now: entry.date)
        return VStack(alignment: .leading, spacing: 0) {
            Header(date: DayMath.dateLine(entry.date, long: true), p: p, word: "training")
            Rule(p: p).padding(.top, 6).padding(.bottom, 8)
            if let state = facts.state {
                StateBody(title: state.title, line: state.line, p: p)
            } else {
                heroes(facts, p).frame(height: 48)
                if !facts.weekCounts.isEmpty {
                    WeekBars(counts: facts.weekCounts, target: facts.planned, height: 26, p: p)
                        .frame(maxWidth: .infinity).padding(.top, 8)
                        .privacySensitive()
                }
                // The ledger takes the height between the bars and the
                // footer (rows grow from 26 to 34 pt to fill it), and the
                // footer sits on the page's last line.
                ledger(facts, p).padding(.top, 8).layoutPriority(1)
                Spacer(minLength: 8)
                FittingText(candidates: facts.footerLines, font: Fonts.ui(11, .medium), color: facts.isStale ? p.warn : p.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(height: 14)
                    .privacySensitive(!facts.isStale)
            }
        }
        .padding(16)
        .containerBackground(p.paper, for: .widget)
    }

    /// This week against the plan on the left; the run of weeks on the right,
    /// the figure with its unit on one baseline as the weight hero is.
    private func heroes(_ facts: TrainingFacts, _ p: Palette) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 0) {
                HeroFigure(figure: facts.heroFigure, unit: nil, p: p)
                FittingText(candidates: facts.heroCaptions, font: Fonts.ui(11, .medium), color: p.muted)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .privacySensitive()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(facts.heroSpoken))
            VStack(alignment: .leading, spacing: 0) {
                HeroFigure(figure: facts.streakFigure, unit: facts.streakUnit, p: p)
                FittingText(candidates: facts.streakCaptions, font: Fonts.ui(11, .medium), color: p.muted)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .privacySensitive()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(facts.streakSpoken))
        }
    }

    /// The last three sessions, a stronger hairline, then the staples with
    /// their best set: six rows at most.
    private func ledger(_ facts: TrainingFacts, _ p: Palette) -> some View {
        let sessions = facts.sessionRows
        let lifts = Array(facts.liftRows.prefix(max(0, 6 - sessions.count)))
        return VStack(spacing: 0) {
            ForEach(Array(sessions.enumerated()), id: \.offset) { index, row in
                if index > 0 { Rectangle().fill(p.line).frame(height: 1) }
                sessionLine(row, p)
            }
            if !sessions.isEmpty && !lifts.isEmpty { Rectangle().fill(p.lineStrong).frame(height: 1) }
            ForEach(Array(lifts.enumerated()), id: \.offset) { index, row in
                if index > 0 { Rectangle().fill(p.line).frame(height: 1) }
                liftLine(row, p)
            }
        }
    }

    /// Day (56) | what it was, muted, in the longest wording that fits | volume.
    private func sessionLine(_ row: TrainingFacts.SessionRow, _ p: Palette) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Text(row.date).font(Fonts.ui(12, .medium)).foregroundStyle(p.ink).lineLimit(1)
                .frame(width: 56, alignment: .leading)
            FittingText(candidates: row.details, font: Fonts.ui(12, .medium), color: p.muted, tabular: true)
                .privacySensitive()
            Spacer(minLength: 8)
            FittingText(candidates: row.values, font: Fonts.ui(12, .semibold), color: p.ink, tabular: true)
                .privacySensitive()
        }
        .frame(minHeight: 26, maxHeight: 34)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(row.spoken))
    }

    /// The exercise, given the width first, so a long Strong name is whole
    /// and the set drops its date instead.
    private func liftLine(_ row: TrainingFacts.LiftRow, _ p: Palette) -> some View {
        HStack(alignment: .center, spacing: 10) {
            Text(row.name).font(Fonts.ui(12, .medium)).foregroundStyle(p.ink).lineLimit(1).truncationMode(.tail)
                .layoutPriority(1)
                .privacySensitive()
            Spacer(minLength: 8)
            FittingText(candidates: row.values, font: Fonts.ui(12, .semibold), color: p.ink, tabular: true)
                .privacySensitive()
        }
        .frame(minHeight: 26, maxHeight: 34)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(row.spoken))
    }
}

// MARK: Lock Screen (vibrant monochrome, system fonts)

struct TrainingCircularView: View {
    var entry: BaselineEntry

    var body: some View {
        let facts = TrainingFacts(feed: entry.feed, now: entry.date)
        let content = facts.circular
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
                    Text(content.caption).font(.system(size: 11, weight: .medium)).foregroundStyle(Color.primary).lineLimit(1)
                }
            }
            .padding(4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(content.map { "Training, \($0.figure) sessions this week" } ?? "Training"))
    }
}

struct TrainingRectangularView: View {
    var entry: BaselineEntry

    var body: some View {
        let facts = TrainingFacts(feed: entry.feed, now: entry.date)
        return ZStack {
            AccessoryWidgetBackground()
            VStack(alignment: .leading, spacing: 1) {
                Text("TRAINING").font(Fonts.mono(11, .semibold)).tracking(0.8).foregroundStyle(Color.primary).lineLimit(1)
                    .widgetAccentable()
                Text(facts.rectangularHeadline).font(.system(size: 15, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(Color.primary).lineLimit(1).truncationMode(.tail)
                    .privacySensitive(facts.state == nil)
                if !facts.rectangularDetails.isEmpty {
                    FittingText(candidates: facts.rectangularDetails, font: .system(size: 12, weight: .medium), color: Color.primary, tabular: true)
                        .privacySensitive(!facts.isStale)
                }
            }
            .padding(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(["Training", facts.rectangularHeadline, facts.rectangularDetails.first].compactMap { $0 }.joined(separator: ", ")))
    }
}

struct TrainingInlineView: View {
    var entry: BaselineEntry

    var body: some View {
        let facts = TrainingFacts(feed: entry.feed, now: entry.date)
        return Text(facts.inline).lineLimit(1).privacySensitive(facts.state == nil && !facts.isStale)
    }
}

// MARK: - Widget declaration

/// The second widget of the bundle. It shares the record card's provider:
/// the same file, the same midnight entries, the same reload on every write.
struct BaselineTrainingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BaselineTraining", provider: BaselineProvider()) { entry in
            BaselineTrainingEntryView(entry: entry)
        }
        .configurationDisplayName("Training")
        .description("This week's sessions against the plan, the last workout and the run of trained weeks. Tap to open Baseline.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
        .contentMarginsDisabled()
    }
}

// MARK: - Preview scenes (appended to WidgetPreviewCatalog.scenes)

#if WIDGET_PREVIEW
enum TrainingPreviewCatalog {
    typealias Scene = (name: String, view: (WidgetFamily) -> AnyView)

    static func scene(_ feed: BaselineFeed?, _ date: Date) -> (WidgetFamily) -> AnyView {
        { AnyView(BaselineTrainingWidgetView(entry: BaselineEntry(date: date, feed: feed), family: $0)) }
    }

    /// The sample record with its training block replaced.
    static func feed(today: String, training: BaselineFeed.Training?) -> BaselineFeed {
        var feed = BaselineFeed.sample(today: today)
        feed.training = training
        return feed
    }

    static let sunday = WidgetPreviewCatalog.today          // 2026-09-20
    static let wednesday = "2026-09-16"
    static let saturday = "2026-09-19"

    /// Wednesday afternoon: two of four, the second this morning, a run of
    /// six weeks, a bench record.
    static var midweek: BaselineFeed {
        feed(today: wednesday, training: BaselineFeed.sampleTraining(today: wednesday, back: [0, 2, 5, 7, 9, 12], olderWeeks: [3, 0, 3, 4, 4, 3]))
    }

    /// Sunday morning with the week's four sessions done; a run of two.
    static var restDay: BaselineFeed {
        feed(today: sunday, training: BaselineFeed.sampleTraining(today: sunday, back: [1, 3, 5, 6, 8, 10, 13], olderWeeks: [2, 0, 3, 4, 4, 0]))
    }

    /// No plan yet (fewer than ten sets logged would give none; here the
    /// record simply has none): the usual cadence stands in, and a long run.
    static var streak: BaselineFeed {
        var training = BaselineFeed.sampleTraining(today: sunday, back: [0, 2, 4, 6, 9, 11, 13], planned: nil, usual: 3, olderWeeks: [3, 3, 4, 3, 3, 4])
        training.streakWeeks = 12
        return feed(today: sunday, training: training)
    }

    /// Calisthenics only: no load anywhere, so reps rank the sets and the
    /// duration stands in for the volume.
    static var bodyweight: BaselineFeed {
        var training = BaselineFeed.sampleTraining(today: saturday, back: [0, 2, 4, 7, 9, 11], planned: nil, usual: 3)
        training.sessions = [
            BaselineFeed.Session(d: saturday, label: "Calisthenics", lifts: 4, sets: 14, vol: 0, min: 48, top: BaselineFeed.TopSet(lift: "Pull Up", w: nil, reps: 14)),
            BaselineFeed.Session(d: DayMath.addDays(saturday, -2), label: "Calisthenics", lifts: 4, sets: 12, vol: 0, min: 44, top: BaselineFeed.TopSet(lift: "Push Up", w: nil, reps: 30)),
            BaselineFeed.Session(d: DayMath.addDays(saturday, -4), label: "Calisthenics", lifts: 3, sets: 10, vol: 0, min: nil, top: BaselineFeed.TopSet(lift: "Dip", w: nil, reps: 20)),
        ]
        training.lifts = [
            BaselineFeed.Lift(lift: "Pull Up", w: nil, reps: 14, max: nil, d: saturday, pr: true),
            BaselineFeed.Lift(lift: "Push Up", w: nil, reps: 30, max: nil, d: DayMath.addDays(saturday, -2), pr: false),
            BaselineFeed.Lift(lift: "Dip", w: nil, reps: 20, max: nil, d: DayMath.addDays(saturday, -4), pr: false),
        ]
        training.weeks = training.weeks?.map { week -> BaselineFeed.Week in var week = week; week.vol = 0; return week }
        return feed(today: saturday, training: training)
    }

    /// The clipping check: Strong's long names and big figures everywhere.
    static var longNames: BaselineFeed {
        var training = BaselineFeed.sampleTraining(today: wednesday, back: [0, 0, 1, 1, 2, 2, 4, 5, 7, 9, 12], usual: 11.5, olderWeeks: [12, 11, 12, 12, 10, 12])
        training.thisWeek = 12
        training.streakWeeks = 104
        let names = ["Incline Dumbbell Bench Press", "Seated Cable Row (Wide Grip)", "Romanian Deadlift (Dumbbell)", "Standing Overhead Press (Barbell)"]
        training.sessions = [
            BaselineFeed.Session(d: wednesday, label: "Upper Body Hypertrophy A", lifts: 14, sets: 48, vol: 112450, min: 145, top: BaselineFeed.TopSet(lift: names[0], w: 112.5, reps: 12)),
            BaselineFeed.Session(d: DayMath.addDays(wednesday, -1), label: "Lower Body Strength Block Two", lifts: 12, sets: 44, vol: 98600, min: 132, top: BaselineFeed.TopSet(lift: names[2], w: 205, reps: 10)),
            BaselineFeed.Session(d: DayMath.addDays(wednesday, -2), label: "Full Body Conditioning", lifts: 16, sets: 52, vol: 124800, min: 158, top: BaselineFeed.TopSet(lift: names[1], w: 180, reps: 12)),
        ]
        training.lifts = [
            BaselineFeed.Lift(lift: names[0], w: 112.5, reps: 12, max: 157.5, d: wednesday, pr: true),
            BaselineFeed.Lift(lift: names[1], w: 180, reps: 12, max: 252, d: DayMath.addDays(wednesday, -2), pr: true),
            BaselineFeed.Lift(lift: names[2], w: 205, reps: 10, max: 273.3, d: DayMath.addDays(wednesday, -1), pr: false),
            BaselineFeed.Lift(lift: names[3], w: 135, reps: 8, max: 171, d: DayMath.addDays(wednesday, -4), pr: false),
        ]
        return feed(today: wednesday, training: training)
    }

    static let scenes: [Scene] = [
        ("training-midweek", scene(midweek, WidgetPreviewCatalog.at(14, 0, day: 16))),
        ("training-rest-day", scene(restDay, WidgetPreviewCatalog.at(9, 0))),
        ("training-streak", scene(streak, WidgetPreviewCatalog.at(18, 30))),
        ("training-bodyweight", scene(bodyweight, WidgetPreviewCatalog.at(10, 0, day: 19))),
        ("training-empty", scene(feed(today: sunday, training: nil), WidgetPreviewCatalog.at(11, 0))),
        // The Wednesday feed three days on: the count still stands, the note says when.
        ("training-stale", scene(midweek, WidgetPreviewCatalog.at(10, 0, day: 19))),
        // The Wednesday feed the Tuesday after: the week has rolled, the count is unknown.
        ("training-stale-week", scene(midweek, WidgetPreviewCatalog.at(7, 30, day: 22))),
        ("training-long-names", scene(longNames, WidgetPreviewCatalog.at(15, 0, day: 16))),
        ("training-signed-out", scene(WidgetPreviewCatalog.status("signed-out"), WidgetPreviewCatalog.at(11, 0))),
        ("training-no-feed", scene(nil, WidgetPreviewCatalog.at(11, 0))),
    ]
}
#endif
