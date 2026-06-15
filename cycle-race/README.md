# 🚴 Cycle Race — multiplayer

A clean, share-a-link bicycle racing game for **3–6 friends across different phones &
laptops**. First rider to finish the laps wins — and **Akhilesh Yadav gifts the cycle** 🚲
with confetti.

**No accounts. No server to run.** Players connect peer-to-peer over WebRTC (PeerJS free
broker + free STUN/TURN), so it works straight off GitHub Pages.

## How to play

1. One person opens the game and taps **🏁 Create Game** → gets a 5-letter room code and a
   shareable link.
2. Friends open the link on their phones/laptops, type a name, and **Join**.
3. The host picks the number of laps and taps **🚦 Start Race**.
4. **Controls:** `◀ ▶` on-screen buttons (mobile) or `←  →` / `A  D` keys (desktop).
   Bikes auto-pedal — you just steer. Stay on the asphalt; grass slows you down.
5. First across the line after all the laps wins the cycle.

> ⚠️ Keep the **host's** tab open during the race — that device runs the game.
> On rare very strict networks WebRTC can fail to connect; usually it just works.

## Run locally

```bash
npx http-server cycle-race -p 4178 -c-1
# open http://localhost:4178
```

It's a single `index.html` — no build step, nothing to install.
