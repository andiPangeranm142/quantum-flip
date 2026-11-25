# QCAI audit — stage 1 triage (25 Nov 2026)

- Audit: QoreChain dashboard QCAI, Blockchain = QoreChain, source
  `flattened/QuantumFlip.flattened.sol` (123 lines, no test code), run 25
  Nov 2026 ~10:03 WIB.
- Result: **score 65/100, risk MEDIUM, quantum readiness HYBRID,
  5 findings.** Report: `docs/QCAI-audit-stage1.pdf` (verified from the
  PDF itself: score, risk, readiness, and all five titles/severities/
  recommendations match).
- Cost: 150 QOR (testnet), paid ON-CHAIN from the dashboard wallet
  "SealedBid" (`qor14pwajnz3pn6uzxkchjv856q8639m6uve6hwmc4`) — fee tx
  `6A303D35…B7CF4588` to `qor1wv0fvt…` (−150.045 QOR incl. gas; wallet
  balance verified on-chain before/after: 158.875 → 8.83 QOR). The wallet
  was topped up 150 QOR from the deployer before the run
  (tx `C5521619…9A449FB8`, code 0).
- Context: tied with QoreVest at 65/100, our lowest (Quantum Vault
  85/100 x2, SealedBid 75/100, BillPay Guard 72/100, QoreRollup 72/100),
  and the only audit with TWO High findings. Both Highs describe
  limitations that are already documented in the contract's NatSpec, the
  README, and docs/randomness.md — not hidden flaws. The game holds no
  funds and has no stakes, so the predictability costs nothing. Stage 2
  is a fresh audit with identical source (the dashboard keeps no
  history); stage 2 NOT yet run.

## Finding 1 — HIGH — Incorrect Quantum Safety Assumption

**Verdict: FALSE POSITIVE — misreading of the claim; no code change.**

The contract's quantum-safety claim is about the CHAIN-GATED WINDOW,
not about in-contract PQC: "Each move is therefore quantum-safe by
construction: a leaked ECDSA key alone cannot play, because it cannot
open a window." That gate is real — every EVM transaction on QoreChain
is admitted only inside a hybrid-signed (secp256k1 + ML-DSA-87) window.
The contract never claims to implement ML-KEM or Dilithium itself, and
in-contract PQC is impossible on the EVM. The recommendation ("remove
quantum safety claims") would make the documentation LESS accurate.
No code change.

## Finding 2 — HIGH — Deterministic Randomness Vulnerability

**Verdict: TRUE — and ALREADY DISCLOSED; accepted by design, no code
change.**

The contract's NatSpec, README, and docs/randomness.md state exactly
this: on Diana the BLOCKHASH opcode returns 0, so the outcome is fully
deterministic from (sender, flip count) and predictable by anyone —
"This game demonstrates PQ-window-gated play, not randomness; it is NOT
suitable for real stakes." The finding describes a documented
limitation, not a hidden flaw. The recommendation ("implement proper
randomness or remove game functionality") was already decided against:
commit-reveal was considered and REJECTED (16 Nov, final) because the
game's purpose is window-gated play, and the game holds no funds — no
stakes, nothing to win by predicting. No code change.

## Finding 3 — MEDIUM — Inconsistent State Management

**Verdict: FALSE POSITIVE — no code change.**

The `seen` mapping is exactly the guard that prevents duplicates:
`if (!seen[msg.sender]) { seen[msg.sender] = true; players.push(
msg.sender); ... }` — a player is pushed to the array only on first
play, so duplicates are impossible by construction. The finding's "may
contain duplicates if not properly managed" is hypothetical; the code
manages it. No code change.

## Finding 4 — LOW — Missing Input Validation

**Verdict: NOT APPLICABLE — no code change.**

`flip()` takes a single `bool` — both values are valid guesses; there is
nothing to validate. No code change.

## Finding 5 — INFO — No PQC Implementation

**Verdict: FALSE POSITIVE — same as finding 1; no code change.**

Same misreading: the contract never claims to implement PQC algorithms;
its quantum safety is the window gate (see finding 1). No code change.

## Summary

0 of 5 findings need a code change: 3 false positives / misreadings
(findings 1, 3, 5), 1 not applicable (finding 4), 1 true but documented
and accepted by design (finding 2). No redeploy. The audit confirms the
documented story: a no-stakes demo of PQ-window-gated play whose
deterministic randomness is disclosed, not hidden.
