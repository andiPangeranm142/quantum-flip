# QuantumFlip — flattened contract source for QCAI audit

File: `QuantumFlip.flattened.sol` — 123 lines, 4,326 bytes.
Generated with hardhat v2.29.2 (`npx hardhat flatten`) from
`contracts/QuantumFlip.sol` (117 lines, no imports). The body is
byte-identical to the deployed source (verified by diff from the
pragma line onward); no test code is included.

Deployed: 0x4a8de5795545fb081cb875e4ba8667290bb11c6f on qorechain-diana
(chain 9800), deploy tx
0x1060dc1c7be190c7f173119e9c61b5d6803eca1bd6eb1097e7d7e13951198a3a.

The companion StreakBadge.sol is a separate contract (win-streak NFT
badges) and is NOT part of this audit — this file covers the game
contract only.

## How to run the audit

1. Open https://dashboard.qorechain.io/audit, sign in with the project account.
2. Start a NEW audit. The form has no file upload — paste the entire
   contents of `QuantumFlip.flattened.sol` into the "Contract Source Code"
   textarea.
3. Set Blockchain = QoreChain. Run the audit (150 QOR testnet per run,
   paid ON-CHAIN from the connected dashboard wallet — the fee is a real
   MsgSend to qor1wv0fvt5qzx7gllk9ckzv3u6ypceaqq8evuny0h; make sure the
   wallet holds ≥150 QOR + gas BEFORE running. The faucet alone
   (100 QOR/24h) is NOT enough — top up from the deployer first).
4. Wait for the result. Record score / risk / quantum readiness / findings.
5. Export the PDF and save it as `docs/QCAI-audit-stage1.pdf`
   (stage 2: `docs/QCAI-audit-stage2.pdf`), then triage every finding in
   `docs/QCAI-stage1-triage.md` (stage 2 likewise).

Notes: the dashboard keeps NO audit history and offers NO stage-2 option
on an existing result — stage 2 is a fresh audit with the identical
source. The dashboard failed twice on BillPay Guard's stage 2 on 25 Nov
("No wallet found" toast) because the account had no dashboard wallet;
the fix (approved by the user 25 Nov 09:11) was creating one via the
dashboard's own "Create a new wallet" button (wallet "SealedBid"
qor14pwajnz3pn6uzxkchjv856q8639m6uve6hwmc4, funded by top-ups from the
deployer).

## Auditor context

- Free-to-play on-chain coin-flip game. Every flip is an EVM transaction,
  and QoreChain admits an EVM transaction only inside a post-quantum
  authorisation window opened by a hybrid-signed (secp256k1 + ML-DSA-87)
  native message — so each move is quantum-safe by construction. The
  window is a chain-level admission rule, not contract logic, so this
  contract does not check it.
- The game holds NO funds and has NO owner or privileged function — there
  is nothing to steal and no admin key to compromise.
- Randomness is a KNOWN, documented limitation: the coin is
  keccak256(previous block hash, sender, flip count), but on the Diana
  testnet the EVM BLOCKHASH opcode returns 0 (verified 19 Nov 2026, see
  scripts/probe-blockhash.mjs and docs/randomness.md), so outcomes are
  fully deterministic from (sender, flip count) and predictable by
  anyone. This game demonstrates PQ-window-gated play, not randomness;
  it is NOT suitable for real stakes.
- Testnet only (qorechain-diana).
