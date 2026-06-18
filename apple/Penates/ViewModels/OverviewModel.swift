import SwiftUI

@Observable @MainActor
final class OverviewModel {
    var sessions: [Session] = []
    var loadError: String?
    private let client: APIClient?
    init(client: APIClient?) { self.client = client }

    // Pinned sessions get their own section at the very top, regardless of
    // running/dormant; Aktiv/Ruhend show only the unpinned remainder. Server
    // order is preserved within each group (filter is stable).
    var pinned: [Session]  { sessions.filter { $0.pinned } }
    var active: [Session]  { sessions.filter { $0.status == .running && !$0.pinned } }
    var dormant: [Session] { sessions.filter { $0.status != .running && !$0.pinned } }

    func load() async {
        guard let client else { return }
        do { sessions = try await client.sessions(); loadError = nil }
        catch { loadError = "Sessions konnten nicht geladen werden." }
    }

    func apply(_ event: FirehoseEvent) {
        switch event {
        case .activity(let name, let a), .attention(let name, let a):
            mutate(name) { $0 = Session(name: $0.name, command: $0.command, activity: a, status: .running, project: $0.project, muted: $0.muted, pinned: $0.pinned) }
        case .ended(let name):
            mutate(name) { $0 = Session(name: $0.name, command: $0.command, activity: .unknown, status: .dormant, project: $0.project, muted: $0.muted, pinned: $0.pinned) }
        }
    }

    private func mutate(_ name: String, _ f: (inout Session) -> Void) {
        guard let i = sessions.firstIndex(where: { $0.name == name }) else { return }
        f(&sessions[i])
    }
}
