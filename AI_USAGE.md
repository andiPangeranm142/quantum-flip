# AI Usage — Quantum Flip

This file documents how AI was used to build Quantum Flip, what the AI
generated, what the human contributed, and how the work was verified. It
exists for the QoreChain Developer Fest's **Best AI-Native Build** award,
and as an honest development record.

## Summary

Quantum Flip was built end-to-end by an AI coding agent (**Muse**, running
as the assistant "forza") from a one-line human request, over a single
build session on 14 November 2026. The human (Aeron) chose the event,
approved the approach, and owns every step that needs a human identity:
accounts, funding, registration, and submission. No code was copied from
any other fest project — the concept was checked against the eight
projects already listed on build.qorechain.io before building began.

## Workflow

1. **Research first, code second.** The agent read the fest site, the
   QoreChain docs (SDK, EVM window, hybrid signing, faucet, QoreX), and
   the published npm packages before writing anything. Two subagents did
   parallel research (docs) and frontend implementation; the coordinator
   agent owned the contract, scripts, tests, and final review.
2. **Scaffold from the official tool.** The project was scaffolded with
   `create-qorechain-dapp` 0.14.0 (`evm-solidity`, testnet preset). The
   window helper came verbatim from the official `hardhat` template and
   the frontend scaffold from the official `viem-wagmi` template (see
   Credits in the README).
3. **Never guess an API.** Every SDK/EVM function used was checked
   against the type definitions in `node_modules` (or the docs) before
   use — including `deriveUnifiedAccount` (async, returns a Promise),
   `evmWindowStatus`, `fetchPqcStatus`, and viem's `mnemonicToAccount`
   derivation path.
4. **Verify at every step.** Contract compiled with `solc` 0.8.24;
   artifact regenerated from compiler output by script (never
   hand-copied); `tsc --noEmit` typecheck; automated contract tests on a
   local EVM; `vite build` for the frontend. On-chain verification
   (deploy + hybrid-signed window transaction) is scripted and ready but
   is still pending testnet funding — see the README's deployment status.
   Nothing in this repo claims an on-chain result that has not happened.
5. **Secrets discipline.** A fresh testnet-only wallet was generated for
   this project; its mnemonic and private key live only in the local,
   git-ignored `.env` and a mode-`600` file outside the repo. The repo
   was checked for secrets before every commit (see below).

## What the AI generated

- `contracts/QuantumFlip.sol` — the game contract (original design).
- `scripts/deploy.ts` — deployment + demo flip + deployment record
  (adapted from the template's deploy-script pattern, with a testnet-only
  chain-id guard added).
- `scripts/build-artifact.mjs` — artifact regeneration from `solc` output.
- `test/quantum-flip.test.ts` — contract tests (artifact checks, event /
  state consistency, two-player independence, totals/streak invariants).
- `src/*` — the React frontend (game UI, QoreX connect, live EVM window
  status, leaderboard), adapted from the `viem-wagmi` template.
- `README.md`, this file, `.gitignore`, `.env.example`, `LICENSE`
  (Apache-2.0 text).
- `scripts/window.ts` was **not** AI-written: it is the official
  `hardhat`-template helper, copied unchanged.

## Debugging the AI did (and how)

Two real bugs were found and fixed during testing, both by reading source
rather than guessing:

1. **Deployment reverted out of gas on the local chain.** The test first
   used address-only (JSON-RPC) accounts. Reading viem's
   `sendTransaction` source showed that path sends the transaction
   as-is and lets the node fill the gas limit — Ganache fills 90,000,
   below the ~345,774 the deployment needs. Fix: derive local signers
   from the same test mnemonic Ganache uses, so viem estimates gas —
   the same local-account path the real deploy script uses.
2. **Second test player had no funds.** `mnemonicToAccount` with
   `accountIndex: 1` derives `m/44'/60'/1'/0/0`, but Ganache funds
   `m/44'/60'/0'/0/1`. Reading viem's `hdKeyToAccount` source confirmed
   the path scheme; fix: use `addressIndex` instead of `accountIndex`.

Both fixes are covered by the passing test suite (`npm test`: 5/5).

## Human contribution

- Chose the event and the Quantum Pass track; gave the go-ahead and the
  quality bar ("no mistakes, however small; maximise the chance of
  winning").
- Owns the accounts and identity steps the agent cannot do: the GitHub
  account the repo will live under, the Dashboard sign-in for the
  faucet claim that funds the deployer, the fest registration
  (GitHub OAuth, X, QoreX), and the final submission.
- Will record/approve the demo video and any submission text.

## Verification status (14 Nov 2026)

| Check | Result |
| --- | --- |
| `solc` 0.8.24 compile | Passes, no warnings shown |
| `npm test` (contract, local EVM) | 5/5 pass |
| `npm run typecheck` | Passes |
| `npm run build` (frontend) | Passes |
| No secrets in repo / git history | Checked (see below) |
| Testnet deploy + hybrid-signed tx | **Pending faucet funding** |

## Secrets check

Before each commit, the repo is checked for secrets: `.env` is
git-ignored (and holds the only copy of the testnet key used by the
scripts); the scaffold's placeholder key was never replaced by a real
one in any committed file; `git log` / `git show` history is reviewed
for accidental additions. The test mnemonic in `test/` is the public
Hardhat test mnemonic — it funds nothing outside the throwaway local
chain and is labelled as such in the test file.

## Tools

- Agent: Muse ("forza"), with two subagents (docs research, frontend
  implementation) coordinated by a build-coordinator agent.
- Toolchain: Node 24, TypeScript, `solc` 0.8.24, viem, wagmi,
  RainbowKit, Ganache (tests), QoreChain SDK/EVM 0.14.0.
