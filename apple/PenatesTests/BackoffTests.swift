import Testing
@testable import Penates

@Test func doublesAndCaps() {
    var b = Backoff(jitter: 0, rng: { 0.5 })       // no jitter
    #expect(b.next() == 1)
    #expect(b.next() == 2)
    #expect(b.next() == 4)
    #expect(b.next() == 8)
    #expect(b.next() == 16)
    #expect(b.next() == 20)   // capped
    #expect(b.next() == 20)
}
@Test func resetGoesBackToBase() {
    var b = Backoff(jitter: 0)
    _ = b.next(); _ = b.next()
    b.reset()
    #expect(b.next() == 1)
}
@Test func jitterStaysWithinBand() {
    var b = Backoff(jitter: 0.2, rng: { 1.0 })     // max positive jitter
    #expect(b.next() == 1.2)                        // 1 * (1 + 0.2)
}
