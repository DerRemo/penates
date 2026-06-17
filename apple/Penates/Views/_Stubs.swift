import SwiftUI
// TEMP stubs — replaced by their real tasks (TerminalScreen=Task14, NewSessionView=Task17, SettingsView=Task19).
struct TerminalScreen: View { let session: Session; var body: some View { Text("terminal: \(session.name)") } }
struct SettingsView: View { var body: some View { Text("settings") } }
struct NewSessionView: View { var onCreated: () -> Void; var body: some View { Text("new session") } }
