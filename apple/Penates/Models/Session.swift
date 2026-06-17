import Foundation

enum Activity: String, Decodable, Equatable {
    case working, waiting, idle, unknown
}

enum SessionStatus: String, Decodable, Equatable {
    case running, dormant, foreign
}

struct Session: Identifiable, Hashable, Decodable {
    var id: String { name }
    let name: String
    let command: String?
    let activity: Activity
    let status: SessionStatus
    let project: String?

    enum CodingKeys: String, CodingKey {
        case name, command, activity, status, project
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name     = try c.decode(String.self, forKey: .name)
        command  = try c.decodeIfPresent(String.self, forKey: .command)
        activity = (try? c.decodeIfPresent(Activity.self, forKey: .activity)) ?? .unknown
        status   = (try? c.decodeIfPresent(SessionStatus.self, forKey: .status)) ?? .running
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
    init(name: String, command: String?, activity: Activity, status: SessionStatus, project: String?) {
        self.name     = name
        self.command  = command
        self.activity = activity
        self.status   = status
        self.project  = project
    }
}

// MARK: - Private helpers

private struct ProjectRef: Decodable {
    let name: String
}
