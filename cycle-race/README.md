# 🏁 Cycle Kart Race — multiplayer

A SmashKarts-style arcade **drift racer** for friends across phones & laptops. Throttle,
steer, **drift to charge a boost**, hit boost pads, and finish the laps first — the winner
gets the golden cycle from **Akhilesh Yadav** 🚲 (with confetti and a goofy animation).

**No accounts. No server to run.** Players connect peer-to-peer over WebRTC (PeerJS free
broker + free STUN/TURN), so it runs straight off GitHub Pages.

## Play

1. One person taps **🏁 Create Game** → gets a 5-letter room code + shareable link.
2. Friends open the link on their phones/laptops, type a name, and **Join**.
   Solo? The host can **🤖 Add bot** to fill the grid.
3. Host picks laps (2 / 3 / 5) and taps **🚦 Start Race**.

### Controls
- **Desktop:** `↑`/W gas · `↓`/S brake · `← →`/A D steer · **Space**/Shift drift.
- **Mobile:** auto-gas · `◀ ▶` steer · big **DRIFT** button.
- **Drift → Boost:** hold drift through a corner to build the boost meter, release to fire
  a speed burst. Yellow chevrons on the track are **boost pads**.
- Stay on the asphalt — grass slows you hard.

The camera follows your kart; a **minimap** (top-right) shows everyone. First across the
line after all laps wins.

> ⚠️ Keep the **host's** tab open during the race — that device runs the simulation.
> On rare very strict networks WebRTC can fail to connect; usually it just works.

## The winner's photo (optional)
The win screen shows an image at `cycle-race/akhilesh.png` (or `.jpg`); if it's missing it
falls back to an emoji. Drop a photo in with that name to use it.

## Run locally
```bash
npx http-server cycle-race -p 4178 -c-1
# open http://localhost:4178
```
Single `index.html`, no build step.
