/**
 * Expo Config Plugin for @rick427/background-timer
 *
 * Automatically configures the native projects so that users don't have
 * to touch AndroidManifest.xml or Info.plist manually.
 *
 * iOS changes:
 *  - Adds "background-processing" to UIBackgroundModes in Info.plist
 *  - Adds BGTaskSchedulerPermittedIdentifiers to Info.plist
 *
 * Android changes:
 *  - All permissions + components are declared in the library's own
 *    AndroidManifest.xml and merged automatically. No changes needed here
 *    except verifying the merge.
 *
 * Usage in app.config.js / app.json:
 *   {
 *     "plugins": [
 *       ["@rick427/background-timer", {
 *         "taskIdentifiers": ["com.myapp.session-timeout"],
 *         "androidNotification": {
 *           "icon": "ic_timer",
 *           "color": "#FF6B35"
 *         }
 *       }]
 *     ]
 *   }
 */

const { withInfoPlist, withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @param {object} options
 * @param {string[]} [options.taskIdentifiers]   iOS BGTask identifiers to register
 * @param {object}  [options.androidNotification] Default notification config
 */
function withBackgroundTimer(config, options = {}) {
  const {
    taskIdentifiers = [],
    androidNotification = {},
  } = options;

  // ── iOS: Info.plist ────────────────────────────────────────────────────────
  config = withInfoPlist(config, (mod) => {
    const plist = mod.modResults;

    // 1. Background modes
    if (!plist.UIBackgroundModes) {
      plist.UIBackgroundModes = [];
    }
    const modes = plist.UIBackgroundModes;
    if (!modes.includes('processing')) modes.push('processing');
    if (!modes.includes('fetch')) modes.push('fetch');

    // 2. BGTaskSchedulerPermittedIdentifiers
    // Always add our base processing task identifier
    const baseId = 'com.rick427.backgroundtimer.processing';
    const allIds = [baseId, ...taskIdentifiers];

    if (!plist.BGTaskSchedulerPermittedIdentifiers) {
      plist.BGTaskSchedulerPermittedIdentifiers = [];
    }

    allIds.forEach((id) => {
      if (!plist.BGTaskSchedulerPermittedIdentifiers.includes(id)) {
        plist.BGTaskSchedulerPermittedIdentifiers.push(id);
      }
    });

    return mod;
  });

  // ── Android: Nothing extra needed — AndroidManifest is in the library ─────
  // But we can optionally add the SCHEDULE_EXACT_ALARM permission note
  config = withAndroidManifest(config, (mod) => {
    // All our permissions are declared in the library AndroidManifest.xml
    // which is merged by AGP automatically.
    // Nothing to do here — but this is where you'd add app-specific overrides.
    return mod;
  });

  return config;
}

module.exports = createRunOncePlugin(
  withBackgroundTimer,
  '@rick427/background-timer',
  '1.0.0'
);
