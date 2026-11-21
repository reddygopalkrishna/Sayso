import Testing

@testable import SaysoHelperCore

@Suite struct AudioGainBehaviour {
    @Test func quietSpeechIsLiftedTowardsTheTarget() {
        let out = AudioGain.lifted([0.1, -0.1, 0.05])
        #expect(abs((out.map { abs($0) }.max() ?? 0) - 0.5) < 0.0001)
    }

    @Test func theLiftIsCapped() {
        let out = AudioGain.lifted([0.01, -0.01])
        #expect(abs(out[0] - 0.08) < 0.0001)
    }

    @Test func loudAudioIsLeftAlone() {
        let samples: [Float] = [0.6, -0.9, 0.2]
        #expect(AudioGain.lifted(samples) == samples)
    }

    @Test func silenceIsLeftAlone() {
        let samples: [Float] = [0.0001, -0.0002, 0]
        #expect(AudioGain.lifted(samples) == samples)
        #expect(AudioGain.lifted([]).isEmpty)
    }
}
