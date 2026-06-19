import Foundation
import os
@testable import Penates

/// `URLProtocol` stub with **per-session** handlers instead of one shared global,
/// so the networking tests stay isolated under Swift Testing's parallel
/// execution. Each `make(...)` mints a unique host and registers a handler for
/// it; `startLoading` routes by `request.url?.host`, which always reaches the
/// protocol (unlike `httpAdditionalHeaders`, whose visibility to a URLProtocol
/// is not guaranteed). No global mutable `handler` for parallel tests to race.
final class StubURLProtocol: URLProtocol {
    typealias Handler = @Sendable (URLRequest) -> (HTTPURLResponse, Data)

    /// Host → handler. Guarded so concurrent tests can register without a race.
    private static let handlers = OSAllocatedUnfairLock(initialState: [String: Handler]())

    /// An isolated `(session, credentials)` pair whose requests are served only
    /// by `handler`, keyed by a unique host. Use `creds`/`creds.baseURL` so the
    /// request actually targets that host.
    static func make(token: String = "tok", handler: @escaping Handler) -> (URLSession, ServerCredentials) {
        let host = "stub-\(UUID().uuidString.lowercased())"
        handlers.withLock { $0[host] = handler }
        let creds = ServerCredentials(baseURL: URL(string: "http://\(host):3333")!, token: token)
        return (session(), creds)
    }

    /// A handler-less stub session for tests that need a `URLSession` but never
    /// perform a request (bad-URL / empty-token guards). A stray request fails
    /// loudly rather than crashing the process via a force-unwrap.
    static func session() -> URLSession {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: cfg)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for r: URLRequest) -> URLRequest { r }

    override func startLoading() {
        let host = request.url?.host ?? ""
        guard let handler = Self.handlers.withLock({ $0[host] }) else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL))
            return
        }
        let (resp, data) = handler(request)
        client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
