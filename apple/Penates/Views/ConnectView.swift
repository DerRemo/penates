import SwiftUI

struct ConnectView: View {
    @Environment(AppSession.self) private var app
    @State private var urlText = ProcessInfo.processInfo.environment["PENATES_URL"]
        ?? ProcessInfo.processInfo.environment["SIMCTL_CHILD_PENATES_URL"] ?? ""
    @State private var token = ProcessInfo.processInfo.environment["PENATES_TOKEN"]
        ?? ProcessInfo.processInfo.environment["SIMCTL_CHILD_PENATES_TOKEN"] ?? ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://mac.tailnet.ts.net:3333", text: $urlText)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Token", text: $token)
                } header: {
                    Text("Hub-Verbindung")
                } footer: {
                    Text("Server-URL deines Penates-Hubs (im LAN oder über Tailscale) und der Bearer-Token aus der .env.")
                }

                if let error { Text(error).foregroundStyle(.red) }

                Button(action: connect) {
                    HStack {
                        if busy { ProgressView() }
                        Text("Verbinden")
                    }
                }
                .disabled(busy || urlText.isEmpty || token.isEmpty)
            }
            .navigationTitle("Penates")
        }
    }

    private func connect() {
        busy = true; error = nil
        Task {
            switch await app.connect(baseURL: urlText, token: token) {
            case .success: break
            case .failure(let e):
                error = switch e {
                    case .badURL: "Ungültige URL."
                    case .unauthorized: "Token abgelehnt."
                    case .unreachable: "Hub nicht erreichbar. Läuft der Server / ist Tailscale verbunden?"
                }
            }
            busy = false
        }
    }
}
