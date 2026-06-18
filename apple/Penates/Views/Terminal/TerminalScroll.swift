import Foundation

/// SGR mouse-event encoding for driving tmux scrollback from the terminal.
///
/// The hub keeps tmux in `mouse on` mode, so the attached terminal is in
/// mouse-reporting mode. Sending SGR-encoded *wheel* events on the terminal's
/// stdin makes tmux scroll its own copy-mode history — the same mechanism the
/// xterm.js web client uses. SwiftTerm's iOS pan gesture instead forwards
/// button drags (which tmux reads as a selection), so the iPhone needs to emit
/// these wheel sequences itself.
enum TmuxMouse {
    /// SGR mouse wheel sequence. `up` → button 64 (scroll back), else 65
    /// (scroll forward). Coordinates are 1-based; values below 1 clamp to 1.
    static func wheel(up: Bool, col: Int, row: Int) -> String {
        let button = up ? 64 : 65
        return "\u{1b}[<\(button);\(max(1, col));\(max(1, row))M"
    }
}

/// Converts a stream of pan-translation deltas into discrete wheel notches,
/// carrying the sub-step residual so slow drags still scroll eventually.
///
/// Sign convention follows direct touch manipulation: a positive delta (finger
/// moving down, UIKit `translation.y > 0`) reveals older content → wheel *up* →
/// a positive notch count.
struct WheelScrollAccumulator {
    let step: Double
    private var residual: Double = 0

    init(step: Double) { self.step = step }

    /// Feed the change in pan translation (points) since the last call.
    /// Returns the signed wheel-notch count: positive = up, negative = down.
    mutating func feed(_ deltaY: Double) -> Int {
        residual += deltaY
        let notches = (residual / step).rounded(.towardZero)
        residual -= notches * step
        return Int(notches)
    }
}
