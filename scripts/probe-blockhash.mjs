// probe-blockhash.mjs — read-only proof that the EVM BLOCKHASH opcode
// returns 0 on the QoreChain Diana testnet, plus an optional check that a
// Quantum Flip outcome can be predicted exactly from (sender, totalFlips).
//
// No private key is needed and no transaction is sent: everything here is
// eth_call / eth_getBlockByNumber against the public testnet RPC.
//
// Usage:
//   node scripts/probe-blockhash.mjs [--from <address>] [--no-predict]
//
//   --from <address>  sender address to predict a flip for (default: the
//                     deployer 0x32fA73e4Eb17d13873D074cdc44105625D48eCD6)
//   --no-predict      skip the flip-prediction check, only probe BLOCKHASH
//
// How the BLOCKHASH probe works: eth_call with a state override places
// this 13-byte program at a scratch address and runs it:
//
//   0x436001034060005260206000f3
//     43       NUMBER            (current block number)
//     6001     PUSH1 1
//     03       SUB               (block.number - 1)
//     40       BLOCKHASH         (hash of the previous block, per the EVM)
//     6000     PUSH1 0
//     52       MSTORE            (store the 32-byte result at memory 0)
//     6020     PUSH1 32
//     6000     PUSH1 0
//     f3       RETURN            (return those 32 bytes)
//
// On a normal EVM chain this returns the previous block's hash. On Diana
// it returns 0x0000...0000 — the BLOCKHASH opcode is not wired up — even
// though the block header itself has a real (non-zero) hash, which the
// script also fetches via eth_getBlockByNumber for comparison.
//
// Consequence for Quantum Flip: the contract computes
// keccak256(blockhash(block.number - 1), sender, totalFlips), so on Diana
// the outcome is keccak256(0, sender, totalFlips) — fully deterministic
// from public inputs. The --predict check below computes that value
// off-chain and compares it against an eth_call simulation of flip(true).
// See docs/randomness.md for the full write-up.

import { encodeFunctionData, encodePacked, hexToBigInt, keccak256 } from "viem";

const RPC_URL =
  process.env.QORE_EVM_RPC_URL ?? "https://evm-testnet.qore.host";
const CONTRACT = "0x4a8de5795545fb081cb875e4ba8667290bb11c6f";
const DEFAULT_SENDER = "0x32fA73e4Eb17d13873D074cdc44105625D48eCD6";
const ZERO_HASH = `0x${"00".repeat(32)}`;

// Scratch address that holds the probe program only via state override.
const PROBE_ADDRESS = "0x000000000000000000000000000000000000beef";
// NUMBER, PUSH1 1, SUB, BLOCKHASH, PUSH1 0, MSTORE, PUSH1 32, PUSH1 0, RETURN
const PROBE_CODE = "0x436001034060005260206000f3";

const FLIP_ABI = [
  {
    type: "function",
    name: "flip",
    stateMutability: "nonpayable",
    inputs: [{ name: "guessHeads", type: "bool" }],
    outputs: [{ name: "won", type: "bool" }],
  },
  {
    type: "function",
    name: "totalFlips",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

let id = 0;
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `${method}: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }
  return json.result;
}

function parseArgs(argv) {
  let from = DEFAULT_SENDER;
  let predict = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") {
      from = argv[++i];
      if (!/^0x[0-9a-fA-F]{40}$/.test(from)) {
        throw new Error(`--from expects an EVM address, got ${from}`);
      }
    } else if (argv[i] === "--no-predict") {
      predict = false;
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return { from, predict };
}

async function main() {
  const { from, predict } = parseArgs(process.argv.slice(2));

  console.log(`RPC:        ${RPC_URL}`);
  console.log(`Contract:   ${CONTRACT}`);
  console.log("");

  // 1. Current block number.
  const blockNumberHex = await rpc("eth_blockNumber", []);
  const blockNumber = hexToBigInt(blockNumberHex);
  console.log(`Block:      ${blockNumber}`);

  // 2. The previous block's header hash, as the chain itself reports it.
  const prevBlock = await rpc("eth_getBlockByNumber", [
    `0x${(blockNumber - 1n).toString(16)}`,
    false,
  ]);
  console.log(`Header hash of block ${blockNumber - 1n}: ${prevBlock.hash}`);

  // 3. What the EVM BLOCKHASH opcode returns for the same block.
  const opcodeResult = await rpc("eth_call", [
    { from: PROBE_ADDRESS, to: PROBE_ADDRESS, data: "0x" },
    "latest",
    { [PROBE_ADDRESS]: { code: PROBE_CODE } },
  ]);
  console.log(`BLOCKHASH opcode result:    ${opcodeResult}`);
  console.log("");

  const blockhashIsZero =
    opcodeResult.toLowerCase() === ZERO_HASH.toLowerCase();
  if (blockhashIsZero && prevBlock.hash.toLowerCase() !== ZERO_HASH) {
    console.log(
      "RESULT: BLOCKHASH opcode returns 0 on Diana, while the block header",
    );
    console.log(
      "        hash is non-zero. The opcode is not wired up on this chain.",
    );
  } else if (blockhashIsZero) {
    console.log(
      "RESULT: BLOCKHASH opcode returns 0 (and the header hash is 0 too).",
    );
  } else if (opcodeResult.toLowerCase() === prevBlock.hash.toLowerCase()) {
    console.log(
      "RESULT: BLOCKHASH opcode matches the header hash — normal EVM behaviour.",
    );
  } else {
    console.log(
      "RESULT: BLOCKHASH opcode returns a non-zero value that does NOT match",
    );
    console.log("        the header hash — unexpected, investigate.");
  }
  console.log("");

  if (!predict) return;

  // 4. Flip prediction: with blockhash == 0, the outcome is
  //    keccak256(0, sender, totalFlips) % 2 == 0  =>  HEADS.
  const totalFlipsHex = await rpc("eth_call", [
    {
      to: CONTRACT,
      data: encodeFunctionData({ abi: FLIP_ABI, functionName: "totalFlips" }),
    },
    "latest",
  ]);
  const totalFlips = hexToBigInt(totalFlipsHex);
  const digest = keccak256(
    encodePacked(
      ["bytes32", "address", "uint256"],
      [`0x${"00".repeat(32)}`, from, totalFlips],
    ),
  );
  const predictedHeads = hexToBigInt(digest) % 2n === 0n;
  console.log(`totalFlips: ${totalFlips}`);
  console.log(`Sender:     ${from}`);
  console.log(`keccak256(0, sender, totalFlips) = ${digest}`);
  console.log(
    `Predicted next flip: ${predictedHeads ? "HEADS" : "TAILS"} (digest % 2 == ${predictedHeads ? "0" : "1"})`,
  );

  // 5. Simulate flip(true) on-chain: `won` is true exactly when the
  //    result is HEADS, so it must equal the prediction above.
  const wonHex = await rpc("eth_call", [
    {
      from,
      to: CONTRACT,
      data: encodeFunctionData({
        abi: FLIP_ABI,
        functionName: "flip",
        args: [true],
      }),
    },
    "latest",
  ]);
  const simulatedHeads = hexToBigInt(wonHex) === 1n;
  console.log(
    `eth_call flip(true) returns won=${simulatedHeads} (=> ${simulatedHeads ? "HEADS" : "TAILS"})`,
  );
  console.log("");
  if (simulatedHeads === predictedHeads) {
    console.log("PREDICTION MATCH: the off-chain prediction equals the on-chain result.");
  } else {
    console.log("PREDICTION MISMATCH: prediction does not match the on-chain result.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`probe-blockhash: ${err.message}`);
  process.exit(1);
});
