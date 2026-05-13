//
//  WidgetBridgePlugin.m — Objective-C bridge para que Capacitor descubra el plugin Swift.
//
//  Copiar a `ios/App/App/Plugins/WidgetBridgePlugin.m` y agregar al target App.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WidgetBridgePlugin, "WidgetBridge",
    CAP_PLUGIN_METHOD(pushWidgetSnapshot, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startFlightLiveActivity, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(updateFlightLiveActivity, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(endFlightLiveActivity, CAPPluginReturnPromise);
)
