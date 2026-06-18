import SwiftUI

@Observable @MainActor
final class OverviewModel {
    var sessions: [Session] = []
    var loadError: String?
    private let client: APIClient?
    init(client: APIClient?) { self.client = client }

    var active: [Session] { pinnedFirst(sessions.filter { $0.status == .running }) }
    var dormant: [Session] { pinnedFirst(sessions.filter { $0.status != .running }) }

    /// Float pinned sessions to the front while preserving the server's order
    /// among equals (Swift's `sort` is not guaranteed stable, so tie-break on
    /// the original index).
    private func pinnedFirst(_ xs: [Session]) -> [Session] {
        xs.enumerated()
            .sorted { l, r in
                l.element.pinned != r.element.pinned ? l.element.pinned : l.offset < r.offset
            }
            .map(\.element)
    }

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
