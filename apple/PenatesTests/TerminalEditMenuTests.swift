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

@Test func menuTitlesAreLocalized() {
    #expect(TerminalEditMenuModel.title(for: .copy) == "Copy")
    #expect(TerminalEditMenuModel.title(for: .selectAll) == "Select All")
    #expect(TerminalEditMenuModel.title(for: .paste) == "Paste")
}
