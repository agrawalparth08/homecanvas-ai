/**
 * electron-builder afterSign hook — notarize the signed .app ONLY when Apple
 * credentials are present in the environment. With no creds it is a clean no-op,
 * so the default unsigned `npm run dist:mac` is unaffected. Enable by exporting
 * APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID and running dist:mac:signed.
 */
exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('  • notarize: skipped (set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID to enable)');
    return;
  }

  let notarize;
  try {
    ({ notarize } = require('@electron/notarize'));
  } catch {
    console.log('  • notarize: @electron/notarize not installed — run `npm i -D @electron/notarize`');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  console.log(`  • notarizing ${appName}.app — this can take several minutes…`);
  await notarize({
    appBundleId: 'com.homecanvas.app',
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
  console.log('  • notarize: done');
};
