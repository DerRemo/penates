import SwiftUI

/// One titled group of session cards in the overview grid (Angeheftet / Aktiv /
/// Ruhend). Renders nothing when empty. Extracted from `OverviewView` so the
/// grid body stays a flat list of sections rather than an inline `@ViewBuilder`
/// helper.
struct SessionSection: View {
    let title: String
    let items: [Session]
    /// Drives the per-card kill-confirmation popover. Anchoring requires a
    /// per-card `isPresented` binding (a single `popover(item:)` would fire on
    /// every card at once), so the optional lives in the parent and is compared
    /// by id here.
    @Binding var killTarget: Session?
    var onRename: (Session) -> Void
    var onTogglePin: (Session) -> Void
    var onToggleMute: (Session) -> Void
    var onConfirmKill: (Session) -> Void

    var body: some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { s in
                    NavigationLink(value: s) {
                        SessionCard(session: s,
                                    onKill: { killTarget = s },
                                    onRename: { onRename(s) },
                                    onTogglePin: { onTogglePin(s) },
                                    onToggleMute: { onToggleMute(s) })
                            .popover(isPresented: Binding(
                                get: { killTarget?.id == s.id },
                                set: { if !$0 { killTarget = nil } }
                            )) {
                                KillConfirmPopover(
                                    name: s.displayName,
                                    onConfirm: { killTarget = nil; onConfirmKill(s) },
                                    onCancel: { killTarget = nil }
                                )
                                .presentationCompactAdaptation(.popover)
                            }
                    }
                    .buttonStyle(.plain)
                }
            } header: {
                HStack {
                    Text(title).font(.subheadline.bold()).foregroundStyle(.secondary)
                    Spacer()
                }
            }
        }
    }
}

/// Compact kill confirmation shown as a popover bubble anchored to the card.
private struct KillConfirmPopover: View {
    let name: String
    var onConfirm: () -> Void
    var onCancel: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Session „\(name)“ beenden?")
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.center)
            Button("Beenden", role: .destructive, action: onConfirm)
                .buttonStyle(.borderedProminent)
            Button("Abbrechen", role: .cancel, action: onCancel)
        }
        .padding()
        .frame(minWidth: 240)
    }
}
