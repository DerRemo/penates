import Testing
import Foundation
@testable import Penates

@MainActor
@Test func loadMarksDidLoadEvenWithoutClient() async {
    let m = OverviewModel(client: nil)
    #expect(m.didLoad == false)
    await m.load()
    #expect(m.didLoad == true)   // lets the view distinguish "loading" from "empty"
}

@MainActor
@Test(.tags(.networking)) func togglePinCallsHubThenReloadsWithUpdatedState() async throws {
    let (session, creds) = StubURLProtocol.make { req in
        let data: Data = req.url?.path == "/api/sessions"
            // Reload returns the post-toggle state, proving load() ran after the pin call.
            ? Data(#"[{"name":"cc-a","command":"claude","activity":"idle","status":"running","pinned":true,"muted":false}]"#.utf8)
            : Data("{}".utf8)   // the /pin POST
        return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
    }
    let m = OverviewModel(client: APIClient(credentials: creds, session: session))
    let s = Session(name: "cc-a", command: "claude", activity: .idle, status: .running, project: nil, pinned: false)
    try await m.togglePin(s)
    #expect(m.sessions.first?.pinned == true)
}

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

@MainActor
@Test func pinnedSessionsGetTheirOwnSectionAndLeaveActiveDormant() {
    let m = OverviewModel(client: nil)
    m.sessions = [
        Session(name: "cc-a", command: "claude", activity: .idle, status: .running, project: nil),
        Session(name: "cc-b", command: "claude", activity: .idle, status: .running, project: nil, pinned: true),
        Session(name: "cc-c", command: "claude", activity: .idle, status: .dormant, project: nil),
        Session(name: "cc-d", command: "claude", activity: .idle, status: .dormant, project: nil, pinned: true),
    ]
    // Pinned (running OR dormant) move to their own section; Aktiv/Ruhend show only the unpinned.
    #expect(m.pinned.map(\.name) == ["cc-b", "cc-d"])
    #expect(m.active.map(\.name) == ["cc-a"])
    #expect(m.dormant.map(\.name) == ["cc-c"])
}

@MainActor
@Test func activityEventPreservesMuteAndPin() {
    let m = OverviewModel(client: nil)
    m.sessions = [Session(name: "cc-a", command: "claude", activity: .idle, status: .running, project: nil,
                          muted: true, pinned: true)]
    m.apply(.activity(name: "cc-a", .working))
    #expect(m.sessions.first?.muted == true)
    #expect(m.sessions.first?.pinned == true)
}
