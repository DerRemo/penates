import UIKit
import SwiftTerm

/// `TerminalView` subclass that lets a finger drag scroll the tmux scrollback.
///
/// The hub keeps tmux in `mouse on` mode, so SwiftTerm enters mouse-reporting
/// mode and forwards pans as button-drag mouse events — which tmux reads as a
/// *selection*, not a scroll. SwiftTerm's own scroll view is no help either:
/// while attached, tmux uses the terminal's alternate screen, so the emulator
/// buffer holds nothing to scroll. The real scrollback lives in tmux.
///
/// So we drive tmux directly, exactly like the xterm.js web client does on a
/// mouse wheel: translate vertical drags into SGR wheel events sent on stdin.
/// We override `mouseModeChanged` to never install SwiftTerm's competing
/// button-drag gesture (taps still forward clicks via separate recognizers, so
/// TUI mouse interaction is preserved) and disable scroll-view bounce so the
/// alt-screen has no rubber-band.
final class ScrollableTerminalView: TerminalView, UIGestureRecognizerDelegate {
    /// Sends raw bytes to the PTY stdin (wired to the WebSocket `input` frame).
    var sendInput: ((String) -> Void)?

    /// Points of finger travel per emitted wheel notch.
    private let scrollStep: Double = 22

    private var accumulator = WheelScrollAccumulator(step: 22)
    private var lastTranslationY: CGFloat = 0

    /// Installs the wheel-forwarding pan. The native scroll view stays enabled
    /// (so a real finger drag still produces touches our pan observes) but its
    /// bounce is disabled — on tmux's alternate screen there is nothing to
    /// scroll locally, so a rubber-band would just be visual noise.
    func installScrollGesture() {
        bounces = false
        alwaysBounceVertical = false
        alwaysBounceHorizontal = false
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handleScrollPan(_:)))
        pan.delegate = self
        addGestureRecognizer(pan)
    }

    /// Suppress SwiftTerm's button-drag mouse gesture. Taps keep forwarding
    /// clicks through the separate tap recognizers, so this only removes the
    /// drag path that would otherwise fight our scroll gesture.
    override func mouseModeChanged(source: Terminal) {}

    @objc private func handleScrollPan(_ gesture: UIPanGestureRecognizer) {
        switch gesture.state {
        case .began:
            accumulator = WheelScrollAccumulator(step: scrollStep)
            lastTranslationY = 0
        case .changed:
            let translationY = gesture.translation(in: self).y
            let delta = translationY - lastTranslationY
            lastTranslationY = translationY
            let notches = accumulator.feed(Double(delta))
            guard notches != 0 else { return }
            let cell = cellCoordinate(of: gesture.location(in: self))
            let sequence = TmuxMouse.wheel(up: notches > 0, col: cell.col, row: cell.row)
            for _ in 0..<abs(notches) { sendInput?(sequence) }
        default:
            break
        }
    }

    /// Maps a point in the view to a 1-based terminal cell, so tmux scrolls the
    /// pane under the finger (matters only with split panes).
    private func cellCoordinate(of point: CGPoint) -> (col: Int, row: Int) {
        let terminal = getTerminal()
        let cols = max(1, terminal.cols)
        let rows = max(1, terminal.rows)
        let cellWidth = bounds.width / CGFloat(cols)
        let cellHeight = bounds.height / CGFloat(rows)
        let col = cellWidth > 0 ? Int(point.x / cellWidth) + 1 : 1
        let row = cellHeight > 0 ? Int(point.y / cellHeight) + 1 : 1
        return (min(max(1, col), cols), min(max(1, row), rows))
    }

    // Recognize alongside SwiftTerm's tap / long-press gestures so scrolling
    // never blocks keyboard focus or selection.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}
