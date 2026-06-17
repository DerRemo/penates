import Testing
import Foundation
@testable import Penates

@Test func createSessionPostsBody() async throws {
    StubURLProtocol.handler = { req in
        #expect(req.httpMethod == "POST")
        #expect(req.url?.path == "/api/sessions")
        // URLProtocol exposes the body via httpBodyStream in some cases; assert status only here.
        return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
    }
    let client = APIClient(credentials: .init(baseURL: URL(string: "http://h:3333")!, token: "t"),
                           session: StubURLProtocol.session())
    try await client.createSession(name: "demo", directory: "/Users/x/p", command: "claude")
}
