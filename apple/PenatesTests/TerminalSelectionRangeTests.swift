import Testing
@testable import Penates

// A long-press-drag selection anchors at the press point and extends to the
// finger. The drag can go any direction, so the raw (anchor, finger) pair must
// be normalized into reading order (start ≤ end): row dominates, column breaks
// ties. These exercise each drag direction.

@Test func orderedKeepsForwardSameRow() {
    let (s, e) = TerminalSelection.ordered(GridCell(col: 2, row: 5), GridCell(col: 9, row: 5))
    #expect(s == GridCell(col: 2, row: 5))
    #expect(e == GridCell(col: 9, row: 5))
}

@Test func orderedFlipsBackwardSameRow() {
    // Drag left: finger ends before the anchor on the same row.
    let (s, e) = TerminalSelection.ordered(GridCell(col: 9, row: 5), GridCell(col: 2, row: 5))
    #expect(s == GridCell(col: 2, row: 5))
    #expect(e == GridCell(col: 9, row: 5))
}

@Test func orderedKeepsDownwardDrag() {
    // Drag down across lines: a higher row is later even if its column is smaller.
    let (s, e) = TerminalSelection.ordered(GridCell(col: 40, row: 3), GridCell(col: 1, row: 7))
    #expect(s == GridCell(col: 40, row: 3))
    #expect(e == GridCell(col: 1, row: 7))
}

@Test func orderedFlipsUpwardDrag() {
    // Drag up across lines: anchor is on a later row than the finger.
    let (s, e) = TerminalSelection.ordered(GridCell(col: 1, row: 7), GridCell(col: 40, row: 3))
    #expect(s == GridCell(col: 40, row: 3))
    #expect(e == GridCell(col: 1, row: 7))
}

@Test func orderedHandlesSameCell() {
    let (s, e) = TerminalSelection.ordered(GridCell(col: 4, row: 4), GridCell(col: 4, row: 4))
    #expect(s == GridCell(col: 4, row: 4))
    #expect(e == GridCell(col: 4, row: 4))
}
