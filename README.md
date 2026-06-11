# 🚬 Smoke Buddy

> Peer pressure, now with push notifications.

**📲 Install it now (iPhone & Android):** https://claudesharee-cmd.github.io/smoke-buddy/
Open the link → browser menu → **Add to Home Screen**. That's it.

A fun, sarcastic squad app for coordinating smoke breaks with your work friends.
One tap summons the squad; everyone RSVPs ("OMW 🏃" / "Gimme 5 🐌" / "Can't 💼"),
and when quorum is reached (e.g. 2 of 5 are in) everybody gets pinged to move.

**No accounts. No server to run.** Squads sync over a shared [ntfy.sh](https://ntfy.sh)
topic derived from your squad code — anyone with the same code is in the same squad.

## Features

- 🔥 **Summon the squad** — one big glowing button, broadcasts to everyone instantly
- ✅ **RSVP** — coming / 5 minutes™ / traitor, with a live roster
- 📢 **Quorum ping** — "2/5 are IN — GO GO GO" notification + confetti when enough people commit
- ⏱️ **15-minute calls** — sessions auto-expire, the instigator can abort
- 📉 **Damage Report** — breaks today/this week, money burned, sarcastic lung status
- 🏆 **Chimney of the Week** — leaderboard of the squad's most committed degenerates
- 😈 Rotating sarcastic copy everywhere, haptics, ambient smoke animation

## Install (Android)

The signed APK is at:

```
android/app/build/outputs/apk/release/app-release.apk
```

Send it to your friends (WhatsApp/Drive/USB), open it on the phone, allow
"install from unknown sources", done.

### Squad setup
1. Everyone installs the APK.
2. Everyone enters **the same squad code** (pick something only your squad would guess —
   it's effectively your password).
3. Set squad size and quorum. Smoke responsibly. Or don't.

> 💡 **Pings with the app fully closed:** notifications fire while the app is open or
> recently used. For bulletproof background pings, install the free **ntfy** app
> and subscribe to the topic shown in Control → Nerd corner.

## iOS

iOS has no APKs — Apple only allows installs via Xcode, TestFlight, or the App Store.
The codebase is iOS-ready via Capacitor:

```bash
# on a Mac with full Xcode installed
npm install
npx cap add ios
npx cap sync ios
npx cap open ios   # then run on your iPhone from Xcode
```

- With a **free** Apple ID: build to your own phone from Xcode (re-sign every 7 days).
- With a **paid** Apple Developer account ($99/yr): distribute to friends via TestFlight.

## Development

```bash
npm install
npx http-server www -p 8717        # run the web app in a browser
npx cap sync android               # copy web assets into the native project
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
  ./gradlew assembleRelease        # build the signed APK
```

- Web app: `www/` (vanilla JS, no framework)
- Sync protocol: JSON events (`call` / `rsvp` / `cancel`) published to
  `https://ntfy.sh/smkbdy-<squad-code>-v1`; state is rebuilt from the last 12h of
  topic history + live WebSocket
- Signing: `release.keystore` (alias `smokebuddy`, password `smokebuddy`) —
  fine for friends, generate your own for anything serious

## Disclaimer

This app coordinates a habit your doctor, your mother, and your lungs all disapprove of.
The sarcasm is load-bearing.
