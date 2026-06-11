const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin — injects network_security_config.xml into the Android
 * build and wires it up in AndroidManifest.xml so the APK can make plain
 * HTTP requests to the backend.
 */
const withAndroidNetworkSecurity = (config) => {
  // Step 1: Write network_security_config.xml (synchronous — required by EAS)
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'xml'
      );
      if (!fs.existsSync(xmlDir)) {
        fs.mkdirSync(xmlDir, { recursive: true });
      }
      const xmlPath = path.join(xmlDir, 'network_security_config.xml');
      fs.writeFileSync(
        xmlPath,
        [
          '<?xml version="1.0" encoding="utf-8"?>',
          '<network-security-config>',
          '    <base-config cleartextTrafficPermitted="true">',
          '        <trust-anchors>',
          '            <certificates src="system" />',
          '        </trust-anchors>',
          '    </base-config>',
          '</network-security-config>',
        ].join('\n'),
        'utf8'
      );
      console.log('[withAndroidNetworkSecurity] Wrote', xmlPath);
      return config;
    },
  ]);

  // Step 2: Add android:networkSecurityConfig to <application> in AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const mainApp = config.modResults.manifest.application?.[0];
    if (mainApp) {
      mainApp.$['android:networkSecurityConfig'] = '@xml/network_security_config';
      console.log('[withAndroidNetworkSecurity] Set android:networkSecurityConfig in manifest');
    }
    return config;
  });

  return config;
};

module.exports = withAndroidNetworkSecurity;
