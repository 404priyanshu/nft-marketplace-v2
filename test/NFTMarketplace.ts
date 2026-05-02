import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { type Address, getAddress, parseEther, zeroAddress } from "viem";

const ACTIVE = 1;
const SOLD = 2;
const CANCELED = 3;
const MARKETPLACE_FEE_BPS = 250n;
const BPS_DENOMINATOR = 10_000n;

describe("NFTMarketplace", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, seller, buyer, feeRecipient, stranger] =
    await viem.getWalletClients();

  async function deployFixture(feeBps = MARKETPLACE_FEE_BPS) {
    const nft = await viem.deployContract("MyNFT");
    const marketplace = await viem.deployContract("NFTMarketplace", [
      feeRecipient.account.address,
      feeBps,
    ]);

    return { nft, marketplace };
  }

  async function mintToSeller(nft: Awaited<ReturnType<typeof viem.deployContract>>) {
    const tokenURI = "ipfs://bafybeihardhatviemmarketplace";

    await nft.write.mintTo([seller.account.address, tokenURI], {
      account: seller.account,
    });

    const tokenId = await nft.read.totalMinted();
    return { tokenId, tokenURI };
  }

  async function createListing({
    price = parseEther("1"),
  }: {
    price?: bigint;
  } = {}) {
    const { nft, marketplace } = await deployFixture();
    const { tokenId, tokenURI } = await mintToSeller(nft);

    await nft.write.approve([marketplace.address, tokenId], {
      account: seller.account,
    });
    await marketplace.write.createListing([nft.address, tokenId, price], {
      account: seller.account,
    });

    const listingId = await marketplace.read.listingCount();
    return { nft, marketplace, listingId, tokenId, price, tokenURI };
  }

  it("mints NFTs with token URIs", async function () {
    const { nft } = await deployFixture();
    const { tokenId, tokenURI } = await mintToSeller(nft);

    assert.equal(tokenId, 1n);
    assert.equal(
      getAddress(await nft.read.ownerOf([tokenId])),
      getAddress(seller.account.address),
    );
    assert.equal(await nft.read.tokenURI([tokenId]), tokenURI);
  });

  it("creates escrowed listings", async function () {
    const { nft, marketplace, listingId, tokenId, price } =
      await createListing();
    const listing = await marketplace.read.getListing([listingId]);

    assert.equal(listingId, 1n);
    assert.equal(await marketplace.read.activeListingCount(), 1n);
    assert.equal(
      getAddress(await nft.read.ownerOf([tokenId])),
      getAddress(marketplace.address),
    );
    assert.equal(await marketplace.read.listingByToken([nft.address, tokenId]), listingId);
    assert.equal(readAddress(listing, "seller", 3), getAddress(seller.account.address));
    assert.equal(readBigInt(listing, "price", 4), price);
    assert.equal(readStatus(listing), ACTIVE);
  });

  it("lets the seller update an active listing price", async function () {
    const { marketplace, listingId } = await createListing();
    const newPrice = parseEther("2.5");

    await marketplace.write.updateListingPrice([listingId, newPrice], {
      account: seller.account,
    });

    const listing = await marketplace.read.getListing([listingId]);
    assert.equal(readBigInt(listing, "price", 4), newPrice);
  });

  it("lets the seller cancel an active listing", async function () {
    const { nft, marketplace, listingId, tokenId } = await createListing();

    await marketplace.write.cancelListing([listingId], {
      account: seller.account,
    });

    const listing = await marketplace.read.getListing([listingId]);
    assert.equal(readStatus(listing), CANCELED);
    assert.equal(await marketplace.read.activeListingCount(), 0n);
    assert.equal(await marketplace.read.listingByToken([nft.address, tokenId]), 0n);
    assert.equal(
      getAddress(await nft.read.ownerOf([tokenId])),
      getAddress(seller.account.address),
    );
  });

  it("purchases listings and splits proceeds from marketplace fees", async function () {
    const price = parseEther("1");
    const { nft, marketplace, listingId, tokenId } = await createListing({
      price,
    });
    const sellerBalanceBefore = await publicClient.getBalance({
      address: seller.account.address,
    });
    const feeRecipientBalanceBefore = await publicClient.getBalance({
      address: feeRecipient.account.address,
    });
    const marketplaceFee = (price * MARKETPLACE_FEE_BPS) / BPS_DENOMINATOR;
    const sellerProceeds = price - marketplaceFee;

    await marketplace.write.purchaseListing([listingId], {
      account: buyer.account,
      value: price,
    });

    const listing = await marketplace.read.getListing([listingId]);
    const sellerBalanceAfter = await publicClient.getBalance({
      address: seller.account.address,
    });
    const feeRecipientBalanceAfter = await publicClient.getBalance({
      address: feeRecipient.account.address,
    });

    assert.equal(readStatus(listing), SOLD);
    assert.equal(readAddress(listing, "buyer", 6), getAddress(buyer.account.address));
    assert.equal(await marketplace.read.activeListingCount(), 0n);
    assert.equal(await marketplace.read.listingByToken([nft.address, tokenId]), 0n);
    assert.equal(
      getAddress(await nft.read.ownerOf([tokenId])),
      getAddress(buyer.account.address),
    );
    assert.equal(sellerBalanceAfter - sellerBalanceBefore, sellerProceeds);
    assert.equal(
      feeRecipientBalanceAfter - feeRecipientBalanceBefore,
      marketplaceFee,
    );
  });

  it("rejects invalid listing and purchase actions", async function () {
    const { nft, marketplace } = await deployFixture();
    const { tokenId } = await mintToSeller(nft);
    const price = parseEther("1");

    await assert.rejects(
      () =>
        marketplace.write.createListing([nft.address, tokenId, 0n], {
          account: seller.account,
        }),
      /PriceMustBeAboveZero/,
    );

    await assert.rejects(
      () =>
        marketplace.write.createListing([nft.address, tokenId, price], {
          account: buyer.account,
        }),
      /NotTokenOwner/,
    );

    await nft.write.approve([marketplace.address, tokenId], {
      account: seller.account,
    });
    await marketplace.write.createListing([nft.address, tokenId, price], {
      account: seller.account,
    });
    const listingId = await marketplace.read.listingCount();

    await assert.rejects(
      () =>
        marketplace.write.updateListingPrice([listingId, parseEther("2")], {
          account: stranger.account,
        }),
      /NotListingSeller/,
    );

    await assert.rejects(
      () =>
        marketplace.write.cancelListing([listingId], {
          account: stranger.account,
        }),
      /NotListingSeller/,
    );

    await assert.rejects(
      () =>
        marketplace.write.purchaseListing([listingId], {
          account: seller.account,
          value: price,
        }),
      /SellerCannotBuyOwnListing/,
    );

    await assert.rejects(
      () =>
        marketplace.write.purchaseListing([listingId], {
          account: buyer.account,
          value: price + 1n,
        }),
      /IncorrectPaymentAmount/,
    );
  });

  it("lets the owner update marketplace settings", async function () {
    const { marketplace } = await deployFixture();

    await marketplace.write.setMarketplaceFee([500n], {
      account: owner.account,
    });
    await marketplace.write.setFeeRecipient([stranger.account.address], {
      account: owner.account,
    });

    assert.equal(await marketplace.read.marketplaceFeeBps(), 500n);
    assert.equal(
      getAddress(await marketplace.read.feeRecipient()),
      getAddress(stranger.account.address),
    );

    await assert.rejects(
      () =>
        marketplace.write.setMarketplaceFee([1001n], {
          account: owner.account,
        }),
      /InvalidFeeBps/,
    );

    await assert.rejects(
      () =>
        marketplace.write.setFeeRecipient([zeroAddress], {
          account: owner.account,
        }),
      /InvalidAddress/,
    );
  });
});

function readBigInt(value: unknown, key: string, tupleIndex: number): bigint {
  const listing = value as Record<string, unknown> & readonly unknown[];
  return BigInt((listing[key] ?? listing[tupleIndex]) as bigint | number | string);
}

function readAddress(value: unknown, key: string, tupleIndex: number): Address {
  const listing = value as Record<string, unknown> & readonly unknown[];
  return getAddress((listing[key] ?? listing[tupleIndex]) as Address);
}

function readStatus(value: unknown): number {
  const listing = value as Record<string, unknown> & readonly unknown[];
  return Number(listing.status ?? listing[5]);
}
