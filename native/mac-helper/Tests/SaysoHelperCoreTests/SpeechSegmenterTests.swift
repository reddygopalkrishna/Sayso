import Testing

@testable import SaysoHelperCore

/// Synthetic audio: a 220 Hz tone for speech, a faint hiss for a quiet room.
private func speech(ms: Int, amplitude: Float = 0.3) -> [Float] {
    (0..<(16 * ms)).map { amplitude * Float(sinTone(Double($0) * 220 / 16_000)) }
}

private func quiet(ms: Int) -> [Float] {
    (0..<(16 * ms)).map { 0.002 * Float(sinTone(Double($0) * 97 / 16_000)) }
}

private func sinTone(_ cycles: Double) -> Double {
    // sin(2πx) without Foundation: a small, exact-enough polynomial on the reduced angle.
    let x = cycles - cycles.rounded(.down)
    let a = x < 0.5 ? x : x - 1
    let t = a * 2  // −1…1 over the half-cycles around 0
    return 4 * t * (1 - abs(t)) * (t >= 0 ? 1 : 1)
}

private func segments(of stream: [Float], chunk: Int = 4_800, config: SpeechSegmenter.Config = .init()) -> [[Float]] {
    var segmenter = SpeechSegmenter(config)
    var out: [[Float]] = []
    var index = 0
    while index < stream.count {
        let end = min(index + chunk, stream.count)
        out += segmenter.feed(Array(stream[index..<end]))
        index = end
    }
    if let rest = segmenter.flush() { out.append(rest) }
    return out
}

private func ms(_ samples: [Float]) -> Int { samples.count / 16 }

@Suite struct SpeechSegmenterBehaviour {
    @Test func silenceMakesNoSegments() {
        #expect(segments(of: quiet(ms: 5_000)).isEmpty)
    }

    @Test func oneSpokenSentenceMakesOneSegmentWithoutTheLongSilence() {
        let out = segments(of: quiet(ms: 800) + speech(ms: 1_500) + quiet(ms: 2_000))
        #expect(out.count == 1)
        // The speech, a little before it (pre-roll) and a little after it (tail), not the 2 s of silence.
        #expect(ms(out[0]) >= 1_500 && ms(out[0]) <= 2_300)
    }

    @Test func twoSentencesSeparatedByALongPauseMakeTwoSegments() {
        let out = segments(of: speech(ms: 1_000) + quiet(ms: 1_800) + speech(ms: 1_200) + quiet(ms: 1_500))
        #expect(out.count == 2)
    }

    @Test func aShortPauseInsideASentenceDoesNotSplitIt() {
        let out = segments(of: speech(ms: 900) + quiet(ms: 500) + speech(ms: 900) + quiet(ms: 1_500))
        #expect(out.count == 1)
        #expect(ms(out[0]) >= 2_300)
    }

    @Test func aClickOrCoughIsDropped() {
        let out = segments(of: quiet(ms: 500) + speech(ms: 90) + quiet(ms: 2_000))
        #expect(out.isEmpty)
    }

    @Test func aBriefBumpDoesNotStartAnUtterance() {
        // One loud frame (30 ms) is below the three needed in a row.
        let out = segments(of: quiet(ms: 500) + speech(ms: 30) + quiet(ms: 2_000))
        #expect(out.isEmpty)
    }

    @Test func theResultDoesNotDependOnHowTheAudioArrivesInChunks() {
        let stream = quiet(ms: 600) + speech(ms: 1_300) + quiet(ms: 1_600) + speech(ms: 800) + quiet(ms: 1_400)
        let whole = segments(of: stream, chunk: stream.count)
        let tiny = segments(of: stream, chunk: 7)
        let medium = segments(of: stream, chunk: 1_000)
        #expect(whole.count == 2)
        #expect(tiny.map(\.count) == whole.map(\.count))
        #expect(medium.map(\.count) == whole.map(\.count))
    }

    @Test func aVeryLongUtteranceIsCutAndTheRestIsKept() {
        var config = SpeechSegmenter.Config()
        config.maxSegmentMs = 5_000
        let out = segments(of: speech(ms: 12_000) + quiet(ms: 1_500), config: config)
        #expect(out.count >= 2)
        #expect(ms(out[0]) <= 5_100)
    }

    @Test func stoppingTheMicrophoneReturnsTheUtteranceInProgress() {
        var segmenter = SpeechSegmenter()
        #expect(segmenter.feed(quiet(ms: 500) + speech(ms: 1_000)).isEmpty)
        #expect(segmenter.isSpeaking)
        let rest = segmenter.flush()
        #expect(rest != nil && ms(rest ?? []) >= 1_000)
        #expect(!segmenter.isSpeaking)
    }

    @Test func stoppingDuringAClickReturnsNothing() {
        var segmenter = SpeechSegmenter()
        _ = segmenter.feed(quiet(ms: 300) + speech(ms: 120))
        #expect(segmenter.flush() == nil)
    }

    @Test func aSteadyRoomNoiseIsLearnedAndNotHeardAsSpeech() {
        // A faint hum, louder than pure silence but steady, followed by real speech.
        let hum: [Float] = (0..<(16 * 3_000)).map { 0.012 * Float(sinTone(Double($0) * 60 / 16_000)) }
        let out = segments(of: hum + speech(ms: 1_200) + quiet(ms: 1_500))
        #expect(out.count == 1)
    }
}
