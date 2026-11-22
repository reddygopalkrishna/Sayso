/// Quiet speech (a person a little away from the microphone) is brought up before it is read by the
/// speech model, which is less accurate on faint audio. Loud audio is left alone, and the lift is
/// capped so a stretch of room noise is not turned into something that sounds like speech.
public enum AudioGain {
    /// The loudest sample is brought up to this (when it is below it).
    public static let target: Float = 0.5
    /// The most the audio is ever lifted, as a multiple.
    public static let maxGain: Float = 8
    /// Below this the recording is silence: nothing to lift.
    public static let floor: Float = 0.0005

    public static func lifted(_ samples: [Float]) -> [Float] {
        var peak: Float = 0
        for sample in samples { peak = max(peak, abs(sample)) }
        guard peak > floor, peak < target else { return samples }
        let gain = min(target / peak, maxGain)
        return samples.map { $0 * gain }
    }

    /// The speech model returns nothing for a recording under about a second (seen live: "backspace"
    /// and "click Save" came back empty, so those commands never ran). Silence is added at the end
    /// so every recording is at least this long.
    public static let minimumSeconds = 1.2

    public static func padded(_ samples: [Float]) -> [Float] {
        let minimum = Int(Double(sampleRate) * minimumSeconds)
        guard !samples.isEmpty, samples.count < minimum else { return samples }
        return samples + [Float](repeating: 0, count: minimum - samples.count)
    }
}
