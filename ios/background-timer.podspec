require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name            = "background-timer"
  s.version         = package["version"]
  s.summary         = package["description"]
  s.homepage        = package["homepage"]
  s.license         = package["license"]
  s.authors         = package["author"]
  s.platforms       = { :ios => "13.0" }
  s.source          = { :git => package["repository"]["url"], :tag => "#{s.version}" }

  s.source_files    = "ios/**/*.{h,m,mm,swift}"

  # Swift requires a bridging header when mixing with ObjC
  s.pod_target_xcconfig = {
    "SWIFT_OBJC_BRIDGING_HEADER" => "$(PODS_ROOT)/../ios/RNBackgroundTimer-Bridging-Header.h",
    "DEFINES_MODULE"             => "YES",
    "SWIFT_VERSION"              => "5.9",
  }

  # New Architecture (Turbo Modules + Codegen)
  s.dependency "React-Core"
  install_modules_dependencies(s)
end
