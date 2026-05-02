import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";

const DEFAULT_MARKETPLACE_FEE_BPS = 250;

async function main() {
  const { viem } = await network.create();
  const [deployer, feeRecipient = deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  console.log("Deploying NFT marketplace contracts");
  console.log("Network chain id:", chainId);
  console.log("Deployer:", deployer.account.address);
  console.log("Fee recipient:", feeRecipient.account.address);
  console.log("Marketplace fee:", `${DEFAULT_MARKETPLACE_FEE_BPS / 100}%`);

  const nft = await viem.deployContract("MyNFT");
  console.log("MyNFT:", nft.address);

  const marketplace = await viem.deployContract("NFTMarketplace", [
    feeRecipient.account.address,
    BigInt(DEFAULT_MARKETPLACE_FEE_BPS),
  ]);
  console.log("NFTMarketplace:", marketplace.address);

  await writeFrontendDeployment({
    chainId,
    myNFT: nft.address,
    marketplace: marketplace.address,
  });

  console.log("Updated src/deployment.ts");
}

async function writeFrontendDeployment(deployment: {
  chainId: number;
  myNFT: string;
  marketplace: string;
}) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const outputPath = join(root, "src", "deployment.ts");

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `import type { Address } from "viem";

export const deployment = {
  chainId: ${deployment.chainId},
  myNFT: "${deployment.myNFT}" as Address,
  marketplace: "${deployment.marketplace}" as Address,
} as const;
`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
