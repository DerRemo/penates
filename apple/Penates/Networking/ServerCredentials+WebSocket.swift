import Foundation

extension ServerCredentials {
    /// Builds a ws/wss URL under baseURL for a WebSocket path (URLSession rejects http/https schemes).
    func webSocketURL(path: String, query: [URLQueryItem] = []) -> URL {
        let base = baseURL.appendingPathComponent(path)
        guard var comps = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return base }
        comps.scheme = comps.scheme == "https" ? "wss" : "ws"
        if !query.isEmpty { comps.queryItems = query }
        return comps.url ?? base
    }
}
