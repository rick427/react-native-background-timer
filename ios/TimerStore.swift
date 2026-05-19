import Foundation

/**
 * TimerStore
 *
 * Persists TimerData to UserDefaults so timers survive app kills.
 * Uses JSON encoding/decoding via Codable.
 */
final class TimerStore {

  private static let suite = "com.rick427.backgroundtimer"
  private static let keyPrefix = "timer_"

  private let defaults: UserDefaults

  init() {
    self.defaults = UserDefaults(suiteName: Self.suite) ?? .standard
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  func save(_ timer: TimerData) {
    guard timer.persist else { return }
    guard let data = try? JSONEncoder().encode(timer) else { return }
    defaults.set(data, forKey: key(for: timer.id))
  }

  func delete(id: String) {
    defaults.removeObject(forKey: key(for: id))
  }

  func clear() {
    defaults.dictionaryRepresentation()
      .keys
      .filter { $0.hasPrefix(Self.keyPrefix) }
      .forEach { defaults.removeObject(forKey: $0) }
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  func load(id: String) -> TimerData? {
    guard let data = defaults.data(forKey: key(for: id)) else { return nil }
    return try? JSONDecoder().decode(TimerData.self, from: data)
  }

  func loadAll() -> [TimerData] {
    return defaults.dictionaryRepresentation()
      .filter { $0.key.hasPrefix(Self.keyPrefix) }
      .compactMap { (_, value) -> TimerData? in
        guard let data = value as? Data else { return nil }
        return try? JSONDecoder().decode(TimerData.self, from: data)
      }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private func key(for id: String) -> String {
    "\(Self.keyPrefix)\(id)"
  }
}
