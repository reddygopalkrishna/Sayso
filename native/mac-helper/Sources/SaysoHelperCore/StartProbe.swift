import Foundation

/// When the hold key last went down, so the microphone can report how long it took to hear the
/// first sound after it. Set by the message loop when it announces the key.
public final class HotkeyClock: @unchecked Sendable {
    public static let shared = HotkeyClock()
    private let lock = NSLock()
    private var down: ContinuousClock.Instant?

    public func markDown(at instant: ContinuousClock.Instant = .now) {
        lock.withLock { down = instant }
    }

    public var lastDown: ContinuousClock.Instant? { lock.withLock { down } }
}

/// Times one microphone start: from the request to start (and from the key going down, if known)
/// to the engine running, and to the first audio. Reports once. Safe to call from the audio thread.
public final class StartProbe: @unchecked Sendable {
    public struct Report: Equatable, Sendable {
        /// Key down → first audio, when the key time is known and recent.
        public var keyDownToFirstMs: Double?
        /// Key down → the request to start arrived (the app's side of the trip).
        public var keyDownToRequestMs: Double?
        /// Request → engine running (permission, engine, converter, start).
        public var setupMs: Double
        /// Engine running → the first buffer of audio.
        public var firstBufferMs: Double

        public var line: String {
            func ms(_ v: Double) -> String { String(Int(v.rounded())) }
            var parts = ["setup \(ms(setupMs)) ms", "first audio \(ms(firstBufferMs)) ms later"]
            if let toRequest = keyDownToRequestMs { parts.insert("request \(ms(toRequest)) ms after the key", at: 0) }
            let head = keyDownToFirstMs.map { "key down → first audio \(ms($0)) ms" }
                ?? "request → first audio \(ms(setupMs + firstBufferMs)) ms"
            return "[mic] \(head) (\(parts.joined(separator: ", ")))"
        }
    }

    private let lock = NSLock()
    private let now: @Sendable () -> ContinuousClock.Instant
    private let keyDownAt: ContinuousClock.Instant?
    private let requestedAt: ContinuousClock.Instant
    private var startedAt: ContinuousClock.Instant?
    private var reported = false

    /// A key time older than this is not "the key press that started this recording".
    static let freshKeyWindow: Duration = .seconds(5)

    public init(
        keyDownAt: ContinuousClock.Instant?,
        now: @escaping @Sendable () -> ContinuousClock.Instant = { .now }
    ) {
        self.now = now
        let at = now()
        requestedAt = at
        self.keyDownAt = keyDownAt.flatMap { at - $0 <= Self.freshKeyWindow ? $0 : nil }
    }

    public func engineStarted() {
        lock.withLock { startedAt = now() }
    }

    /// Call for every buffer from the audio thread; returns a report only the first time.
    public func firstSample() -> Report? {
        lock.withLock {
            guard !reported, let startedAt else { return nil }
            reported = true
            let at = now()
            func ms(_ d: Duration) -> Double {
                Double(d.components.seconds) * 1000 + Double(d.components.attoseconds) / 1e15
            }
            return Report(
                keyDownToFirstMs: keyDownAt.map { ms(at - $0) },
                keyDownToRequestMs: keyDownAt.map { ms(requestedAt - $0) },
                setupMs: ms(startedAt - requestedAt),
                firstBufferMs: ms(at - startedAt))
        }
    }
}
