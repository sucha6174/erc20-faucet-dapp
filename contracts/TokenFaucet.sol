// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IToken {
    function mint(address to, uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function MAX_SUPPLY() external view returns (uint256);
}

contract TokenFaucet is ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                            CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint256 public constant FAUCET_AMOUNT = 10 * 10 ** 18;
    uint256 public constant COOLDOWN_TIME = 24 hours;
    uint256 public constant MAX_CLAIM_AMOUNT = 100 * 10 ** 18;

    /*//////////////////////////////////////////////////////////////
                              STATE
    //////////////////////////////////////////////////////////////*/

    IToken public token;
    address public admin;
    bool private paused;

    mapping(address => uint256) public lastClaimAt;
    mapping(address => uint256) public totalClaimed;

    /*//////////////////////////////////////////////////////////////
                              EVENTS
    //////////////////////////////////////////////////////////////*/

    event TokensClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event FaucetPaused(bool paused);

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(address _tokenAddress) {
        require(_tokenAddress != address(0), "Invalid token address");
        token = IToken(_tokenAddress);
        admin = msg.sender;
        paused = false;
    }

    /*//////////////////////////////////////////////////////////////
                          CLAIM FUNCTION
    //////////////////////////////////////////////////////////////*/

    function requestTokens() external nonReentrant {
        require(!paused, "Faucet is paused");
        require(
            totalClaimed[msg.sender] + FAUCET_AMOUNT <= MAX_CLAIM_AMOUNT,
            "Lifetime claim limit reached"
        );
        require(
            block.timestamp >= lastClaimAt[msg.sender] + COOLDOWN_TIME,
            "Cooldown period not elapsed"
        );
        require(
            token.totalSupply() + FAUCET_AMOUNT <= token.MAX_SUPPLY(),
            "Insufficient token supply"
        );

        // State updates (Checks-Effects-Interactions)
        lastClaimAt[msg.sender] = block.timestamp;
        totalClaimed[msg.sender] += FAUCET_AMOUNT;

        // Interaction
        token.mint(msg.sender, FAUCET_AMOUNT);

        emit TokensClaimed(msg.sender, FAUCET_AMOUNT, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function canClaim(address user) public view returns (bool) {
        if (paused) return false;
        if (totalClaimed[user] + FAUCET_AMOUNT > MAX_CLAIM_AMOUNT) return false;
        if (block.timestamp < lastClaimAt[user] + COOLDOWN_TIME) return false;
        if (token.totalSupply() + FAUCET_AMOUNT > token.MAX_SUPPLY()) return false;
        return true;
    }

    function remainingAllowance(address user) public view returns (uint256) {
        if (totalClaimed[user] >= MAX_CLAIM_AMOUNT) {
            return 0;
        }
        return MAX_CLAIM_AMOUNT - totalClaimed[user];
    }

    function isPaused() external view returns (bool) {
        return paused;
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setPaused(bool _paused) external {
        require(msg.sender == admin, "Only admin");
        paused = _paused;
        emit FaucetPaused(_paused);
    }
}
