package com.rick427.backgroundtimer

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * BackgroundTimerPackage
 *
 * Registers BackgroundTimerModule with the React Native runtime.
 * Uses BaseReactPackage (New Architecture) instead of the legacy
 * ReactPackage interface.
 */
class BackgroundTimerPackage : BaseReactPackage() {

  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? {
    return if (name == BackgroundTimerModule.NAME) {
      BackgroundTimerModule(context)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        BackgroundTimerModule.NAME to ReactModuleInfo(
          _name = BackgroundTimerModule.NAME,
          _className = BackgroundTimerModule::class.java.name,
          _canOverrideExistingModule = false,
          _needsEagerInit = false,
          isCxxModule = false,
          isTurboModule = true,
        )
      )
    }
  }
}
