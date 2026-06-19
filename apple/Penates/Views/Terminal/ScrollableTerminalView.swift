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
// The `UIEditMenuInteractionDelegate` conformance is isolated to the main actor:
// every method touches main-actor UIKit state, and UIKit only ever invokes the
// edit-menu delegate on the main thread. (UIGestureRecognizerDelegate is already
// `@MainActor` in the SDK, so only the edit-menu conformance needs the annotation.)
final class ScrollableTerminalView: TerminalView, UIGestureRecognizerDelegate, @MainActor UIEditMenuInteractionDelegate {
    /// Sends raw bytes to the PTY stdin (wired to the WebSocket `input` frame).
    var sendInput: ((String) -> Void)?

    /// Points of finger travel per emitted wheel notch.
    private let scrollStep: Double = 22

    private var accumulator = WheelScrollAccumulator(step: 22)
    private var lastTranslationY: CGFloat = 0

    /// Modern edit menu (replaces SwiftTerm's deprecated UIMenuController path,
    /// which is inert on iOS 26).
    private var editMenuInteraction: UIEditMenuInteraction?
    /// Anchor for the edit menu — the most recent touch location.
    private var lastTouchPoint: CGPoint = .zero
    /// Guards against re-presenting the menu on every selectionChanged tick
    /// during a drag-extend; we present once per selection.
    private var menuShownForSelection = false

    /// The cell where a long-press-drag selection started. While set,
    /// `selectionDragActive` is true and the drag extends the selection from
    /// this anchor rather than scrolling.
    private var selectionAnchor: GridCell?
    /// True between a selection long-press `.began` and its release. Suppresses
    /// the scroll pan and the per-tick menu presentation so the drag cleanly
    /// extends the highlight; the menu is presented once on release.
    private var selectionDragActive = false

    /// References to the two competing recognizers so the delegate can keep
    /// exactly this pair mutually exclusive (scroll xor select) while leaving
    /// every other pairing simultaneous.
    private weak var scrollPan: UIPanGestureRecognizer?
    private weak var selectionPress: UILongPressGestureRecognizer?

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
        scrollPan = pan

        // Unlock SwiftTerm's local selection: with tmux `mouse on`, reporting
        // would otherwise forward double-tap/drag to tmux instead of selecting.
        // Scrolling survives because our pan emits wheel events directly.
        allowMouseReporting = false

        let menu = UIEditMenuInteraction(delegate: self)
        addInteraction(menu)
        editMenuInteraction = menu

        // Press-and-drag to select a range — the standard iOS text-selection
        // gesture (Safari/Notes), and the only discoverable way to pick a
        // multi-line range here. SwiftTerm's own selection needs a double-tap
        // *then* a second drag started exactly on the (handle-less) selection
        // edge, which races our scroll pan and lands as a scroll. A quick drag
        // still scrolls — the press threshold disambiguates select vs scroll.
        let press = UILongPressGestureRecognizer(target: self, action: #selector(handleSelectionLongPress(_:)))
        press.minimumPressDuration = 0.3
        press.delegate = self
        addGestureRecognizer(press)
        selectionPress = press
    }

    /// Suppresses SwiftTerm's button-drag mouse gesture. With native text
    /// selection enabled (`allowMouseReporting = false`), tap-to-click
    /// forwarding to TUIs is intentionally disabled — an accepted v1
    /// trade-off. Scrolling is preserved because the scroll pan emits wheel
    /// events directly; only the drag-mouse path is removed here.
    override func mouseModeChanged(source: Terminal) {}

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        if let p = touches.first?.location(in: self) { lastTouchPoint = p }
        super.touchesBegan(touches, with: event)
    }

    /// Hardware-keyboard paste (iPad / Magic Keyboard). `paste(_:)` is the open
    /// SwiftTerm responder method. Deduped so we never double-register if a
    /// future SwiftTerm version already maps Cmd+V.
    override var keyCommands: [UIKeyCommand]? {
        var cmds = super.keyCommands ?? []
        if !cmds.contains(where: { $0.input == "v" && $0.modifierFlags == .command }) {
            cmds.append(UIKeyCommand(input: "v", modifierFlags: .command, action: #selector(paste(_:))))
        }
        return cmds
    }

    /// Present our modern edit menu when a selection appears, dismiss it when it
    /// clears. Presented once per selection (the guard) so drag-extend — which
    /// fires many selectionChanged ticks — doesn't make the menu flicker.
    override func selectionChanged(source: Terminal) {
        super.selectionChanged(source: source)
        // During a long-press-drag we mutate the selection on every tick; the
        // menu would flicker and cover the text, so we present it once on
        // release instead (see handleSelectionLongPress).
        if selectionDragActive { return }
        if hasActiveSelection {
            if !menuShownForSelection {
                menuShownForSelection = true
                presentEditMenu(at: lastTouchPoint)
            }
        } else if menuShownForSelection {
            menuShownForSelection = false
            editMenuInteraction?.dismissMenu()
        }
    }

    private func presentEditMenu(at point: CGPoint) {
        let config = UIEditMenuConfiguration(identifier: nil, sourcePoint: point)
        editMenuInteraction?.presentEditMenu(with: config)
    }

    // MARK: UIEditMenuInteractionDelegate

    func editMenuInteraction(_ interaction: UIEditMenuInteraction,
                             willDismissMenuFor configuration: UIEditMenuConfiguration,
                             animator: UIEditMenuInteractionAnimating) {
        // Reset the present-once guard whenever the menu goes away (incl. an
        // external tap-outside dismiss that left the selection intact), so a
        // later drag-extend can re-present it.
        menuShownForSelection = false
    }

    func editMenuInteraction(_ interaction: UIEditMenuInteraction,
                             menuFor configuration: UIEditMenuConfiguration,
                             suggestedActions: [UIMenuElement]) -> UIMenu? {
        // hasStrings avoids triggering the iOS paste-access prompt that reading
        // `.string` would.
        let actions = TerminalEditMenuModel
            .actions(pasteboardHasText: UIPasteboard.general.hasStrings)
            .map { action in
                UIAction(title: TerminalEditMenuModel.title(for: action)) { [weak self] _ in
                    self?.performMenuAction(action)
                }
            }
        return UIMenu(children: actions)
    }

    private func performMenuAction(_ action: TerminalMenuAction) {
        switch action {
        case .copy:
            guard let text = getSelection(), !text.isEmpty else {
                clearSelection()   // → selectionChanged → dismiss + reset guard
                return
            }
            UIPasteboard.general.string = text
            clearSelection()       // → selectionChanged → dismiss + reset guard
        case .selectAll:
            selectAll()
            // Re-present on the next runloop so the user can immediately Copy
            // the full buffer (the current menu is mid-dismiss from the tap).
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                // Load-bearing: set BEFORE presenting so the selectionChanged
                // that presenting triggers sees the guard already set and does
                // not re-present (which would flicker). Do not remove.
                self.menuShownForSelection = true
                self.presentEditMenu(at: self.lastTouchPoint)
            }
        case .paste:
            paste(nil)             // no auto-enter
            clearSelection()       // drop the now-stale highlight, like copy
        }
    }

    /// Press-and-drag selection: anchor at the press cell, extend to the finger
    /// on every move, present the edit menu on release. Drives SwiftTerm's
    /// selection via the public `setSelectionRange` API; `selectionDragActive`
    /// keeps the scroll pan and the per-tick menu out of the way.
    @objc private func handleSelectionLongPress(_ gesture: UILongPressGestureRecognizer) {
        let point = gesture.location(in: self)
        switch gesture.state {
        case .began:
            _ = becomeFirstResponder()
            let anchor = bufferCell(at: point)
            selectionAnchor = anchor
            selectionDragActive = true
            lastTouchPoint = point
            setSelectionRange(start: Position(col: anchor.col, row: anchor.row),
                              end: Position(col: anchor.col, row: anchor.row))
        case .changed:
            guard let anchor = selectionAnchor else { return }
            let (s, e) = TerminalSelection.ordered(anchor, bufferCell(at: point))
            lastTouchPoint = point
            setSelectionRange(start: Position(col: s.col, row: s.row),
                              end: Position(col: e.col, row: e.row))
        case .ended:
            selectionDragActive = false
            selectionAnchor = nil
            lastTouchPoint = point
            // Present the menu once the range is final. If the press never
            // moved off a blank cell, drop the empty highlight.
            if hasActiveSelection, let text = getSelection(), !text.isEmpty {
                menuShownForSelection = true
                presentEditMenu(at: point)
            } else {
                clearSelection()
            }
        case .cancelled, .failed:
            selectionDragActive = false
            selectionAnchor = nil
        default:
            break
        }
    }

    /// Maps a view point to a 0-based buffer cell for selection. Attached to a
    /// tmux pane the emulator runs on the alternate screen (no SwiftTerm-side
    /// scrollback), so the visible grid is the buffer — viewport row == buffer
    /// row. Cell size is derived from bounds like `cellCoordinate`.
    private func bufferCell(at point: CGPoint) -> GridCell {
        let terminal = getTerminal()
        let cols = max(1, terminal.cols)
        let rows = max(1, terminal.rows)
        let cellWidth = bounds.width / CGFloat(cols)
        let cellHeight = bounds.height / CGFloat(rows)
        let col = cellWidth > 0 ? Int(point.x / cellWidth) : 0
        let row = cellHeight > 0 ? Int(point.y / cellHeight) : 0
        return GridCell(col: min(max(0, col), cols - 1), row: min(max(0, row), rows - 1))
    }

    @objc private func handleScrollPan(_ gesture: UIPanGestureRecognizer) {
        // While a selection is active (or being dragged), a drag should extend
        // it, not scroll.
        guard !selectionDragActive,
              TerminalScrollPolicy.shouldScroll(hasActiveSelection: hasActiveSelection) else { return }
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
    // never blocks keyboard focus or selection — EXCEPT the scroll pan and our
    // selection long-press, which must stay mutually exclusive (scroll xor
    // select). Letting that pair recognize together lets a dwell mid-drag flip
    // an in-flight scroll into a selection — the "hangs in the middle" bug.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        if let pan = scrollPan, let press = selectionPress {
            let pair = Set([ObjectIdentifier(gestureRecognizer), ObjectIdentifier(other)])
            if pair == Set([ObjectIdentifier(pan), ObjectIdentifier(press)]) {
                return false
            }
        }
        return true
    }
}
