import SwiftUI

struct TerminalScreen: View {
    let session: Session
    @Environment(AppSession.self) private var appSession
    @State private var socket: TerminalSocket?
    @State private var seed: [UInt8] = []
    @State private var isReady = false
    @AppStorage("terminalFontSize") private var fontSize = 13.0

    var body: some View {
        Group {
            if isReady, let s = socket {
                SwiftTermBridge(socket: s, seed: seed, fontSize: fontSize)
                    .ignoresSafeArea(.container, edges: .bottom)
            } else {
                ProgressView("Connecting…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(session.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await connect() }
        .onDisappear { socket?.close() }
    }

    private func connect() async {
        guard let creds = appSession.credentials else { return }
        let client = APIClient(credentials: creds)
        // Seed scrollback; swallow errors — missing scrollback is non-fatal
        if let text = try? await client.scrollback(name: session.name) {
            seed = Array(text.utf8)
        }
        let s = TerminalSocket(credentials: creds, name: session.name)
        socket = s
        isReady = true
    }
}
