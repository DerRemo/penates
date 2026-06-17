// Mirror of public/clis.js — keep in sync
import Foundation

struct CLIVariant: Equatable, Hashable {
    let label: String
    let command: String
}

struct CLI: Identifiable, Equatable, Hashable {
    let id: String
    let label: String
    let binary: String
    let color: String
    let variants: [CLIVariant]
}

enum CLIRegistry {
    static let all: [CLI] = [
        CLI(
            id: "claude",
            label: "Claude",
            binary: "claude",
            color: "#d97757",
            variants: [
                CLIVariant(label: "Standard", command: "claude"),
                CLIVariant(label: "Auto", command: "claude --permission-mode auto"),
                CLIVariant(label: "Dangerous (skip permissions)", command: "claude --dangerously-skip-permissions"),
            ]
        ),
        CLI(
            id: "codex",
            label: "Codex",
            binary: "codex",
            color: "#10a37f",
            variants: [
                CLIVariant(label: "Standard", command: "codex"),
                CLIVariant(label: "Full-Auto", command: "codex --sandbox workspace-write --ask-for-approval on-request"),
                CLIVariant(label: "YOLO (bypass)", command: "codex --dangerously-bypass-approvals-and-sandbox"),
            ]
        ),
        CLI(
            id: "antigravity",
            label: "Antigravity",
            binary: "agy",
            color: "#4285F4",
            variants: [
                CLIVariant(label: "Standard", command: "agy"),
                CLIVariant(label: "Dangerous (skip permissions)", command: "agy --dangerously-skip-permissions"),
            ]
        ),
        CLI(
            id: "opencode",
            label: "opencode",
            binary: "opencode",
            color: "#7c7575",
            variants: [
                CLIVariant(label: "Standard", command: "opencode"),
            ]
        ),
    ]

    /// Mirror of cliFromCommand: trim, take first whitespace-separated token,
    /// strip any path prefix (basename), match against each CLI's binary.
    static func from(command: String) -> CLI? {
        let trimmed = command.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty,
              let firstToken = trimmed.split(whereSeparator: { $0.isWhitespace }).first.map(String.init)
        else { return nil }
        let bin = (firstToken as NSString).lastPathComponent
        return all.first { $0.binary == bin }
    }
}
