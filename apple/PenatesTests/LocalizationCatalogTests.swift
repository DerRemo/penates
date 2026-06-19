import Testing
import Foundation

/// Reads the source String Catalog directly (via this test file's compile-time
/// path) and verifies the German localization is complete and well-formed.
/// Runs on the dev machine where the tests are compiled; #filePath points here.
struct LocalizationCatalogTests {

    private func loadCatalog() throws -> [String: Any] {
        let here = URL(fileURLWithPath: #filePath)               // …/apple/PenatesTests/LocalizationCatalogTests.swift
        let appleDir = here.deletingLastPathComponent().deletingLastPathComponent()  // …/apple
        let url = appleDir.appendingPathComponent("Penates/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        return try JSONSerialization.jsonObject(with: data) as! [String: Any]
    }

    private func deValue(_ strings: [String: Any], _ key: String) -> String? {
        guard let entry = strings[key] as? [String: Any],
              let locs = entry["localizations"] as? [String: Any],
              let de = locs["de"] as? [String: Any],
              let unit = de["stringUnit"] as? [String: Any],
              let value = unit["value"] as? String else { return nil }
        return value
    }

    @Test func sourceLanguageIsEnglish() throws {
        let cat = try loadCatalog()
        #expect(cat["sourceLanguage"] as? String == "en")
    }

    @Test func spotCheckGermanTranslations() throws {
        let cat = try loadCatalog()
        let strings = cat["strings"] as! [String: Any]
        let expected: [String: String] = [
            "Connect": "Verbinden",
            "New Session": "Neue Session",
            "Stop": "Beenden",
            "Pinned": "Angeheftet",
            "Active": "Aktiv",
            "Dormant": "Ruhend",
            "Settings": "Einstellungen",
            "Coming in a later version.": "Kommt in einer späteren Version.",
            "Connecting…": "Verbinde…",
            "Back to Overview": "Zurück zur Übersicht",
        ]
        for (key, de) in expected {
            #expect(deValue(strings, key) == de, "key \(key) → expected de \(de)")
        }
    }

    @Test func everyGermanEntryIsTranslatedAndNonEmpty() throws {
        let cat = try loadCatalog()
        let strings = cat["strings"] as! [String: Any]
        var translated = 0
        for (key, raw) in strings {
            guard let entry = raw as? [String: Any],
                  let locs = entry["localizations"] as? [String: Any],
                  let de = locs["de"] as? [String: Any],
                  let unit = de["stringUnit"] as? [String: Any] else { continue }
            let state = unit["state"] as? String
            let value = unit["value"] as? String ?? ""
            #expect(state == "translated", "key \(key) de state is \(state ?? "nil")")
            #expect(!value.isEmpty, "key \(key) has empty de value")
            translated += 1
        }
        #expect(translated >= 50, "expected ≥50 translated de entries, got \(translated)")
    }
}
