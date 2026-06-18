import SwiftUI
import SwiftTerm

/// UIViewRepresentable wrapping SwiftTerm's TerminalView.
/// Seeds scrollback data before live bytes arrive, then wires
/// socket.onBytes → terminalView.feed and terminal input → socket.send(.input).
struct SwiftTermBridge: UIViewRepresentable {
    let socket: TerminalSocket
    let seed: [UInt8]
    var fontSize: Double = 13.0

    func makeCoordinator() -> Coordinator { Coordinator(socket: socket) }

    func makeUIView(context: Context) -> TerminalView {
        let tv = ScrollableTerminalView(frame: .zero)
        tv.terminalDelegate = context.coordinator
        tv.font = UIFont.monospacedSystemFont(ofSize: CGFloat(fontSize), weight: .regular)

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
        // Route incoming PTY bytes to the terminal
        socket.onBytes = { [weak tv] bytes in
            DispatchQueue.main.async { tv?.feed(byteArray: bytes[...]) }
        }
        // Connect after onBytes is wired so no early PTY output is dropped
        socket.connect()
        return tv
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {
        let newFont = UIFont.monospacedSystemFont(ofSize: CGFloat(fontSize), weight: .regular)
        if uiView.font != newFont {
            uiView.font = newFont
        }
    }

    // MARK: - Delegate

    final class Coordinator: NSObject, TerminalViewDelegate {
        let socket: TerminalSocket

        init(socket: TerminalSocket) { self.socket = socket }

        /// User typed something → forward to the hub via WebSocket.
        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            socket.send(.input(String(decoding: data, as: UTF8.self)))
        }

        /// Terminal was resized → tell the hub so the PTY can reflow.
        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            socket.send(.resize(cols: newCols, rows: newRows))
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
