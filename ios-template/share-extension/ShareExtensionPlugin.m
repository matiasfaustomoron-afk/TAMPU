//
//  ShareExtensionPlugin.m — Obj-C bridge para que Capacitor registre el plugin.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ShareExtensionPlugin, "ShareExtension",
    CAP_PLUGIN_METHOD(consumePendingShare, CAPPluginReturnPromise);
)
