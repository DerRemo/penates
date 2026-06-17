import SwiftUI

struct SessionCard: View {
    let session: Session
    var onKill: () -> Void
    var onRename: () -> Void

    var body: some View {
        let tint = Color.cli(session.command)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "terminal.fill").font(.title3)
                Spacer()
                Menu {
                    Button("Umbenennen", systemImage: "pencil", action: onRename)
                    Button("Beenden", systemImage: "trash", role: .destructive, action: onKill)
                } label: {
                    Image(systemName: "ellipsis").frame(width: 44, height: 44, alignment: .topTrailing)
                }
            }
            Spacer()
            HStack {
                Text(session.name).font(.headline).lineLimit(2)
                Spacer()
                StatusChip(activity: session.activity, dormant: session.status != .running)
            }
        }
        .padding()
        .frame(minHeight: 110, alignment: .topLeading)
        .foregroundStyle(.white)
        .background(tint.opacity(session.status == .running ? 1 : 0.45),
                    in: RoundedRectangle(cornerRadius: 18))
        .contentShape(RoundedRectangle(cornerRadius: 18))
    }
}
