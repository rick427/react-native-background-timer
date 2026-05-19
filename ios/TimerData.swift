import Foundation

// ─── Timer Status ─────────────────────────────────────────────────────────────

@objc enum TimerStatus: Int {
  case idle
  case running
  case paused
  case completed
  case stopped

  var stringValue: String {
    switch self {
    case .idle:      return "idle"
    case .running:   return "running"
    case .paused:    return "paused"
    case .completed: return "completed"
    case .stopped:   return "stopped"
    }
  }

  static func from(_ string: String) -> TimerStatus {
    switch string {
    case "running":   return .running
    case "paused":    return .paused
    case "completed": return .completed
    case "stopped":   return .stopped
    default:          return .idle
    }
  }
}

// ─── Timer Model ──────────────────────────────────────────────────────────────

struct TimerData: Codable {
  var id: String
  var status: String           // uses string for Codable simplicity
  var duration: TimeInterval   // ms
  var elapsed: TimeInterval    // ms
  var remaining: TimeInterval  // ms
  var tickInterval: TimeInterval
  var startedAt: TimeInterval  // epoch ms (0 = never)
  var completedAt: TimeInterval
  var pausedAt: TimeInterval
  var persist: Bool
  var iosTaskIdentifier: String

  var timerStatus: TimerStatus { TimerStatus.from(status) }

  init(
    id: String,
    status: TimerStatus = .idle,
    duration: TimeInterval,
    elapsed: TimeInterval = 0,
    remaining: TimeInterval? = nil,
    tickInterval: TimeInterval = 1000,
    startedAt: TimeInterval = 0,
    completedAt: TimeInterval = 0,
    pausedAt: TimeInterval = 0,
    persist: Bool = true,
    iosTaskIdentifier: String = ""
  ) {
    self.id = id
    self.status = status.stringValue
    self.duration = duration
    self.elapsed = elapsed
    self.remaining = remaining ?? duration
    self.tickInterval = tickInterval
    self.startedAt = startedAt
    self.completedAt = completedAt
    self.pausedAt = pausedAt
    self.persist = persist
    self.iosTaskIdentifier = iosTaskIdentifier.isEmpty
      ? "com.rick427.backgroundtimer.\(id)"
      : iosTaskIdentifier
  }

  /// Convert to the dictionary format expected by React Native
  func toRNMap() -> [String: Any] {
    return [
      "id": id,
      "status": status,
      "duration": duration,
      "elapsed": elapsed,
      "remaining": remaining,
      "startedAt": startedAt,
      "completedAt": completedAt,
      "pausedAt": pausedAt,
    ]
  }
}
