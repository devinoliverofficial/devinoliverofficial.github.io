// Capacitor's own web view controller, with Greenroom's own plugins registered (DayBar, the lock-screen day bar; Alarms,
// the stage and bus call alarms). Plugins from npm (App, StatusBar, PushNotifications) register themselves; a plugin that
// lives inside the app is registered here, which is Capacitor's documented way ("Custom Native iOS Code"). prepare.sh
// points the scene at this class.

import UIKit
import WebKit
import Capacitor

class GreenroomViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DayBarPlugin())
        bridge?.registerPluginInstance(AlarmsPlugin())
        MainFrameOnlyBridge.install(on: bridge)
    }
}

// Only the app's own page reaches the plugins (2026-10-23). An opened spot card frames a page of the website (Apple's
// place card, place.html, with Apple's MapKit JS in it), and Capacitor 8 hands a message from ANY frame to the plugins:
// it never asks which frame sent it (WebViewDelegationHandler's userContentController), although its own bridge script
// is put in the app's page alone (forMainFrameOnly). So its "bridge" message handler is wrapped: a message from a frame
// inside the page is dropped before Capacitor sees it; the app's own page goes through exactly as before.
final class MainFrameOnlyBridge: NSObject, WKScriptMessageHandler {
    private weak var inner: WebViewDelegationHandler?

    init(_ inner: WebViewDelegationHandler) {
        self.inner = inner
    }

    // Called once, before the app's page loads. ("bridge" is the name Capacitor 8 gives its handler: the name its
    // bridge script posts to. A handler is taken off before one of the same name is added; WebKit refuses two.)
    static func install(on bridge: CAPBridgeProtocol?) {
        guard let handler = (bridge as? CapacitorBridge)?.webViewDelegationHandler else { return }
        let content = handler.contentController
        content.removeScriptMessageHandler(forName: "bridge")
        content.add(MainFrameOnlyBridge(handler), name: "bridge")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        inner?.userContentController(userContentController, didReceive: message)
    }
}
