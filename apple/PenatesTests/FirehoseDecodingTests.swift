import Testing
import Foundation
@testable import Penates

@Test func decodesActivity() {
    let d = #"{"type":"session-activity","name":"cc-a","activity":"working","at":1}"#.data(using: .utf8)!
    #expect(NotificationsFirehose.decode(d) == .activity(name: "cc-a", .working))
}
@Test func decodesEnded() {
    let d = #"{"type":"session-ended","name":"cc-a","at":2}"#.data(using: .utf8)!
    #expect(NotificationsFirehose.decode(d) == .ended(name: "cc-a"))
}
@Test func ignoresUnknownTypes() {
    let d = #"{"type":"presence","deviceId":"x"}"#.data(using: .utf8)!
    #expect(NotificationsFirehose.decode(d) == nil)
}
