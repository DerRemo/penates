// EN bundle for Claude Code Hub — populated during i18n extraction tasks.
window.__I18N_BUNDLES = window.__I18N_BUNDLES || {};
window.__I18N_BUNDLES.en = {
  // Header
  'header.logoProduct': 'Claude Code',
  'header.sidebarToggleAria': 'Toggle navigation',
  'header.pushToggleAria': 'Toggle push notifications',
  'header.pushToggleTitle': 'Push notifications (works with tab closed)',
  'header.soundToggleAria': 'Toggle sound alerts',
  'header.soundToggleTitle': 'Toggle sound alerts',
  'header.themeToggleAria': 'Toggle theme',
  'header.themeToggleTitle': 'Toggle theme (t)',
  'header.kbdHelpAria': 'Show keyboard shortcuts',
  'header.kbdHelpTitle': 'Keyboard shortcuts (?)',

  // Sidebar
  'sidebar.sessionsLabel': 'Sessions',
  'sidebar.navigationLabel': 'Navigation',
  'sidebar.loading': 'Loading…',
  'sidebar.noActiveSessions': 'No active sessions',
  'sidebar.nav.overview': 'Overview',
  'sidebar.nav.projects': 'Projects',
  'sidebar.nav.usage': 'Usage',

  // Dashboard toolbar
  'dashboard.tablistAria': 'Dashboard tabs',
  'dashboard.tab.sessions': 'Sessions',
  'dashboard.tab.usage': 'Usage',
  'dashboard.tab.projects': 'Projects',
  'dashboard.filterPlaceholder': 'Filter… (/)',
  'dashboard.layoutAria': 'Layout',
  'dashboard.layout.gridAria': 'Grid view',
  'dashboard.layout.gridTitle': 'Grid (g)',
  'dashboard.layout.listAria': 'List view',
  'dashboard.layout.listTitle': 'List (l)',
  'dashboard.refresh': 'Refresh',
  'dashboard.bulkKill': 'Bulk Kill',
  'dashboard.newSession': 'New Session',
  'dashboard.newProject': 'New Project',

  // Dashboard empty states
  'dashboard.emptyNoMatchesHeading': 'No matches',
  'dashboard.emptyNoMatchesBody': 'No session name or preview matches "{q}".',
  'dashboard.emptyHeading': 'No active sessions',
  'dashboard.emptyBody': 'Start a new Claude Code session to get started.',

  // Dashboard section headers
  'dashboard.section.active': 'Active',
  'dashboard.section.dormant': 'Dormant',
  'dashboard.section.foreign': 'Foreign',

  // Session card — status badges
  'sessionCard.status.working': 'Working',
  'sessionCard.status.needsInput': 'Needs Input',
  'sessionCard.status.ready': 'Ready',
  'sessionCard.status.active': 'Active',
  'sessionCard.status.dormant': 'Dormant',
  'sessionCard.status.workingTitle': 'Claude is currently working (ESC in terminal to cancel)',
  'sessionCard.status.needsInputTitle': 'Claude is waiting for your input',
  'sessionCard.status.readyTitle': 'Claude is ready for the next task',
  'sessionCard.status.activeTitle': 'Session running, state unknown',
  'sessionCard.dormantBadgeTitle': 'Session is not active in tmux, can be restored',

  // Session card — mute button
  'sessionCard.mute.muteAria': 'Mute',
  'sessionCard.mute.enableAria': 'Enable notifications',
  'sessionCard.mute.mutedTitle': 'Muted — click to enable',
  'sessionCard.mute.enabledTitle': 'Notifications on — click to mute',

  // Session card — pin button
  'sessionCard.pin.pinAria': 'Pin',
  'sessionCard.pin.pinnedAria': 'Pinned — click to unpin',
  'sessionCard.pin.pinTitle': 'Pin — drag session to end of list',
  'sessionCard.pin.pinnedTitle': 'Pinned — click to unpin',

  // Session card — actions
  'sessionCard.action.connect': 'Connect',
  'sessionCard.action.kill': 'Kill',
  'sessionCard.action.restore': 'Restore',
  'sessionCard.action.forget': 'Forget',
  'sessionCard.action.forgetTitle': 'Remove from list',
  'sessionCard.action.adopt': 'Adopt',

  // Session card — dormant metadata
  'sessionCard.lastSeen': 'Last seen: {time}',

  // Terminal toolbar buttons
  'terminal.toolbar.backAria': 'Back to dashboard',
  'terminal.toolbar.backTitle': 'Back',
  'terminal.toolbar.back': 'Back',
  'terminal.toolbar.filesAria': 'Show files',
  'terminal.toolbar.filesTitle': 'Show files',
  'terminal.toolbar.files': 'Files',
  'terminal.toolbar.captureIdeaAria': 'Capture idea',
  'terminal.toolbar.captureIdeaTitle': 'Capture idea to project backlog',
  'terminal.toolbar.captureIdea': 'Capture idea',
  'terminal.toolbar.killAria': 'Kill session',
  'terminal.toolbar.killTitle': 'Kill session',
  'terminal.toolbar.kill': 'Kill',

  // Terminal connection status labels
  'terminal.connStatus.connecting': 'Connecting',
  'terminal.connStatus.connected': 'Connected',
  'terminal.connStatus.reconnecting': 'Reconnect {n}/{max}',
  'terminal.connStatus.reconnectIn': 'Reconnect in 2s ({n}/{max})',
  'terminal.connStatus.disconnected': 'Disconnected',
  'terminal.connStatus.authMissing': 'Auth missing',
  'terminal.connStatus.sessionGone': 'Session gone',

  // Terminal inline messages (written into PTY)
  'terminal.msg.connLost': '── Connection lost, reconnect {n}/{max} ──',
  'terminal.msg.connClosed': '── Connection closed, reconnect limit reached ──',

  // Touch bar
  'terminal.touchBar.aria': 'Virtual Keys',

  // File browser toolbar
  'filebrowser.toolbar.newFolder': '+ Folder',
  'filebrowser.toolbar.newFolderTitle': 'New Folder',
  'filebrowser.toolbar.upload': '+ File',
  'filebrowser.toolbar.uploadTitle': 'Upload File',
  'filebrowser.toolbar.refreshTitle': 'Refresh',
  'filebrowser.toolbar.closeTitle': 'Close',

  // File browser tree
  'filebrowser.tree.loading': 'Loading…',
  'filebrowser.tree.empty': 'Empty',
  'filebrowser.tree.noSubdirs': '(no subdirectories)',
  'filebrowser.tree.pickerEmpty': '(empty)',

  // File browser context menu
  'filebrowser.context.open': 'Open',
  'filebrowser.context.rename': 'Rename',
  'filebrowser.context.copyTo': 'Copy to…',
  'filebrowser.context.moveTo': 'Move to…',
  'filebrowser.context.moveToTrash': 'Move to Trash',
  'filebrowser.context.copyPath': 'Copy Path',

  // File browser prompts & toasts
  'filebrowser.prompt.copy': 'Copy to',
  'filebrowser.prompt.move': 'Move to',
  'filebrowser.prompt.targetPath': '{label} (relative target path):',
  'filebrowser.prompt.newFolder': 'New Folder:',
  'filebrowser.toast.renameFailed': 'Rename failed',
  'filebrowser.toast.deleteFailed': 'Delete failed',
  'filebrowser.toast.copyFailed': 'copy failed',
  'filebrowser.toast.moveFailed': 'move failed',
  'filebrowser.toast.createFailed': 'Create failed',
  'filebrowser.toast.cannotCreateFolder': 'Cannot create folder',

  // File preview modal
  'preview.copyPathTitle': 'Copy Path',
  'preview.copyPathLabel': 'Path',
  'preview.closeTitle': 'Close',
  'preview.closeLabel': '×',
  'preview.loading': 'Loading…',
  'preview.tooLarge': 'Too large for preview. Open in terminal.',
  'preview.unknownBinary': 'Unknown binary type.',
  'preview.error': 'Error: {message}',

  // Upload toast stack
  'upload.status.queued': 'wartet',
  'upload.status.done': 'done',
  'upload.status.tooLargeClient': 'too large (max 100 MB)',
  'upload.status.tooLargeServer': 'too large (server)',
  'upload.status.exists': 'exists',
  'upload.status.networkError': 'Network error',
  'upload.conflict.rename': 'Rename',
  'upload.conflict.overwrite': 'Overwrite',
  'upload.conflict.abort': 'Cancel',

  // Terminal drop overlay
  'terminal.dropOverlay.label': 'Upload to session directory',

  // Modals — New Session
  'modal.newSession.title': 'Start New Session',
  'modal.newSession.nameLabel': 'Session Name',
  'modal.newSession.namePlaceholder': 'e.g. kalvo-feature',
  'modal.newSession.dirLabel': 'Project Directory',
  'modal.newSession.cmdLabel': 'Start Command',
  'modal.newSession.cancel': 'Cancel',
  'modal.newSession.start': 'Start',

  // Modals — Bulk Kill
  'modal.bulkKill.title': 'Kill Idle Sessions',
  'modal.bulkKill.cancel': 'Cancel',
  'modal.bulkKill.confirm': 'Kill All',
  'modal.bulkKill.intro': 'Terminating {count} session{plural} without recent activity:',
  'modal.bulkKill.andMore': 'and {n} more…',

  // Modals — Adopt Session
  'modal.adopt.title': 'Adopt Session',
  'modal.adopt.nameLabel': 'New Name (without cc- prefix)',
  'modal.adopt.cancel': 'Cancel',
  'modal.adopt.submit': 'Adopt',

  // Modals — Idea Capture
  'modal.idea.title': 'Capture Idea',
  'modal.idea.descLabel': 'Short Description',
  'modal.idea.descPlaceholder': 'e.g. Sidebar should remember which session was last open',
  'modal.idea.cancel': 'Close',
  'modal.idea.save': 'Save',

  // Modals — New Project
  'modal.newProject.title': 'Create New Project',
  'modal.newProject.nameLabel': 'Display Name',
  'modal.newProject.namePlaceholder': 'e.g. Kalvo Backend',
  'modal.newProject.dirLabel': 'Project Directory',
  'modal.newProject.cancel': 'Cancel',
  'modal.newProject.create': 'Create',

  // Toasts — session lifecycle
  'toast.sessionHasOutput': '{name} has output',
  'toast.invalidToken': 'Invalid token — please re-enter',
  'toast.connFailed': 'Connection to server failed',
  'toast.connected': 'Connected to {name}',
  'toast.authFailed': 'Auth failed — invalid token',
  'toast.sessionGone': 'Session no longer exists',
  'toast.sessionKilled': 'Session "{name}" killed',
  'toast.killFailed': 'Failed to kill session',
  'toast.noIdleSessions': 'No idle sessions to kill',
  'toast.bulkKillDone': '{n} session{plural} killed',
  'toast.bulkKillPartial': '{succeeded} killed, {failed} failed',
  'toast.sessionRestored': 'Session "{name}" restored',
  'toast.restoreConflict': 'A session with this name already exists',
  'toast.restoreFailed': 'Restore failed',
  'toast.restoreConnError': 'Connection error during restore',
  'toast.sessionForgotten': '"{name}" forgotten',
  'toast.forgetFailed': 'Forget failed',
  'toast.adoptNameInUse': 'Target name already in use',
  'toast.adoptInvalidName': 'Invalid name',
  'toast.adopted': '"{source}" adopted as "cc-{name}"',
  'toast.adoptFailed': 'Adopt failed',
  'toast.enterName': 'Please enter a name',
  'toast.sessionStarted': 'Session "{name}" started',
  'toast.sessionNameExists': 'Session with this name already exists',
  'toast.enterSessionName': 'Please enter a session name',
  'toast.createSessionFailed': 'Failed to create session',
  'toast.projectCreated': 'Project "{name}" created',
  'toast.enterDisplayName': 'Please enter a display name',
  'toast.selectProjectDir': 'Please select a project directory',
  'toast.projectError': 'Error: {message}',
  'toast.releaseMissingVersions': 'Release and dev version must be set',
  'toast.releaseFailed': 'Release failed: {message}',
  'toast.muteFailed': 'Mute failed',
  'toast.notifMuted': 'Notifications muted',
  'toast.notifActive': 'Notifications active',
  'toast.pinFailed': 'Pin failed',
  'toast.pinOnlyKnown': 'Only known sessions can be pinned',
  'toast.sessionPinned': 'Session pinned',
  'toast.sessionUnpinned': 'Session unpinned',
  'toast.copiedChars': 'Copied ({n} chars)',
  'toast.copyFailed': 'Copy failed — clipboard not writable',
  'toast.pasteFailed': 'Paste failed — clipboard not readable. Firefox: allow permission.',
  'toast.clipboardNotReadable': 'Clipboard not readable — please allow browser permission',
  'toast.copyHint': 'Tip: Shift+Drag or Alt+Drag selects and copies instantly',
  'toast.noActiveSession': 'No active session',
  'toast.pushBlocked': 'Push blocked — please allow in browser settings',
  'toast.pushSubFailed': 'Push subscription failed: {message}',
  'toast.pushSubSaveFailed': 'Subscription could not be saved: {message}',
  'toast.pushEnabled': 'Push notifications enabled',
  'toast.pushDisabled': 'Push notifications disabled',
  'toast.vapidNotLoaded': 'VAPID key not loaded',
  'toast.ideaAdded': 'Idea added to backlog',

  // Confirm dialogs
  'confirm.killSession': 'Really kill session "{name}"?',
  'confirm.forgetSession': 'Remove entry "{name}" from the list?\n\nThe session will not be killed (it is no longer running). Restore will no longer be possible.',

  // Tree picker (inside modals)
  'treePicker.loading': 'Loading…',
};
