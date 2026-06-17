import SwiftUI

struct StatusChip: View {
    let activity: Activity
    let dormant: Bool

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
        Image(systemName: symbol)
            .font(.caption2.weight(.bold))
            .foregroundStyle(tint)
            .padding(6)
            .background(.regularMaterial, in: Circle())   // neutral chip, not a color dot on the tinted card
            .accessibilityLabel(dormant ? "dormant" : activity.rawValue)
    }
}
