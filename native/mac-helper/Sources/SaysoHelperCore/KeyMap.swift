/// Key names from the protocol (KeySchema in messages.ts) → macOS virtual key codes (ANSI layout).
public enum KeyMap {
    private static let named: [String: UInt16] = [
        "enter": 36, "tab": 48, "space": 49, "delete": 51, "escape": 53, "forwardDelete": 117,
        "home": 115, "pageUp": 116, "end": 119, "pageDown": 121,
        "left": 123, "right": 124, "down": 125, "up": 126,
    ]
    private static let characters: [Character: UInt16] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
        "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29,
        "o": 31, "u": 32, "i": 34, "p": 35, "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
    ]

    public static func code(for key: String) -> UInt16? {
        if let code = named[key] { return code }
        guard key.count == 1, let character = key.first else { return nil }
        return characters[character]
    }
}
