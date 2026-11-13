/**
 * proof-send.ts - one-off helper: send a tiny self-send on QoreChain testnet
 * with an exact memo, for the Developer Fest QoreX registration proof.
 *
 * The fest's manual QoreX flow asks for 0.000001 QOR (= 1 uqor) sent to your
 * own testnet address with a memo like "bbqd-link:<code>". This script sends
 * exactly that from the deployer account in .env, hybrid-signed like any
 * other native transaction. The memo is taken from argv so it is never
 * committed to the repo.
 *
 * Usage (testnet only):
 *   tsx --env-file=.env scripts/proof-send.ts "bbqd-link:<code>"
 *
 * Prints the transaction hash and the deliver code; exits non-zero unless
 * the transaction was accepted (code 0). Verify afterwards with:
 *   curl https://api-testnet.qore.host/cosmos/tx/v1beta1/txs/<hash>
 */
import { StargateClient } from "@cosmjs/stargate";
import { EthNativeSigner, deriveUnifiedAccount } from "@qorechain/sdk";

const REST = "https://api-testnet.qore.host";
const RPC = "https://rpc-testnet.qore.host";
const CHAIN_ID = "qorechain-diana";

/** Same native-lane fee as scripts/window.ts (~0.1 QOR). */
const FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

async function accountSequence(address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${REST}/cosmos/auth/v1beta1/accounts/${address}`);
    if (res.ok) {
      const body = (await res.json()) as { account?: Record<string, unknown> };
      const acc = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
      return { accountNumber: BigInt(acc.account_number ?? "0"), sequence: BigInt(acc.sequence ?? "0") };
    }
    lastStatus = res.status;
    lastBody = (await res.text()).slice(0, 200);
    console.error(`account query attempt ${attempt}: HTTP ${lastStatus} ${lastBody}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`account query failed: HTTP ${lastStatus} ${lastBody}`);
}

async function main(): Promise<void> {
  const network = process.env.QORE_NETWORK ?? "testnet";
  if (network !== "testnet") throw new Error(`Refusing to run on network "${network}": this script is testnet-only.`);
  const memo = process.argv[2]?.trim();
  if (!memo) throw new Error('Usage: proof-send.ts "<memo>"  (e.g. "bbqd-link:<code>")');
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (!mnemonic) throw new Error("Set QORE_MNEMONIC in .env");

  const acc = await deriveUnifiedAccount(mnemonic, 0);
  console.log(`account: ${acc.evm} (${acc.cosmos})`);
  const { accountNumber, sequence } = await accountSequence(acc.cosmos);
  const signer = new EthNativeSigner(acc, { signMode: "hybrid", rest: REST });
  const transport = await StargateClient.connect(RPC);
  try {
    const res = await signer.bankSend(transport, acc.cosmos, [{ denom: "uqor", amount: "1" }], {
      chainId: CHAIN_ID,
      accountNumber,
      sequence,
      fee: FEE,
      memo,
    });
    console.log(`proof tx: ${res.transactionHash}`);
    console.log(`code: ${res.code}`);
    if (res.code !== 0) {
      console.error("Transaction was NOT accepted (code != 0). Do not press 'I have sent it'.");
      process.exitCode = 1;
    }
  } finally {
    transport.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
