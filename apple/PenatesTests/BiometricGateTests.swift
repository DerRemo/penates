import Testing
@testable import Penates

@Test func gateOpenWhenDisabled() {
    #expect(BiometricGate.shouldPrompt(enabled: false, alreadyUnlocked: false, deviceCapable: true) == false)
}
@Test func gatePromptsWhenEnabledAndLocked() {
    #expect(BiometricGate.shouldPrompt(enabled: true, alreadyUnlocked: false, deviceCapable: true) == true)
}
@Test func gateSkipsWhenAlreadyUnlocked() {
    #expect(BiometricGate.shouldPrompt(enabled: true, alreadyUnlocked: true, deviceCapable: true) == false)
}
@Test func gateSkipsWhenDeviceCannotAuthenticate() {
    // Anti-trap: a bare simulator with no biometrics/passcode could never
    // satisfy the prompt, so we must not gate or the user is locked out.
    #expect(BiometricGate.shouldPrompt(enabled: true, alreadyUnlocked: false, deviceCapable: false) == false)
}
