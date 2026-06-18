import Foundation

struct VersionInfo: Decodable { let current: String }

enum APIError: Error, Equatable {
    case unauthorized, http(Int), transport(String), decoding(String)
}

final class APIClient {
    let credentials: ServerCredentials
    private let session: URLSession
    init(credentials: ServerCredentials, session: URLSession = .shared) {
        self.credentials = credentials
        self.session = session
    }

    func version() async throws -> VersionInfo { try await request("GET", "/api/version") }
    func sessions() async throws -> [Session] { try await request("GET", "/api/sessions") }

    private struct Scrollback: Decodable { let data: String }
    func scrollback(name: String, lines: Int = 2000) async throws -> String {
        let r: Scrollback = try await request("GET", "/api/sessions/\(name)/scrollback", query: ["lines": "\(lines)"])
        return r.data
    }

    // MARK: - Browse & directory helpers

    func browse(path: String, hidden: Bool = false) async throws -> [DirEntry] {
        struct Resp: Decodable { let entries: [DirEntry] }
        let r: Resp = try await request("GET", "/api/browse",
                                        query: ["path": path, "hidden": hidden ? "1" : "0"])
        return r.entries
    }

    func recentDirs() async throws -> [String] {
        struct RecentDir: Decodable { let cwd: String }
        struct Resp: Decodable { let dirs: [RecentDir] }
        let r: Resp = try await request("GET", "/api/recent-dirs")
        return r.dirs.map(\.cwd)
    }

    func createSession(name: String, directory: String, command: String) async throws {
        let body = try JSONEncoder().encode(["name": name, "directory": directory, "command": command])
        let _: EmptyResponse = try await request("POST", "/api/sessions", body: body)
    }

    func deleteSession(name: String) async throws {
        let _: EmptyResponse = try await request("DELETE", "/api/sessions/\(name)")
    }

    func renameSession(name: String, to newName: String) async throws {
        let body = try JSONEncoder().encode(["newName": newName])
        let _: EmptyResponse = try await request("PATCH", "/api/sessions/\(name)", body: body)
    }

    /// Notification mute toggle. The hub takes the explicit target value, not a
    /// toggle, so the caller passes `!session.muted`.
    func setMuted(name: String, muted: Bool) async throws {
        let body = try JSONEncoder().encode(["muted": muted])
        let _: EmptyResponse = try await request("POST", "/api/sessions/\(name)/mute", body: body)
    }

    /// Sidebar/overview pin toggle. Like mute, the hub takes the explicit target value.
    func setPinned(name: String, pinned: Bool) async throws {
        let body = try JSONEncoder().encode(["pinned": pinned])
        let _: EmptyResponse = try await request("POST", "/api/sessions/\(name)/pin", body: body)
    }

    // MARK: - Generic request

    func request<T: Decodable>(_ method: String, _ path: String,
                               query: [String: String] = [:],
                               body: Data? = nil) async throws -> T {
        guard let base = URLComponents(url: credentials.baseURL.appendingPathComponent(path),
                                      resolvingAgainstBaseURL: false) else {
            throw APIError.transport("invalid URL for path \(path)")
        }
        var comps = base
        if !query.isEmpty { comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        guard let url = comps.url else { throw APIError.transport("invalid URL for path \(path)") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
        if let body { req.httpBody = body; req.setValue("application/json", forHTTPHeaderField: "Content-Type") }

        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await session.data(for: req) }
        catch { throw APIError.transport(error.localizedDescription) }

        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(code) else { throw APIError.http(code) }
        if T.self == EmptyResponse.self { return EmptyResponse() as! T }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(error.localizedDescription) }
    }
}

struct EmptyResponse: Decodable {}
