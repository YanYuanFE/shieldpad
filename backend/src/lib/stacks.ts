import {
  makeContractDeploy,
  makeContractCall,
  broadcastTransaction,
  Cl,
  cvToJSON,
  cvToValue,
  ClarityValue,
  hexToCV,
  cvToHex,
  PostConditionMode,
} from "@stacks/transactions";
import {
  STACKS_DEVNET,
  STACKS_TESTNET,
  STACKS_MAINNET,
  StacksNetwork,
} from "@stacks/network";
import { config } from "../config";

// ---------------------------------------------------------------------------
// Shared headers (includes Hiro API key if configured)
// ---------------------------------------------------------------------------

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (config.hiroApiKey) {
    headers["x-hiro-api-key"] = config.hiroApiKey;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

export function getNetwork(): StacksNetwork {
  switch (config.network) {
    case "mainnet":
      return {
        ...STACKS_MAINNET,
        client: { baseUrl: config.stacksApiUrl },
      };
    case "testnet":
      return {
        ...STACKS_TESTNET,
        client: { baseUrl: config.stacksApiUrl },
      };
    case "devnet":
    default:
      return {
        ...STACKS_DEVNET,
        client: { baseUrl: config.stacksApiUrl },
      };
  }
}

// ---------------------------------------------------------------------------
// Read-only contract call via Hiro REST API
// ---------------------------------------------------------------------------

export interface ReadOnlyResult {
  okay: boolean;
  result?: string;
  cause?: string;
}

export async function callReadOnly(
  contractAddress: string,
  contractName: string,
  functionName: string,
  args: ClarityValue[] = []
): Promise<ClarityValue> {
  const url = `${config.stacksApiUrl}/v2/contracts/call-read/${contractAddress}/${contractName}/${functionName}`;

  const serializedArgs = args.map((a) => cvToHex(a));

  const response = await fetch(url, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sender: config.deployerAddress,
      arguments: serializedArgs,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Read-only call failed: ${response.status} ${response.statusText} - ${text}`
    );
  }

  const data = (await response.json()) as ReadOnlyResult;

  if (!data.okay || !data.result) {
    throw new Error(`Read-only call error: ${data.cause || "unknown error"}`);
  }

  return hexToCV(data.result);
}

// ---------------------------------------------------------------------------
// Clarity value parsing helpers
// ---------------------------------------------------------------------------

/**
 * Recursively unwrap cvToJSON output into plain JS values.
 * cvToJSON returns nested {type, value} objects — flatten them.
 */
export function parseClarityValue(cv: ClarityValue): any {
  const json = cvToJSON(cv);
  return deepUnwrap(json);
}

function deepUnwrap(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(deepUnwrap);

  // If it has {type, value}, keep unwrapping value recursively
  if ("type" in val && "value" in val) {
    return deepUnwrap(val.value);
  }

  // Plain object — recurse into all keys
  const result: Record<string, any> = {};
  for (const k of Object.keys(val)) {
    result[k] = deepUnwrap(val[k]);
  }
  return result;
}

/**
 * Simple unwrap: get the JS value directly via cvToValue.
 * Handles nested {type, value} objects that cvToValue sometimes returns.
 */
export function unwrapValue(cv: ClarityValue): any {
  const val = cvToValue(cv, true);
  // cvToValue can return { type: 'uint', value: '1' } — extract .value
  if (val && typeof val === "object" && "value" in val && "type" in val) {
    return val.value;
  }
  return val;
}

// ---------------------------------------------------------------------------
// Deploy contract
// ---------------------------------------------------------------------------

export async function deployContract(
  contractName: string,
  codeBody: string
): Promise<{ txId: string; contractAddress: string; contractName: string }> {
  const network = getNetwork();

  const tx = await makeContractDeploy({
    contractName,
    codeBody,
    senderKey: config.deployerKey,
    network,
    fee: 100_000, // generous fee for devnet
  });

  const result = await broadcastTransaction({ transaction: tx, network });

  console.log("Broadcast result:", JSON.stringify(result, null, 2));

  // broadcastTransaction in v7 returns { txid, error, reason, reason_data }
  if (typeof result === "object" && "error" in result && result.error) {
    throw new Error(`Broadcast failed: ${(result as any).reason ?? (result as any).error} ${JSON.stringify((result as any).reason_data ?? "")}`);
  }

  if (typeof result === "object" && "txid" in result) {
    return {
      txId: (result as any).txid as string,
      contractAddress: config.deployerAddress,
      contractName,
    };
  }

  if (typeof result === "string") {
    return {
      txId: result,
      contractAddress: config.deployerAddress,
      contractName,
    };
  }

  throw new Error(`Unexpected broadcast result: ${JSON.stringify(result)}`);
}

// ---------------------------------------------------------------------------
// Call a public contract function
// ---------------------------------------------------------------------------

export async function callContractFn(
  contractAddress: string,
  contractName: string,
  functionName: string,
  functionArgs: ClarityValue[],
  options?: { postConditionMode?: PostConditionMode; nonce?: number }
): Promise<string> {
  const network = getNetwork();

  const tx = await makeContractCall({
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    senderKey: config.deployerKey,
    network,
    fee: 500_000,
    postConditionMode: options?.postConditionMode ?? PostConditionMode.Allow,
    ...(options?.nonce !== undefined ? { nonce: options.nonce } : {}),
  });

  const result = await broadcastTransaction({ transaction: tx, network });

  if (typeof result === "object" && "error" in result && result.error) {
    throw new Error(`Call failed: ${(result as any).reason ?? (result as any).error}`);
  }

  if (typeof result === "object" && "txid" in result) {
    return (result as any).txid as string;
  }

  if (typeof result === "string") return result;

  throw new Error(`Unexpected call result: ${JSON.stringify(result)}`);
}

// ---------------------------------------------------------------------------
// Wait for a tx to be mined (poll)
// ---------------------------------------------------------------------------

export async function waitForTx(txId: string, maxAttempts = 30): Promise<string> {
  const cleanTxId = txId.startsWith("0x") ? txId : `0x${txId}`;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${config.stacksApiUrl}/extended/v1/tx/${cleanTxId}`, {
        headers: apiHeaders(),
      });
      if (res.ok) {
        const data = await res.json() as { tx_status?: string };
        if (data.tx_status === "success") return "success";
        if (data.tx_status?.startsWith("abort")) return data.tx_status;
      }
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return "pending";
}

// ---------------------------------------------------------------------------
// Get current nonce for deployer
// ---------------------------------------------------------------------------

export async function getNonce(): Promise<number> {
  const res = await fetch(`${config.stacksApiUrl}/v2/accounts/${config.deployerAddress}`, {
    headers: apiHeaders(),
  });
  const data = await res.json() as { nonce: number };
  return data.nonce;
}
