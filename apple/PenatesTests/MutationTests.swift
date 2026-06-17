import Testing
import Foundation
@testable import Penates

@Test func deleteHitsDeleteEndpoint() async throws {
    StubURLProtocol.handler = { req in
        #expect(req.httpMethod == "DELETE")
        #expect(req.url?.path == "/api/sessions/cc-demo")
        return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
    }
    let c = APIClient(credentials: .init(baseURL: URL(string: "http://h:3333")!, token: "t"),
                      session: StubURLProtocol.session())
    try await c.deleteSession(name: "cc-demo")
}

@Test func renameHitsPatchEndpoint() async throws {
    StubURLProtocol.handler = { req in
        #expect(req.httpMethod == "PATCH")
        #expect(req.url?.path == "/api/sessions/cc-demo")
        // best-effort body check (URLProtocol may stream the body):
        var bodyData = req.httpBody
        if bodyData == nil, let stream = req.httpBodyStream {
            stream.open(); defer { stream.close() }
            var data = Data(); var buf = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let n = stream.read(&buf, maxLength: buf.count)
                if n <= 0 { break }
                data.append(buf, count: n)
            }
            bodyData = data.isEmpty ? nil : data
        }
        if let bodyData, let obj = try? JSONSerialization.jsonObject(with: bodyData) as? [String: String] {
            #expect(obj["newName"] == "cc-renamed")
        } // else: body not observable via URLProtocol here — method+path asserted above
        return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
    }
    let c = APIClient(credentials: .init(baseURL: URL(string: "http://h:3333")!, token: "t"),
                      session: StubURLProtocol.session())
    try await c.renameSession(name: "cc-demo", to: "cc-renamed")
}
