import SwiftUI

struct RootView: View {
    @State private var app = AppSession()
    var body: some View {
        Group {
            if app.credentials == nil { ConnectView() } else { AppTabs() }
        }
        .environment(app)
        .task { app.restore() }
    }
}
