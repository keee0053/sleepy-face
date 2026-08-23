import ActivityKit
import ExpoModulesCore
import Foundation

#if canImport(AlarmKit)
import AppIntents
import AlarmKit
import SwiftUI
#endif

public final class AlarmRingingModule: Module {
  public func definition() -> ModuleDefinition {
    // Keep the existing JS-facing module name so Android and iOS can share
    // src/services/android-alarm-mechanics.ts for now.
    Name("AndroidAlarmMechanics")

    AsyncFunction("canScheduleExactAlarms") { () async throws -> Bool in
      return try await AlarmKitBridge.canScheduleAlarms()
    }

    AsyncFunction("openExactAlarmSettings") { () async throws -> Void in
      try await AlarmKitBridge.requestAuthorization()
    }

    AsyncFunction("getNotificationPermissionStatus") { () async throws -> String in
      return try await AlarmKitBridge.authorizationStatus()
    }

    AsyncFunction("requestNotificationPermission") { () async throws -> String in
      return try await AlarmKitBridge.requestAuthorizationStatus()
    }

    // `soundId` matches one of the ids in src/constants/alarm-sounds.ts. The matching
    // .wav files are bundled into the iOS project as resources (see the "sounds" option
    // on the expo-notifications plugin in app.json) so AlarmKit can play them by name.
    AsyncFunction("scheduleTestAlarmAfterSeconds") { (seconds: Int, soundId: String?) async throws -> [String: String] in
      let alarmID = "test-alarm"
      let triggerAtMillis = Int64(Date().timeIntervalSince1970 * 1000) + Int64(seconds * 1000)

      return try await AlarmKitBridge.scheduleAlarm(
        alarmID: alarmID,
        triggerAtMillis: triggerAtMillis,
        soundId: soundId
      )
    }

    AsyncFunction("cancelScheduledTestAlarm") { () async throws -> Void in
      try await AlarmKitBridge.cancelAlarm(alarmID: "test-alarm")
    }

    AsyncFunction("scheduleSavedAlarmOccurrence") { (alarmID: String, triggerAtMillis: Int64, soundId: String?) async throws -> [String: String] in
      return try await AlarmKitBridge.scheduleAlarm(
        alarmID: alarmID,
        triggerAtMillis: triggerAtMillis,
        soundId: soundId
      )
    }

    AsyncFunction("cancelSavedAlarmOccurrence") { (alarmID: String) async throws -> Void in
      try await AlarmKitBridge.cancelAlarm(alarmID: alarmID)
    }

    AsyncFunction("getRingingAlarmState") { () -> [String: String]? in
      // AlarmKit owns the lock-screen alert state. The React Native ringing
      // screen can be opened from the app after the alert brings the user back.
      return nil
    }

    AsyncFunction("stopRingingAlarm") { () async throws -> Void in
      await AlarmKitBridge.stopActiveRingingAlarm()
    }

    AsyncFunction("consumePendingWakeChallengeRoute") { () -> [String: String]? in
      return AlarmKitBridge.consumePendingWakeChallengeRoute()
    }
  }
}

private enum AlarmKitBridge {
  private static let pendingWakeChallengeAlarmIDKey =
    "sleepy-face:pending-wake-challenge:alarm-id"
  private static let pendingWakeChallengeStartedAtKey =
    "sleepy-face:pending-wake-challenge:started-at"
  // Read by rearmAlarm() so a re-armed alarm (see below) keeps playing the sound
  // the user originally picked, not the system default.
  private static let activeAlarmSoundIdKey =
    "sleepy-face:active-ringing-alarm:sound-id"
  // How soon a stopped-via-slide-to-stop alarm rings again -- short enough to feel
  // like it never really stopped, long enough for AlarmKit to accept the schedule.
  private static let rearmDelaySeconds: TimeInterval = 1

  static func canScheduleAlarms() async throws -> Bool {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      return try await requestAuthorization()
    }
    #endif

    throw AlarmKitUnavailableException()
  }

  static func authorizationStatus() async throws -> String {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      switch AlarmManager.shared.authorizationState {
      case .authorized:
        return "granted"
      case .denied:
        return "denied"
      default:
        return "undetermined"
      }
    }
    #endif

    throw AlarmKitUnavailableException()
  }

  @discardableResult
  static func requestAuthorization() async throws -> Bool {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      let state = try await AlarmManager.shared.requestAuthorization()
      return state == .authorized
    }
    #endif

    throw AlarmKitUnavailableException()
  }

  static func requestAuthorizationStatus() async throws -> String {
    return try await requestAuthorization() ? "granted" : "denied"
  }

  // Keep in sync with src/constants/alarm-sounds.ts and the .wav files bundled via
  // the expo-notifications plugin's "sounds" option in app.json.
  static func alertSound(for soundId: String?) -> ActivityKit.AlertConfiguration.AlertSound {
    switch soundId {
    case "classic_beep":
      return .named("classic_beep.wav")
    case "digital_pulse":
      return .named("digital_pulse.wav")
    case "gentle_chime":
      return .named("gentle_chime.wav")
    default:
      return .default
    }
  }

  static func scheduleAlarm(
    alarmID: String,
    triggerAtMillis: Int64,
    soundId: String? = nil
  ) async throws -> [String: String] {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      guard try await requestAuthorization() else {
        throw AlarmKitAuthorizationDeniedException()
      }

      let id = stableUUID(from: alarmID)
      let date = Date(timeIntervalSince1970: TimeInterval(triggerAtMillis) / 1000)
      let schedule = Alarm.Schedule.fixed(date)
      // Two distinct intent instances (not the same one reused) so perform() can
      // tell which button was actually tapped -- see actionKind below.
      let stopWakeChallengeIntent = OpenWakeChallengeIntent(
        alarmID: alarmID,
        startedAt: date.ISO8601Format(),
        actionKind: OpenWakeChallengeIntent.stopActionKind
      )
      let secondaryWakeChallengeIntent = OpenWakeChallengeIntent(
        alarmID: alarmID,
        startedAt: date.ISO8601Format(),
        actionKind: OpenWakeChallengeIntent.secondaryActionKind
      )

      // AlarmKit provides the stop control automatically. We connect both the
      // stop action and the secondary action to Sleepy Face so stopping the
      // system alarm still returns the user to the wake challenge flow.
      // iOS 26.0 still needs the deprecated stopButton initializer. The newer
      // initializer without stopButton is only available from iOS 26.1.
      // AlarmKit reuses tintColor for both the compact Live Activity banner's
      // icon/text (sits on a dark background, so tintColor must be light) and the
      // lock screen alert's button fill (so AlarmButton.textColor here must be the
      // opposite -- dark -- or the buttons render as solid tintColor-on-tintColor).
      let alert = AlarmPresentation.Alert(
        title: "眠そうな顔",
        stopButton: AlarmButton(
          text: "停止",
          textColor: .black,
          systemImageName: "stop.fill"
        ),
        secondaryButton: AlarmButton(
          text: "起床確認",
          textColor: .black,
          systemImageName: "camera.fill"
        ),
        secondaryButtonBehavior: .custom
      )
      let presentation = AlarmPresentation(alert: alert)
      let attributes = AlarmAttributes(
        presentation: presentation,
        metadata: SleepyFaceAlarmMetadata(alarmID: alarmID),
        tintColor: Color.white
      )
      let configuration = AlarmManager.AlarmConfiguration.alarm(
        schedule: schedule,
        attributes: attributes,
        stopIntent: stopWakeChallengeIntent,
        secondaryIntent: secondaryWakeChallengeIntent,
        sound: alertSound(for: soundId)
      )

      // Read back by rearmAlarm() when the stop control is used -- see perform().
      if let soundId {
        UserDefaults.standard.set(soundId, forKey: activeAlarmSoundIdKey)
      } else {
        UserDefaults.standard.removeObject(forKey: activeAlarmSoundIdKey)
      }

      // Track from the moment it's armed (not just once a button is tapped) so
      // startObservingAlarmUpdatesIfNeeded can catch a silence -- e.g. via the
      // side button -- even on the very first ring.
      UserDefaults.standard.set(alarmID, forKey: activeRingingAlarmIDKey)
      startObservingAlarmUpdatesIfNeeded()

      try? await AlarmManager.shared.cancel(id: id)
      _ = try await AlarmManager.shared.schedule(
        id: id,
        configuration: configuration
      )

      return [
        "alarmId": alarmID,
        "scheduledFor": date.ISO8601Format()
      ]
    }
    #endif

    throw AlarmKitUnavailableException()
  }

  static func cancelAlarm(alarmID: String) async throws {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      try await AlarmManager.shared.cancel(id: stableUUID(from: alarmID))
      return
    }
    #endif

    throw AlarmKitUnavailableException()
  }

  static func stopAlarm(alarmID: String) {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) {
      try? AlarmManager.shared.stop(id: stableUUID(from: alarmID))
    }
    #endif
  }

  // The alarm keeps ringing through Face Check -- tapping 起床確認 only opens the
  // camera flow, it doesn't stop the sound. This key tracks which alarm is still
  // ringing so JS's stopRingingAlarm() (called from face-check.tsx on Face
  // Verification success or the 3rd Bad Photo Attempt) knows which one to stop.
  // It's separate from pendingWakeChallengeAlarmIDKey below, which is consumed
  // (and cleared) by the routing hand-off long before the photo is taken.
  //
  // Simplification: this only tracks the single most-recently-armed alarm. If
  // multiple alarms are scheduled and a different, untracked one is the one that
  // actually fires, stopActiveRingingAlarm/startObservingAlarmUpdatesIfNeeded's
  // rearm-on-external-stop won't apply to it. Fine for the common case (one
  // active wake alarm at a time); revisit with a real id-keyed map if that stops
  // being true.
  private static let activeRingingAlarmIDKey =
    "sleepy-face:active-ringing-alarm:alarm-id"

  private static var isObservingAlarmUpdates = false

  // The side/volume button silence gesture has no public AppIntent or callback of
  // its own (unlike the on-screen stop control, wired to stopIntent) -- iOS just
  // silences the alert directly. This watches AlarmManager's own state stream
  // instead, so it catches ANY way the tracked alarm stops alerting, regardless
  // of cause. Started once (lazily, from scheduleAlarm) and left running for the
  // life of the process.
  static func startObservingAlarmUpdatesIfNeeded() {
    #if canImport(AlarmKit)
    guard !isObservingAlarmUpdates else { return }
    isObservingAlarmUpdates = true

    if #available(iOS 26.0, *) {
      Task {
        // Edge-triggered on purpose: only re-arm on an alerting -> not-alerting
        // transition for the alarm we're tracking, never merely because it isn't
        // alerting right now (e.g. it's sitting in .scheduled for the ~1s between
        // a rearm and its next ring -- treating that as "stopped" would rearm in
        // a tight loop).
        var wasAlerting = false

        for await alarms in AlarmManager.shared.alarmUpdates {
          guard let trackedAlarmID = UserDefaults.standard.string(forKey: activeRingingAlarmIDKey) else {
            wasAlerting = false
            continue
          }

          let trackedID = stableUUID(from: trackedAlarmID)
          let isCurrentlyAlerting = alarms.contains { $0.id == trackedID && $0.state == .alerting }

          if isCurrentlyAlerting {
            wasAlerting = true
            continue
          }

          if wasAlerting {
            wasAlerting = false
            await rearmAlarm(alarmID: trackedAlarmID)
          }
        }
      }
    }
    #endif
  }

  static func stopActiveRingingAlarm() async {
    let defaults = UserDefaults.standard

    guard let alarmID = defaults.string(forKey: activeRingingAlarmIDKey) else {
      return
    }

    defaults.removeObject(forKey: activeRingingAlarmIDKey)
    defaults.removeObject(forKey: activeAlarmSoundIdKey)
    stopAlarm(alarmID: alarmID)
    // Also cancel: rearmAlarm() may have just re-scheduled this same alarmID a few
    // seconds out (see perform()) right before the user finished the challenge --
    // stop() alone only silences an alarm that's currently ringing, it does
    // nothing to one that's merely scheduled to ring again shortly.
    try? await cancelAlarm(alarmID: alarmID)
  }

  // Re-rings the same alarm shortly after the built-in stop control silences it --
  // see the isStopAction branch in OpenWakeChallengeIntent.perform(). Best-effort:
  // if this fails (e.g. authorization was somehow revoked), the alarm just stays
  // stopped rather than blocking the user from reaching the camera at all.
  static func rearmAlarm(alarmID: String) async {
    let soundId = UserDefaults.standard.string(forKey: activeAlarmSoundIdKey)
    let triggerAtMillis =
      Int64(Date().timeIntervalSince1970 * 1000) + Int64(rearmDelaySeconds * 1000)

    _ = try? await scheduleAlarm(
      alarmID: alarmID,
      triggerAtMillis: triggerAtMillis,
      soundId: soundId
    )
  }

  static func storePendingWakeChallengeRoute(alarmID: String, startedAt: String) {
    let defaults = UserDefaults.standard
    defaults.set(alarmID, forKey: pendingWakeChallengeAlarmIDKey)
    defaults.set(startedAt, forKey: pendingWakeChallengeStartedAtKey)
    defaults.set(alarmID, forKey: activeRingingAlarmIDKey)
  }

  static func consumePendingWakeChallengeRoute() -> [String: String]? {
    let defaults = UserDefaults.standard
    guard let alarmID = defaults.string(forKey: pendingWakeChallengeAlarmIDKey) else {
      return nil
    }

    let startedAt = defaults.string(forKey: pendingWakeChallengeStartedAtKey)
      ?? Date().ISO8601Format()

    defaults.removeObject(forKey: pendingWakeChallengeAlarmIDKey)
    defaults.removeObject(forKey: pendingWakeChallengeStartedAtKey)

    return [
      "alarmId": alarmID,
      "startedAt": startedAt
    ]
  }

  private static func stableUUID(from value: String) -> UUID {
    let bytes = Array(value.utf8)
    var uuidBytes = [UInt8](repeating: 0, count: 16)

    for (index, byte) in bytes.enumerated() {
      uuidBytes[index % 16] = uuidBytes[index % 16] &+ byte &+ UInt8(index & 0xff)
    }

    // Mark as UUIDv5-like and RFC 4122 variant so the string is stable and valid.
    uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50
    uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80

    return UUID(uuid: (
      uuidBytes[0],
      uuidBytes[1],
      uuidBytes[2],
      uuidBytes[3],
      uuidBytes[4],
      uuidBytes[5],
      uuidBytes[6],
      uuidBytes[7],
      uuidBytes[8],
      uuidBytes[9],
      uuidBytes[10],
      uuidBytes[11],
      uuidBytes[12],
      uuidBytes[13],
      uuidBytes[14],
      uuidBytes[15]
    ))
  }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
private struct SleepyFaceAlarmMetadata: AlarmMetadata {
  let alarmID: String
}

@available(iOS 26.0, *)
public struct OpenWakeChallengeIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "起床確認を開く"
  public static var supportedModes: IntentModes = .foreground(.immediate)

  @Parameter(title: "Alarm ID")
  var alarmID: String

  @Parameter(title: "Started At")
  var startedAt: String

  // Distinguishes which button was tapped even though both wire to this same
  // intent type -- see the two separate instances built in
  // AlarmKitBridge.scheduleAlarm (stopWakeChallengeIntent / secondaryWakeChallengeIntent).
  // A String, not a Bool: a Bool @Parameter was found not to reliably survive
  // being persisted and later reconstructed by the system for the actual
  // stop-button invocation (it silently came back as the init() default every
  // time), while the existing String parameters (alarmID/startedAt) round-trip
  // correctly, so this follows that same working pattern instead.
  @Parameter(title: "Action Kind")
  var actionKind: String

  public static let stopActionKind = "stop"
  public static let secondaryActionKind = "secondary"

  public init() {
    alarmID = ""
    startedAt = ""
    actionKind = OpenWakeChallengeIntent.secondaryActionKind
  }

  public init(alarmID: String, startedAt: String, actionKind: String) {
    self.alarmID = alarmID
    self.startedAt = startedAt
    self.actionKind = actionKind
  }

  public func perform() async throws -> some IntentResult & OpensIntent {
    let wakeChallengeStartedAt = startedAt.isEmpty ? Date().ISO8601Format() : startedAt

    // Either button opens the camera flow -- neither stops the alarm here:
    //   - Tapping stop: the system already silences the alarm regardless of what
    //     perform() does here, so there's nothing for us to stop. Instead we
    //     immediately re-arm the same alarm to ring again shortly (see
    //     AlarmKitBridge.rearmAlarm) so it effectively keeps nagging until the
    //     wake challenge actually completes.
    //   - Tapping 起床確認: the alarm keeps ringing on its own (stop is NOT
    //     automatic for this button) until stopRingingAlarm() is called from
    //     face-check.tsx on Face Verification success or the 3rd Bad Photo
    //     Attempt (see AlarmKitBridge.stopActiveRingingAlarm).
    AlarmKitBridge.storePendingWakeChallengeRoute(
      alarmID: alarmID,
      startedAt: wakeChallengeStartedAt
    )

    if actionKind == OpenWakeChallengeIntent.stopActionKind {
      await AlarmKitBridge.rearmAlarm(alarmID: alarmID)
    }

    var components = URLComponents(string: "sleepyface:///face-check")
    components?.queryItems = [
      URLQueryItem(name: "alarmId", value: alarmID),
      URLQueryItem(name: "badPhotoAttempts", value: "0"),
      URLQueryItem(name: "startedAt", value: wakeChallengeStartedAt)
    ]

    guard let url = components?.url else {
      return .result()
    }

    return .result(opensIntent: OpenURLIntent(url))
  }
}
#endif

private final class AlarmKitUnavailableException: Exception {
  override var reason: String {
    "AlarmKit is available only on iOS 26.0 or newer."
  }
}

private final class AlarmKitAuthorizationDeniedException: Exception {
  override var reason: String {
    "AlarmKit authorization was denied."
  }
}
