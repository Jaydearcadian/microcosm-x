// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    /// Read by the router to tell funds it owes Spaces apart from funds sent to
    /// it by mistake. Without it the excess sweep has no bound and could reach
    /// into a Space's balance.
    function balanceOf(address account) external view returns (uint256);
}
