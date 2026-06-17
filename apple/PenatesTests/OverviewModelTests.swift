import Testing
@testable import Penates

@MainActor
@Test func activityEventUpdatesSession() {
    let m = OverviewModel(client: nil)
    m.sessions = [Session(name: "cc-a", command: "claude", activity: .idle, status: .running, project: nil)]
    m.apply(.activity(name: "cc-a", .working))
    #expect(m.sessions.first?.activity == .working)
}

@MainActor
@Test func endedEventMarksDormant() {
    let m = OverviewModel(client: nil)
    m.sessions = [Session(name: "cc-a", command: "claude", activity: .working, status: .running, project: nil)]
    m.apply(.ended(name: "cc-a"))
    #expect(m.sessions.first?.status == .dormant)
    #expect(m.dormant.map(\.name) == ["cc-a"])
}
