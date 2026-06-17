import SwiftUI

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard s.count == 6, let v = UInt64(s, radix: 16) else {
            self = .gray
            return
        }
        self.init(.sRGB,
                  red: Double((v >> 16) & 0xff) / 255,
                  green: Double((v >> 8) & 0xff) / 255,
                  blue: Double(v & 0xff) / 255)
    }
    static func cli(_ command: String?) -> Color {
        guard let command, let cli = CLIRegistry.from(command: command) else { return .gray }
        return Color(hex: cli.color)
    }
}
