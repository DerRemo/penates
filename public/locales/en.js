// EN bundle for Claude Code Hub — populated during i18n extraction tasks.
window.__I18N_BUNDLES = window.__I18N_BUNDLES || {};
window.__I18N_BUNDLES.en = {
  // Header
  'header.logoProduct': 'Claude Code',
  'header.sidebarToggleAria': 'Toggle navigation',
  // Sidebar
  'sidebar.sessionsLabel': 'Sessions',
  'sidebar.navigationLabel': 'Navigation',
  'sidebar.loading': 'Loading…',
  'sidebar.noActiveSessions': 'No active sessions',
  'sidebar.filterActive': 'Active',
  'sidebar.filterAll': 'All',
  'sidebar.noActiveFiltered': 'No active sessions — switch to "All"',
  'sidebar.nav.overview': 'Overview',
  'sidebar.nav.projects': 'Projects',
  'sidebar.nav.usage': 'Usage',
  'sidebar.brand.subtitle': '{active} active · {dormant} dormant',
  'sidebar.limit.label': '5h limit',
  'sidebar.limit.reset': 'resets in {time}',
  'sidebar.usage.label': 'Usage',
  'sidebar.usage.limited': 'Limit',

  // Shell — titles
  'shell.title.overview': 'Overview',
  'shell.title.projects': 'Projects',
  'shell.title.usage': 'Usage',

  // Shell — summary
  'shell.summary.working': 'working',
  'shell.summary.waiting': 'waiting',
  'shell.summary.idle': 'idle',

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
  'sessionCard.status.runningTool': 'running: {tool}',
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
  'terminal.connStatus.reconnecting': 'Reconnecting … (attempt {n})',
  'terminal.connStatus.reconnectIn': 'Reconnecting … (attempt {n})',
  'terminal.connStatus.disconnected': 'Disconnected',
  'terminal.connStatus.authMissing': 'Auth missing',
  'terminal.connStatus.sessionGone': 'Session gone',

  // Terminal inline messages (written into PTY)
  'terminal.msg.connLost': '── Connection lost, reconnecting … ──',
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
  'filebrowser.context.download': 'Download',
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
  'filebrowser.toast.copyFailed': 'Copy failed',
  'filebrowser.toast.moveFailed': 'Move failed',
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
  'preview.oversize.download': 'Download file',

  // Upload toast stack
  'upload.status.queued': 'queued',
  'upload.status.done': 'done',
  'upload.status.tooLargeClient': 'too large (max 100 MB)',
  'upload.status.tooLargeServer': 'too large (server)',
  'upload.status.exists': 'exists',
  'upload.status.networkError': 'Network error',
  'upload.status.httpError': 'Error {status}',
  'upload.conflict.rename': 'Rename',
  'upload.conflict.overwrite': 'Overwrite',
  'upload.conflict.abort': 'Cancel',

  // Terminal drop overlay
  'terminal.dropOverlay.label': 'Upload to session directory',
  'terminal.dropOverlay.mentionLabel': 'Insert as @-mention',

  // Approvals
  'approval.wants': 'Claude wants to run {tool}',
  'approval.allow': 'Allow',
  'approval.deny': 'Deny',

  // Modals — New Session
  'modal.newSession.title': 'Start New Session',
  'modal.newSession.nameLabel': 'Session Name',
  'modal.newSession.namePlaceholder': 'e.g. feature-login',
  'modal.newSession.dirLabel': 'Project Directory',
  'modal.newSession.recentLabel': 'Recently used',
  'modal.newSession.cliLabel': 'CLI',
  'modal.newSession.variantLabel': 'Variant',
  'modal.newSession.dirTabBrowse': 'Browse',
  'modal.newSession.dirTabRecent': 'Recent',
  'modal.newSession.recentEmpty': 'No recent directories',
  'modal.newSession.modeLabel': 'Mode',
  'modal.newSession.modeStandardSub': 'asks first',
  'modal.newSession.modeAutoSub': 'mostly autonomous',
  'modal.newSession.modeDangerSub': 'skip all',
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
  'modal.newProject.description': 'Create a new <code>ROADMAP.md</code> in an existing directory. It will be registered as a project and appear in the Projects tab.',
  'modal.newProject.nameLabel': 'Display Name',
  'modal.newProject.namePlaceholder': 'e.g. Kalvo Backend',
  'modal.newProject.dirLabel': 'Project Directory',
  'modal.newProject.cancel': 'Cancel',
  'modal.newProject.create': 'Create',

  // Toasts — session lifecycle
  'toast.downloadFailed': 'Download failed',
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
  'toast.adoptInvalidName': 'Invalid name',
  'toast.adopted': '"{source}" adopted',
  'toast.adoptFailed': 'Adopt failed',
  'toast.sessionStarted': 'Session "{name}" started',
  'toast.sessionNameExists': 'Session with this name already exists',
  'toast.enterSessionName': 'Please enter a session name',
  'toast.createSessionFailed': 'Failed to create session',
  'toast.projectCreated': 'Project "{name}" created',
  'toast.enterDisplayName': 'Please enter a display name',
  'toast.selectProjectDir': 'Please select a project directory',
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
  'toast.pushToggleFailed': 'Failed to toggle push notifications',
  'toast.vapidNotLoaded': 'VAPID key not loaded',
  'toast.ideaAdded': 'Idea added to backlog',

  // Confirm dialogs
  'confirm.killSession': 'Really kill session "{name}"?',
  'confirm.forgetSession': 'Remove entry "{name}" from the list?\n\nThe session will not be killed (it is no longer running). Restore will no longer be possible.',

  // Tree picker (inside modals)
  'treePicker.loading': 'Loading…',
  'treePicker.mkdir.button':       '+ Folder',
  'treePicker.mkdir.title':        'New Folder',
  'treePicker.mkdir.placeholder':  'Folder name…',
  'treePicker.mkdir.invalidName':  'Invalid name',
  'treePicker.mkdir.exists':       'Already exists',
  'treePicker.mkdir.failed':       'Create failed',

  // Session card — git badge
  'sessionCard.git.statusTitle': 'Git status',
  'sessionCard.git.dirtyTitle': 'Unstaged changes',

  // Diff view
  'diff.title': 'Diff: {name}',
  'diff.openTitle': 'Show changes',
  'diff.toggle': 'Diff',
  'diff.toggleAria': 'Toggle diff panel',
  'diff.refresh': 'Refresh',
  'diff.close': 'Close',
  'diff.group.unstaged': 'Unstaged',
  'diff.group.staged': 'Staged',
  'diff.group.untracked': 'Untracked',
  'diff.empty': 'No uncommitted changes',
  'diff.noRepo': 'Not a Git repository',
  'diff.binary': 'Binary file — no diff',
  'diff.oversize': 'File too large to display',

  // Session card — context tooltip
  'sessionCard.noClaudeData': 'No Claude Code data in cwd yet',

  // Login modal
  'login.title': 'Login',
  'login.hint': 'Auth token from <code>.env</code> — stored once in your browser.',
  'login.tokenLabel': 'Token',
  'login.submit': 'Login',

  // Keyboard help modal
  'kbdHelp.title': 'Keyboard Shortcuts',
  'kbdHelp.newSession': 'New Session',
  'kbdHelp.focusFilter': 'Focus filter',
  'kbdHelp.reload': 'Reload sessions',
  'kbdHelp.gridLayout': 'Grid layout',
  'kbdHelp.listLayout': 'List layout',
  'kbdHelp.toggleTheme': 'Toggle theme',
  'kbdHelp.backClose': 'Back / Close',
  'kbdHelp.thisHelp': 'This help',

  // Header — sound toggle (dynamic JS title)
  'header.soundOffTitle': 'Turn sound alerts OFF',
  'header.soundOnTitle': 'Turn sound alerts ON',

  // Projects list view
  'projects.loading': 'Loading projects…',
  'projects.authExpired': 'Auth expired.',
  'projects.missingBadge': 'ROADMAP.md missing',
  'projects.releasedLabel': 'released',
  'projects.devLabel': 'dev',
  'projects.progress': '{done}/{total} dev · {backlog} backlog',
  'projects.emptyNoFiles': 'No ROADMAP.md files found.',
  'projects.emptyInstruction': 'Create a ROADMAP.md in a project under ~/Projects/* — it will be registered on the next server restart.',
  'projects.activeSessions': '{n} active',
  'projects.startSessionHere': 'New session',
  'projects.open': 'Open',
  'projects.sort.label': 'Sort',
  'projects.sort.name': 'Name',
  'projects.sort.progress': 'Progress',
  'projects.sort.backlog': 'Backlog',
  'projects.sort.sessions': 'Active sessions',
  'projects.sort.modified': 'Last modified',
  'projects.filter.label': 'Filter',
  'projects.filter.all': 'All projects',
  'projects.filter.sessions': 'With active sessions',
  'projects.filter.backlog': 'With open backlog',
  'projects.filter.hideMissing': 'Hide missing ROADMAP',
  'projects.layout.gridAria': 'Grid view',
  'projects.layout.listAria': 'List view',
  'projects.emptyFiltered': 'No projects match the filter.',

  // Projects search
  'projects.search.header': 'Roadmap matches for "{q}" ({count})',
  'projects.search.empty': 'No matching items found.',

  // Project detail view
  'projects.detail.loading': 'Loading project…',
  'projects.detail.notFound': 'Project not found.',
  'projects.detail.roadmapNotReadable': 'ROADMAP.md not readable.',
  'projects.detail.roadmapMissingInstruction': 'Create a ROADMAP.md in this directory and restart the server.',
  'projects.detail.openSessions': 'Open Sessions ({n})',
  'projects.detail.loadingSessions': 'Loading sessions…',
  'projects.detail.noSessions': 'No session running in this directory.',
  'projects.detail.sectionReleased': 'Released',
  'projects.detail.sectionDev': 'In Development',
  'projects.detail.sectionBacklog': 'Backlog / Ideas',
  'projects.detail.sectionChangelog': 'Changelog',
  'projects.detail.sectionEmpty': '— empty —',
  'projects.detail.addItem': '+ Item',
  'projects.detail.markAsDone': 'Mark as done',
  'projects.detail.markAsOpen': 'Mark as open',
  'projects.detail.deleteItem': 'Delete item',
  'projects.detail.deleteTitle': 'Delete',
  'projects.detail.confirmDelete': 'Confirm delete',
  'projects.detail.newItemPlaceholder': 'New item…',
  'projects.detail.inlineHint': 'Enter = save · Esc = cancel',
  'projects.detail.conflict': 'Conflict — reloading…',
  'projects.detail.itemAdded': 'Item added',
  'projects.detail.finalizeVersion': 'Finalize version',
  'projects.detail.startSessionHere': 'Start session here',
  'projects.detail.collapseSection': 'Collapse section',
  'projects.detail.expandSection': 'Expand section',
  'projects.detail.editItem': 'Edit item',
  'projects.detail.editSave': 'Save (Enter)',
  'projects.detail.moveItem': 'Move to section',
  'projects.detail.moveTo': 'Move to',
  'projects.detail.moveCurrent': '(current)',
  'projects.detail.editVersion': 'Edit version',

  // Release modal
  'projects.release.title': 'Finalize version',
  'projects.release.description': 'All items from <strong>In Development</strong> will be moved to <strong>Released</strong>, both version headers bumped, and a new changelog entry inserted at the top. This is a destructive action — make a git commit of ROADMAP.md first if you version it.',
  'projects.release.versionLabel': 'Release Version (sets <code>## Released: vX</code>)',
  'projects.release.versionPlaceholder': 'e.g. 0.3.0',
  'projects.release.newDevLabel': 'New Dev Version (sets <code>## In Development: vY</code>)',
  'projects.release.newDevPlaceholder': 'e.g. 0.4.0',
  'projects.release.narrativeLabel': 'Changelog Narrative (optional, free Markdown — no H2)',
  'projects.release.narrativePlaceholder': 'What was built in this version? Multiple paragraphs are fine.',
  'projects.release.cancel': 'Cancel',
  'projects.release.complete': 'Complete',
  'projects.release.finalized': 'v{version} finalized',

  // Usage dashboard — loading / error states
  'usage.loading': 'Loading usage data…',
  'usage.noData': 'No data available — Claude Code was not active this month.',
  'usage.loadError': 'Load error: {message}',

  // Usage dashboard — limit status card
  'usage.reset': 'Reset {time}',
  'usage.resetNow': 'Now',
  'usage.limitPeaks': 'Last 7 days: {peaks5h}x >90% (5h) · {peaks7d}x >90% (7d)',
  'usage.accountPanelTitle': 'Accounts',
  'usage.noAccountData': 'No account data (moshi-hook unavailable)',
  'usage.window5h': '5h',
  'usage.window7d': '7d',

  // Usage dashboard — heatmap
  'usage.heatmapTitle': 'Activity (Heatmap)',
  'usage.day.mon': 'Mon',
  'usage.day.tue': 'Tue',
  'usage.day.wed': 'Wed',
  'usage.day.thu': 'Thu',
  'usage.day.fri': 'Fri',
  'usage.day.sat': 'Sat',
  'usage.day.sun': 'Sun',

  // Usage dashboard — top projects
  'usage.topProjectsTitle': 'Top Projects',

  // Usage dashboard — 30-day table
  'usage.tableTitle': '30-Day Table',
  'usage.table.date': 'Date',
  'usage.table.input': 'Input',
  'usage.table.output': 'Output',
  'usage.table.total': 'Total',
  'usage.table.cost': 'Cost',
  'usage.table.sessions': 'Sessions',

  // Usage dashboard — tool usage
  'usage.toolTitle': 'Tool Usage',

  // Usage dashboard — work style
  'usage.workStyleTitle': 'Work Style',
  'usage.workStyleToolChains': 'Tool Chains {pct}% ({n})',
  'usage.workStyleDirectAnswers': 'Direct Answers {pct}% ({n})',

  // Usage dashboard — productivity
  'usage.productivityTitle': 'Productivity',
  'usage.linesAdded': 'Lines added',
  'usage.linesRemoved': 'Lines removed',
  'usage.apiTime': 'API time',

  // Usage dashboard — summary cards
  'usage.card.monthlyCost': 'Monthly Cost',
  'usage.card.monthlySessions': 'Monthly Sessions',
  'usage.card.monthlyCacheRate': 'Monthly Cache Rate',
  'usage.card.autonomousChains': 'Autonomous Tool Chains',

  // Common / shared
  'common.errorWithMessage': 'Error: {message}',
  'common.on': 'On',
  'common.off': 'Off',

  // Settings — sidebar entry + page
  'settings.sidebarEntry': 'Settings',
  'settings.sidebarEntryAria': 'Open settings',
  'settings.pageTitle': 'Settings',

  // Settings — section headers
  'settings.section.appearance': 'Appearance',
  'settings.section.language': 'Language',
  'settings.section.notifications': 'Notifications',
  'settings.section.sessions': 'Sessions',
  'settings.section.help': 'Help',
  'settings.section.about': 'About',

  // Settings — Sessions section
  'settings.sessions.bulkKillLabel': 'Kill idle sessions',
  'settings.sessions.bulkKillDesc': 'Terminates all sessions without recent activity at once.',

  // Settings — Appearance section
  'settings.appearance.themeLabel': 'Theme',
  'settings.appearance.themeLight': 'Light',
  'settings.appearance.themeDark': 'Dark',

  // Settings — Language section
  'settings.language.label': 'Interface language',
  'settings.language.english': 'English',
  'settings.language.german': 'Deutsch',
  'settings.language.reloadHint': 'Switching reloads the page.',

  // Settings — Notifications section
  'settings.notifications.pushLabel': 'Push notifications',
  'settings.notifications.push.permission.default': 'Permission: not requested yet',
  'settings.notifications.push.permission.denied': 'Permission: denied — allow it in browser settings',
  'settings.notifications.push.permission.granted': 'Permission: granted',
  'settings.notifications.pushUnsupported': 'Not supported in this browser',
  'settings.notifications.soundLabel': 'Sound alerts',

  // Settings — Help section
  'settings.help.kbdShortcutsLabel': 'Keyboard shortcuts',

  // Settings — About section
  'settings.about.currentVersion': 'Current version',
  'settings.about.latestVersion': 'Latest release',
  'settings.about.viewRelease': 'View release',
  'settings.about.uptimeLabel': 'Server uptime',
  'settings.about.newAvailable': '(new version available)',

  // Time / relative
  'time.unknown': 'unknown',
  'time.justNow': 'just now',
  'time.justNowLower': 'just now',
  'time.mAgo': '{n}m ago',
  'time.hAgo': '{n}h ago',
  'time.dAgo': '{n}d ago',
  'time.minAgo': '{n} min ago',
  'time.daysAgo': '{n} days ago',
  'time.weeksAgo': '{n} weeks ago',
  // Image-Paste & Annotation
  'imagePaste.toolbar.arrow': 'Arrow',
  'imagePaste.toolbar.box': 'Box',
  'imagePaste.toolbar.pen': 'Pen',
  'imagePaste.toolbar.text': 'Text',
  'imagePaste.toolbar.undo': 'Undo',
  'imagePaste.send': 'Send',
  'imagePaste.cancel': 'Cancel',
  'imagePaste.pickerTitle': 'Insert image',
  'voice.btnTitle': 'Speak',
  'voice.recording': 'Recording … {sec}s',
  'voice.transcribing': 'Transcribing …',
  'voice.errPermission': 'Microphone access denied.',
  'voice.errNoDevice': 'No microphone found.',
  'voice.errEmpty': 'Nothing recorded.',
  'voice.errBusy': 'A transcription is still running — please wait.',
  'voice.errTooLong': 'Recording too long.',
  'voice.errDisabled': 'Voice input is not set up.',
  'voice.errFailed': 'Transcription failed.',
  'imagePaste.textPrompt': 'Enter text',
  'imagePaste.error.noCwd': 'Session directory unavailable',
  'imagePaste.error.tooLarge': 'Image too large',
  'imagePaste.error.failed': 'Image upload failed',
  // Browser-Preview
  'preview.toggle': 'Preview',
  'preview.toggleAria': 'Toggle preview',
  'preview.header.portLabel': 'Port',
  'preview.header.portPlaceholder': 'Port…',
  'preview.header.reload': 'Reload',
  'preview.header.openTab': 'Open in new tab',
  'preview.header.close': 'Close',
  'preview.empty.choosePort': 'Pick or enter a port to load the preview.',
  'preview.empty.notConfigured': 'Preview not configured. Set PREVIEW_DOMAIN in .env (see setup.sh).',
  'preview.error.noServer': 'No server on port {n} — is your dev server running?',
  'preview.header.ports': 'Ports',
  'preview.empty.noMatch': 'No matching port',
  'preview.empty.noPorts': 'No ports detected',
  // Remote-Approval
  'settings.remoteApproval': 'Remote approval',
  'settings.remoteApprovalDesc': 'Route tool approvals to the dashboard/phone when nobody is at the terminal (normal mode only).',
};
