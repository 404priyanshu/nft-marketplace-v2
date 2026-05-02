import type { Abi } from "viem";

import marketplaceArtifact from "../artifacts/contracts/NFTMarketplace.sol/NFTMarketplace.json";
import myNFTArtifact from "../artifacts/contracts/MyNFT.sol/MyNFT.json";

export const marketplaceAbi = marketplaceArtifact.abi as Abi;
export const myNFTAbi = myNFTArtifact.abi as Abi;
