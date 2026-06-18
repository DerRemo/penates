import Foundation

enum Activity: String, Decodable, Equatable {
    case working, waiting, idle, unknown
}

enum SessionStatus: String, Decodable, Equatable {
    case running, dormant, foreign
}

struct Session: Identifiable, Hashable, Decodable {
    var id: String { name }
    /// Name shown in the UI — the hub's "cc-" session prefix stripped. `id`
    /// keeps the real tmux name so navigation/identity are unaffected.
    var displayName: String { name.hasPrefix("cc-") ? String(name.dropFirst(3)) : name }
    let name: String
    let command: String?
    let activity: Activity
    let status: SessionStatus
    let project: String?
    let muted: Bool
    let pinned: Bool

    enum CodingKeys: String, CodingKey {
        case name, command, activity, status, project, muted, pinned
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name     = try c.decode(String.self, forKey: .name)
        command  = try c.decodeIfPresent(String.self, forKey: .command)
        activity = (try? c.decodeIfPresent(Activity.self, forKey: .activity)) ?? .unknown
        status   = (try? c.decodeIfPresent(SessionStatus.self, forKey: .status)) ?? .running
        muted    = (try? c.decode(Bool.self, forKey: .muted)) ?? false
        pinned   = (try? c.decode(Bool.self, forKey: .pinned)) ?? false
        // `project` can arrive as a plain string OR as `{ "id": ..., "name": ... }` from
        // server.js projectOf(). Decode tolerantly so either form resolves to a String?.
        if let s = try? c.decodeIfPresent(String.self, forKey: .project) {
            project = s
        } else {
            // try? + decodeIfPresent yields ProjectRef?? — flatten with ?? nil
            let ref: ProjectRef?? = try? c.decodeIfPresent(ProjectRef.self, forKey: .project)
            project = (ref ?? nil)?.name
        }
    }

    /// Memberwise init for tests and SwiftUI previews.
    init(name: String, command: String?, activity: Activity, status: SessionStatus, project: String?,
         muted: Bool = false, pinned: Bool = false) {
        self.name     = name
        self.command  = command
        self.activity = activity
        self.status   = status
        self.project  = project
        self.muted    = muted
        self.pinned   = pinned
    }
}

// MARK: - Private helpers

private struct ProjectRef: Decodable {
    let name: String
}
