import Foundation

enum TerminalOutbound {
    case input(String), resize(cols: Int, rows: Int), ping
    func jsonData() -> Data {
        let obj: [String: Any] = switch self {
            case .input(let d): ["type": "input", "data": d]
            case .resize(let c, let r): ["type": "resize", "cols": c, "rows": r]
            case .ping: ["type": "ping"]
        }
        return try! JSONSerialization.data(withJSONObject: obj)
    }
}

enum TerminalInbound: Equatable {
    case bytes([UInt8]), pong, error(String)
    static func decode(_ message: URLSessionWebSocketTask.Message) -> TerminalInbound? {
        switch message {
        case .data(let d): return .bytes([UInt8](d))
        case .string(let s):
            guard let obj = try? JSONSerialization.jsonObject(with: Data(s.utf8)) as? [String: Any],
                  let type = obj["type"] as? String else { return nil }
            if type == "pong" { return .pong }
            if type == "error" { return .error(obj["message"] as? String ?? "error") }
            return nil
        @unknown default: return nil
        }
    }
}
