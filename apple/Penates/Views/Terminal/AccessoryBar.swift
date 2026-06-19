import UIKit
import SwiftTerm

// MARK: - Key sequences

/// Byte sequences for common terminal keys sent via `TerminalView.send(txt:)`.
/// Arrow sequences use normal-cursor mode (ESC [ A/B/C/D); app-cursor mode
/// (ESC O A/B/C/D) is not used here because `sendKeyUp/Down/Left/Right` on
/// TerminalView are internal — normal-cursor mode works for all shells and
/// editors the app is likely to use (claude, zsh, vim in insert mode, etc.).
enum AccessoryKey {
    static let esc   = "\u{1b}"
    static let tab   = "\t"
    static let enter = "\r"
    static let up    = "\u{1b}[A"
    static let down  = "\u{1b}[B"
    static let right = "\u{1b}[C"
    static let left  = "\u{1b}[D"
}

// MARK: - PenatesAccessoryBar

/// A fully custom `UIInputView` accessory bar that provides the key set:
/// **Esc · Ctrl (sticky) · Tab · ↑ ↓ ← → · Dismiss**
///
/// Because `TerminalAccessory` is `public` but not `open`, we cannot subclass
/// it outside the SwiftTerm module. Instead we build our own `UIInputView` and
/// wire sticky-Ctrl to `TerminalView.controlModifier` (a `public` property on
/// `TerminalView`). The input pipeline already falls back to `controlModifier`
/// when `terminalAccessory` is nil:
///   `terminalAccessory?.controlModifier ?? controlModifier ?? false`
/// so sticky-Ctrl is fully preserved without needing the `TerminalAccessory`.
final class PenatesAccessoryBar: UIInputView, UIInputViewAudioFeedback {

    // MARK: State

    weak var terminalView: TerminalView?

    /// Whether the Ctrl key is sticky-latched (next keystroke is ctrl-modified).
    private var ctrlActive = false {
        didSet {
            terminalView?.controlModifier = ctrlActive
            refreshCtrlButton()
        }
    }

    // MARK: Internal references

    private weak var ctrlButton: UIButton?

    // MARK: UIInputViewAudioFeedback

    var enableInputClicksWhenVisible: Bool { true }

    // MARK: Init

    init(frame: CGRect, terminalView: TerminalView) {
        self.terminalView = terminalView
        super.init(frame: frame, inputViewStyle: .keyboard)
        allowsSelfSizing = true
        buildUI()
        // Deactivate the Ctrl button visually once TerminalView has applied
        // the control modifier to a keystroke and reset its own `controlModifier`.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onControlModifierReset),
            name: .terminalViewControlModifierReset,
            object: terminalView
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func onControlModifierReset() {
        ctrlActive = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    // MARK: Build UI

    private func buildUI() {
        // Opaque background tuned to the system keyboard colour so the bar reads
        // as one continuous piece with the keyboard below it — on iPad in
        // particular. The `.keyboard` input-view style is translucent and bleeds
        // the (now adaptive) terminal colour behind the bar, which mismatched the
        // opaque iPad keyboard; a solid keyboard-tone fill removes that seam.
        let bg = UIView()
        bg.backgroundColor = Self.keyboardBackground
        bg.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        bg.frame = bounds
        insertSubview(bg, at: 0)

        // --- Button row ---
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.alignment = .fill
        stack.distribution = .fillEqually
        stack.spacing = 6
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
        ])

        // Esc
        stack.addArrangedSubview(makeKey("esc", action: #selector(tapEsc), accessibilityLabel: "Escape"))
        // Ctrl (sticky)
        let ctrl = makeKey("ctrl", action: #selector(tapCtrl), accessibilityLabel: "Steuerung")
        ctrl.layer.borderWidth = 1
        ctrl.layer.borderColor = UIColor.systemBlue.withAlphaComponent(0.4).cgColor
        ctrlButton = ctrl
        stack.addArrangedSubview(ctrl)
        // Tab — icon only; the "tab" label does not fit the equal-width button
        stack.addArrangedSubview(makeKey("", icon: "arrow.right.to.line.compact", action: #selector(tapTab), accessibilityLabel: "Tab"))
        // Arrows
        stack.addArrangedSubview(makeKey("", icon: "arrow.up", action: #selector(tapUp), accessibilityLabel: "Nach oben"))
        stack.addArrangedSubview(makeKey("", icon: "arrow.down", action: #selector(tapDown), accessibilityLabel: "Nach unten"))
        stack.addArrangedSubview(makeKey("", icon: "arrow.left", action: #selector(tapLeft), accessibilityLabel: "Nach links"))
        stack.addArrangedSubview(makeKey("", icon: "arrow.right", action: #selector(tapRight), accessibilityLabel: "Nach rechts"))
        // Paste — inserts clipboard text into the input line (no auto-enter)
        stack.addArrangedSubview(makeKey("", icon: "doc.on.clipboard", action: #selector(tapPaste), accessibilityLabel: "Einfügen"))
        // Dismiss keyboard
        stack.addArrangedSubview(makeKey("", icon: "keyboard.chevron.compact.down", action: #selector(tapDismiss), accessibilityLabel: "Tastatur ausblenden"))
    }

    // MARK: Button factory

    /// The native iOS keyboard tray tone (no public API exposes it) — measured
    /// pixel-for-pixel against the live system keyboard so the bar blends in.
    static let keyboardBackground = UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0.094, green: 0.094, blue: 0.098, alpha: 1)   // #181819 native dark tray
            : UIColor(red: 0.882, green: 0.886, blue: 0.902, alpha: 1)   // #E1E2E6 native light tray
    }

    /// Native keyboard-key fill, measured against the system keys: white in
    /// light mode, a dark charcoal in dark mode (matches the letter keys).
    static let keyColor = UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0.239, green: 0.239, blue: 0.243, alpha: 1)   // #3D3D3E native dark key
            : .white
    }

    private func makeKey(_ title: String, icon: String = "", action: Selector,
                         accessibilityLabel: String? = nil) -> UIButton {
        var cfg = UIButton.Configuration.filled()
        cfg.baseForegroundColor = .label
        cfg.background.backgroundColor = Self.keyColor
        cfg.cornerStyle = .fixed
        cfg.background.cornerRadius = 5
        cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attrs in
            var a = attrs
            a.font = UIFont.systemFont(ofSize: 12, weight: .medium)
            return a
        }
        if !title.isEmpty {
            cfg.title = title
        }
        if !icon.isEmpty {
            cfg.image = UIImage(
                systemName: icon,
                withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .regular)
            )
        }
        let b = UIButton(configuration: cfg)
        b.addTarget(self, action: action, for: .touchDown)
        // Icon-only keys carry no title, so give VoiceOver an explicit label.
        if let accessibilityLabel { b.accessibilityLabel = accessibilityLabel }
        // Subtle bottom drop-shadow, exactly like a real keyboard key. The
        // rounded fill comes from the configuration background, so the layer
        // stays unmasked (masksToBounds = false) to let the shadow show.
        b.layer.cornerRadius = 5
        b.layer.masksToBounds = false
        b.layer.shadowColor = UIColor.black.cgColor
        b.layer.shadowOpacity = 0.35
        b.layer.shadowOffset = CGSize(width: 0, height: 1)
        b.layer.shadowRadius = 0
        return b
    }

    // MARK: Actions

    /// Shared helper for all bar keys that send a character/escape sequence.
    /// Clears the sticky-Ctrl latch (fires its didSet → updates controlModifier
    /// and button highlight) then delivers the sequence to the terminal.
    private func sendKey(_ sequence: String) {
        UIDevice.current.playInputClick()
        if ctrlActive { ctrlActive = false }   // a bar key consumes and clears the Ctrl latch
        terminalView?.send(txt: sequence)
    }

    @objc private func tapEsc() {
        sendKey(AccessoryKey.esc)
    }

    @objc private func tapCtrl() {
        UIDevice.current.playInputClick()
        ctrlActive.toggle()
    }

    @objc private func tapTab() {
        sendKey(AccessoryKey.tab)
    }

    // TODO: auto-repeat-on-hold deferred — v1 fires on tap only (TerminalAccessory had a repeat timer).
    @objc private func tapUp() {
        sendKey(AccessoryKey.up)
    }

    @objc private func tapDown() {
        sendKey(AccessoryKey.down)
    }

    @objc private func tapLeft() {
        sendKey(AccessoryKey.left)
    }

    @objc private func tapRight() {
        sendKey(AccessoryKey.right)
    }

    @objc private func tapDismiss() {
        UIDevice.current.playInputClick()
        _ = terminalView?.resignFirstResponder()
    }

    @objc private func tapPaste() {
        UIDevice.current.playInputClick()
        terminalView?.paste(nil)   // SwiftTerm handles bracketed-paste; no auto-enter
    }

    // MARK: Ctrl button visual feedback

    /// Update Ctrl button highlight to reflect current selection state.
    private func refreshCtrlButton() {
        guard let b = ctrlButton else { return }
        var cfg = b.configuration ?? .filled()
        cfg.background.backgroundColor = ctrlActive
            ? UIColor.systemBlue.withAlphaComponent(0.25)
            : Self.keyColor
        b.configuration = cfg
    }
}
