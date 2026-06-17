import LocalAuthentication

enum BiometricGate {
    static func shouldPrompt(enabled: Bool, alreadyUnlocked: Bool) -> Bool {
        enabled && !alreadyUnlocked
    }

    static func authenticate(reason: String) async -> Bool {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { return false }
        return (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}
