# Demo Video Plan — Quantum Flip

The fest submission requires a demo video (max 3 minutes) showing the
project actually running. This file is the recording plan. The recording
itself happens **after** the testnet deployment, because the video must
show the real app and a real testnet transaction — no slideshows, no
mock-ups.

## Prerequisites (before recording)

- [x] Contract deployed on `qorechain-diana`; address in
      `deployments/testnet.json` and `VITE_QUANTUM_FLIP_ADDRESS`.
- [x] Dev server running: `VITE_QUANTUM_FLIP_ADDRESS=<address> npm run dev`
      (or the production build served with `npm run preview`).
- [x] QoreX connected on the testnet with a funded account and a **live
      EVM window** (open it from QoreX just before recording; a fresh
      window lasts ~16 minutes at QoreX defaults — record in one take).
      See "Deviations" below: the take used an injected EVM wallet
      instead of the QoreX extension, with a fresh 1200-block window
      opened by a hybrid-signed transaction just before the take.
- [x] Browser window 1280×720, screen recording at 1080p or 720p,
      system audio off, notifications silenced.
- [x] Explorer tab ready: https://explore.qore.network (Testnet).

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

- [x] Watch the full video once: audio clear, all hashes readable,
      total length ≤ 3:00.
- [x] Update this file with the final length and the transaction hashes
      shown in the video.

## Final video (recorded 14 Nov 2026, one take)

- **File:** `docs/demo.mp4` — MP4 H.264, 1280×720, 25 fps, silent.
- **Duration:** 107.5 s (1:47) — under the 3:00 limit.
- **Size:** 2.0 MB.
- **Recording account (testnet only):**
  EVM `0x97846f217f6b0Cb0e26A72358C97733ebFf4B259`,
  Cosmos `qor1j7zx7gtldvxtpcn2wg6ce9mn86llfvjerkaxee`.
  Funded with 2 test QOR from the deployer; PQC key registered; fresh
  EVM window (1200 blocks, 10 txs) opened just before the take.

| # | Time | What is shown |
| --- | --- | --- |
| 1 | 0:00–0:17 | App loaded, unconnected state, "Connect Wallet". |
| 2 | 0:17–0:36 | Connect → "Injected Wallet"; balance 1.69 QOR; "EVM window: live". |
| 3 | 0:36–0:51 | Flip — Heads: HEADS, won. Stats update to 1 flip / 1 win / streak 1. |
| 4 | 0:51–1:15 | Explorer (testnet) showing the same flip as its Cosmos transaction: status success, block #10,035,793, MsgEthereumTx, "Post-quantum authorized window" badge. |
| 5 | 1:15–1:38 | Flip — Tails: HEADS, lost. Leaderboard: deployer #1, recording account #2 (best streak 1, 1 win in 2 flips). Totals: 3 flips, 2 wins. |
| 6 | 1:38–1:47 | Title card (cover.png) with both flip hashes in full. |

### Transactions shown in the video

- **Flip 1 (Heads, won):**
  EVM `0x3833a584fc7dbb17a368263afa17dac1fe78cea26d22210631cf922d7fae440d`
  (block 10035793, receipt success).
  Cosmos `2B16167DE9554FDEF52CB821188895D8F358A357D6D8234EB586400F85A179BE`
  — the hash the explorer indexes; shown on the explorer page in scene 4.
- **Flip 2 (Tails, lost):**
  EVM `0x381dd884f6f854d963f54ab074158fa9d3e852321e694b8a921c7a99647853aa`
  (block 10035823, receipt success).
- Both receipts verified on-chain after recording; contract totals
  after the take: 3 flips, 2 wins.

### Deviations from the plan

- **Injected wallet instead of QoreX (scene 2):** the QoreX browser
  extension cannot be automated in this sandbox, and per the
  `@qorechain/qorex-rainbowkit` docs QoreX does not support
  `eth_sendTransaction` on EVM anyway — so even a real QoreX session
  could not have sent the flip. The take used an injected EIP-1193
  wallet ("Injected Wallet" in the connect modal); signing happened in
  the recording script, never on screen. The PQC story stays true: the
  window was genuinely opened by a hybrid-signed transaction, and the
  app + explorer both show it live / "Post-quantum authorized window".
- **Explorer via Cosmos hash (scene 4):** the app's transaction link
  points at `explore.qore.network/tx/<EVM hash>`, but the explorer's
  `/tx/` route looks up **Cosmos** hashes, so clicking it lands on a
  "Transaction not found" page (app bug — see below). Instead, the
  take navigates to the explorer page for the flip's Cosmos hash
  (derived live from the flip receipt: receipt → block → match the
  `MsgEthereumTx` whose `keccak256(raw tx)` equals the EVM hash →
  `sha256(TxRaw)`). The caption says so honestly.
- **No voiceover:** no usable TTS exists in the VM, so the video is
  silent with burned-in scene captions (ffmpeg drawtext) telling the
  same story as the planned narration.
- **Shorter than planned:** 1:47 instead of ~3:00. All six scenes are
  present; nothing was cut.

### Known app bug found during recording

The transaction-hash link in the app (`EXPLORER_URL}/tx/${hash}` with
the EVM hash) lands on a "Transaction not found" page, because the
explorer's `/tx/` route only resolves Cosmos transaction hashes. The
video works around it (see above), but the link should be fixed or
removed before judges click it.

## Final video v2 (recorded 19 Nov 2026, one take)

Re-recorded after the quality push: the demo now has a simulated mock
mode (no wallet needed) and the StreakBadge companion contract, so the
video shows both. Same recording account and setup as v1; the recorder
is `~/workspace/qorechain/video/record-v2.mjs` and the renderer
`~/workspace/qorechain/video/render-v2.mjs` (caption timings are read
from the take's meta file, not hardcoded).

- **File:** `docs/demo.mp4` — MP4 H.264, 1280×720, 25 fps, silent
  (ffprobe-verified: one video stream, no audio track).
- **Duration:** 108.6 s (1:49) — under the 3:00 limit.
- **Size:** 2.4 MB.
- **Recording account (testnet only):**
  EVM `0x97846f217f6b0Cb0e26A72358C97733ebFf4B259`,
  Cosmos `qor1j7zx7gtldvxtpcn2wg6ce9mn86llfvjerkaxee`.
  Fresh EVM window (1200 blocks, 10 txs) opened just before the take
  (native tx `0EECD49CE31A21064B11338AB08025A637A7CE3ED197ABA873837D05F8B8C974`).

| # | Time | What is shown |
| --- | --- | --- |
| 1 | 0:02–0:14 | App loaded, unconnected state, mock mode visible. |
| 2 | 0:14–0:26 | Simulated flip — Heads: TAILS, lost (simulated). Caption stresses it is not on-chain. |
| 3 | 0:26–0:44 | Connect → "Injected Wallet"; balance 1.56 QOR; "EVM window: live". |
| 4 | 0:44–0:57 | Real flip — Heads: HEADS, won. Stats update to 3 flips / 2 wins / streak 1. |
| 5 | 0:57–1:14 | "Your badges" (video account: not eligible yet), then the Streak badges panel: deployer best streak 4, Double Up; tiers listed. |
| 6 | 1:14–1:39 | Explorer (testnet) showing the same flip as its Cosmos transaction: status success, block #10,368,708, MsgEthereumTx. |
| 7 | 1:39–1:49 | Title card (cover.png) with the flip hash, the StreakBadge address, and the badge-claim hash in full. |

### Transaction shown in the video

- **Flip (Heads, won):**
  EVM `0x3bec01ae92bd058ba0fdcd895310ce8de7fb0bf662d747dd98d4fdc9b6e8e631`
  (block 10368708, receipt success).
  Cosmos `65115FC8A0806AB4D76726DFB2FC062BBB218DA0A1488912FD3F03791E04D5D8`
  — the hash the explorer indexes; shown on the explorer page in scene 6.
- Receipt verified on-chain after recording; contract totals after the
  take: 22 flips, 13 wins.

### Deviations from the plan

- **Injected wallet instead of QoreX (scene 3):** same as v1 — the QoreX
  browser extension cannot be automated in this sandbox, and QoreX does
  not support `eth_sendTransaction` on EVM anyway. The take used the
  injected EIP-1193 wallet; signing happened in the recording script,
  never on screen. The window was genuinely opened by a hybrid-signed
  transaction, and the app shows it live.
- **Explorer via Cosmos hash (scene 6):** same as v1 — the explorer's
  `/tx/` route only resolves Cosmos hashes, so the take navigates to the
  flip's Cosmos hash (derived live from the flip receipt).
- **No voiceover:** same as v1 — silent with burned-in scene captions
  (ffmpeg drawtext).
- **The on-camera flip was predicted to win:** on Diana the outcome is
  `keccak256(0, sender, totalFlips)` — fully deterministic (see
  `docs/randomness.md`). Before recording, the outcome for the video
  account at totalFlips=21 was computed off-chain (HEADS), so the take
  guessed Heads and won. The caption claims only that the contract
  settles the flip on-chain; it claims no luck, and the video never
  presents the win as a feat of chance.
- **The flip hash is recovered from the event log, not the page:** the
  app shows only a shortened tx hash as text (no link), so the recorder
  reads the full hash from the `FlipResult` event the flip emitted
  (`eth_getLogs` from the scene's start block).
- **Dev-server proxy fix (needed for scene 3):** the first v2 take
  failed because the window-status panel never loaded: vite's HTTP proxy
  does not read `https_proxy`, so in this sandbox its upstream TLS
  handshake to the LCD failed. `vite.config.ts` now routes the LCD
  proxy through `https_proxy` when set (`https-proxy-agent`, dev
  dependency). The live static site is unaffected — it never had the
  proxy, and the panel's documented limitation there is unchanged.
