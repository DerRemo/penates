import Testing
import Foundation
@testable import Penates

private func client(_ creds: ServerCredentials = .init(baseURL: URL(string: "http://h:3333")!, token: "tok")) -> APIClient {
    APIClient(credentials: creds, session: StubURLProtocol.session())
}

@Test func versionDecodesAndSendsBearer() async throws {
    StubURLProtocol.handler = { req in
        #expect(req.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
        #expect(req.url?.path == "/api/version")
        let body = try! JSONSerialization.data(withJSONObject: ["version": "1.0.1"])
        return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, body)
    }
    let info = try await client().version()
    #expect(info.version == "1.0.1")
}

@Test func unauthorizedMapsToError() async {
    StubURLProtocol.handler = { req in
        (HTTPURLResponse(url: req.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
    }
    await #expect(throws: APIError.unauthorized) { _ = try await client().version() }
}
