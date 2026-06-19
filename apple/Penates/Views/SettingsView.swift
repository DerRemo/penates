import SwiftUI

struct SettingsView: View {
    @Environment(AppSession.self) private var app
    @Environment(\.dismiss) private var dismiss
    @AppStorage("requireBiometrics") private var requireBiometrics = false
    @AppStorage("autoFocusTerminal") private var autoFocusTerminal = true
    @State private var hubVersion = "…"

    // Compile-time-constant literal; the single force-unwrap is isolated here
    // rather than scattered in the body.
    private static let siteURL = URL(string: "https://penates.dev")!

    var body: some View {
        NavigationStack {
            Form {
                Section("Connection") {
                    if let url = app.credentials?.baseURL {
                        Text(url.absoluteString)
                            .foregroundStyle(.secondary)
                    }
                    Button("Disconnect", role: .destructive) {
                        app.disconnect()
                        dismiss()
                    }
                }
                Section("Security") {
                    Toggle("Face ID on launch", isOn: $requireBiometrics)
                }
                Section {
                    Toggle("Show keyboard on open", isOn: $autoFocusTerminal)
                } header: {
                    Text("Terminal")
                } footer: {
                    // Off = der Nutzer tippt zuerst ins Terminal, um zu schreiben.
                    Text("Off: tap the terminal first to type.")
                }
                Section("About") {
                    LabeledContent("App",
                        value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                    LabeledContent("Hub", value: hubVersion)
                    Link("penates.dev", destination: Self.siteURL)
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                if let creds = app.credentials {
                    hubVersion = (try? await APIClient(credentials: creds).version().current) ?? "—"
                }
            }
        }
    }
}
