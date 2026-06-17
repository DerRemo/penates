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
