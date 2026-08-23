const { withEntitlementsPlist } = require('@expo/config-plugins');

// expo-notifications always adds the `aps-environment` entitlement so remote push works.
// That entitlement requires an App ID with the Push Notifications capability, which a
// free/personal Apple Developer team cannot provision -- it fails the whole build with
// "does not support the Push Notifications capability" even though nothing else in the
// app needs it yet. This must be declared BEFORE expo-notifications in app.json's
// plugins array: @expo/config-plugins chains same-key mods in reverse declaration
// order (the last-declared plugin's action runs first, then hands off down to
// earlier ones), so declaring this one earlier makes it run after
// expo-notifications has already added the key, letting it see and delete it.
function withIosDisablePushEntitlement(config) {
  return withEntitlementsPlist(config, (configWithEntitlements) => {
    delete configWithEntitlements.modResults['aps-environment'];
    return configWithEntitlements;
  });
}

module.exports = withIosDisablePushEntitlement;
