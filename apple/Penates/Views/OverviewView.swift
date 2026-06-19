import SwiftUI

struct OverviewView: View {
    @Environment(AppSession.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: OverviewModel?
    @State private var showSettings = false
    @State private var showNewSession = false

    // Kill + rename state
    @State private var killTarget: Session?
    @State private var renameTarget: Session?
    @State private var isRenaming = false
    @State private var renameText = ""
    @State private var errorMessage: String?
    @State private var showError = false

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        NavigationStack {
            Group {
                if let model {
                    if model.sessions.isEmpty {
                        if let err = model.loadError {
                            ContentUnavailableView {
                                Label("Couldn't load sessions", systemImage: "exclamationmark.triangle")
                            } description: {
                                Text(err)
                            } actions: {
                                Button("Try Again") { Task { await model.load() } }
                            }
                        } else if model.didLoad {
                            ContentUnavailableView("No Sessions", systemImage: "square.grid.2x2",
                                description: Text("Tap + in the top right to start a session."))
                        } else {
                            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    } else {
                        ScrollView {
                            LazyVGrid(columns: columns, spacing: 12) {
                                sessionSection("Pinned", model.pinned)
                                sessionSection("Active", model.active)
                                sessionSection("Dormant", model.dormant)
                            }
                            .padding()
                        }
                        .refreshable { await model.load() }
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .navigationTitle("Sessions")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Settings", systemImage: "gearshape") { showSettings = true }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New Session", systemImage: "plus") { showNewSession = true }
                }
            }
            .navigationDestination(for: Session.self) { s in TerminalScreen(session: s) }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .sheet(isPresented: $showNewSession) { NewSessionView { Task { await model?.load() } } }
        // Rename alert — bool-driven with `presenting:` so the optional session
        // is safely unwrapped without a Binding(get:set:) in the body.
        .alert("Rename Session", isPresented: $isRenaming, presenting: renameTarget) { session in
            TextField("New name", text: $renameText)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Button("Rename") {
                // Defense-in-depth: a hardware-keyboard Return can bypass .disabled on an alert button.
                guard SessionName.isValid(renameText) else { return }
                let newName = renameText
                Task { await performRename(session, to: newName) }
            }
            .disabled(!SessionName.isValid(renameText))
            Button("Cancel", role: .cancel) {}
        }
        // Error alert
        .alert("Error", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Unknown error")
        }
        .task { await setup() }
        // `.task` is view-lifecycle bound, so returning from background never
        // re-runs setup() — the firehose only carries deltas and its socket dies
        // on suspend. Re-sync the full list the moment the scene comes forward so
        // the user never opens to a stale state (no manual pull-to-refresh).
        // onChange skips the initial `.active`, so this won't double-load at launch.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model?.load() } }
        }
    }

    /// Builds one overview section, sharing the common per-card action closures.
    /// Returns a concrete `SessionSection` (a factory, not a `some View` body
    /// fragment) so the three call sites stay DRY.
    private func sessionSection(_ title: LocalizedStringKey, _ items: [Session]) -> SessionSection {
        SessionSection(
            title: title,
            items: items,
            killTarget: $killTarget,
            onRename: startRename,
            onTogglePin: { s in Task { await performPin(s) } },
            onToggleMute: { s in Task { await performMute(s) } },
            onConfirmKill: { s in Task { await performKill(s) } }
        )
    }

    // MARK: - Actions
    //
    // Thin presentation wrappers: the API work lives on OverviewModel; here we
    // only surface failures via the error alert.

    private func startRename(_ s: Session) {
        renameText = ""
        renameTarget = s
        isRenaming = true
    }

    private func performKill(_ s: Session) async {
        do { try await model?.kill(s) } catch { present(error) }
    }

    private func performRename(_ s: Session, to newName: String) async {
        do { try await model?.rename(s, to: newName) } catch { present(error) }
    }

    private func performPin(_ s: Session) async {
        do { try await model?.togglePin(s) } catch { present(error) }
    }

    private func performMute(_ s: Session) async {
        do { try await model?.toggleMute(s) } catch { present(error) }
    }

    private func present(_ error: Error) {
        errorMessage = error.localizedDescription
        showError = true
    }

    private func setup() async {
        guard let creds = app.credentials else { return }
        let client = APIClient(credentials: creds)
        let m = OverviewModel(client: client); model = m
        await m.load()
        // Live updates with auto-reconnect: the firehose stream ends on any
        // network blip, so re-sync + re-open until the view goes away (the
        // enclosing .task is cancelled, which ends the AsyncStream).
        let firehose = NotificationsFirehose(credentials: creds)
        while !Task.isCancelled {
            for await event in firehose.events() { m.apply(event) }
            guard !Task.isCancelled else { break }
            try? await Task.sleep(for: .seconds(2))
            await m.load()
        }
    }
}
