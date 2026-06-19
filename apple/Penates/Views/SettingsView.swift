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
                Section("Verbindung") {
                    if let url = app.credentials?.baseURL {
                        Text(url.absoluteString)
                            .foregroundStyle(.secondary)
                    }
                    Button("Verbindung trennen", role: .destructive) {
                        app.disconnect()
                        dismiss()
                    }
                }
                Section("Sicherheit") {
                    Toggle("Face ID beim Start", isOn: $requireBiometrics)
                }
                Section {
                    Toggle("Tastatur beim Öffnen anzeigen", isOn: $autoFocusTerminal)
                } header: {
                    Text("Terminal")
                } footer: {
                    // Off = der Nutzer tippt zuerst ins Terminal, um zu schreiben.
                    Text("Aus: erst ins Terminal tippen, um zu schreiben.")
                }
                Section("Über") {
                    LabeledContent("App",
                        value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                    LabeledContent("Hub", value: hubVersion)
                    Link("penates.dev", destination: Self.siteURL)
                }
            }
            .navigationTitle("Einstellungen")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fertig") { dismiss() }
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
