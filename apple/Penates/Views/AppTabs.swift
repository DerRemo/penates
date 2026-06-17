import SwiftUI

struct AppTabs: View {
    var body: some View {
        TabView {
            Tab("Overview", systemImage: "square.grid.2x2") { OverviewView() }
            Tab("Projects", systemImage: "folder") { ComingSoonView(title: "Projects", systemImage: "folder") }
            Tab("Usage", systemImage: "chart.bar") { ComingSoonView(title: "Usage", systemImage: "chart.bar") }
            Tab("Board", systemImage: "rectangle.split.3x1") { ComingSoonView(title: "Board", systemImage: "rectangle.split.3x1") }
        }
        .tabViewStyle(.sidebarAdaptable)
    }
}
