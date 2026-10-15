# Sentinel Guard — recovered mobile source

Recovered from your uploaded sentinel-review.zip. Includes login, assigned shifts,
GPS clock-in/out, foreground sharing and background sharing.
No backend, database, admin website or credentials are overwritten by this package.
Your archive did not contain the image assets, so unavailable icon paths have been removed.

## Quick local phone test

Keep this folder in ~/Developer/sentinel-mobile (outside Desktop to avoid the previous slow file loading).

    npm ci --no-audit --no-fund
    npm run setup
    npm start

Mac and phone must share a Wi-Fi network. Open the health URL printed by setup on the phone.
It must return sentinel-api before login can work. The backend must bind to 0.0.0.0:8000,
and DJANGO_ALLOWED_HOSTS must include the Mac IP. Do not use localhost as the phone's API URL.
Re-run setup when your network/IP changes and restart Expo.
For an existing hosted backend use: npm run setup -- https://YOUR-BACKEND-HOST
The hostname is public configuration, not a password.

Open the QR code with a compatible Expo Go app. If Expo Go reports an SDK mismatch,
use the development build instructions below; do not change dependencies at random.
Sign in with the assigned GUARD account, not the administrator.
Set the site's real coordinates and an active shift in the web dashboard first.
At the site: Clock in with GPS → Share while app is open → confirm permission.
Switching apps or locking the phone stops foreground sharing. Reopen and tap Start again.
On the web dashboard: Guard personnel → the guard → GPS location.
It shows last accepted position, accuracy and time. A shift assignment alone does not start tracking.
GPS is the phone location, not independent proof of the person's presence.

## Background sharing (installed development build)

The configuration already requests background location. Background mode needs a native
build plus OS permission; it cannot be verified from source/typechecking.

    npx eas-cli@latest login
    npx eas-cli@latest build:configure
    npx eas-cli@latest build --profile development --platform android

For iPhone use --platform ios instead. EAS may ask you to link/create your Expo project,
choose bundle/package identifiers, register the phone and provide signing credentials.
A physical iPhone EAS build requires Apple signing setup. No build or account was created here.
Install the resulting development app, then:

    npm run start:dev

Open the installed app, clock in and choose Share in background. Grant Always on iPhone
or Allow all the time on Android when requested. Background delivery timing varies by OS;
force-quitting, permissions, battery settings and connectivity can stop updates.
The server marks readings older than 90 seconds stale. Do not treat an old dot as live.

## Important

This package works with your existing Sentinel API routes. Newer backend fixes return
HTTP 409 for closed tracking shifts; older backend versions return 400 and will still
reject the upload. Clock out and Stop sharing explicitly stop native tracking.
A poor/stale GPS reading no longer disables the whole background service automatically.
For release builds use an HTTPS backend. This package does not redeploy your services.

Verified: TypeScript check passed on the recovered source. Physical GPS, background
permissions and iOS/Android builds must still be tested on your phone.

Official setup references:
https://docs.expo.dev/versions/v57.0.0/sdk/location/
https://docs.expo.dev/build/eas-json/
