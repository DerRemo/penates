import SwiftUI

struct StatusChip: View {
    let activity: Activity
    let dormant: Bool
    // `plain` drops the material chip background (e.g. when sitting directly on
    // the tinted card); `diameter` sizes the glyph into a fixed circle so it
    // lines up with the 30pt "…" menu button.
    var plain: Bool = false
    var diameter: CGFloat? = nil

    private var symbol: String {
        if dormant { return "moon.zzz.fill" }
        return switch activity {
            case .working: "bolt.fill"
            case .waiting: "hourglass"
            case .idle:    "checkmark.circle.fill"
            case .unknown: "circle.dashed"
        }
    }
    private var tint: Color {
        if dormant { return .secondary }
        return switch activity {
            case .working: .green
            case .waiting: .orange
            case .idle:    .blue
            case .unknown: .secondary
        }
    }

    var body: some View {
        if let diameter {
            // Sized variant: scale the glyph to fill the fixed frame nicely.
            Image(systemName: symbol)
                .font(.system(size: diameter * 0.62, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: diameter, height: diameter)
                .modifier(ChipBackground(plain: plain))
                .accessibilityLabel(dormant ? "dormant" : activity.rawValue)
        } else {
            Image(systemName: symbol)
                .font(.caption2.weight(.bold))
                .foregroundStyle(tint)
                .modifier(ChipBackground(plain: plain))
                .accessibilityLabel(dormant ? "dormant" : activity.rawValue)
        }
    }
}

/// Adds the material chip background + padding unless `plain` is set, in which
/// case the tinted glyph renders bare (used on the tinted session card).
private struct ChipBackground: ViewModifier {
    let plain: Bool
    func body(content: Content) -> some View {
        if plain {
            content
        } else {
            content
                .padding(6)
                .background(.regularMaterial, in: Circle())   // neutral chip, not a color dot on the tinted card
        }
    }
}
