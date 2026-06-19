import Testing
@testable import Penates

@Test func acceptsValidNames() {
    #expect(SessionName.isValid("my-session_1"))
    #expect(SessionName.isValid("a b.c"))
}
@Test func rejectsInvalid() {
    #expect(SessionName.isValid("") == false)
    #expect(SessionName.isValid("has/slash") == false)
    #expect(SessionName.isValid(String(repeating: "x", count: 65)) == false)
}
