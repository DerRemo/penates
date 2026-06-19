import Foundation

/// Pure, UIKit-free description of the terminal edit-menu composition and the
/// scroll-vs-selection policy. Keeping the decision logic here lets it be unit
/// tested without a running TerminalView; the view holds only thin glue.

enum TerminalMenuAction: Equatable {
    case copy
    case selectAll
    case paste
}

enum TerminalEditMenuModel {
    /// The edit menu only ever appears while a selection is active (presented
    /// from `selectionChanged`), so Copy + Select All are always offered;
    /// Paste only when the pasteboard holds text. Returned order is display order.
    static func actions(pasteboardHasText: Bool) -> [TerminalMenuAction] {
        pasteboardHasText ? [.copy, .selectAll, .paste] : [.copy, .selectAll]
    }

    /// Localized edit-menu labels (English source; German via Localizable.xcstrings).
    static func title(for action: TerminalMenuAction) -> String {
        switch action {
        case .copy:      return String(localized: "Copy")
        case .selectAll: return String(localized: "Select All")
        case .paste:     return String(localized: "Paste")
        }
    }
}

enum TerminalScrollPolicy {
    /// The scroll pan stands down while a selection is active, so a drag extends
    /// the selection instead of scrolling.
    static func shouldScroll(hasActiveSelection: Bool) -> Bool {
        !hasActiveSelection
    }
}

/// A 0-based terminal buffer cell, mirroring SwiftTerm's `Position` but free of
/// any SwiftTerm import so the ordering logic stays unit-testable.
struct GridCell: Equatable {
    let col: Int
    let row: Int
}

enum TerminalSelection {
    /// Orders the press anchor and the current finger cell into reading order
    /// (`start ≤ end`) so a long-press-drag selecting in any direction — left,
    /// right, up, or down across lines — yields a normalized range. Row
    /// dominates; column breaks ties on the same row.
    static func ordered(_ a: GridCell, _ b: GridCell) -> (start: GridCell, end: GridCell) {
        if a.row < b.row || (a.row == b.row && a.col <= b.col) {
            return (a, b)
        }
        return (b, a)
    }
}
