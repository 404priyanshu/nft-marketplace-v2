import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NFTMarketplaceModule", (m) => {
  const deployer = m.getAccount(0);
  const feeRecipient = m.getParameter("feeRecipient", deployer);
  const marketplaceFeeBps = m.getParameter("marketplaceFeeBps", 250n);

  const nft = m.contract("MyNFT");
  const marketplace = m.contract("NFTMarketplace", [
    feeRecipient,
    marketplaceFeeBps,
  ]);

  return { nft, marketplace };
});
