import SwiftUI

struct ComingSoonView: View {
    let title: String
    let systemImage: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text("Kommt in einer späteren Version.")
        }
    }
}
