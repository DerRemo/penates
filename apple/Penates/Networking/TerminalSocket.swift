import Foundation

final class TerminalSocket {
    enum ReconnectDecision: Equatable { case retry, abort }

    static func decision(forCloseCode code: Int) -> ReconnectDecision {
        (code == 4001 || code == 4004) ? .abort : .retry
    }

    private let credentials: ServerCredentials
    private let session: URLSession
    private let name: String
    private var task: URLSessionWebSocketTask?
    private var backoff = Backoff()
    private var lastPong = Date()
    private var pingTimer: Timer?
    private var didConfirmAlive = false
    private var didNotifyClose = false
    var onBytes: ([UInt8]) -> Void = { _ in }
    /// Fired on the main thread when the connection is gone for good (no
    /// reconnect): 4004 = session ended, 4001 = auth rejected. Lets the UI
    /// surface a terminal-ended state instead of a frozen screen.
    var onClose: (Int) -> Void = { _ in }

    init(credentials: ServerCredentials, name: String, session: URLSession = .shared) {
        self.credentials = credentials
        self.name = name
        self.session = session
    }

    func connect() {
        let url = credentials.webSocketURL(
            path: "/api/terminal/\(name)",
            query: [URLQueryItem(name: "token", value: credentials.token)]
        )
        let t = session.webSocketTask(with: url, protocols: ["bearer.\(credentials.token)"])
        task = t
        t.resume()
        lastPong = Date()
        startHeartbeat()
        receive()
    }

    func send(_ out: TerminalOutbound) {
        task?.send(.data(out.jsonData())) { _ in }
    }

    func close() {
        pingTimer?.invalidate()
        pingTimer = nil
        task?.cancel(with: .goingAway, reason: nil)
    }

    private func startHeartbeat() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let self else { return }
            if Date().timeIntervalSince(self.lastPong) > 18 {
                self.reconnect()
                return
            }
            self.send(.ping)
        }
    }

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let msg):
                if !self.didConfirmAlive { self.didConfirmAlive = true; self.backoff.reset() }
                if let inbound = TerminalInbound.decode(msg) {
                    switch inbound {
                    case .bytes(let b): self.onBytes(b)
                    case .pong: self.lastPong = Date()
                    case .error: break
                    }
                }
                self.receive()
            case .failure:
                self.reconnect()
            }
        }
    }

    private func reconnect() {
        let code = task?.closeCode.rawValue ?? 1006
        pingTimer?.invalidate()
        pingTimer = nil
        didConfirmAlive = false
        guard Self.decision(forCloseCode: code) == .retry else {
            // Terminal close (session gone / auth rejected): notify the UI once.
            // reconnect() can run on the URLSession callback thread OR the main
            // (pingTimer) thread, so the once-guard is checked/set on main only
            // — keeps didNotifyClose race-free without a lock.
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.didNotifyClose else { return }
                self.didNotifyClose = true
                self.onClose(code)
            }
            return
        }
        let delay = backoff.next()
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.connect()
        }
    }
}
