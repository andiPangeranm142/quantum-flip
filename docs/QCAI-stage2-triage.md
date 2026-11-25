# QCAI audit — stage 2 triage (25 Nov 2026)

- Audit: QoreChain dashboard QCAI, Blockchain = QoreChain, source
  `flattened/QuantumFlip.flattened.sol` (123 lines, no test code), run 25
  Nov 2026 ~22:46 WIB — a fresh audit with the IDENTICAL source as stage
  1 (the dashboard keeps no history).
- Result: **score 65/100, risk MEDIUM, quantum readiness HYBRID,
  5 findings.** Report: `docs/QCAI-audit-stage2.pdf` (verified from the
  PDF itself: score, risk, readiness, and all five titles/severities/
  recommendations match).
- Cost: 150 QOR (testnet), paid ON-CHAIN from the dashboard wallet
  "SealedBid" (`qor14pwajnz3pn6uzxkchjv856q8639m6uve6hwmc4`) — fee tx
  `B2E17BC2…1F4AEEED` to `qor1wv0fvt…` (−150.045 QOR incl. gas; wallet
  balance verified on-chain before/after: 158.695 → 8.65 QOR). The wallet
  was topped up 150 QOR from the deployer before the run
  (tx `B98BD845…18028F8C`, code 0). No faucet was used and no re-login was
  needed (the dashboard session was still active).
- vs stage 1 (same source, 25 Nov ~10:03 WIB): score UNCHANGED 65/100,
  risk UNCHANGED MEDIUM, quantum readiness UNCHANGED HYBRID — the only
  stage-2 result that did not improve (Quantum Vault 85→85, SealedBid
  75→75 with readiness HYBRID→QUANTUM-SAFE, QoreVest 65→65, QoreRollup
  72→78). Finding composition changed: the two HIGHs are the same issues
  reworded (randomness now titled "Predictable Randomness Implementation"
  and claiming players "can always win"); the MEDIUM "Inconsistent State
  Management" is replaced by "Reentrancy Risk in State Updates"; a new
  MEDIUM "Gas Optimization Opportunity" appears; the INFO "No PQC
  Implementation" was upgraded to LOW "Missing PQC Integration"; the LOW
  "Missing Input Validation" is gone.

## Finding 1 — HIGH — Incorrect Quantum Safety Assumption

**Verdict: FALSE POSITIVE — misreading of the claim; no code change.**

Same issue as stage-1 finding 1. The contract's quantum-safety claim is
about the CHAIN-GATED WINDOW, not about in-contract PQC: "Each move is
therefore quantum-safe by construction: a leaked ECDSA key alone cannot
play, because it cannot open a window." That gate is real — every EVM
transaction on QoreChain is admitted only inside a hybrid-signed
(secp256k1 + ML-DSA-87) window. The contract never claims to implement
ML-KEM or Dilithium itself, and in-contract PQC is impossible on the
EVM. The recommendation ("remove quantum safety claims") would make the
documentation LESS accurate. No code change.

## Finding 2 — HIGH — Predictable Randomness Implementation

**Verdict: TRUE — and ALREADY DISCLOSED; accepted by design, no code
change.**

Same issue as stage-1 finding 2. The contract's NatSpec, README, and
docs/randomness.md state exactly this: on Diana the BLOCKHASH opcode
returns 0, so the outcome is fully deterministic from (sender, flip
count) and predictable by anyone — "This game demonstrates
PQ-window-gated play, not randomness; it is NOT suitable for real
stakes." The new framing ("allowing players to always win") changes
nothing: there is nothing to win — the game holds no funds and has no
stakes. The recommendation ("implement proper randomness or clearly
state that this is a demonstration-only contract") was already decided
against: commit-reveal was considered and REJECTED (16 Nov, final)
because the game's purpose is window-gated play. No code change.

## Finding 3 — MEDIUM — Reentrancy Risk in State Updates

**Verdict: FALSE POSITIVE — no code change.**

New in stage 2 (replaces the stage-1 "Inconsistent State Management"
finding). `flip()` makes NO external calls at all — there is no call for
an attacker to reenter through. The finding itself admits it: "While
not directly vulnerable to reentrancy (Solidity EVM context)". The
"problematic if extended with external calls in future versions" is
purely hypothetical; the code as written cannot reenter. The state
updates happen in sequence with no external call between them, so
checks-effects-interactions is satisfied trivially. No code change.

## Finding 4 — MEDIUM — Gas Optimization Opportunity

**Verdict: NOT APPLICABLE — a gas note, not a vulnerability; no code
change.**

New in stage 2. Caching state reads would save a negligible amount of
gas in a 123-line demo contract on a free testnet — and it is not a
security finding. No code change.

## Finding 5 — LOW — Missing PQC Integration

**Verdict: FALSE POSITIVE — same as finding 1; no code change.**

The stage-1 INFO "No PQC Implementation" upgraded to LOW, but it is the
same misreading: the contract never claims to implement PQC algorithms;
its quantum safety is the window gate (see finding 1). No code change.

## Summary

0 of 5 findings need a code change: 3 false positives / misreadings
(findings 1, 3, 5), 1 not applicable (finding 4), 1 true but documented
and accepted by design (finding 2). No redeploy. Stage 2 confirms stage
1 exactly (65/100 both times): a no-stakes demo of PQ-window-gated play
whose deterministic randomness is disclosed, not hidden.
