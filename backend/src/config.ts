import dotenv from "dotenv";
import path from "node:path";
dotenv.config();

export type NetworkName = "devnet" | "testnet" | "mainnet";

const network = (process.env.STACKS_NETWORK || "devnet") as NetworkName;

function getDefaultApiUrl(net: NetworkName): string {
  switch (net) {
    case "mainnet":
      return "https://api.mainnet.hiro.so";
    case "testnet":
      return "https://api.testnet.hiro.so";
    case "devnet":
    default:
      return "http://localhost:3999";
  }
}

export const config = {
  network,
  deployerAddress: process.env.DEPLOYER_ADDRESS || "",
  deployerKey: process.env.DEPLOYER_KEY || "",
  stacksApiUrl: process.env.STACKS_API_URL || getDefaultApiUrl(network),
  port: parseInt(process.env.PORT || "3001", 10),
  ammContractName: process.env.AMM_CONTRACT_NAME || "shield-amm",
  registryContractName: process.env.REGISTRY_CONTRACT_NAME || "shield-registry",
  hiroApiKey: process.env.HIRO_API_KEY || "",
  tokenTemplatePath:
    process.env.TOKEN_TEMPLATE_PATH ||
    path.resolve(__dirname, "../../contracts/contracts/shield-token.clar"),
};
