import Testing
import Foundation
@testable import Penates

@Test func roundTripsCredentials() throws {
    let store = KeychainStore(backend: InMemoryKeychain())
    let creds = ServerCredentials(baseURL: URL(string: "http://mac.tailnet.ts.net:3333")!, token: "abc")
    try store.save(creds)
    #expect(store.load() == creds)
}

@Test func clearRemovesCredentials() throws {
    let store = KeychainStore(backend: InMemoryKeychain())
    try store.save(ServerCredentials(baseURL: URL(string: "http://x:3333")!, token: "t"))
    try store.clear()
    #expect(store.load() == nil)
}
