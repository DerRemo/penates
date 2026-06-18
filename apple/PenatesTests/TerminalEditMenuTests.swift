import Testing
@testable import Penates

// The edit menu only appears while a selection is active, so Copy + Select All
// are always offered; Paste only when the pasteboard holds text.

@Test func menuOmitsPasteWhenPasteboardEmpty() {
    #expect(TerminalEditMenuModel.actions(pasteboardHasText: false) == [.copy, .selectAll])
}

@Test func menuIncludesPasteWhenPasteboardHasText() {
    #expect(TerminalEditMenuModel.actions(pasteboardHasText: true) == [.copy, .selectAll, .paste])
}

@Test func menuTitlesAreGerman() {
    #expect(TerminalEditMenuModel.title(for: .copy) == "Kopieren")
    #expect(TerminalEditMenuModel.title(for: .selectAll) == "Alles auswählen")
    #expect(TerminalEditMenuModel.title(for: .paste) == "Einfügen")
}
