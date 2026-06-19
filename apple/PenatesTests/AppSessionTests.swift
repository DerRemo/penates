import Testing
import Foundation
@testable import Penates

// MARK: - Test Helper

extension Result {
    var isSuccess: Bool {
        if case .success = self { true } else { false }
    }
}

// MARK: - Tests

@MainActor
@Test(.tags(.networking)) func connectStoresCredentialsOnSuccess() async {
    let (session, creds) = StubURLProtocol.make { req in
        let body = try! JSONSerialization.data(withJSONObject: ["current": "1.0.1"])
        return (HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, body)
    }
    let store = KeychainStore(backend: InMemoryKeychain())
    let app = AppSession(store: store, sessionFactory: { _ in session })
    let result = await app.connect(baseURL: creds.baseURL.absoluteString, token: "tok")
    #expect(result.isSuccess)
    #expect(app.credentials?.token == "tok")
    #expect(store.load()?.token == "tok")
}

@MainActor
@Test func connectRejectsBadURL() async {
    let app = AppSession(store: KeychainStore(backend: InMemoryKeychain()),
                         sessionFactory: { _ in StubURLProtocol.session() })
    let result = await app.connect(baseURL: "not a url", token: "t")
    guard case .failure(let e) = result else { Issue.record("expected failure"); return }
    #expect(e == .badURL)
}

@MainActor
@Test func connectRejectsEmptyToken() async {
    let app = AppSession(store: KeychainStore(backend: InMemoryKeychain()),
                         sessionFactory: { _ in StubURLProtocol.session() })
    let result = await app.connect(baseURL: "http://mac:3333", token: "   ")
    guard case .failure(let e) = result else { Issue.record("expected failure"); return }
    #expect(e == .badURL)
}
