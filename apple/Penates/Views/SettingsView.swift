import SwiftUI

struct SettingsView: View {
    @Environment(AppSession.self) private var app
    @Environment(\.dismiss) private var dismiss
    @AppStorage("requireBiometrics") private var requireBiometrics = false
    @AppStorage("terminalFontSize") private var fontSize = 13.0
    @State private var hubVersion = "…"

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
                Section("Terminal") {
                    Stepper("Schriftgröße: \(Int(fontSize))", value: $fontSize, in: 9...24)
                }
                Section("Über") {
                    LabeledContent("App",
                        value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                    LabeledContent("Hub", value: hubVersion)
                    Link("penates.dev", destination: URL(string: "https://penates.dev")!)
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
