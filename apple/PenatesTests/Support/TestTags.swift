import Testing

/// Shared Swift Testing tags. `.networking` marks every test that exercises the
/// HTTP layer through `StubURLProtocol`, so they can be run or filtered together.
extension Tag {
    @Tag static var networking: Self
}
