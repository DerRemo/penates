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

    /// Scales the color's brightness (HSB) by `factor`, clamped to [0, 1].
    /// Used to build the subtle top→bottom card gradient (Shortcuts-style sheen).
    func adjustingBrightness(_ factor: Double) -> Color {
        let ui = UIColor(self)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getHue(&h, saturation: &s, brightness: &b, alpha: &a) else { return self }
        return Color(hue: h, saturation: s, brightness: min(max(b * factor, 0), 1), opacity: a)
    }
}
