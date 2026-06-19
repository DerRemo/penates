import SwiftUI

struct TerminalScreen: View {
    let session: Session
    @Environment(AppSession.self) private var appSession
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var socket: TerminalSocket?
    @State private var seed: [UInt8] = []
    @State private var isReady = false
    @State private var endedCode: Int?
    // Fixed terminal font size — the user-facing stepper was removed; a single
    // tuned size keeps the terminal layout consistent across devices.
    private let fontSize = 13.0
    // Default true = keyboard appears immediately on opening a session.
    @AppStorage("autoFocusTerminal") private var autoFocusTerminal = true

    var body: some View {
        Group {
            if let code = endedCode {
                SessionEndedView(code: code) { dismiss() }
            } else if isReady, let s = socket {
                SwiftTermBridge(socket: s, seed: seed, fontSize: fontSize,
                                colorScheme: colorScheme, autoFocus: autoFocusTerminal)
                    // Inset the terminal off the screen edges so text doesn't
                    // stick to the bezel.
                    .padding(.horizontal, 10)
                    .padding(.top, 4)
                    // Adaptive full-bleed background BEHIND the padded terminal:
                    // the inset band matches the terminal color (no contrasting
                    // gap) and fills the bottom safe-area + the region under the
                    // keyboard. .ignoresSafeArea() extends it under the keyboard
                    // so no host background shows through the rounded corners.
                    // (Final corner polish is device-verified.)
                    .background(
                        Color(uiColor: TerminalPalette.background(colorScheme == .dark))
                            .ignoresSafeArea()
                    )
            } else {
                ProgressView("Connecting…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle(session.displayName)
        .navigationBarTitleDisplayMode(.inline)
        // The session view is immersive: hide the tab bar so the terminal owns
        // the full height. Otherwise the pushed view keeps the TabView's bar and
        // the safe-area-ignoring terminal draws its bottom rows behind it.
        .toolbar(.hidden, for: .tabBar)
        .task { await connect() }
        .onDisappear { socket?.close() }
    }

    private func connect() async {
        guard let creds = appSession.credentials else { return }
        let client = APIClient(credentials: creds)
        // A dormant session has no live tmux/PTY — re-spawn it on the hub before
        // attaching, otherwise the terminal WS closes immediately (4004).
        // Foreign/running sessions are already live and attach directly.
        if session.status == .dormant {
            do { try await client.restoreSession(name: session.name) }
            catch { endedCode = 4004; return }
        }
        // Seed scrollback; swallow errors — missing scrollback is non-fatal
        if let text = try? await client.scrollback(name: session.name) {
            seed = Array(text.utf8)
        }
        let s = TerminalSocket(credentials: creds, name: session.name)
        // onClose must be set before isReady = true: that flips the view to the
        // SwiftTermBridge, whose makeUIView calls socket.connect() — so wiring it
        // here guarantees onClose is in place before the connection can close.
        s.onClose = { code in endedCode = code }   // fires on the main thread
        socket = s
        isReady = true
    }
}

/// Shown when the terminal connection ends for good — the session was killed
/// elsewhere (4004) or auth was rejected (4001) — so the user is never left
/// staring at a frozen terminal.
private struct SessionEndedView: View {
    let code: Int
    let onBack: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(code == 4001 ? "Not authorized" : "Session ended",
                  systemImage: code == 4001 ? "lock.slash" : "xmark.circle")
        } description: {
            Text(code == 4001
                 ? "The connection was rejected."
                 : "This session is no longer running.")
        } actions: {
            Button("Back to Overview", action: onBack)
                .buttonStyle(.borderedProminent)
        }
    }
}
