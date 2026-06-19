import SwiftUI

struct ConnectView: View {
    @Environment(AppSession.self) private var app
    #if DEBUG
    @State private var urlText = ProcessInfo.processInfo.environment["PENATES_URL"]
        ?? ProcessInfo.processInfo.environment["SIMCTL_CHILD_PENATES_URL"] ?? ""
    @State private var token = ProcessInfo.processInfo.environment["PENATES_TOKEN"]
        ?? ProcessInfo.processInfo.environment["SIMCTL_CHILD_PENATES_TOKEN"] ?? ""
    #else
    @State private var urlText = ""
    @State private var token = ""
    #endif
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
                    Text("Hub Connection")
                } footer: {
                    Text("Your Penates hub's server URL (on your LAN or via Tailscale) and the bearer token from .env.")
                }

                if let error { Text(error).foregroundStyle(.red) }

                Button(action: connect) {
                    HStack {
                        if busy { ProgressView() }
                        Text("Connect")
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
                    case .badURL: String(localized: "Invalid URL.")
                    case .unauthorized: String(localized: "Token rejected.")
                    case .unreachable: String(localized: "Hub unreachable. Is the server running / is Tailscale connected?")
                }
            }
            busy = false
        }
    }
}
