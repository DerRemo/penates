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
