import {
  ArrowDownUp,
  BadgeCheck,
  CircleDollarSign,
  Coins,
  Gem,
  Grid2X2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatEther,
  http,
  parseEther,
  type Address,
  zeroAddress,
} from "viem";

import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Card, CardContent, CardHeader } from "./components/ui/card.js";
import { marketplaceAbi, myNFTAbi } from "./abi.js";
import { deployment } from "./deployment.js";

const ACTIVE_STATUS = 1;
const DEFAULT_TOKEN_URI =
  "ipfs://bafkreiavkvhof4xcs7obthi3kvipsy6qx7px3dn6ruekxqvo6yn37y4dci";
const BPS_DENOMINATOR = 10_000;
const METADATA_TIMEOUT_MS = 5_000;

type Listing = {
  listingId: bigint;
  nft: Address;
  tokenId: bigint;
  seller: Address;
  price: bigint;
  status: number;
  buyer: Address;
  tokenURI: string;
  name: string;
  description: string;
  imageURL: string;
};

type OwnedNFT = {
  tokenId: bigint;
  tokenURI: string;
  name: string;
  description: string;
  imageURL: string;
};

type MarketFilter = "all" | "mine" | "available";
type SortOrder = "recent" | "price-asc" | "price-desc";

const rpcUrl = import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545";
const marketplaceChain = defineChain({
  id: deployment.chainId,
  name: deployment.chainId === 31337 ? "Hardhat Local" : "Marketplace Network",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [rpcUrl],
    },
  },
});

const publicClient = createPublicClient({
  chain: marketplaceChain,
  transport: http(rpcUrl),
});

export default function App() {
  const [account, setAccount] = useState<Address | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [ownedNFTs, setOwnedNFTs] = useState<OwnedNFT[]>([]);
  const [tokenURI, setTokenURI] = useState(DEFAULT_TOKEN_URI);
  const [listTokenId, setListTokenId] = useState("");
  const [listPrice, setListPrice] = useState("0.25");
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingListings, setIsLoadingListings] = useState(false);
  const [isLoadingOwnedNFTs, setIsLoadingOwnedNFTs] = useState(false);
  const [notice, setNotice] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [marketplaceFeeBps, setMarketplaceFeeBps] = useState<bigint>(0n);

  const isDeployed =
    deployment.myNFT !== zeroAddress && deployment.marketplace !== zeroAddress;
  const connectedLabel = account ? formatAddress(account) : "Connect Wallet";
  const activeListingCount = listings.length;
  const availableCount = account
    ? listings.filter(
        (listing) => listing.seller.toLowerCase() !== account.toLowerCase(),
      ).length
    : listings.length;
  const floorPrice = useMemo(
    () =>
      listings.reduce<bigint | null>(
        (lowest, listing) =>
          lowest === null || listing.price < lowest ? listing.price : lowest,
        null,
      ),
    [listings],
  );
  const totalAskValue = useMemo(
    () => listings.reduce((total, listing) => total + listing.price, 0n),
    [listings],
  );
  const myListings = useMemo(
    () =>
      account
        ? listings.filter(
            (listing) => listing.seller.toLowerCase() === account.toLowerCase(),
          )
        : [],
    [account, listings],
  );
  const myCollectionCount = myListings.length + ownedNFTs.length;
  const visibleListings = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return listings
      .filter((listing) => {
        if (!normalizedSearch) {
          return true;
        }

        return (
          listing.name.toLowerCase().includes(normalizedSearch) ||
          listing.tokenId.toString().includes(normalizedSearch) ||
          listing.seller.toLowerCase().includes(normalizedSearch) ||
          formatAddress(listing.seller).toLowerCase().includes(normalizedSearch)
        );
      })
      .filter((listing) => {
        if (!account || marketFilter === "all") {
          return true;
        }

        const isMine = listing.seller.toLowerCase() === account.toLowerCase();
        return marketFilter === "mine" ? isMine : !isMine;
      })
      .sort((a, b) => {
        if (sortOrder === "price-asc") {
          return a.price < b.price ? -1 : a.price > b.price ? 1 : 0;
        }
        if (sortOrder === "price-desc") {
          return a.price > b.price ? -1 : a.price < b.price ? 1 : 0;
        }

        return Number(b.listingId - a.listingId);
      });
  }, [account, listings, marketFilter, searchTerm, sortOrder]);

  const getWalletClient = useCallback(() => {
    if (!window.ethereum) {
      throw new Error("No injected wallet found");
    }

    return createWalletClient({
      chain: marketplaceChain,
      transport: custom(window.ethereum),
    });
  }, []);

  const switchToMarketplaceChain = useCallback(async () => {
    if (!window.ethereum) {
      return;
    }

    const chainId = `0x${deployment.chainId.toString(16)}`;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } catch (error) {
      const maybeProviderError = error as { code?: number };
      if (maybeProviderError.code !== 4902) {
        throw error;
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: marketplaceChain.name,
            nativeCurrency: marketplaceChain.nativeCurrency,
            rpcUrls: [rpcUrl],
          },
        ],
      });
    }
  }, []);

  const connectWallet = useCallback(async () => {
    try {
      const walletClient = getWalletClient();
      await switchToMarketplaceChain();
      const [address] = await walletClient.requestAddresses();
      setAccount(address);
      setNotice(`Connected ${formatAddress(address)}`);
    } catch (error) {
      setNotice(readError(error));
    }
  }, [getWalletClient, switchToMarketplaceChain]);

  const loadListings = useCallback(async () => {
    if (!isDeployed) {
      setListings([]);
      return;
    }

    setIsLoadingListings(true);
    try {
      const listingCount = (await publicClient.readContract({
        address: deployment.marketplace,
        abi: marketplaceAbi,
        functionName: "listingCount",
      })) as bigint;
      const feeBps = (await publicClient.readContract({
        address: deployment.marketplace,
        abi: marketplaceAbi,
        functionName: "marketplaceFeeBps",
      })) as bigint;

      const loadedListings = await Promise.all(
        Array.from({ length: Number(listingCount) }, async (_, index) => {
          const listingId = BigInt(index + 1);
          const listing = normalizeListing(
            await publicClient.readContract({
              address: deployment.marketplace,
              abi: marketplaceAbi,
              functionName: "getListing",
              args: [listingId],
            }),
          );

          if (listing.status !== ACTIVE_STATUS) {
            return null;
          }

          const uri = (await publicClient.readContract({
            address: listing.nft,
            abi: myNFTAbi,
            functionName: "tokenURI",
            args: [listing.tokenId],
          })) as string;
          const metadata = await resolveNFTMetadata(uri, listing.tokenId);

          return {
            ...listing,
            ...metadata,
            tokenURI: uri,
          };
        }),
      );

      setMarketplaceFeeBps(feeBps);
      setListings(loadedListings.filter(Boolean) as Listing[]);
    } catch (error) {
      setNotice(readError(error));
    } finally {
      setIsLoadingListings(false);
    }
  }, [isDeployed]);

  const loadOwnedNFTs = useCallback(
    async (owner: Address | null) => {
      if (!isDeployed || !owner) {
        setOwnedNFTs([]);
        return;
      }

      setIsLoadingOwnedNFTs(true);
      try {
        const totalMinted = (await publicClient.readContract({
          address: deployment.myNFT,
          abi: myNFTAbi,
          functionName: "totalMinted",
        })) as bigint;

        const ownedTokens = await Promise.all(
          Array.from({ length: Number(totalMinted) }, async (_, index) => {
            const tokenId = BigInt(index + 1);
            const tokenOwner = (await publicClient.readContract({
              address: deployment.myNFT,
              abi: myNFTAbi,
              functionName: "ownerOf",
              args: [tokenId],
            })) as Address;

            if (tokenOwner.toLowerCase() !== owner.toLowerCase()) {
              return null;
            }

            const uri = (await publicClient.readContract({
              address: deployment.myNFT,
              abi: myNFTAbi,
              functionName: "tokenURI",
              args: [tokenId],
            })) as string;
            const metadata = await resolveNFTMetadata(uri, tokenId);

            return {
              ...metadata,
              tokenId,
              tokenURI: uri,
            };
          }),
        );

        setOwnedNFTs(ownedTokens.filter(Boolean) as OwnedNFT[]);
      } catch (error) {
        setNotice(readError(error));
      } finally {
        setIsLoadingOwnedNFTs(false);
      }
    },
    [isDeployed],
  );

  const refreshMarketplace = useCallback(async () => {
    await Promise.all([loadListings(), loadOwnedNFTs(account)]);
  }, [account, loadListings, loadOwnedNFTs]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    void loadOwnedNFTs(account);
  }, [account, loadOwnedNFTs]);

  useEffect(() => {
    if (!window.ethereum?.on) {
      return;
    }

    const handleAccountsChanged = (accounts: unknown) => {
      const [address] = accounts as Address[];
      setAccount(address ?? null);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum?.removeListener?.(
        "accountsChanged",
        handleAccountsChanged,
      );
    };
  }, []);

  async function mintNFT(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) {
      await connectWallet();
      return;
    }

    await runWalletAction("Minted NFT", async () => {
      const walletClient = getWalletClient();
      const hash = await walletClient.writeContract({
        account,
        address: deployment.myNFT,
        abi: myNFTAbi,
        functionName: "mint",
        args: [tokenURI],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      const mintedTokenId = (await publicClient.readContract({
        address: deployment.myNFT,
        abi: myNFTAbi,
        functionName: "totalMinted",
      })) as bigint;
      setListTokenId(mintedTokenId.toString());
      await loadOwnedNFTs(account);
    });
  }

  async function approveAndListNFT(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) {
      await connectWallet();
      return;
    }

    await runWalletAction("Listed NFT", async () => {
      const walletClient = getWalletClient();
      const tokenId = BigInt(listTokenId);
      const price = parseEther(listPrice);

      const approvalHash = await walletClient.writeContract({
        account,
        address: deployment.myNFT,
        abi: myNFTAbi,
        functionName: "approve",
        args: [deployment.marketplace, tokenId],
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });

      const listingHash = await walletClient.writeContract({
        account,
        address: deployment.marketplace,
        abi: marketplaceAbi,
        functionName: "createListing",
        args: [deployment.myNFT, tokenId, price],
      });
      await publicClient.waitForTransactionReceipt({ hash: listingHash });
      await refreshMarketplace();
    });
  }

  async function buyListing(listing: Listing) {
    if (!account) {
      await connectWallet();
      return;
    }

    await runWalletAction("Purchased NFT", async () => {
      const walletClient = getWalletClient();
      const hash = await walletClient.writeContract({
        account,
        address: deployment.marketplace,
        abi: marketplaceAbi,
        functionName: "purchaseListing",
        args: [listing.listingId],
        value: listing.price,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await refreshMarketplace();
    });
  }

  async function cancelListing(listing: Listing) {
    if (!account) {
      await connectWallet();
      return;
    }

    await runWalletAction("Canceled listing", async () => {
      const walletClient = getWalletClient();
      const hash = await walletClient.writeContract({
        account,
        address: deployment.marketplace,
        abi: marketplaceAbi,
        functionName: "cancelListing",
        args: [listing.listingId],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      await refreshMarketplace();
    });
  }

  async function runWalletAction(successMessage: string, action: () => Promise<void>) {
    if (!isDeployed) {
      setNotice("Deploy contracts before using the app");
      return;
    }

    setIsBusy(true);
    setNotice("");
    try {
      await switchToMarketplaceChain();
      await action();
      setNotice(successMessage);
    } catch (error) {
      setNotice(readError(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Store size={22} aria-hidden="true" />
          </span>
          <span>
            <strong>Viem NFT Marketplace</strong>
            <small>{marketplaceChain.name}</small>
          </span>
        </div>

        <label className="topbar-search" htmlFor="marketplace-search">
          <Search size={18} aria-hidden="true" />
          <input
            id="marketplace-search"
            aria-label="Search marketplace"
            placeholder="Search token, card, seller"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <div className="topbar-actions">
          <Button
            size="icon"
            type="button"
            variant="ghost"
            title="Refresh listings"
            onClick={() => void refreshMarketplace()}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </Button>
          <Button type="button" onClick={connectWallet}>
            <Wallet size={18} aria-hidden="true" />
            {connectedLabel}
          </Button>
        </div>
      </header>

      {!isDeployed && (
        <div className="deployment-banner">
          Run the deployment script to populate contract addresses.
        </div>
      )}

      <main className="app-main">
        <section className="market-hero">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Badge variant="success">
              <BadgeCheck size={14} aria-hidden="true" />
              Live market
            </Badge>
            <h1>Dark gallery for shiny on-chain collectibles.</h1>
            <p>Mint, list, and trade your card-style NFTs with a local Viem wallet flow.</p>
          </motion.div>

          <div className="stats-grid" aria-label="Marketplace stats">
            <StatTile
              icon={<Grid2X2 size={19} aria-hidden="true" />}
              label="Active"
              value={activeListingCount.toString()}
            />
            <StatTile
              icon={<CircleDollarSign size={19} aria-hidden="true" />}
              label="Floor"
              value={floorPrice === null ? "0 ETH" : formatEthValue(floorPrice)}
            />
            <StatTile
              icon={<Coins size={19} aria-hidden="true" />}
              label="Total Ask"
              value={formatEthValue(totalAskValue)}
            />
          </div>
        </section>

        <section className="workspace">
          <aside className="creator-panel" aria-label="Creator tools">
            <Card className="account-summary">
              <CardContent>
                <div>
                  <span className="eyebrow">Wallet</span>
                  <strong>{account ? formatAddress(account) : "Disconnected"}</strong>
                </div>
                <span className={account ? "status-dot live" : "status-dot"} />
              </CardContent>
            </Card>

            <Card className="tool-panel">
              <CardHeader>
                <div className="panel-heading">
                  <Sparkles size={18} aria-hidden="true" />
                  <h2>Create NFT</h2>
                </div>
                <Badge variant="muted">Mint</Badge>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => void mintNFT(event)}>
                  <label htmlFor="token-uri">Token URI</label>
                  <textarea
                    id="token-uri"
                    rows={4}
                    value={tokenURI}
                    onChange={(event) => setTokenURI(event.target.value)}
                  />
                  <Button className="button-full" type="submit" disabled={isBusy}>
                    {isBusy ? (
                      <Loader2 className="spin" size={18} aria-hidden="true" />
                    ) : (
                      <Sparkles size={18} aria-hidden="true" />
                    )}
                    Mint NFT
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="tool-panel">
              <CardHeader>
                <div className="panel-heading">
                  <Tag size={18} aria-hidden="true" />
                  <h2>List for Sale</h2>
                </div>
                <Badge variant="muted">Escrow</Badge>
              </CardHeader>
              <CardContent>
                <form onSubmit={(event) => void approveAndListNFT(event)}>
                  <label htmlFor="token-id">Token ID</label>
                  <input
                    id="token-id"
                    inputMode="numeric"
                    min="1"
                    value={listTokenId}
                    onChange={(event) => setListTokenId(event.target.value)}
                    required
                  />
                  <label htmlFor="price">Price</label>
                  <div className="price-input">
                    <input
                      id="price"
                      inputMode="decimal"
                      min="0"
                      step="0.0001"
                      value={listPrice}
                      onChange={(event) => setListPrice(event.target.value)}
                      required
                    />
                    <span>ETH</span>
                  </div>
                  <Button className="button-full" type="submit" disabled={isBusy}>
                    {isBusy ? (
                      <Loader2 className="spin" size={18} aria-hidden="true" />
                    ) : (
                      <Tag size={18} aria-hidden="true" />
                    )}
                    Approve & List
                  </Button>
                </form>
              </CardContent>
            </Card>
          </aside>

          <section className="market-section">
            <div className="market-heading">
              <div>
                <span className="eyebrow">Explore</span>
                <h2>Marketplace</h2>
              </div>
              <div className="market-badges">
                <Badge variant="muted">
                  <ShieldCheck size={14} aria-hidden="true" />
                  Chain {deployment.chainId}
                </Badge>
                <Badge variant="warning">
                  <Gem size={14} aria-hidden="true" />
                  {formatFee(marketplaceFeeBps)} fee
                </Badge>
              </div>
            </div>

            {notice && <motion.div className="notice">{notice}</motion.div>}

            <div className="market-toolbar">
              <div className="segmented-control" aria-label="Listing filter">
                {[
                  ["all", `All ${activeListingCount}`],
                  ["available", `Buy ${availableCount}`],
                  ["mine", `Mine ${myCollectionCount}`],
                ].map(([value, label]) => (
                  <Button
                    className={marketFilter === value ? "active" : ""}
                    key={value}
                    type="button"
                    variant="ghost"
                    onClick={() => setMarketFilter(value as MarketFilter)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <label className="sort-control" htmlFor="sort-order">
                <ArrowDownUp size={16} aria-hidden="true" />
                <select
                  id="sort-order"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                >
                  <option value="recent">Newest</option>
                  <option value="price-asc">Price low</option>
                  <option value="price-desc">Price high</option>
                </select>
              </label>

              {(isLoadingListings || isLoadingOwnedNFTs) && (
                <Loader2 className="spin muted-icon" size={20} aria-hidden="true" />
              )}
            </div>

            {marketFilter === "mine" ? (
              <>
                <div className="listing-grid">
                  <AnimatePresence initial={false}>
                    {myListings.map((listing) => (
                      <ListingCard
                        account={account}
                        isBusy={isBusy}
                        key={`listing-${listing.listingId.toString()}`}
                        listing={listing}
                        onBuy={buyListing}
                        onCancel={cancelListing}
                      />
                    ))}
                    {ownedNFTs.map((nft) => (
                      <OwnedNFTCard
                        key={`owned-${nft.tokenId.toString()}`}
                        nft={nft}
                        onList={(tokenId) => {
                          setListTokenId(tokenId.toString());
                          setNotice(`Token #${tokenId.toString()} ready to list`);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {myCollectionCount === 0 && (
                  <motion.div
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    No owned NFTs found
                  </motion.div>
                )}
              </>
            ) : (
              <>
                <div className="listing-grid">
                  <AnimatePresence initial={false}>
                    {visibleListings.map((listing) => (
                      <ListingCard
                        account={account}
                        isBusy={isBusy}
                        key={listing.listingId.toString()}
                        listing={listing}
                        onBuy={buyListing}
                        onCancel={cancelListing}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {visibleListings.length === 0 && (
                  <motion.div
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    No listings found
                  </motion.div>
                )}
              </>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

function ListingCard({
  account,
  isBusy,
  listing,
  onBuy,
  onCancel,
}: {
  account: Address | null;
  isBusy: boolean;
  listing: Listing;
  onBuy: (listing: Listing) => Promise<void>;
  onCancel: (listing: Listing) => Promise<void>;
}) {
  const isMine =
    account && listing.seller.toLowerCase() === account.toLowerCase();

  return (
    <motion.article
      className="listing-card"
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.24 }}
    >
      <NFTMedia
        badge={isMine ? "Listed by you" : "Listed"}
        imageURL={listing.imageURL}
        name={listing.name}
        tokenId={listing.tokenId}
        variant={isMine ? "warning" : "success"}
      />

      <div className="listing-body">
        <div>
          <span className="collection-label">Viem Creatures</span>
          <h3>{listing.name}</h3>
          <p>Seller {formatAddress(listing.seller)}</p>
        </div>
        <strong className="price-pill">
          <CircleDollarSign size={17} aria-hidden="true" />
          {formatEthValue(listing.price)}
        </strong>
      </div>

      <div className="listing-actions">
        {isMine ? (
          <Button
            className="button-full"
            type="button"
            variant="outline"
            onClick={() => void onCancel(listing)}
            disabled={isBusy}
          >
            <X size={17} aria-hidden="true" />
            Cancel Listing
          </Button>
        ) : (
          <Button
            className="button-full"
            type="button"
            onClick={() => void onBuy(listing)}
            disabled={isBusy}
          >
            <ShoppingBag size={17} aria-hidden="true" />
            Buy Now
          </Button>
        )}
      </div>
    </motion.article>
  );
}

function OwnedNFTCard({
  nft,
  onList,
}: {
  nft: OwnedNFT;
  onList: (tokenId: bigint) => void;
}) {
  return (
    <motion.article
      className="listing-card owned-nft-card"
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.24 }}
    >
      <NFTMedia
        badge="In wallet"
        imageURL={nft.imageURL}
        name={nft.name}
        tokenId={nft.tokenId}
        variant="success"
      />

      <div className="listing-body">
        <div>
          <span className="collection-label">Viem Creatures</span>
          <h3>{nft.name}</h3>
          <p>Owned by you</p>
        </div>
        <strong className="ownership-pill">
          <Gem size={17} aria-hidden="true" />
          Owned
        </strong>
      </div>

      <div className="listing-actions">
        <Button
          className="button-full"
          type="button"
          variant="secondary"
          onClick={() => onList(nft.tokenId)}
        >
          <Tag size={17} aria-hidden="true" />
          List This NFT
        </Button>
      </div>
    </motion.article>
  );
}

function NFTMedia({
  badge,
  imageURL,
  name,
  tokenId,
  variant,
}: {
  badge: string;
  imageURL: string;
  name: string;
  tokenId: bigint;
  variant: "success" | "warning";
}) {
  return (
    <div className="nft-media">
      {imageURL ? (
        <img src={imageURL} alt={name} loading="lazy" />
      ) : (
        <div className="media-fallback">
          <Gem size={34} aria-hidden="true" />
          <span>#{tokenId.toString()}</span>
        </div>
      )}
      <div className="media-overlay">
        <Badge variant={variant}>{badge}</Badge>
        <strong>#{tokenId.toString()}</strong>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <motion.div
      className="stat-tile"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.div>
  );
}

function normalizeListing(value: unknown): Omit<
  Listing,
  "tokenURI" | "name" | "description" | "imageURL"
> {
  const listing = value as Record<string, unknown> & readonly unknown[];

  return {
    listingId: BigInt((listing.listingId ?? listing[0]) as bigint),
    nft: (listing.nft ?? listing[1]) as Address,
    tokenId: BigInt((listing.tokenId ?? listing[2]) as bigint),
    seller: (listing.seller ?? listing[3]) as Address,
    price: BigInt((listing.price ?? listing[4]) as bigint),
    status: Number(listing.status ?? listing[5]),
    buyer: (listing.buyer ?? listing[6]) as Address,
  };
}

async function resolveNFTMetadata(tokenURI: string, tokenId: bigint) {
  const fallbackName = `Token #${tokenId.toString()}`;
  const resolvedURI = toGatewayURL(tokenURI);
  if (isImageURL(resolvedURI)) {
    return {
      description: "",
      imageURL: resolvedURI,
      name: fallbackName,
    };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

  try {
    const response = await fetch(resolvedURI, { signal: controller.signal });
    if (!response.ok) {
      return {
        description: "",
        imageURL: "",
        name: fallbackName,
      };
    }

    const metadata = (await response.json()) as {
      description?: string;
      image?: string;
      name?: string;
    };

    return {
      description: metadata.description ?? "",
      imageURL: metadata.image ? toGatewayURL(metadata.image) : "",
      name: metadata.name?.trim() || fallbackName,
    };
  } catch {
    return {
      description: "",
      imageURL: "",
      name: fallbackName,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toGatewayURL(uri: string) {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }

  return uri;
}

function isImageURL(uri: string) {
  return (
    /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(uri) ||
    uri.includes("images.unsplash.com") ||
    uri.includes("picsum.photos")
  );
}

function formatAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEthValue(amount: bigint) {
  const value = Number(formatEther(amount));
  if (value === 0) {
    return "0 ETH";
  }

  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 1 ? 3 : 4,
    minimumFractionDigits: value >= 1 ? 0 : 4,
  })} ETH`;
}

function formatFee(feeBps: bigint) {
  return `${((Number(feeBps) / BPS_DENOMINATOR) * 100).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2,
    },
  )}%`;
}

function readError(error: unknown) {
  if (error instanceof Error) {
    const [firstLine] = error.message.split("\n");
    return firstLine;
  }

  return "Transaction failed";
}
