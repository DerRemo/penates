import Testing
@testable import Penates

// MARK: - SGR mouse wheel encoding
//
// tmux runs with `mouse on` (server-global), so the attached terminal is in
// mouse-reporting mode. Scrolling the tmux scrollback from a terminal works by
// sending SGR-encoded mouse *wheel* events (button 64 = up, 65 = down) on the
// terminal's stdin — exactly what xterm.js does in the web client. These are
// the bytes we feed back over the `input` WebSocket frame.

@Test func wheelUpUsesButton64() {
    #expect(TmuxMouse.wheel(up: true, col: 5, row: 10) == "\u{1b}[<64;5;10M")
}

@Test func wheelDownUsesButton65() {
    #expect(TmuxMouse.wheel(up: false, col: 5, row: 10) == "\u{1b}[<65;5;10M")
}

@Test func wheelClampsCoordinatesToOneBasedMinimum() {
    // SGR mouse coordinates are 1-based; 0 / negative must clamp up to 1.
    #expect(TmuxMouse.wheel(up: true, col: 0, row: -3) == "\u{1b}[<64;1;1M")
}

// MARK: - Pan → wheel-notch accumulation
//
// A finger drag delivers many small translation deltas. We accumulate them and
// emit one wheel notch per `step` points moved, carrying the residual so slow
// drags still eventually scroll. Sign convention: a positive deltaY (finger
// moving *down*, UIKit translation.y > 0) reveals older content → wheel *up* →
// positive notch count.

@Test func subStepDeltaEmitsNoNotchButCarriesResidual() {
    var acc = WheelScrollAccumulator(step: 30)
    #expect(acc.feed(20) == 0)   // 20 < 30, nothing yet
    #expect(acc.feed(20) == 1)   // residual 40 → one up-notch, 10 carried
}

@Test func downwardDragScrollsBack() {
    var acc = WheelScrollAccumulator(step: 30)
    #expect(acc.feed(90) == 3)   // 90 / 30 = 3 up-notches
}

@Test func upwardDragScrollsForward() {
    var acc = WheelScrollAccumulator(step: 30)
    #expect(acc.feed(-60) == -2) // negative → wheel down (forward)
}

@Test func residualCarriesAcrossDirectionChange() {
    var acc = WheelScrollAccumulator(step: 30)
    #expect(acc.feed(20) == 0)    // residual 20
    #expect(acc.feed(-50) == -1)  // 20 - 50 = -30 → one down-notch
}
