import SwiftUI

struct RootView: View {
    @State private var app = AppSession()
    @AppStorage("requireBiometrics") private var requireBiometrics = false
    @State private var unlocked = false

    var body: some View {
        Group {
            if app.credentials == nil {
                ConnectView()
            } else {
                AppTabs()
                    .overlay {
                        if BiometricGate.shouldPrompt(enabled: requireBiometrics, alreadyUnlocked: unlocked) {
                            LockOverlay {
                                Task {
                                    let ok = await BiometricGate.authenticate(
                                        reason: "Schuetzt den Zugriff auf deine Sessions."
                                    )
                                    if ok { unlocked = true }
                                }
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
    let onUnlock: () -> Void

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.secondary)
                Button("Entsperren", action: onUnlock)
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}
