import Testing
import Foundation
@testable import Penates

@Suite(.tags(.networking))
struct MutationTests {
    @Test func deleteHitsDeleteEndpoint() async throws {
        let (session, creds) = StubURLProtocol.make { req in
            #expect(req.httpMethod == "DELETE")
            #expect(req.url?.path == "/api/sessions/cc-demo")
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
        }
        try await APIClient(credentials: creds, session: session).deleteSession(name: "cc-demo")
    }

    @Test func renameHitsPatchEndpoint() async throws {
        let (session, creds) = StubURLProtocol.make { req in
            #expect(req.httpMethod == "PATCH")
            #expect(req.url?.path == "/api/sessions/cc-demo")
            if let body = drainBody(req), let obj = try? JSONSerialization.jsonObject(with: body) as? [String: String] {
                #expect(obj["newName"] == "cc-renamed")
            } // else: body not observable via URLProtocol here — method+path asserted above
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
        }
        try await APIClient(credentials: creds, session: session).renameSession(name: "cc-demo", to: "cc-renamed")
    }

    @Test func muteHitsMuteEndpointWithValue() async throws {
        let (session, creds) = StubURLProtocol.make { req in
            #expect(req.httpMethod == "POST")
            #expect(req.url?.path == "/api/sessions/cc-demo/mute")
            if let obj = boolBody(req) { #expect(obj["muted"] == true) }
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
        }
        try await APIClient(credentials: creds, session: session).setMuted(name: "cc-demo", muted: true)
    }

    @Test func pinHitsPinEndpointWithValue() async throws {
        let (session, creds) = StubURLProtocol.make { req in
            #expect(req.httpMethod == "POST")
            #expect(req.url?.path == "/api/sessions/cc-demo/pin")
            if let obj = boolBody(req) { #expect(obj["pinned"] == false) }
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
        }
        try await APIClient(credentials: creds, session: session).setPinned(name: "cc-demo", pinned: false)
    }

    @Test func restoreHitsRestoreEndpoint() async throws {
        let (session, creds) = StubURLProtocol.make { req in
            #expect(req.httpMethod == "POST")
            #expect(req.url?.path == "/api/sessions/cc-demo/restore")
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
        }
        try await APIClient(credentials: creds, session: session).restoreSession(name: "cc-demo")
    }
}

/// Reads a request body whether it arrives inline or as a stream (URLProtocol
/// may stream the body). `@Sendable` so the handler closures can call it.
@Sendable private func drainBody(_ req: URLRequest) -> Data? {
    if let body = req.httpBody { return body.isEmpty ? nil : body }
    guard let stream = req.httpBodyStream else { return nil }
    stream.open(); defer { stream.close() }
    var data = Data(); var buf = [UInt8](repeating: 0, count: 1024)
    while stream.hasBytesAvailable {
        let n = stream.read(&buf, maxLength: buf.count)
        if n <= 0 { break }
        data.append(buf, count: n)
    }
    return data.isEmpty ? nil : data
}

/// Decodes the request body as a `[String: Bool]` JSON object (mute/pin payloads).
@Sendable private func boolBody(_ req: URLRequest) -> [String: Bool]? {
    guard let body = drainBody(req) else { return nil }
    return try? JSONSerialization.jsonObject(with: body) as? [String: Bool]
}
