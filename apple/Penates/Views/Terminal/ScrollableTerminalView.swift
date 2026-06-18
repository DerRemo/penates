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
final class ScrollableTerminalView: TerminalView, UIGestureRecognizerDelegate, UIEditMenuInteractionDelegate {
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

        // Unlock SwiftTerm's local selection: with tmux `mouse on`, reporting
        // would otherwise forward double-tap/drag to tmux instead of selecting.
        // Scrolling survives because our pan emits wheel events directly.
        allowMouseReporting = false

        let menu = UIEditMenuInteraction(delegate: self)
        addInteraction(menu)
        editMenuInteraction = menu
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

    @objc private func handleScrollPan(_ gesture: UIPanGestureRecognizer) {
        // While a selection is active, a drag should extend it (SwiftTerm's
        // selection pan), not scroll.
        guard TerminalScrollPolicy.shouldScroll(hasActiveSelection: hasActiveSelection) else { return }
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
