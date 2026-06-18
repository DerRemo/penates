import SwiftUI

struct RootView: View {
    @State private var app = AppSession()
    @AppStorage("requireBiometrics") private var requireBiometrics = false
    @State private var unlocked = false
    // Constant for the app's lifetime — compute once instead of on every body pass.
    @State private var deviceCapable = BiometricGate.canAuthenticate()

    var body: some View {
        Group {
            if app.credentials == nil {
                ConnectView()
            } else {
                AppTabs()
                    .overlay {
                        if BiometricGate.shouldPrompt(enabled: requireBiometrics,
                                                      alreadyUnlocked: unlocked,
                                                      deviceCapable: deviceCapable) {
                            LockOverlay {
                                let ok = await BiometricGate.authenticate(
                                    reason: "Schützt den Zugriff auf deine Sessions."
                                )
                                if ok { unlocked = true }
                                return ok
                            }
                        }
                    }
            }
        }
        .environment(app)
        .task { app.restore() }
    }
}

private struct LockOverlay: View {
    /// Runs the biometric prompt; returns whether it succeeded.
    let authenticate: () async -> Bool
    @State private var showRetry = false

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.secondary)
                // No button in the happy path — Face ID fires automatically on
                // appear. The retry button only surfaces after a failed/cancelled
                // attempt so the user is never trapped on the lock screen.
                if showRetry {
                    Button("Entsperren") { Task { await run() } }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
        .task { await run() }
    }

    private func run() async {
        showRetry = false
        let ok = await authenticate()
        if !ok { showRetry = true }
    }
}
