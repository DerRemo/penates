import Testing
@testable import Penates

@Test func abortsOnAuthAndGone() {
    #expect(TerminalSocket.decision(forCloseCode: 4001) == .abort)
    #expect(TerminalSocket.decision(forCloseCode: 4004) == .abort)
}
@Test func retriesOnTransientClose() {
    #expect(TerminalSocket.decision(forCloseCode: 1006) == .retry)
    #expect(TerminalSocket.decision(forCloseCode: 1000) == .retry)
}
