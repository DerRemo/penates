import SwiftUI

enum ConnectError: Error, Equatable { case badURL, unreachable, unauthorized }

@Observable @MainActor
final class AppSession {
    private(set) var credentials: ServerCredentials?
    private let store: CredentialStoring
    private let sessionFactory: (ServerCredentials) -> URLSession

    init(store: CredentialStoring = KeychainStore(),
         sessionFactory: @escaping (ServerCredentials) -> URLSession = { _ in .shared }) {
        self.store = store
        self.sessionFactory = sessionFactory
    }

    func restore() { credentials = store.load() }

    func connect(baseURL: String, token: String) async -> Result<Void, ConnectError> {
        let trimmedURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else { return .failure(.badURL) }
        guard let url = URL(string: trimmedURL), url.scheme != nil, url.host != nil else {
            return .failure(.badURL)
        }
        let creds = ServerCredentials(baseURL: url, token: trimmedToken)
        let client = APIClient(credentials: creds, session: sessionFactory(creds))
        do {
            _ = try await client.version()
            try? store.save(creds)
            credentials = creds
            return .success(())
        } catch APIError.unauthorized {
            return .failure(.unauthorized)
        } catch {
            return .failure(.unreachable)
        }
    }

    func disconnect() {
        try? store.clear()
        credentials = nil
    }
}
