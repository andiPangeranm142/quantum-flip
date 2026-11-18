# Randomness in Quantum Flip — what we found on-chain

> **Short version:** on the QoreChain Diana testnet the EVM `BLOCKHASH`
> opcode always returns 0. Quantum Flip's coin is
> `keccak256(blockhash(block.number - 1), sender, totalFlips)`, so on
> Diana every flip is `keccak256(0, sender, totalFlips)` — fully
> deterministic from two public inputs, and anyone can compute the
> result of the next flip before it is sent. This document states the
> finding honestly, shows how to verify it, and explains what the game
> still demonstrates.

## What we found

The contract was written assuming the usual EVM behaviour: `blockhash`
of the previous block is a real hash that nobody can know in advance,
so `keccak256(blockhash, sender, flip count)` would at least be
unpredictable to a casual player (the README already warned it was
fully simulatable and unsuitable for real stakes).

On 19 Nov 2026 we tested that assumption directly against the Diana
testnet and it turned out to be wrong: **the `BLOCKHASH` opcode returns
`0x0000…0000` on Diana**. The block header itself still has a real
(non-zero) hash — `eth_getBlockByNumber` returns one — but the EVM
opcode that reads it is not wired up on this chain, so the contract
always hashes zero.

Concretely, at block 10335773 (19 Nov 2026, ~03:35 WIB):

| Check | Result |
| --- | --- |
| Header hash of block 10335772 (`eth_getBlockByNumber`) | `0x3b496a6db936dfd06117289cb7f97e9541e11226211872c23574440059a7701b` |
| `BLOCKHASH(10335772)` via the EVM opcode (`eth_call` + state override) | `0x0000000000000000000000000000000000000000000000000000000000000000` |
| `totalFlips` on the contract | 21 |
| Off-chain prediction for the next flip, sender `0x32fA…eCD6` | TAILS — `keccak256(0, sender, 21) = 0xbc7f…074f`, odd |
| On-chain simulation `flip(true)` (`eth_call`) | `won = false` — TAILS. **Match.** |

The prediction was checked for a second sender as well
(`0x0000…0001`, also TAILS, also a match). Anyone can run the same
check: see below.

## How to verify it yourself

No private key, no transaction, no funds — the probe is read-only
against the public testnet RPC:

```sh
node scripts/probe-blockhash.mjs [--from <address>] [--no-predict]
```

It does three things:

1. **Fetches the previous block's header hash** with
   `eth_getBlockByNumber` — a normal non-zero hash.
2. **Runs the `BLOCKHASH` opcode** for the same block via `eth_call`
   with a state override that places this 15-byte program at a scratch
   address and executes it:
   `0x436001034060005260206000f3`
   (`NUMBER, PUSH1 1, SUB, BLOCKHASH, PUSH1 0, MSTORE, PUSH1 32, PUSH1 0,
   RETURN` — i.e. return `blockhash(block.number - 1)`). On Diana the
   result is 32 zero bytes.
3. **Predicts the next flip** (unless `--no-predict`): it reads
   `totalFlips` from the contract, computes
   `keccak256(0, sender, totalFlips) % 2` off-chain, and compares it
   against an `eth_call` simulation of `flip(true)`. `won` is true
   exactly when the result is HEADS, so the two must agree — and they do.

## What this means for the game

- **The coin is not random at all on Diana.** The outcome of any flip
  is determined by `(sender, totalFlips)` alone, both public. A player
  who simulates can win every flip they choose to send; streaks and the
  leaderboard can be ground at will.
- **Nothing about the deployed contract needs to change for the fest.**
  The game is free, holds no funds, and has no owner — there is nothing
  at stake to protect, and redeploying would not change the chain's
  `BLOCKHASH` behaviour anyway. The honest fix is documentation, which
  is what this file (plus the README section and the contract NatSpec)
  is.
- **What the game still demonstrates is real:** every flip is an EVM
  transaction admitted only inside a post-quantum authorisation window
  opened by a hybrid-signed (secp256k1 + ML-DSA-87) native message, so
  a leaked ECDSA key alone cannot play; the contract settles flips and
  keeps per-player statistics and a leaderboard fully on-chain; and the
  project survived the Q-Day Drill (18 Nov 2026, proof accepted) with
  a fresh account whose ECDSA key was handed to the organisers.
- **For real stakes this design would be wrong twice over** — even on a
  chain where `BLOCKHASH` works, block-hash randomness is simulatable
  and miner-influenceable. A valued version would need commit–reveal
  or a VRF. That is out of scope for this free testnet game, and is
  deliberately not implemented here.

## Timeline

| When | What |
| --- | --- |
| 13 Nov 2026 | Contract deployed; README warned the coin was simulatable and not for real stakes, but assumed `blockhash` was a real hash. |
| 18 Nov 2026 | Q-Day Drill: drill account flip played, proof accepted. |
| 19 Nov 2026 | Direct `eth_call` probe confirms `BLOCKHASH` returns 0 on Diana; flip predictions verified against on-chain simulation. README, contract NatSpec, and this document corrected. |
