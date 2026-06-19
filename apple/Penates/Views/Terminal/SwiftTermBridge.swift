import SwiftUI
import SwiftTerm
import UIKit

/// Single source of truth for the adaptive terminal colors so the SwiftTerm
/// view and the SwiftUI background behind it stay byte-identical. SwiftTerm
/// resolves the UIColor to its own color at set-time (it does not track a
/// dynamic UIColor), so the bridge re-applies these on every scheme change.
enum TerminalPalette {
    static func background(_ dark: Bool) -> UIColor { dark ? UIColor(white: 0.05, alpha: 1) : UIColor(white: 0.98, alpha: 1) }
    static func foreground(_ dark: Bool) -> UIColor { dark ? UIColor(white: 0.92, alpha: 1) : UIColor(white: 0.12, alpha: 1) }
}

/// UIViewRepresentable wrapping SwiftTerm's TerminalView.
/// Seeds scrollback data before live bytes arrive, then wires
/// socket.onBytes → terminalView.feed and terminal input → socket.send(.input).
struct SwiftTermBridge: UIViewRepresentable {
    let socket: TerminalSocket
    let seed: [UInt8]
    var fontSize: Double = 13.0
    /// Drives the adaptive terminal colors; passed in from TerminalScreen's
    /// environment so a live light/dark switch re-colors the terminal.
    var colorScheme: ColorScheme = .dark
    /// When true, the terminal grabs first responder on creation so the
    /// keyboard appears immediately on opening a session.
    var autoFocus: Bool = true

    func makeCoordinator() -> Coordinator { Coordinator(socket: socket) }

    func makeUIView(context: Context) -> TerminalView {
        let tv = ScrollableTerminalView(frame: .zero)
        tv.terminalDelegate = context.coordinator
        tv.font = UIFont.monospacedSystemFont(ofSize: CGFloat(fontSize), weight: .regular)

        // Adaptive theme: dark bg + bright text in dark mode, light bg + dark
        // text in light mode. This also makes default (uncolored) CLI text
        // bright in dark mode, so the previously too-dark font reads cleanly.
        let dark = colorScheme == .dark
        tv.nativeBackgroundColor = TerminalPalette.background(dark)
        tv.nativeForegroundColor = TerminalPalette.foreground(dark)

        // Touch-drag → tmux wheel events. Without this, tmux's server-global
        // `mouse on` makes SwiftTerm forward pans as button drags (read as a
        // selection), and the alt-screen leaves nothing to scroll locally.
        tv.sendInput = { [weak socket] data in socket?.send(.input(data)) }
        tv.installScrollGesture()

        // Replace the built-in TerminalAccessory with our custom accessory bar.
        // `TerminalAccessory` is public-but-not-open so we cannot subclass it.
        // Instead we build a `PenatesAccessoryBar: UIInputView` and wire
        // sticky-Ctrl through `tv.controlModifier` (a public property). The
        // TerminalView input pipeline already falls back to `controlModifier`
        // when `terminalAccessory` (the TerminalAccessory cast) is nil:
        //   `terminalAccessory?.controlModifier ?? controlModifier ?? false`
        // so sticky-Ctrl is fully preserved.
        let isPhone = UIDevice.current.userInterfaceIdiom == .phone
        let accessoryHeight: CGFloat = isPhone ? 44 : 52
        let accessory = PenatesAccessoryBar(
            frame: CGRect(x: 0, y: 0, width: 0, height: accessoryHeight),
            terminalView: tv
        )
        tv.inputAccessoryView = accessory

        // Feed scrollback seed before opening the live connection
        if !seed.isEmpty {
            tv.feed(byteArray: seed[...])
        }
        // Route incoming PTY bytes to the terminal. TerminalSocket is @MainActor,
        // so onBytes already fires on the main actor — feed directly, no hop.
        socket.onBytes = { [weak tv] bytes in tv?.feed(byteArray: bytes[...]) }
        // Connect after onBytes is wired so no early PTY output is dropped
        socket.connect()

        // Show the keyboard immediately on open (deferred so the view is in the
        // hierarchy first). If false, the user taps into the terminal to focus.
        if autoFocus {
            Task { @MainActor in _ = tv.becomeFirstResponder() }
        }
        return tv
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {
        let newFont = UIFont.monospacedSystemFont(ofSize: CGFloat(fontSize), weight: .regular)
        if uiView.font != newFont {
            uiView.font = newFont
        }

        // Re-apply colors on a live light/dark switch. SwiftTerm resolves the
        // UIColor at set-time, so we must re-set (a dynamic UIColor would not
        // re-resolve on its own). Only set when the value actually differs.
        let dark = colorScheme == .dark
        let bg = TerminalPalette.background(dark)
        let fg = TerminalPalette.foreground(dark)
        if uiView.nativeBackgroundColor != bg { uiView.nativeBackgroundColor = bg }
        if uiView.nativeForegroundColor != fg { uiView.nativeForegroundColor = fg }
    }

    // MARK: - Delegate

    final class Coordinator: NSObject, TerminalViewDelegate {
        let socket: TerminalSocket

        init(socket: TerminalSocket) { self.socket = socket }

        /// User typed something → forward to the hub via WebSocket.
        /// SwiftTerm invokes its delegate on the main thread and `socket.send`
        /// is @MainActor, so assert the isolation rather than hop (no latency).
        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            let text = String(decoding: data, as: UTF8.self)
            // Bind `socket` (a `@MainActor` class, hence Sendable) to a local so the
            // assumeIsolated closure captures it directly instead of the non-Sendable
            // Coordinator `self`.
            let socket = self.socket
            MainActor.assumeIsolated { socket.send(.input(text)) }
        }

        /// Terminal was resized → tell the hub so the PTY can reflow.
        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            let socket = self.socket
            MainActor.assumeIsolated { socket.send(.resize(cols: newCols, rows: newRows)) }
        }

        // Required stubs — no-op for our remote-terminal use-case
        func setTerminalTitle(source: TerminalView, title: String) {}
        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
        func scrolled(source: TerminalView, position: Double) {}
        func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {}
        func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}

        // bell / clipboardCopy / clipboardRead / iTermContent have default implementations
        // in the TerminalViewDelegate extension — no stubs needed.
    }
}
