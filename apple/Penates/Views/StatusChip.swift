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
    // German VoiceOver label, matching the rest of the (German) UI rather than
    // reading the raw English enum case.
    private var accessibilityText: String {
        if dormant { return "Ruhend" }
        return switch activity {
            case .working: "Arbeitet"
            case .waiting: "Wartet"
            case .idle:    "Bereit"
            case .unknown: "Unbekannt"
        }
    }
    // Sized variant scales the glyph to fill the fixed frame; the default uses a
    // caption glyph. Resolved as a value (not a view branch) so the two paths
    // share one Image and keep a stable structural identity.
    private var glyphFont: Font {
        if let diameter { .system(size: diameter * 0.62, weight: .bold) }
        else { .caption2.weight(.bold) }
    }

    var body: some View {
        // `.frame(width:height:)` with a nil diameter is a no-op, so a single
        // Image covers both the sized and unsized cases.
        Image(systemName: symbol)
            .font(glyphFont)
            .foregroundStyle(tint)
            .frame(width: diameter, height: diameter)
            .modifier(ChipBackground(plain: plain))
            .accessibilityLabel(accessibilityText)
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
