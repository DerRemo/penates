import SwiftUI

struct SessionCard: View {
    let session: Session
    var onKill: () -> Void
    var onRename: () -> Void
    var onTogglePin: () -> Void
    var onToggleMute: () -> Void

    var body: some View {
        let tint = Color.cli(session.command)
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                // Status now lives top-left as a backgroundless tinted glyph,
                // level with the 30pt "…" circle on the right.
                StatusChip(activity: session.activity,
                           dormant: session.status != .running,
                           plain: true, diameter: 30)
                Spacer()
                Menu {
                    actionButtons
                } label: {
                    // Shortcuts-style: white dots on a translucent circle. The
                    // fixed 30pt circle keeps the glyph level with the status
                    // circle and stable on tap (no jump).
                    Image(systemName: "ellipsis")
                        .font(.footnote.weight(.bold))
                        .frame(width: 30, height: 30)
                        .background(.black.opacity(0.18), in: Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
            HStack(spacing: 5) {
                Text(session.displayName).font(.subheadline.weight(.semibold)).lineLimit(2)
                Spacer(minLength: 4)
                // No pin glyph here — pinned sessions live in their own
                // "Angeheftet" section, so the indicator would be redundant.
                if session.muted {
                    Image(systemName: "bell.slash.fill").font(.caption2).opacity(0.85)
                }
                // Status moved to the top-left circle, so no chip here anymore.
            }
        }
        .padding(14)
        .frame(minHeight: 92, alignment: .topLeading)
        .foregroundStyle(.white)
        // Shortcuts-style depth: a subtle top→bottom brightness gradient on the
        // CLI tint plus a soft tinted shadow lifting the card off the background.
        .background(
            LinearGradient(
                colors: [tint.adjustingBrightness(1.10), tint.adjustingBrightness(0.84)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            .opacity(session.status == .running ? 1 : 0.4),
            in: RoundedRectangle(cornerRadius: 18)
        )
        .shadow(color: tint.opacity(session.status == .running ? 0.22 : 0.07), radius: 9, y: 4)
        .contentShape(RoundedRectangle(cornerRadius: 18))
        // Long-press anywhere on the card surfaces the same actions as "…".
        .contextMenu { actionButtons }
    }

    /// The session actions, shared by the "…" Menu and the card's context menu.
    @ViewBuilder private var actionButtons: some View {
        Button("Umbenennen", systemImage: "pencil", action: onRename)
        Button(session.pinned ? "Lösen" : "Anheften",
               systemImage: session.pinned ? "pin.slash" : "pin",
               action: onTogglePin)
        Button(session.muted ? "Stummschaltung aufheben" : "Stummschalten",
               systemImage: session.muted ? "bell" : "bell.slash",
               action: onToggleMute)
        Divider()
        Button("Beenden", systemImage: "trash", role: .destructive, action: onKill)
    }
}
