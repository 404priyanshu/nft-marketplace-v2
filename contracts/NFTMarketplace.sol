// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NFTMarketplace is IERC721Receiver, Ownable, ReentrancyGuard {
    uint96 public constant BPS_DENOMINATOR = 10_000;
    uint96 public constant MAX_MARKETPLACE_FEE_BPS = 1_000;

    enum ListingStatus {
        None,
        Active,
        Sold,
        Canceled
    }

    struct Listing {
        uint256 listingId;
        address nft;
        uint256 tokenId;
        address payable seller;
        uint256 price;
        ListingStatus status;
        address buyer;
    }

    uint256 public listingCount;
    uint256 public activeListingCount;
    uint96 public marketplaceFeeBps;
    address payable public feeRecipient;

    mapping(uint256 listingId => Listing listing) public listings;
    mapping(address nft => mapping(uint256 tokenId => uint256 listingId))
        public listingByToken;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed nft,
        uint256 indexed tokenId,
        address seller,
        uint256 price
    );

    event ListingPurchased(
        uint256 indexed listingId,
        address indexed nft,
        uint256 indexed tokenId,
        address seller,
        address buyer,
        uint256 price,
        uint256 marketplaceFee
    );

    event ListingCanceled(
        uint256 indexed listingId,
        address indexed nft,
        uint256 indexed tokenId,
        address seller
    );

    event ListingPriceUpdated(
        uint256 indexed listingId,
        uint256 oldPrice,
        uint256 newPrice
    );

    event MarketplaceFeeUpdated(uint96 oldFeeBps, uint96 newFeeBps);
    event FeeRecipientUpdated(
        address indexed oldFeeRecipient,
        address indexed newFeeRecipient
    );

    error InvalidAddress();
    error InvalidFeeBps();
    error PriceMustBeAboveZero();
    error ListingDoesNotExist();
    error ListingNotActive();
    error NotTokenOwner();
    error NotListingSeller();
    error SellerCannotBuyOwnListing();
    error IncorrectPaymentAmount();
    error PayoutFailed();

    constructor(
        address payable initialFeeRecipient,
        uint96 initialMarketplaceFeeBps
    ) Ownable(msg.sender) {
        if (initialFeeRecipient == address(0)) {
            revert InvalidAddress();
        }
        if (initialMarketplaceFeeBps > MAX_MARKETPLACE_FEE_BPS) {
            revert InvalidFeeBps();
        }

        feeRecipient = initialFeeRecipient;
        marketplaceFeeBps = initialMarketplaceFeeBps;
    }

    function createListing(
        address nft,
        uint256 tokenId,
        uint256 price
    ) external nonReentrant returns (uint256 listingId) {
        if (nft == address(0)) {
            revert InvalidAddress();
        }
        if (price == 0) {
            revert PriceMustBeAboveZero();
        }
        if (IERC721(nft).ownerOf(tokenId) != msg.sender) {
            revert NotTokenOwner();
        }

        listingId = ++listingCount;
        activeListingCount++;
        listingByToken[nft][tokenId] = listingId;

        listings[listingId] = Listing({
            listingId: listingId,
            nft: nft,
            tokenId: tokenId,
            seller: payable(msg.sender),
            price: price,
            status: ListingStatus.Active,
            buyer: address(0)
        });

        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);

        emit ListingCreated(listingId, nft, tokenId, msg.sender, price);
    }

    function updateListingPrice(
        uint256 listingId,
        uint256 newPrice
    ) external {
        if (newPrice == 0) {
            revert PriceMustBeAboveZero();
        }

        Listing storage listing = _activeListing(listingId);
        if (listing.seller != msg.sender) {
            revert NotListingSeller();
        }

        uint256 oldPrice = listing.price;
        listing.price = newPrice;

        emit ListingPriceUpdated(listingId, oldPrice, newPrice);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _activeListing(listingId);
        if (listing.seller != msg.sender) {
            revert NotListingSeller();
        }

        listing.status = ListingStatus.Canceled;
        activeListingCount--;
        listingByToken[listing.nft][listing.tokenId] = 0;

        IERC721(listing.nft).safeTransferFrom(
            address(this),
            listing.seller,
            listing.tokenId
        );

        emit ListingCanceled(
            listingId,
            listing.nft,
            listing.tokenId,
            listing.seller
        );
    }

    function purchaseListing(uint256 listingId) external payable nonReentrant {
        Listing storage listing = _activeListing(listingId);
        if (listing.seller == msg.sender) {
            revert SellerCannotBuyOwnListing();
        }
        if (msg.value != listing.price) {
            revert IncorrectPaymentAmount();
        }

        uint256 marketplaceFee = _marketplaceFee(listing.price);
        uint256 sellerProceeds = listing.price - marketplaceFee;

        listing.status = ListingStatus.Sold;
        listing.buyer = msg.sender;
        activeListingCount--;
        listingByToken[listing.nft][listing.tokenId] = 0;

        IERC721(listing.nft).safeTransferFrom(
            address(this),
            msg.sender,
            listing.tokenId
        );

        if (marketplaceFee > 0) {
            _sendValue(feeRecipient, marketplaceFee);
        }
        _sendValue(listing.seller, sellerProceeds);

        emit ListingPurchased(
            listingId,
            listing.nft,
            listing.tokenId,
            listing.seller,
            msg.sender,
            listing.price,
            marketplaceFee
        );
    }

    function getListing(
        uint256 listingId
    ) external view returns (Listing memory) {
        if (listingId == 0 || listingId > listingCount) {
            revert ListingDoesNotExist();
        }

        return listings[listingId];
    }

    function setMarketplaceFee(uint96 newMarketplaceFeeBps) external onlyOwner {
        if (newMarketplaceFeeBps > MAX_MARKETPLACE_FEE_BPS) {
            revert InvalidFeeBps();
        }

        uint96 oldMarketplaceFeeBps = marketplaceFeeBps;
        marketplaceFeeBps = newMarketplaceFeeBps;

        emit MarketplaceFeeUpdated(
            oldMarketplaceFeeBps,
            newMarketplaceFeeBps
        );
    }

    function setFeeRecipient(
        address payable newFeeRecipient
    ) external onlyOwner {
        if (newFeeRecipient == address(0)) {
            revert InvalidAddress();
        }

        address oldFeeRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;

        emit FeeRecipientUpdated(oldFeeRecipient, newFeeRecipient);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _activeListing(
        uint256 listingId
    ) private view returns (Listing storage listing) {
        if (listingId == 0 || listingId > listingCount) {
            revert ListingDoesNotExist();
        }

        listing = listings[listingId];
        if (listing.status != ListingStatus.Active) {
            revert ListingNotActive();
        }
    }

    function _marketplaceFee(uint256 price) private view returns (uint256) {
        return (price * marketplaceFeeBps) / BPS_DENOMINATOR;
    }

    function _sendValue(address payable recipient, uint256 amount) private {
        (bool sent, ) = recipient.call{value: amount}("");
        if (!sent) {
            revert PayoutFailed();
        }
    }
}
