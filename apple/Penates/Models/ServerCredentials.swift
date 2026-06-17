import Foundation

struct ServerCredentials: Equatable, Codable {
    let baseURL: URL
    let token: String
}
