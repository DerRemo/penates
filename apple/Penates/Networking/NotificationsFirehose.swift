import Foundation

enum FirehoseEvent: Equatable {
    case activity(name: String, Activity)
    case attention(name: String, Activity)
    case ended(name: String)
}

final class NotificationsFirehose {
    private let credentials: ServerCredentials
    private let session: URLSession
    init(credentials: ServerCredentials, session: URLSession = .shared) {
        self.credentials = credentials; self.session = session
    }

    // Reused across every decoded frame instead of allocating per event.
    private static let decoder = JSONDecoder()

    static func decode(_ data: Data) -> FirehoseEvent? {
        struct Frame: Decodable { let type: String; let name: String?; let activity: Activity? }
        guard let f = try? decoder.decode(Frame.self, from: data), let name = f.name else { return nil }
        switch f.type {
        case "session-activity":  return .activity(name: name, f.activity ?? .unknown)
        case "session-attention": return .attention(name: name, f.activity ?? .unknown)
        case "session-ended":     return .ended(name: name)
        default: return nil
        }
    }

    // One WS connection; firehose = every event, no subscribe message.
    func events() -> AsyncStream<FirehoseEvent> {
        AsyncStream { continuation in
            let url = credentials.webSocketURL(path: "/api/notifications/events")
            let task = session.webSocketTask(with: url, protocols: ["bearer.\(credentials.token)"])
            task.resume()
            func receive() {
                task.receive { result in
                    switch result {
                    case .success(let msg):
                        if case .string(let s) = msg, let e = Self.decode(Data(s.utf8)) { continuation.yield(e) }
                        if case .data(let d) = msg, let e = Self.decode(d) { continuation.yield(e) }
                        receive()
                    case .failure:
                        continuation.finish()
                    }
                }
            }
            receive()
            continuation.onTermination = { _ in task.cancel(with: .goingAway, reason: nil) }
        }
    }
}
