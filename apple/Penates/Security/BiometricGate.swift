import LocalAuthentication

enum BiometricGate {
    /// Pure gate decision. We only prompt when the feature is enabled, the
    /// session is still locked, AND the device can actually evaluate the
    /// policy. The `deviceCapable` guard prevents a permanent lock-out on
    /// devices/simulators with no enrolled biometrics and no passcode, where
    /// `evaluatePolicy` could never succeed and the lock screen would trap.
    static func shouldPrompt(enabled: Bool, alreadyUnlocked: Bool, deviceCapable: Bool) -> Bool {
        enabled && !alreadyUnlocked && deviceCapable
    }

    /// Whether the device can evaluate device-owner authentication at all
    /// (biometrics or passcode). Returns `false` on a bare simulator with
    /// neither enrolled — callers must then skip the gate rather than trap.
    static func canAuthenticate(_ context: LAContext = LAContext()) -> Bool {
        var err: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
    }

    static func authenticate(reason: String) async -> Bool {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { return false }
        return (try? await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}
