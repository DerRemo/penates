import Foundation

struct Backoff {
    private let base, cap, jitter: Double
    private let multiplier: Double
    private let rng: () -> Double
    private var attempt = 0

    init(base: TimeInterval = 1, multiplier: Double = 2, cap: TimeInterval = 20,
         jitter: Double = 0.2, rng: @escaping () -> Double = { Double.random(in: 0...1) }) {
        self.base = base; self.multiplier = multiplier; self.cap = cap; self.jitter = jitter; self.rng = rng
    }

    mutating func next() -> TimeInterval {
        let raw = min(cap, base * pow(multiplier, Double(attempt)))
        attempt += 1
        guard jitter > 0 else { return raw }
        let delta = raw * jitter * (rng() * 2 - 1)   // ±jitter
        return raw + delta
    }
    mutating func reset() { attempt = 0 }
}
