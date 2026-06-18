import Testing
@testable import Penates

// The scroll pan stands down while a selection is active so a drag extends the
// selection instead of scrolling.

@Test func scrollAllowedWithoutSelection() {
    #expect(TerminalScrollPolicy.shouldScroll(hasActiveSelection: false) == true)
}

@Test func scrollSuppressedDuringSelection() {
    #expect(TerminalScrollPolicy.shouldScroll(hasActiveSelection: true) == false)
}
