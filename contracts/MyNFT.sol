// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract MyNFT is ERC721URIStorage {
    uint256 public totalMinted;

    event TokenMinted(
        address indexed minter,
        address indexed owner,
        uint256 indexed tokenId,
        string tokenURI
    );

    error InvalidRecipient();

    constructor() ERC721("Viem Marketplace NFT", "VMNFT") {}

    function mint(string calldata tokenURI_) external returns (uint256 tokenId) {
        tokenId = mintTo(msg.sender, tokenURI_);
    }

    function mintTo(
        address to,
        string calldata tokenURI_
    ) public returns (uint256 tokenId) {
        if (to == address(0)) {
            revert InvalidRecipient();
        }

        tokenId = ++totalMinted;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        emit TokenMinted(msg.sender, to, tokenId, tokenURI_);
    }
}
