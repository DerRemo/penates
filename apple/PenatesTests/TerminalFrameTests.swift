import Testing
import Foundation
@testable import Penates

@Test func encodesInput() throws {
    let obj = try JSONSerialization.jsonObject(with: TerminalOutbound.input("ls\r").jsonData()) as! [String: Any]
    #expect(obj["type"] as? String == "input")
    #expect(obj["data"] as? String == "ls\r")
}
@Test func encodesResize() throws {
    let obj = try JSONSerialization.jsonObject(with: TerminalOutbound.resize(cols: 80, rows: 24).jsonData()) as! [String: Any]
    #expect(obj["cols"] as? Int == 80 && obj["rows"] as? Int == 24)
}
@Test func decodesBinaryAsBytes() {
    let msg = URLSessionWebSocketTask.Message.data(Data([0x68, 0x69]))
    #expect(TerminalInbound.decode(msg) == .bytes([0x68, 0x69]))
}
@Test func decodesPong() {
    let msg = URLSessionWebSocketTask.Message.string("{\"type\":\"pong\"}")
    #expect(TerminalInbound.decode(msg) == .pong)
}
