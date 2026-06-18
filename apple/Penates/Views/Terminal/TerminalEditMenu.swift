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

    /// Hard-coded German labels — the app has no i18n infrastructure; all UI
    /// strings are German literals (cf. SettingsView, SessionEndedView).
    static func title(for action: TerminalMenuAction) -> String {
        switch action {
        case .copy:      return "Kopieren"
        case .selectAll: return "Alles auswählen"
        case .paste:     return "Einfügen"
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
