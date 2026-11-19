import { isAddress } from "viem";

/** EVM chain id of the QoreChain testnet (`qorechain-diana`). */
export const TESTNET_CHAIN_ID = 9800;

/** QoreChain block explorer (covers the testnet). */
export const EXPLORER_URL = "https://explore.qore.network";

/**
 * The deployed QuantumFlip contract address, read from the build-time
 * environment. Empty string means the contract has not been deployed yet —
 * the UI must not show flip buttons in that case.
 *
 * A malformed value is treated the same as unset: never trust a bad address.
 */
const raw = (import.meta.env.VITE_QUANTUM_FLIP_ADDRESS ?? "").trim();

export const QUANTUM_FLIP_ADDRESS: `0x${string}` | "" = isAddress(raw)
  ? (raw as `0x${string}`)
  : "";

export const CONTRACT_DEPLOYED = QUANTUM_FLIP_ADDRESS !== "";

/**
 * The deployed StreakBadge companion contract address, read from the
 * build-time environment. Empty string means the badge contract has not
 * been deployed yet — the UI must not show the badge section in that case.
 *
 * A malformed value is treated the same as unset: never trust a bad address.
 */
const rawBadge = (import.meta.env.VITE_STREAK_BADGE_ADDRESS ?? "").trim();

export const STREAK_BADGE_ADDRESS: `0x${string}` | "" = isAddress(rawBadge)
  ? (rawBadge as `0x${string}`)
  : "";

export const BADGE_DEPLOYED = STREAK_BADGE_ADDRESS !== "";
