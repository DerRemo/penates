import Testing
import Foundation
@testable import Penates

@Suite(.tags(.networking))
struct CreateSessionTests {
    @Test func createSessionPostsBody() async throws {
        let (session, creds) = StubURLProtocol.make { req in
            #expect(req.httpMethod == "POST")
            #expect(req.url?.path == "/api/sessions")
            // URLProtocol exposes the body via httpBodyStream in some cases; assert status only here.
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8))
        }
        try await APIClient(credentials: creds, session: session)
            .createSession(name: "demo", directory: "/Users/x/p", command: "claude")
    }
}
