import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(
      name: "lifeos/google_settings",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel.setMethodCallHandler { call, result in
      guard call.method == "getClientIds" else {
        result(FlutterMethodNotImplemented)
        return
      }
      result([
        "webClientId": Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String ?? "",
        "iosClientId": Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String ?? ""
      ])
    }
  }
}
