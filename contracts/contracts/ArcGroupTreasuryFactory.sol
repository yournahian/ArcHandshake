// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ArcGroupTreasury.sol";

contract ArcGroupTreasuryFactory {
    event TreasuryDeployed(address indexed treasuryAddress, address indexed adminAddress);

    function deployTreasury(address _usdc) external returns (address) {
        ArcGroupTreasury newTreasury = new ArcGroupTreasury(_usdc, msg.sender);
        emit TreasuryDeployed(address(newTreasury), msg.sender);
        return address(newTreasury);
    }
}
