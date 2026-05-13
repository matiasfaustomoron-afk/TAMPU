//
//  AppleIntelligencePlugin.m — Obj-C bridge para Capacitor.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AppleIntelligencePlugin, "AppleIntelligence",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(generate, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(summarizeTrip, CAPPluginReturnPromise);
)
