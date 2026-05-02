# Viem NFT Marketplace

A full local NFT marketplace built with Hardhat 3, Solidity, OpenZeppelin, Viem, and a React/Vite frontend.

## What It Includes

- `MyNFT`: ERC721 minting contract with token URI storage.
- `NFTMarketplace`: escrow-based marketplace with listing, price updates, cancellation, exact-price purchases, seller payouts, and marketplace fees.
- Viem-powered Hardhat tests.
- Viem deployment and demo scripts.
- React frontend that mints NFTs, approves/list NFTs, shows active listings, buys listings, and cancels your own listings.

## Install

```shell
npm install
```

## Verify

```shell
npm test
npm run typecheck
npm run build
```

## Run Locally

Start a local Hardhat node:

```shell
npm run node
```

In a second terminal, deploy the contracts to that node:

```shell
npm run deploy
```

The deployment script writes the frontend contract addresses to `src/deployment.ts`.

Start the app:

```shell
npm run dev
```

Open the Vite URL, connect a wallet to chain `31337`, and use the local Hardhat account private keys for testing.

## Demo Script

Run a complete marketplace flow on an in-memory Hardhat network:

```shell
npm run demo
```

The script deploys both contracts, mints an NFT to a seller, approves and lists it, buys it from another account, and prints the final token owner.

## Contract Flow

1. Seller mints with `MyNFT.mint` or `MyNFT.mintTo`.
2. Seller approves the marketplace for the token.
3. Seller calls `NFTMarketplace.createListing`.
4. Marketplace escrows the NFT.
5. Buyer calls `purchaseListing` with the exact ETH price.
6. Marketplace transfers the NFT, pays the seller, and sends the fee to the fee recipient.

## Scripts

- `npm run compile`: compile Solidity contracts.
- `npm run typecheck`: type-check the TypeScript contracts tooling and frontend.
- `npm test`: run the Viem test suite.
- `npm run deploy`: deploy to `localhost` and update `src/deployment.ts`.
- `npm run demo`: run an end-to-end marketplace script.
- `npm run dev`: start the React frontend.
- `npm run build`: compile contracts and build the frontend.
