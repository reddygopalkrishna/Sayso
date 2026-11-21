import Foundation

/// Scores how well an on-screen label matches what the user said ("submit" vs "Submit form").
public enum LabelMatch {
    /// Lowercased words only: letters and digits, single spaces.
    public static func normalize(_ text: String) -> String {
        let letters = text.lowercased().unicodeScalars.map {
            CharacterSet.alphanumerics.contains($0) ? Character($0) : " "
        }
        return String(letters).split(separator: " ").joined(separator: " ")
    }

    /// 3 = same words, 2 = the label starts with the query's words, 1 = it contains them, 0 = no match.
    public static func score(query: String, text: String) -> Int {
        let q = normalize(query)
        let t = normalize(text)
        guard !q.isEmpty, !t.isEmpty else { return 0 }
        if t == q { return 3 }
        if t.hasPrefix(q + " ") { return 2 }
        if (" " + t + " ").contains(" " + q + " ") { return 1 }
        return 0
    }
}
