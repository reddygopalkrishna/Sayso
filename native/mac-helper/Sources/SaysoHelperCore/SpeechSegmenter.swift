/// Cuts a continuous microphone stream (16 kHz mono) into utterances: speech starts, and about a
/// two-thirds of a second of silence ends it. Pure logic, so it is unit-tested with synthetic signals; the helper
/// feeds it whatever the microphone delivers, in chunks of any size.
public struct SpeechSegmenter: Sendable {
    public struct Config: Sendable {
        public var sampleRate = 16_000
        /// The length of one measured frame.
        public var frameMs = 30
        /// Never treat anything quieter than this (RMS) as speech, however still the room is.
        public var minThreshold: Float = 0.008
        /// Speech must be this many times louder than the room's own noise level to start…
        public var speechRatio: Float = 3.0
        /// …and stays speech while it is this many times louder (so a sentence is not cut mid-word).
        public var continueRatio: Float = 2.0
        /// Silence that ends an utterance.
        public var endSilenceMs = 650
        /// Shorter than this (a click, a cough) is dropped.
        public var minSpeechMs = 180
        /// A longer utterance is cut here and the rest becomes the next one.
        public var maxSegmentMs = 30_000
        /// Audio kept from just before speech was noticed, so the first word is not clipped.
        public var preRollMs = 500
        /// Silence kept after the last word.
        public var tailMs = 300
        /// How many recent frames the lowest level is taken over (50 frames is 1.5 s).
        public var minWindowFrames = 50
        /// Loud frames in a row before speech counts as started (ignores one-frame bumps).
        public var startFrames = 2

        public init() {}
    }

    private let config: Config
    private let frameSize: Int
    private var pending: [Float] = []
    private var preRoll: [[Float]] = []
    private var noiseFloor: Float = 0.003
    /// The last second and a half of frame levels. Speech dips between words; a steady noise
    /// does not, so the lowest recent level is the room's noise even when it started suddenly.
    private var recentLevels: [Float] = []
    private var loudRun = 0
    private var loudFrames: [[Float]] = []

    private var segment: [[Float]] = []
    private var inSegment = false
    private var silentRun = 0
    /// How many frames of the segment are the audio from just before speech began.
    private var leadFrames = 0

    public init(_ config: Config = Config()) {
        self.config = config
        self.frameSize = config.sampleRate * config.frameMs / 1_000
    }

    /// True while an utterance is being heard.
    public var isSpeaking: Bool { inSegment }

    /// Feeds more audio and returns the utterances that finished with it.
    public mutating func feed(_ samples: [Float]) -> [[Float]] {
        pending.append(contentsOf: samples)
        var done: [[Float]] = []
        while pending.count >= frameSize {
            let frame = Array(pending.prefix(frameSize))
            pending.removeFirst(frameSize)
            if let finished = process(frame) { done.append(finished) }
        }
        return done
    }

    /// The microphone stopped: returns the utterance in progress, if it was long enough.
    public mutating func flush() -> [Float]? {
        let finished = inSegment ? finish() : nil
        pending.removeAll()
        preRoll.removeAll()
        loudRun = 0
        loudFrames.removeAll()
        recentLevels.removeAll()
        return finished
    }

    private mutating func process(_ frame: [Float]) -> [Float]? {
        let level = rms(frame)
        // The room's level is learned all the time: it drops fast when it gets quieter and rises
        // slowly (about 6 s) when it gets louder, so a steady fan or music becomes "silence"
        // while speech, which comes and goes, stays above it.
        noiseFloor = level < noiseFloor ? 0.9 * noiseFloor + 0.1 * level : 0.995 * noiseFloor + 0.005 * level
        recentLevels.append(level)
        if recentLevels.count > config.minWindowFrames { recentLevels.removeFirst() }
        // A room that was already noisy when listening began (a video, a fan, typing) would
        // otherwise be heard as one 9-15 s "utterance" until the slow estimate caught up.
        let steady = recentLevels.count >= config.minWindowFrames ? (recentLevels.min() ?? 0) : 0
        let floor = max(noiseFloor, steady)
        let ratio = inSegment ? config.continueRatio : config.speechRatio
        let loud = level > max(config.minThreshold, floor * ratio)

        if !inSegment {
            if loud {
                loudRun += 1
                loudFrames.append(frame)
                if loudRun >= config.startFrames {
                    inSegment = true
                    silentRun = 0
                    leadFrames = preRoll.count
                    segment = preRoll + loudFrames
                    preRoll.removeAll()
                    loudFrames.removeAll()
                    loudRun = 0
                }
            } else {
                // Quiet again: what looked like the start was a bump, so it joins the background.
                if loudRun > 0 { preRoll.append(contentsOf: loudFrames) }
                loudRun = 0
                loudFrames.removeAll()
                preRoll.append(frame)
                let keep = max(1, config.preRollMs / config.frameMs)
                if preRoll.count > keep { preRoll.removeFirst(preRoll.count - keep) }
            }
            return nil
        }

        segment.append(frame)
        silentRun = loud ? 0 : silentRun + 1
        let silentMs = silentRun * config.frameMs
        let totalMs = segment.count * config.frameMs
        if silentMs >= config.endSilenceMs || totalMs >= config.maxSegmentMs {
            return finish()
        }
        return nil
    }

    private mutating func finish() -> [Float]? {
        defer {
            segment.removeAll()
            inSegment = false
            silentRun = 0
            leadFrames = 0
        }
        let tailFrames = max(1, config.tailMs / config.frameMs)
        let extraSilence = max(0, silentRun - tailFrames)
        let kept = segment.dropLast(min(extraSilence, segment.count))
        // From the first loud frame to the last one: what was actually spoken.
        let speechFrames = segment.count - leadFrames - silentRun
        guard speechFrames * config.frameMs >= config.minSpeechMs else { return nil }
        return kept.flatMap { $0 }
    }

    private func rms(_ frame: [Float]) -> Float {
        guard !frame.isEmpty else { return 0 }
        var sum: Float = 0
        for sample in frame { sum += sample * sample }
        return (sum / Float(frame.count)).squareRoot()
    }
}
