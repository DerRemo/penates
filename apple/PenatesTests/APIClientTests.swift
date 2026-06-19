import Testing
import Foundation
@testable import Penates

@Suite(.tags(.networking))
struct APIClientTests {
    @Test func versionDecodesAndSendsBearer() async throws {
        let (session, creds) = StubURLProtocol.make { req in
            #expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
            #expect(req.url?.path == "/api/version")
            let body = try! JSONSerialization.data(withJSONObject: ["current": "1.0.1"])
            return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, body)
        }
        let info = try await APIClient(credentials: creds, session: session).version()
        #expect(info.current == "1.0.1")
    }

    @Test func unauthorizedMapsToError() async {
        let (session, creds) = StubURLProtocol.make { req in
            (HTTPURLResponse(url: req.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }
        await #expect(throws: APIError.unauthorized) {
            _ = try await APIClient(credentials: creds, session: session).version()
        }
    }
}
