import SwiftUI

struct OverviewView: View {
    @Environment(AppSession.self) private var app
    @State private var model: OverviewModel?
    @State private var showSettings = false
    @State private var showNewSession = false

    // Task 18: kill + rename state
    @State private var killTarget: Session?
    @State private var renameTarget: Session?
    @State private var renameText = ""
    @State private var errorMessage: String?
    @State private var showError = false

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if let model {
                    LazyVGrid(columns: columns, spacing: 12) {
                        section("Angeheftet", model.pinned, model)
                        section("Aktiv", model.active, model)
                        section("Ruhend", model.dormant, model)
                    }.padding()
                }
            }
            .navigationTitle("Sessions")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showNewSession = true } label: { Image(systemName: "plus") }
                }
            }
            .refreshable { await model?.load() }
            .navigationDestination(for: Session.self) { s in TerminalScreen(session: s) }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .sheet(isPresented: $showNewSession) { NewSessionView { Task { await model?.load() } } }
        // Kill confirmation is anchored to each card via a popover (see `section`).
        // Rename alert
        .alert("Session umbenennen", isPresented: Binding(get: { renameTarget != nil }, set: { if !$0 { renameTarget = nil } })) {
            TextField("Neuer Name", text: $renameText)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Button("Umbenennen") {
                // Defense-in-depth: a hardware-keyboard Return can bypass .disabled on an alert button.
                guard let s = renameTarget, SessionName.isValid(renameText) else { return }
                let newName = renameText
                renameTarget = nil
                Task { await performRename(s, to: newName) }
            }
            .disabled(!SessionName.isValid(renameText))
            Button("Abbrechen", role: .cancel) { renameTarget = nil }
        }
        // Error alert
        .alert("Fehler", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "Unbekannter Fehler")
        }
        .task { await setup() }
    }

    @ViewBuilder private func section(_ title: String, _ items: [Session], _ model: OverviewModel) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { s in
                    NavigationLink(value: s) {
                        SessionCard(session: s,
                                    onKill: { killTarget = s },
                                    onRename: { renameText = ""; renameTarget = s },
                                    onTogglePin: { Task { await performPin(s) } },
                                    onToggleMute: { Task { await performMute(s) } })
                            // Kill confirmation pops up right at the card, not as
                            // a bottom action sheet.
                            .popover(isPresented: Binding(
                                get: { killTarget?.id == s.id },
                                set: { if !$0 { killTarget = nil } }
                            )) {
                                KillConfirmPopover(
                                    name: s.displayName,
                                    onConfirm: { let target = s; killTarget = nil; Task { await performKill(target) } },
                                    onCancel: { killTarget = nil }
                                )
                                .presentationCompactAdaptation(.popover)
                            }
                    }
                    .buttonStyle(.plain)
                }
            } header: { HStack { Text(title).font(.subheadline.bold()).foregroundStyle(.secondary); Spacer() } }
        }
    }

    private func performKill(_ s: Session) async {
        guard let creds = app.credentials else { return }
        let client = APIClient(credentials: creds)
        do {
            try await client.deleteSession(name: s.name)
            await model?.load()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func performRename(_ s: Session, to newName: String) async {
        guard let creds = app.credentials else { return }
        let client = APIClient(credentials: creds)
        do {
            try await client.renameSession(name: s.name, to: newName)
            await model?.load()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func performPin(_ s: Session) async {
        guard let creds = app.credentials else { return }
        let client = APIClient(credentials: creds)
        do {
            try await client.setPinned(name: s.name, pinned: !s.pinned)
            await model?.load()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func performMute(_ s: Session) async {
        guard let creds = app.credentials else { return }
        let client = APIClient(credentials: creds)
        do {
            try await client.setMuted(name: s.name, muted: !s.muted)
            await model?.load()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func setup() async {
        guard let creds = app.credentials else { return }
        let client = APIClient(credentials: creds)
        let m = OverviewModel(client: client); model = m
        await m.load()
        let firehose = NotificationsFirehose(credentials: creds)
        for await event in firehose.events() { m.apply(event) }   // live, no polling
    }
}

/// Compact kill confirmation shown as a popover bubble anchored to the card.
private struct KillConfirmPopover: View {
    let name: String
    var onConfirm: () -> Void
    var onCancel: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Session „\(name)“ beenden?")
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.center)
            Button("Beenden", role: .destructive, action: onConfirm)
                .buttonStyle(.borderedProminent)
            Button("Abbrechen", role: .cancel, action: onCancel)
        }
        .padding()
        .frame(minWidth: 240)
    }
}
