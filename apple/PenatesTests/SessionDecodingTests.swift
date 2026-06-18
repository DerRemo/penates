import Testing
import Foundation
@testable import Penates

@Test func decodesSessionWithActivityAndStatus() throws {
    let json = """
    [{"name":"cc-demo","command":"claude --continue","activity":"working","status":"running","project":"penates"}]
    """.data(using: .utf8)!
    let sessions = try JSONDecoder().decode([Session].self, from: json)
    #expect(sessions.first?.activity == .working)
    #expect(sessions.first?.status == .running)
    #expect(sessions.first?.project == "penates")
}

@Test func missingActivityDefaultsToUnknown() throws {
    let json = #"[{"name":"cc-x","status":"dormant"}]"#.data(using: .utf8)!
    let s = try JSONDecoder().decode([Session].self, from: json).first
    #expect(s?.activity == .unknown)
    #expect(s?.command == nil)
}

@Test func decodesProjectObjectForm() throws {
    let json = #"[{"name":"cc-z","status":"running","project":{"id":"p1","name":"penates"}}]"#.data(using: .utf8)!
    let s = try JSONDecoder().decode([Session].self, from: json).first
    #expect(s?.project == "penates")
}

@Test func decodesMutedAndPinned() throws {
    let json = #"[{"name":"cc-m","status":"running","muted":true,"pinned":true}]"#.data(using: .utf8)!
    let s = try JSONDecoder().decode([Session].self, from: json).first
    #expect(s?.muted == true)
    #expect(s?.pinned == true)
}

@Test func mutedAndPinnedDefaultToFalseWhenAbsent() throws {
    let json = #"[{"name":"cc-x","status":"running"}]"#.data(using: .utf8)!
    let s = try JSONDecoder().decode([Session].self, from: json).first
    #expect(s?.muted == false)
    #expect(s?.pinned == false)
}

@Test func displayNameStripsLeadingCcPrefixOnce() {
    func s(_ name: String) -> Session {
        Session(name: name, command: nil, activity: .idle, status: .running, project: nil)
    }
    #expect(s("cc-packliste").displayName == "packliste")
    #expect(s("cc-cc-iostest").displayName == "cc-iostest")   // only the leading prefix
    #expect(s("foreign-session").displayName == "foreign-session")  // no prefix → unchanged
    #expect(s("cc-").displayName == "")
}
