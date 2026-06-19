import Foundation

/// Terminal WebSocket with heartbeat + reconnect.
///
/// `@MainActor`-isolated: every piece of mutable state (`task`, `lastPong`,
/// `backoff`, the `didConfirmAlive`/`didNotifyClose` guards) is touched only on
/// the main actor, so there is no cross-thread race between the receive loop and
/// the heartbeat. The receive loop and heartbeat are structured `Task`s using
/// `URLSessionWebSocketTask.receive()` / `Task.sleep` instead of completion
/// handlers + `Timer`, so cancellation (close / reconnect) is deterministic.
@MainActor
final class TerminalSocket {
    enum ReconnectDecision: Equatable { case retry, abort }

    /// Pure policy — `nonisolated` so unit tests (and any thread) can call it
    /// without hopping onto the main actor.
    nonisolated static func decision(forCloseCode code: Int) -> ReconnectDecision {
        (code == 4001 || code == 4004) ? .abort : .retry
    }

    private let credentials: ServerCredentials
    private let session: URLSession
    private let name: String
    private var task: URLSessionWebSocketTask?
    private var backoff = Backoff()
    private var lastPong = Date.now
    private var didConfirmAlive = false
    private var didNotifyClose = false
    private var heartbeatTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    var onBytes: ([UInt8]) -> Void = { _ in }
    /// Fired on the main actor when the connection is gone for good (no
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
        lastPong = Date.now
        startHeartbeat()
        startReceiveLoop(on: t)
    }

    func send(_ out: TerminalOutbound) {
        task?.send(.data(out.jsonData())) { _ in }
    }

    func close() {
        heartbeatTask?.cancel(); heartbeatTask = nil
        receiveTask?.cancel(); receiveTask = nil
        reconnectTask?.cancel(); reconnectTask = nil
        task?.cancel(with: .goingAway, reason: nil)
    }

    private func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard let self, !Task.isCancelled else { return }
                if Date.now.timeIntervalSince(self.lastPong) > 18 {
                    self.reconnect()
                    return
                }
                self.send(.ping)
            }
        }
    }

    private func startReceiveLoop(on socket: URLSessionWebSocketTask) {
        // Cancel any prior loop before reassigning the handle (mirrors
        // startHeartbeat). The current call graph always cancels via reconnect()
        // first, but overwriting a live Task handle would orphan it — defensive
        // against a future second caller of connect().
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let msg = try await socket.receive()
                    guard let self, !Task.isCancelled else { return }
                    if !self.didConfirmAlive { self.didConfirmAlive = true; self.backoff.reset() }
                    if let inbound = TerminalInbound.decode(msg) {
                        switch inbound {
                        case .bytes(let b): self.onBytes(b)
                        case .pong: self.lastPong = Date.now
                        case .error: break
                        }
                    }
                } catch {
                    guard let self, !Task.isCancelled else { return }
                    self.reconnect()
                    return
                }
            }
        }
    }

    private func reconnect() {
        let code = task?.closeCode.rawValue ?? 1006
        heartbeatTask?.cancel(); heartbeatTask = nil
        receiveTask?.cancel(); receiveTask = nil
        didConfirmAlive = false
        guard Self.decision(forCloseCode: code) == .retry else {
            // Terminal close (session gone / auth rejected): notify the UI once.
            // Everything is on the main actor now, so the once-guard needs no lock.
            if !didNotifyClose {
                didNotifyClose = true
                onClose(code)
            }
            return
        }
        let delay = backoff.next()
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !Task.isCancelled else { return }
            self.connect()
        }
    }
}
