import SwiftUI

struct OverviewView: View {
    @Environment(AppSession.self) private var app
    @State private var model: OverviewModel?
    @State private var showSettings = false
    @State private var showNewSession = false
    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if let model {
                    LazyVGrid(columns: columns, spacing: 12) {
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
        .task { await setup() }
    }

    @ViewBuilder private func section(_ title: String, _ items: [Session], _ model: OverviewModel) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { s in
                    NavigationLink(value: s) {
                        SessionCard(session: s,
                                    onKill: { /* Task 18 */ },
                                    onRename: { /* Task 18 */ })
                    }
                    .buttonStyle(.plain)
                }
            } header: { HStack { Text(title).font(.subheadline.bold()).foregroundStyle(.secondary); Spacer() } }
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
