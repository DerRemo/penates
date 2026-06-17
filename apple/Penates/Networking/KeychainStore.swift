import Foundation
import Security

protocol CredentialStoring {
    func save(_ c: ServerCredentials) throws
    func load() -> ServerCredentials?
    func clear() throws
}

// Thin seam over the Keychain so logic is unit-testable.
protocol KeychainBackend {
    func set(_ data: Data, account: String) throws
    func get(account: String) -> Data?
    func remove(account: String) throws
}

final class InMemoryKeychain: KeychainBackend {
    private var store: [String: Data] = [:]
    func set(_ data: Data, account: String) throws { store[account] = data }
    func get(account: String) -> Data? { store[account] }
    func remove(account: String) throws { store[account] = nil }
}

final class KeychainStore: CredentialStoring {
    private let backend: KeychainBackend
    private let account = "server-credentials"
    init(backend: KeychainBackend = SystemKeychain()) { self.backend = backend }

    func save(_ c: ServerCredentials) throws {
        try backend.set(try JSONEncoder().encode(c), account: account)
    }
    func load() -> ServerCredentials? {
        guard let data = backend.get(account: account) else { return nil }
        return try? JSONDecoder().decode(ServerCredentials.self, from: data)
    }
    func clear() throws { try backend.remove(account: account) }
}

struct SystemKeychain: KeychainBackend {
    private let service = "dev.penates.app"
    func set(_ data: Data, account: String) throws {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account]
        SecItemDelete(base as CFDictionary)
        var add = base; add[kSecValueData as String] = data
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }
    func get(account: String) -> Data? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: account,
                                kSecReturnData as String: true]
        var out: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }
    func remove(account: String) throws {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: account]
        let status = SecItemDelete(q as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError.status(status) }
    }
}

enum KeychainError: Error { case status(OSStatus) }
