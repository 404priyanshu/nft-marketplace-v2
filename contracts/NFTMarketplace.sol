// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract NFTMarketplace {
    uint256 public itemCount;

    struct Item {
        uint256 itemId;
        address nft;
        uint256 tokenId;
        uint256 price;
        address payable seller;
        bool sold;
    }

    mapping(uint256 => Item) public items;

    event Offered(
        uint256 itemId,
        address indexed nft,
        uint256 tokenId,
        uint256 price,
        address indexed seller
    );

    event Bought(
        uint256 itemId,
        address indexed nft,
        uint256 tokenId,
        uint256 price,
        address indexed seller,
        address indexed buyer
    );

    function makeItem(
        address _nft,
        uint256 _tokenId,
        uint256 _price
    ) public {
        require(_price > 0, "Price must be greater than zero");

        itemCount++;

        IERC721(_nft).transferFrom(msg.sender, address(this), _tokenId);

        items[itemCount] = Item(
            itemCount,
            _nft,
            _tokenId,
            _price,
            payable(msg.sender),
            false
        );

        emit Offered(itemCount, _nft, _tokenId, _price, msg.sender);
    }

    function purchaseItem(uint256 _itemId) public payable {
        Item storage item = items[_itemId];

        require(_itemId > 0 && _itemId <= itemCount, "Item doesn't exist");
        require(!item.sold, "Item already sold");
        require(msg.value >= item.price, "Not enough ether");

        item.seller.transfer(item.price);

        item.sold = true;

        IERC721(item.nft).transferFrom(address(this), msg.sender, item.tokenId);

        emit Bought(
            _itemId,
            item.nft,
            item.tokenId,
            item.price,
            item.seller,
            msg.sender
        );
    }
}
