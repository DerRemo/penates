import Testing
@testable import Penates

@Test func resolvesClaudeFromCommand() {
    #expect(CLIRegistry.from(command: "claude --continue")?.id == "claude")
}

@Test func resolvesCodexFromCommand() {
    #expect(CLIRegistry.from(command: "codex resume --last")?.id == "codex")
}

@Test func resolvesOpencodeAndAgy() {
    #expect(CLIRegistry.from(command: "opencode")?.id == "opencode")
    #expect(CLIRegistry.from(command: "agy --continue")?.id == "antigravity")
}

@Test func unknownCommandReturnsNil() {
    #expect(CLIRegistry.from(command: "vim") == nil)
}

@Test func everyCLIHasAtLeastOneVariant() {
    for cli in CLIRegistry.all { #expect(!cli.variants.isEmpty) }
}
