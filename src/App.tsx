import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  QORECHAIN_REST_ENDPOINTS,
  classifyEvmWindowRejection,
  qorechainTestnet,
  evmWindowStatus,
  type EvmWindowRejection,
} from "@qorechain/evm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { parseEventLogs } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { quantumFlipAbi } from "../contracts/QuantumFlip.artifact.js";
import { CONTRACT_DEPLOYED, QUANTUM_FLIP_ADDRESS, TESTNET_CHAIN_ID } from "./config.js";

const REMEDY: Record<EvmWindowRejection, string> = {
  "no-pqc-key": "This account has no registered ML-DSA-87 key. Register one on the native lane first.",
  "no-window": "No EVM authorisation window is open. Open one from QoreX, then retry.",
  exhausted: "The window has run out of blocks, transactions or value. Open a new one.",
  invalid: "The chain refused the window parameters.",
};

/**
 * The REST API of each chain, through the dev server's proxy (vite.config.ts):
 * the public REST endpoints send no CORS headers. Same chains as
 * QORECHAIN_REST_ENDPOINTS.
 */
const REST_PROXY: Record<number, string | undefined> = Object.fromEntries(
  Object.keys(QORECHAIN_REST_ENDPOINTS).map((id) => [
    Number(id),
    Number(id) === qorechainTestnet.id ? "/lcd-testnet" : "/lcd-mainnet",
  ]),
);

/** How many players the leaderboard reads at most (one call per player). */
const LEADERBOARD_LIMIT = 50;

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function winRate(flips: bigint, wins: bigint): string {
  if (flips === 0n) return "—";
  return `${((Number(wins) / Number(flips)) * 100).toFixed(1)}%`;
}

/** The account's EVM authorisation window, read over the native-lane REST API. */
function WindowStatus({ address, chainId }: { address: `0x${string}`; chainId: number }) {
  const rest = REST_PROXY[chainId];
  const { data, error, isLoading } = useQuery({
    queryKey: ["evm-window", chainId, address],
    queryFn: () => evmWindowStatus({ rest: rest!, address }),
    enabled: rest !== undefined,
    refetchInterval: 10_000,
  });
  if (!rest) return <p>Unknown network.</p>;
  if (isLoading) return <p>Reading the EVM window...</p>;
  // The window status comes from the native-lane REST API, which sends no
  // CORS headers — it is only readable when the app runs behind the /lcd
  // proxy (local dev/preview). On a plain static host this read fails, but
  // flips still work when the wallet already has a live window open.
  if (error)
    return (
      <p>
        Could not read the EVM window status from here. If you already opened a
        window from QoreX, you can still flip; otherwise open one from QoreX first.
      </p>
    );
  if (!data?.found) {
    return (
      <p>
        EVM window: none. Flips are refused until one is open — open an EVM window from QoreX, then
        retry.
      </p>
    );
  }
  return (
    <p>
      EVM window: {data.live ? "live" : "not usable"} ({data.remainingBlocks.toString()} blocks,{" "}
      {data.remainingTxs.toString()} transactions, {data.remainingValue.toString()} uqor left)
      {data.nativeOnly
        ? " — this window admits native transfers only, so a flip (a contract call) would be refused; open a window that covers contract calls."
        : ""}
      {!data.live ? " Open a new EVM window from QoreX, then retry." : ""}
    </p>
  );
}

interface FlipOutcome {
  guessHeads: boolean;
  resultHeads: boolean;
  won: boolean;
  flips: bigint;
  wins: bigint;
  currentStreak: bigint;
}

function FlipButtons({
  address,
  onReceipt,
}: {
  address: `0x${string}`;
  onReceipt: () => void;
}) {
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const [lastFlip, setLastFlip] = useState<FlipOutcome | null>(null);

  // Decode the FlipResult event from the confirmed receipt, then refresh the
  // on-chain stats and leaderboard.
  useEffect(() => {
    if (!receipt.data) return;
    onReceipt();
    const logs = parseEventLogs({
      abi: quantumFlipAbi,
      eventName: "FlipResult",
      logs: receipt.data.logs,
      strict: false,
    });
    const log = logs[0];
    // With strict: false the decoded args are optional; only report a flip
    // when every field decoded.
    if (
      log &&
      log.args.guessHeads !== undefined &&
      log.args.resultHeads !== undefined &&
      log.args.won !== undefined &&
      log.args.flips !== undefined &&
      log.args.wins !== undefined &&
      log.args.currentStreak !== undefined
    ) {
      setLastFlip({
        guessHeads: log.args.guessHeads,
        resultHeads: log.args.resultHeads,
        won: log.args.won,
        flips: log.args.flips,
        wins: log.args.wins,
        currentStreak: log.args.currentStreak,
      });
    }
    // onReceipt is stable (invalidates queries); only the receipt re-triggers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.data]);

  const rejection = write.error ? classifyEvmWindowRejection(write.error) : undefined;
  const busy = write.isPending || receipt.isLoading;
  const reverted = receipt.data?.status === "reverted";

  const flip = (guessHeads: boolean) => {
    setLastFlip(null);
    write.writeContract({
      address: QUANTUM_FLIP_ADDRESS as `0x${string}`,
      abi: quantumFlipAbi,
      functionName: "flip",
      args: [guessHeads],
    });
  };

  return (
    <section>
      <h2>Flip the coin</h2>
      <p>
        <button type="button" disabled={busy} onClick={() => flip(true)}>
          Flip — Heads
        </button>{" "}
        <button type="button" disabled={busy} onClick={() => flip(false)}>
          Flip — Tails
        </button>
      </p>
      {write.isPending && <p>Waiting for your wallet to sign...</p>}
      {receipt.isLoading && <p>Confirming on-chain...</p>}
      {write.data && (
        <p>
          {/* The explorer's /tx/ route only resolves Cosmos transaction
              hashes, not EVM hashes, so the hash is shown as text rather
              than a link that would land on "Transaction not found". */}
          Transaction: <code>{shorten(write.data)}</code>
        </p>
      )}
      {reverted && <p>The transaction was reverted on-chain — no flip happened.</p>}
      {lastFlip && !reverted && (
        <p>
          {lastFlip.resultHeads ? "HEADS" : "TAILS"} — you called{" "}
          {lastFlip.guessHeads ? "heads" : "tails"}, so you{" "}
          {lastFlip.won ? "won" : "lost"}. Current streak: {lastFlip.currentStreak.toString()} (
          {lastFlip.wins.toString()} wins in {lastFlip.flips.toString()} flips).
        </p>
      )}
      {write.error && <p>Flip refused: {rejection ? REMEDY[rejection] : write.error.message}</p>}
      {receipt.error && <p>Could not confirm the transaction: {receipt.error.message}</p>}
      <p>
        Playing as <code>{shorten(address)}</code>
      </p>
    </section>
  );
}

function PlayerStats({ address }: { address: `0x${string}` }) {
  const { data, error, isLoading } = useReadContract({
    address: QUANTUM_FLIP_ADDRESS as `0x${string}`,
    abi: quantumFlipAbi,
    functionName: "getStats",
    args: [address],
  });
  return (
    <section>
      <h2>Your stats</h2>
      {isLoading && <p>Loading...</p>}
      {error && <p>Could not read your stats: {error.message}</p>}
      {data && (
        <ul>
          <li>Flips: {data.flips.toString()}</li>
          <li>Wins: {data.wins.toString()}</li>
          <li>Win rate: {winRate(data.flips, data.wins)}</li>
          <li>Current streak: {data.currentStreak.toString()}</li>
          <li>Best streak: {data.bestStreak.toString()}</li>
        </ul>
      )}
    </section>
  );
}

function Totals() {
  const flips = useReadContract({
    address: QUANTUM_FLIP_ADDRESS as `0x${string}`,
    abi: quantumFlipAbi,
    functionName: "totalFlips",
  });
  const wins = useReadContract({
    address: QUANTUM_FLIP_ADDRESS as `0x${string}`,
    abi: quantumFlipAbi,
    functionName: "totalWins",
  });
  return (
    <section>
      <h2>All players</h2>
      <ul>
        <li>Total flips: {flips.data?.toString() ?? "..."}</li>
        <li>Total wins: {wins.data?.toString() ?? "..."}</li>
      </ul>
      {(flips.error ?? wins.error) && (
        <p>Could not read totals: {(flips.error ?? wins.error)?.message}</p>
      )}
    </section>
  );
}

interface LeaderboardRow {
  address: `0x${string}`;
  flips: bigint;
  wins: bigint;
  bestStreak: bigint;
}

function Leaderboard() {
  const contract = QUANTUM_FLIP_ADDRESS as `0x${string}`;
  const { data: count, error: countError } = useReadContract({
    address: contract,
    abi: quantumFlipAbi,
    functionName: "playerCount",
  });

  const shown = count === undefined ? 0 : Number(count > BigInt(LEADERBOARD_LIMIT) ? BigInt(LEADERBOARD_LIMIT) : count);
  const playersQuery = useReadContracts({
    contracts: Array.from({ length: shown }, (_, i) => ({
      address: contract,
      abi: quantumFlipAbi,
      functionName: "players" as const,
      args: [BigInt(i)] as const,
    })),
  });
  const addresses = (playersQuery.data ?? [])
    .filter((r) => r.status === "success" && r.result !== undefined)
    .map((r) => r.result as `0x${string}`);
  const statsQuery = useReadContracts({
    contracts: addresses.map((player) => ({
      address: contract,
      abi: quantumFlipAbi,
      functionName: "getStats" as const,
      args: [player] as const,
    })),
    query: { enabled: addresses.length > 0 },
  });

  const rows: LeaderboardRow[] = addresses
    .map((player, i) => {
      const s = statsQuery.data?.[i];
      if (s?.status !== "success" || !s.result) return null;
      return {
        address: player,
        flips: s.result.flips,
        wins: s.result.wins,
        bestStreak: s.result.bestStreak,
      };
    })
    .filter((r): r is LeaderboardRow => r !== null)
    .sort((a, b) => {
      if (a.bestStreak !== b.bestStreak) return a.bestStreak > b.bestStreak ? -1 : 1;
      if (a.wins !== b.wins) return a.wins > b.wins ? -1 : 1;
      return 0;
    });

  return (
    <section>
      <h2>Leaderboard</h2>
      {countError && <p>Could not read the leaderboard: {countError.message}</p>}
      {count === undefined && !countError && <p>Loading...</p>}
      {count === 0n && <p>No flips yet — be the first!</p>}
      {rows.length > 0 && (
        <ol>
          {rows.map((row) => (
            <li key={row.address}>
              <code>{shorten(row.address)}</code> — best streak {row.bestStreak.toString()},{" "}
              {row.wins.toString()} wins in {row.flips.toString()} flips
            </li>
          ))}
        </ol>
      )}
      {count !== undefined && count > BigInt(LEADERBOARD_LIMIT) && (
        <p>Showing the first {LEADERBOARD_LIMIT} of {count.toString()} players.</p>
      )}
    </section>
  );
}

export function App() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const queryClient = useQueryClient();
  const onReceipt = () => {
    void queryClient.invalidateQueries();
  };

  const onTestnet = chainId === TESTNET_CHAIN_ID;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Quantum Flip</h1>
      <p>
        A free coin-flip game on the QoreChain testnet. Every flip is an EVM transaction, and it is
        only admitted inside a post-quantum authorisation window — so each move is quantum-safe by
        construction.
      </p>
      <ConnectButton />

      {!isConnected && <p>Connect a wallet to play. QoreX is recommended.</p>}

      {isConnected && address && chainId && !onTestnet && (
        <section>
          <p>
            You are connected on chain {chainId}. Quantum Flip lives on the QoreChain Testnet
            (chain {TESTNET_CHAIN_ID}) — please switch networks to play.
          </p>
          <button type="button" onClick={() => switchChain({ chainId: TESTNET_CHAIN_ID })}>
            Switch to QoreChain Testnet
          </button>
        </section>
      )}

      {isConnected && address && onTestnet && (
        <section>
          <p>
            Account <code>{address}</code> on the QoreChain Testnet
          </p>
          <WindowStatus address={address} chainId={chainId} />

          {!CONTRACT_DEPLOYED && (
            <p>Contract not deployed yet — check back after deployment.</p>
          )}

          {CONTRACT_DEPLOYED && (
            <>
              <FlipButtons address={address} onReceipt={onReceipt} />
              <PlayerStats address={address} />
              <Totals />
              <Leaderboard />
            </>
          )}
        </section>
      )}

      <footer>
        <hr />
        <p>
          Honest notes: the coin result is derived from the block hash — unpredictable enough for a
          free testnet game, but NOT suitable for real stakes. This game holds no funds and has no
          admin or owner; there is nothing to deposit and nothing to withdraw.
        </p>
      </footer>
    </main>
  );
}
