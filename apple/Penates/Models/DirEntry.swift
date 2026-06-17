import Foundation

struct DirEntry: Decodable, Identifiable {
    var id: String { path }
    let name: String
    let path: String
    let isDir: Bool

    enum CodingKeys: String, CodingKey {
        case name, path, isDir
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name  = try c.decode(String.self, forKey: .name)
        path  = try c.decode(String.self, forKey: .path)
        // The /api/browse endpoint only returns directories and has no isDir field.
        // Default to true so browse entries work correctly.
        isDir = (try? c.decodeIfPresent(Bool.self, forKey: .isDir)) ?? true
    }
}
