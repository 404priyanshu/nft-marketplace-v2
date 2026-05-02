import { formatEther, parseEther } from "viem";

import { network } from "hardhat";

async function main() {
  const { viem } = await network.create();
  const [deployer, seller, buyer, feeRecipient] = await viem.getWalletClients();
  const price = parseEther("0.25");
  const tokenURI =
    "https://images.unsplash.com/photo-1642104704074-907c0698cbd9?auto=format&fit=crop&w=900&q=80";

  console.log("Running marketplace demo");
  console.log("Deployer:", deployer.account.address);
  console.log("Seller:", seller.account.address);
  console.log("Buyer:", buyer.account.address);

  const nft = await viem.deployContract("MyNFT");
  const marketplace = await viem.deployContract("NFTMarketplace", [
    feeRecipient.account.address,
    250n,
  ]);

  console.log("MyNFT deployed:", nft.address);
  console.log("NFTMarketplace deployed:", marketplace.address);

  await nft.write.mintTo([seller.account.address, tokenURI], {
    account: seller.account,
  });
  const tokenId = await nft.read.totalMinted();
  console.log(`Minted token #${tokenId} to seller`);

  await nft.write.approve([marketplace.address, tokenId], {
    account: seller.account,
  });
  await marketplace.write.createListing([nft.address, tokenId, price], {
    account: seller.account,
  });
  const listingId = await marketplace.read.listingCount();
  console.log(
    `Listed token #${tokenId} as listing #${listingId} for ${formatEther(
      price,
    )} ETH`,
  );

  await marketplace.write.purchaseListing([listingId], {
    account: buyer.account,
    value: price,
  });

  const owner = await nft.read.ownerOf([tokenId]);
  console.log(`Purchased listing #${listingId}`);
  console.log("New token owner:", owner);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
