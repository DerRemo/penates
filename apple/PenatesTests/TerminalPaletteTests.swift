import Testing
import UIKit
@testable import Penates

/// Reads the white component of a grayscale UIColor (the palette is built from
/// `UIColor(white:alpha:)`, so a single channel fully describes its lightness).
private func white(_ color: UIColor) -> CGFloat {
    var w: CGFloat = 0, a: CGFloat = 0
    color.getWhite(&w, alpha: &a)
    return w
}

@Test func backgroundDiffersByScheme() {
    #expect(TerminalPalette.background(true) != TerminalPalette.background(false))
}
@Test func foregroundDiffersByScheme() {
    #expect(TerminalPalette.foreground(true) != TerminalPalette.foreground(false))
}
@Test func darkBackgroundIsDarkerThanLight() {
    #expect(white(TerminalPalette.background(true)) < white(TerminalPalette.background(false)))
}
