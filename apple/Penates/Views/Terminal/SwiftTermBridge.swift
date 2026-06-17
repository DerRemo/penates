import SwiftUI
import SwiftTerm

/// UIViewRepresentable wrapping SwiftTerm's TerminalView.
/// Seeds scrollback data before live bytes arrive, then wires
/// socket.onBytes → terminalView.feed and terminal input → socket.send(.input).
struct SwiftTermBridge: UIViewRepresentable {
    let socket: TerminalSocket
    let seed: [UInt8]

    func makeCoordinator() -> Coordinator { Coordinator(socket: socket) }

    func makeUIView(context: Context) -> TerminalView {
        let tv = TerminalView(frame: .zero)
        tv.terminalDelegate = context.coordinator
        // Feed scrollback seed before opening the live connection
        if !seed.isEmpty {
            tv.feed(byteArray: seed[...])
        }
        // Route incoming PTY bytes to the terminal
        socket.onBytes = { [weak tv] bytes in
            DispatchQueue.main.async { tv?.feed(byteArray: bytes[...]) }
        }
        return tv
    }

    func updateUIView(_ uiView: TerminalView, context: Context) {}

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
