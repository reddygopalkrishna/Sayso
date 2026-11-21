import Foundation
import Testing

@testable import SaysoHelperCore

/// A clock the test moves by hand.
private final class FakeClock: @unchecked Sendable {
    private let lock = NSLock()
    private var at = ContinuousClock.now
    func advance(ms: Int) { lock.withLock { at = at.advanced(by: .milliseconds(ms)) } }
    func now() -> ContinuousClock.Instant { lock.withLock { at } }
}

@Suite struct StartProbeBehaviour {
    @Test func reportsEachPartOfTheTripFromTheKey() throws {
        let clock = FakeClock()
        let keyDown = clock.now()
        clock.advance(ms: 40)  // the key's trip to the app and back
        let probe = StartProbe(keyDownAt: keyDown, now: { clock.now() })
        clock.advance(ms: 90)  // permission, engine, converter, start
        probe.engineStarted()
        clock.advance(ms: 70)  // first buffer
        let report = try #require(probe.firstSample())
        #expect(report.keyDownToRequestMs == 40)
        #expect(report.setupMs == 90)
        #expect(report.firstBufferMs == 70)
        #expect(report.keyDownToFirstMs == 200)
        #expect(report.line == "[mic] key down → first audio 200 ms (request 40 ms after the key, setup 90 ms, first audio 70 ms later)")
    }

    @Test func reportsOnlyOnceAndOnlyAfterTheEngineStarted() throws {
        let clock = FakeClock()
        let probe = StartProbe(keyDownAt: nil, now: { clock.now() })
        #expect(probe.firstSample() == nil)  // a buffer before the engine is marked running
        probe.engineStarted()
        clock.advance(ms: 20)
        #expect(probe.firstSample() != nil)
        #expect(probe.firstSample() == nil)
    }

    @Test func withoutAKeyTimeItReportsFromTheRequest() throws {
        let clock = FakeClock()
        let probe = StartProbe(keyDownAt: nil, now: { clock.now() })
        clock.advance(ms: 100)
        probe.engineStarted()
        clock.advance(ms: 50)
        let report = try #require(probe.firstSample())
        #expect(report.keyDownToFirstMs == nil)
        #expect(report.line == "[mic] request → first audio 150 ms (setup 100 ms, first audio 50 ms later)")
    }

    @Test func aKeyTimeFromLongAgoIsNotThisPress() throws {
        let clock = FakeClock()
        let old = clock.now()
        clock.advance(ms: 60_000)
        let probe = StartProbe(keyDownAt: old, now: { clock.now() })
        probe.engineStarted()
        let report = try #require(probe.firstSample())
        #expect(report.keyDownToFirstMs == nil)
    }
}
