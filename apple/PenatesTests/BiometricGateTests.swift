import Testing
@testable import Penates

@Test func gateOpenWhenDisabled() {
    #expect(BiometricGate.shouldPrompt(enabled: false, alreadyUnlocked: false) == false)
}
@Test func gatePromptsWhenEnabledAndLocked() {
    #expect(BiometricGate.shouldPrompt(enabled: true, alreadyUnlocked: false) == true)
}
@Test func gateSkipsWhenAlreadyUnlocked() {
    #expect(BiometricGate.shouldPrompt(enabled: true, alreadyUnlocked: true) == false)
}
