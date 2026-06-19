import SwiftUI

// MARK: - NewSessionView

struct NewSessionView: View {
    var onCreated: () -> Void

    @Environment(AppSession.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var sessionName = ""
    @State private var selectedDirectory = ""
    @State private var selectedCLI: CLI = CLIRegistry.all[0]
    @State private var selectedVariant: CLIVariant = CLIRegistry.all[0].variants[0]

    // Directory picker state
    @State private var recentDirs: [String] = []
    @State private var browseStack: [BrowsePage] = []   // navigation stack for browse
    @State private var isLoadingDirs = false

    // Create state
    @State private var isCreating = false
    @State private var errorMessage: String? = nil

    private var client: APIClient? {
        app.credentials.map { APIClient(credentials: $0) }
    }

    private var isNameValid: Bool { SessionName.isValid(sessionName) }
    private var isDirectoryChosen: Bool { !selectedDirectory.isEmpty }
    private var canCreate: Bool { isNameValid && isDirectoryChosen && !isCreating }

    var body: some View {
        NavigationStack {
            Form {
                nameSection
                directorySection
                cliSection
            }
            .navigationTitle("New Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Create") { create() }
                        .bold()
                        .disabled(!canCreate)
                }
            }
            .disabled(isCreating)
            .task { await loadInitialDirs() }
        }
    }

    // MARK: - Sections

    @ViewBuilder private var nameSection: some View {
        Section("Session Name") {
            TextField("e.g. my-project", text: $sessionName)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !sessionName.isEmpty && !isNameValid {
                Label("Letters, numbers, -, _, . and spaces only (max. 64 characters)", systemImage: "exclamationmark.circle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    @ViewBuilder private var directorySection: some View {
        Section("Directory") {
            if isLoadingDirs {
                HStack { ProgressView(); Text("Loading…").foregroundStyle(.secondary) }
            }

            // Recent dirs quick-pick
            if !recentDirs.isEmpty {
                DisclosureGroup("Recent") {
                    ForEach(recentDirs, id: \.self) { dir in
                        Button {
                            selectedDirectory = dir
                        } label: {
                            HStack {
                                Image(systemName: "clock.arrow.circlepath")
                                    .foregroundStyle(.secondary)
                                Text(abbreviatePath(dir))
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                Spacer()
                                if dir == selectedDirectory {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.teal)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            // Browse navigation
            DisclosureGroup("Browse") {
                browsePager
            }

            // Chosen path display
            if !selectedDirectory.isEmpty {
                HStack {
                    Image(systemName: "folder.fill").foregroundStyle(.teal)
                    Text(abbreviatePath(selectedDirectory))
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .font(.callout)
                        .foregroundStyle(.primary)
                }
            }
        }
    }

    @ViewBuilder private var browsePager: some View {
        // Back button if we've navigated inside
        if !browseStack.isEmpty {
            Button {
                browseStack.removeLast()
            } label: {
                Label("Back", systemImage: "chevron.left")
                    .font(.subheadline)
            }
        }

        let page = browseStack.last
        let entries = page?.entries ?? []
        let loading = page?.isLoading ?? false

        if loading {
            HStack { ProgressView(); Text("Loading…").foregroundStyle(.secondary) }
        } else if entries.isEmpty && page != nil {
            Text("No subfolders")
                .foregroundStyle(.secondary)
                .font(.caption)
        } else {
            ForEach(entries) { entry in
                Button {
                    selectOrNavigate(entry)
                } label: {
                    HStack {
                        Image(systemName: entry.isDir ? "folder" : "doc")
                            .foregroundStyle(.secondary)
                        Text(entry.name)
                            .lineLimit(1)
                        Spacer()
                        if entry.path == selectedDirectory {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.teal)
                        }
                        if entry.isDir {
                            Image(systemName: "chevron.right")
                                .foregroundStyle(.secondary)
                                .font(.caption)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder private var cliSection: some View {
        Section("CLI") {
            Picker("Tool", selection: $selectedCLI) {
                ForEach(CLIRegistry.all) { cli in
                    Text(cli.label).tag(cli)
                }
            }
            .onChange(of: selectedCLI) { _, newCLI in
                // Reset variant when CLI changes
                selectedVariant = newCLI.variants[0]
            }

            Picker("Mode", selection: $selectedVariant) {
                ForEach(selectedCLI.variants, id: \.command) { variant in
                    Text(variant.label).tag(variant)
                }
            }
        }

        if let err = errorMessage {
            Section {
                Label(err, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.callout)
            }
        }
    }

    // MARK: - Helpers

    private func abbreviatePath(_ path: String) -> String {
        let home = NSHomeDirectory()
        if path.hasPrefix(home) {
            return "~" + path.dropFirst(home.count)
        }
        return path
    }

    // MARK: - Data loading

    private func loadInitialDirs() async {
        guard let client else { return }
        isLoadingDirs = true
        defer { isLoadingDirs = false }

        // Load recent dirs
        if let dirs = try? await client.recentDirs(), !dirs.isEmpty {
            recentDirs = dirs
            // Pre-select the most recent directory
            if selectedDirectory.isEmpty, let first = dirs.first {
                selectedDirectory = first
            }
        }

        // Start browse from home
        await pushBrowsePage(path: "")
    }

    private func pushBrowsePage(path: String) async {
        guard let client else { return }
        let newPage = BrowsePage(path: path, entries: [], isLoading: true)
        browseStack.append(newPage)
        let idx = browseStack.count - 1

        do {
            let entries = try await client.browse(path: path)
            guard browseStack.indices.contains(idx) else { return }
            browseStack[idx].entries = entries
            browseStack[idx].isLoading = false
        } catch {
            guard browseStack.indices.contains(idx) else { return }
            browseStack[idx].isLoading = false
            browseStack[idx].entries = []
        }
    }

    private func selectOrNavigate(_ entry: DirEntry) {
        // Selecting taps the dir as the chosen directory
        selectedDirectory = entry.path
        // Also navigate into it (push next page)
        if entry.isDir {
            Task { await pushBrowsePage(path: entry.path) }
        }
    }

    // MARK: - Create

    private func create() {
        guard canCreate, let client else { return }
        isCreating = true
        errorMessage = nil
        Task {
            do {
                try await client.createSession(
                    name: sessionName,
                    directory: selectedDirectory,
                    command: selectedVariant.command
                )
                onCreated()
                dismiss()
            } catch APIError.unauthorized {
                errorMessage = String(localized: "Not authorized. Please check your token.")
            } catch APIError.http(let code) {
                errorMessage = String(localized: "Server error \(code). Please check the name and directory.")
            } catch {
                errorMessage = String(localized: "Error: \(error.localizedDescription)")
            }
            isCreating = false
        }
    }
}

// MARK: - Browse page state

private struct BrowsePage {
    let path: String
    var entries: [DirEntry]
    var isLoading: Bool
}
