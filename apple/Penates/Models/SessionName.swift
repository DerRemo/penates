import Foundation

enum SessionName {
    static func isValid(_ s: String) -> Bool {
        s.range(of: "^[\\w\\-. ]{1,64}$", options: .regularExpression) != nil
    }
}
