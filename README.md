# Quantum Flip

A free-to-play on-chain coin-flip game on the **QoreChain testnet**
(`qorechain-diana`, EVM chain id 9800). Built for the QoreChain Developer
Fest **"Build Before Q-Day"** (Quantum Pass).

Every flip is an EVM transaction — and QoreChain admits an EVM transaction
only inside a post-quantum authorisation window opened by a hybrid-signed
(secp256k1 + ML-DSA-87) native message. Each move is therefore
quantum-safe by construction: a leaked ECDSA key alone cannot play, because
it cannot open a window.

The game holds no funds and has no owner or privileged function. There is
nothing to steal and no admin key to compromise.

## Live deployment (testnet)

| | |
| --- | --- |
| Network | QoreChain testnet `qorechain-diana` (EVM chain id 9800) |
| Deployer (EVM) | `0x32fA73e4Eb17d13873D074cdc44105625D48eCD6` |
| Deployer (Cosmos) | `qor1xta88e8tzlgnsu7swnxugsg9vfw53mxk94q7tp` |
| Contract | _not yet deployed — deployment is pending a testnet faucet claim; see below_ |
| Explorer | https://explore.qore.network (switch to Testnet) |

> **Deployment status (14 Nov 2026):** the code, tests and scripts are
> complete and verified locally. The on-chain deployment is waiting on
> testnet QOR from the Dashboard faucet
> ([dashboard.qorechain.io/faucet](https://dashboard.qorechain.io/faucet)),
> which requires a signed-in Dashboard account — there is no public,
> unauthenticated faucet endpoint (verified against the published
> `@qorechain/sdk` 0.14.0 and `@qorechain/rdk` 0.9.0, neither of which
> bakes in a faucet hostname). Once the deployer address above holds test
> QOR, deployment is a single command (`npm run deploy`). This section
> will be updated with the contract address and transaction hashes then.

## How to play

1. Open the app (`npm run dev`, then http://localhost:5173).
2. Connect **QoreX** (or any injected EVM wallet) on the QoreChain Testnet.
3. Make sure an EVM authorisation window is open for your account — the
   app shows the window status live. Open one from QoreX (EVM access
   window) or with `npm run window open` (see below).
4. Call **Heads** or **Tails**. The contract settles the flip on-chain and
   the app shows the result, your stats, and the transaction hash.
5. The leaderboard ranks players by best win streak.

## Quick start

### Prerequisites

- **Node.js 20+** (developed and tested on Node 24).
- A funded testnet account for deploying: test QOR from the Dashboard
  faucet (see the deployment status above).

### Install

```sh
npm install
```

### Configure

```sh
cp .env.example .env
```

Edit `.env`:

| Variable | Purpose |
| --- | --- |
| `QORE_EVM_RPC_URL` | Testnet EVM JSON-RPC: `https://evm-testnet.qore.host` |
| `QORE_EVM_PRIVATE_KEY` | The deployer's funded testnet private key (`0x…`) |
| `QORE_MNEMONIC` | The same account's mnemonic, for `npm run window` |
| `QORE_NETWORK` | `testnet` (Quantum Flip is testnet-only) |
| `QORE_WINDOW_BLOCKS` / `QORE_WINDOW_TXS` | Size of the EVM window opened by `npm run window open` |

`QORE_EVM_PRIVATE_KEY` and `QORE_MNEMONIC` must be the **same account**
(derived at `m/44'/60'/0'/0/0`): the window is opened for the mnemonic's
account, and the deploy signs from the private key. Never commit `.env`.

### Open the post-quantum gate

```sh
npm run window status    # show the account, its PQC key and its window
npm run window register  # register the account's ML-DSA-87 key (once)
npm run window open      # open a window sized for a few deploys
```

Registration is the account's first native transaction (signed classically;
it is the one message the chain accepts that way). Opening the window is a
**hybrid-signed** native transaction — that is the project's hybrid-signed
transaction. Opening a window advances the account's nonce, so deploy
**after** it lands, and wait ~10 seconds before the first EVM transaction.

### Deploy and play one demo flip

```sh
npm run deploy
```

This deploys `QuantumFlip`, prints the contract address and transaction
hashes, plays one demo flip (calling heads), reads the totals back, and
writes `deployments/testnet.json` with the addresses and explorer links.
The script refuses to run on any chain other than the testnet (chain id
9800).

### Run the web app

```sh
VITE_QUANTUM_FLIP_ADDRESS=<deployed contract address> npm run dev
```

Then open http://localhost:5173. Without the contract address the app shows
a "not deployed yet" notice instead of the game.

### Tests

```sh
npm test        # contract tests on a local in-memory EVM (Ganache)
npm run typecheck
npm run build   # typecheck + production frontend build
```

The contract tests deploy the real compiled bytecode to a local chain and
check event/state consistency, two-player independence, and totals/streak
invariants over many flips. The test accounts are Ganache's built-in
deterministic test accounts — public test keys that exist only on the
throwaway local chain.

### Recompile the contract

```sh
npm run compile
```

This runs `solc` 0.8.24 and regenerates the committed artifact
(`contracts/QuantumFlip.artifact.ts`, ABI + creation bytecode) from
`contracts/QuantumFlip.sol`, so the artifact can never drift from the
source.

## How it works

### The contract (`contracts/QuantumFlip.sol`)

- `flip(bool guessHeads)` settles one coin flip on-chain and emits
  `FlipResult(player, guessHeads, resultHeads, won, flips, wins,
  currentStreak)`. The first flip from a new address also emits
  `PlayerJoined` and records the address for the leaderboard.
- `stats(address)` / `getStats(address)` return per-player
  `{flips, wins, currentStreak, bestStreak}`; `players(i)` and
  `playerCount()` enumerate the leaderboard; `totalFlips` / `totalWins`
  are global counters.
- No value is accepted, no funds are held, and there is no owner.

### Randomness — read this

The coin is derived from `keccak256(previous block hash, sender, flip
count)`. The previous block hash is fixed by the time a flip executes, so
the outcome is settled on-chain and identical for everyone reading the
block. That is unpredictable enough for a **free testnet game**. It is
**not** suitable for real stakes: a block producer could influence a
block hash, and anyone can simulate the outcome of a pending flip. If
this game ever carried value, it would need commit–reveal or a VRF. The
frontend says the same thing in its footer.

### The quantum-safe gate

Since chain v3.2.0 the EVM lane admits a transaction only from an account
that (1) has a registered ML-DSA-87 key and (2) has a live EVM
authorisation window. The window is opened by a native-lane message
signed hybrid (ML-DSA-87 + secp256k1) and bounds the blocks, transaction
count and total value the account may spend. The SDK deliberately never
opens a window automatically — it is a spending authorisation, so it
stays explicit. The frontend reads the window over REST
(`evmWindowStatus`) and explains exactly which requirement is missing
when a flip is refused (`no-pqc-key`, `no-window`, `exhausted`).

### Q-Day Drill

The project is designed to survive a leaked ECDSA key: gameplay needs
the PQC gate, not just the classical key; the contract has no admin
function to abuse; and no secret exists anywhere in the repo (keys live
only in the local, git-ignored `.env`). See `AI_USAGE.md` for the
development record.

## Project layout

```
contracts/
  QuantumFlip.sol            # the game contract
  QuantumFlip.artifact.ts    # compiled ABI + creation bytecode (generated)
scripts/
  deploy.ts                  # deploy + demo flip + record deployments/testnet.json
  window.ts                  # PQC key registration + EVM window helper
  build-artifact.mjs         # regenerate the artifact from solc output
src/
  App.tsx                    # the game UI
  config.ts                  # contract address (env) + chain/explorer constants
  wagmi.ts                   # wagmi + RainbowKit config, QoreX first
  main.tsx                   # providers
test/
  quantum-flip.test.ts       # contract tests on a local EVM
deployments/
  testnet.json               # written by `npm run deploy` (after deployment)
```

## Credits

Built with [create-qorechain-dapp](https://www.npmjs.com/package/create-qorechain-dapp)
0.14.0 and the QoreChain SDK 0.14.0:

- `evm-solidity` template — the project scaffold, deploy-script pattern
  and pre-compiled-artifact approach.
- `hardhat` template — `scripts/window.ts`, the PQC key registration and
  EVM authorisation window helper, used as written.
- `viem-wagmi` template — the frontend scaffold: wagmi + RainbowKit
  config with the QoreX wallet, the EVM window status component pattern,
  and the Vite `/lcd` REST proxy.
- Libraries: `@qorechain/sdk`, `@qorechain/evm`,
  `@qorechain/qorex-rainbowkit`, `viem`, `wagmi`, `@rainbow-me/rainbowkit`,
  `@tanstack/react-query`, `solc` (contract compilation), `ganache`
  (local contract tests).

QoreChain itself: https://qorechain.io — docs at https://docs.qorechain.io.

## License

Apache-2.0 — see [LICENSE](LICENSE).
