# Demo Video Plan — Quantum Flip

The fest submission requires a demo video (max 3 minutes) showing the
project actually running. This file is the recording plan. The recording
itself happens **after** the testnet deployment, because the video must
show the real app and a real testnet transaction — no slideshows, no
mock-ups.

## Prerequisites (before recording)

- [ ] Contract deployed on `qorechain-diana`; address in
      `deployments/testnet.json` and `VITE_QUANTUM_FLIP_ADDRESS`.
- [ ] Dev server running: `VITE_QUANTUM_FLIP_ADDRESS=<address> npm run dev`
      (or the production build served with `npm run preview`).
- [ ] QoreX connected on the testnet with a funded account and a **live
      EVM window** (open it from QoreX just before recording; a fresh
      window lasts ~16 minutes at QoreX defaults — record in one take).
- [ ] Browser window 1280×720, screen recording at 1080p or 720p,
      system audio off, notifications silenced.
- [ ] Explorer tab ready: https://explore.qore.network (Testnet).

## Scenes (total ≤ 3:00)

| # | Time | What is shown | Narration |
| --- | --- | --- | --- |
| 1 | 0:00–0:20 | App loaded, unconnected state. | "Quantum Flip is a free coin-flip game on the QoreChain testnet. Every flip is an on-chain transaction — and every transaction has to pass QoreChain's post-quantum gate." |
| 2 | 0:20–0:50 | Click Connect, choose QoreX, account + testnet balance appear. Window status reads "live". | "I connect with QoreX on the testnet. The app shows my EVM authorisation window is live — that window was opened by a hybrid-signed transaction, classical plus ML-DSA-87." |
| 3 | 0:50–1:40 | Click "Flip — Heads". Pending state, then the result (HEADS/TAILS, won/lost), the transaction hash link, and the stats panel updating. | "One flip, one transaction. The contract settles the coin on-chain and my stats update — flips, wins, and my current streak." |
| 4 | 1:40–2:20 | Click the transaction hash; the explorer opens on the testnet showing the confirmed transaction and its FlipResult event. | "Here is the same flip on the explorer: confirmed on qorechain-diana, with the FlipResult event." |
| 5 | 2:20–2:50 | Back in the app: flip once more (Tails), then scroll to the leaderboard showing the player and best streak. | "And a second flip — the leaderboard ranks players by best streak. The game holds no funds and has no admin key, so there is nothing to steal." |
| 6 | 2:50–3:00 | Title card (cover.png) or the repo README. | "Quantum Flip — every flip is quantum-safe." |

## Rules for the recording

- Show the **real** app and **real** transactions only. If a flip fails
  on camera (e.g. the window expired), keep recording, open a new window,
  and flip again — do not cut to a fake success.
- Do not show any seed phrase, private key, or `.env` file at any point.
  The recording account is a testnet-only account.
- Keep it under 3:00. If a take runs long, trim scene 5, never scenes
  2–4 (the proof is in the live flip and the explorer).
- Export as MP4 (H.264, ≤ 1080p). Attach the file to the fest
  submission. A copy may be kept at `docs/demo.mp4` in this repo only if
  it stays small; otherwise keep it out of git and link it from the
  submission instead.

## After recording

- [ ] Watch the full video once: audio clear, all hashes readable,
      total length ≤ 3:00.
- [ ] Update this file with the final length and the transaction hashes
      shown in the video.
