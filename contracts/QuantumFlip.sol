// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title QuantumFlip
/// @notice A free-to-play on-chain coin-flip game for the QoreChain testnet.
/// @dev Every flip is an EVM transaction, and QoreChain admits an EVM
///      transaction only inside a post-quantum authorisation window opened
///      by a hybrid-signed (secp256k1 + ML-DSA-87) native message. Each move
///      is therefore quantum-safe by construction: a leaked ECDSA key alone
///      cannot play, because it cannot open a window.
///
///      The game holds no funds and has no owner or privileged function, so
///      there is nothing to steal and no admin key to compromise.
///
///      Randomness: the coin is keccak256(previous block hash, sender,
///      flip count) — but on the Diana testnet the EVM BLOCKHASH opcode
///      returns 0 (verified 19 Nov 2026, see scripts/probe-blockhash.mjs
///      and docs/randomness.md), so the outcome is fully deterministic
///      from (sender, flip count) and predictable by anyone. This game
///      demonstrates PQ-window-gated play, not randomness; it is NOT
///      suitable for real stakes. See the README.
contract QuantumFlip {
    /// @notice Per-player statistics.
    struct PlayerStats {
        uint256 flips;
        uint256 wins;
        uint256 currentStreak;
        uint256 bestStreak;
    }

    /// @notice Total flips across all players.
    uint256 public totalFlips;

    /// @notice Total wins across all players.
    uint256 public totalWins;

    /// @notice Statistics per player address.
    mapping(address => PlayerStats) public stats;

    /// @notice Every address that has played at least once, in first-play order.
    address[] public players;

    /// @notice Whether an address has played before (so `players` has no duplicates).
    mapping(address => bool) internal seen;

    /// @notice Emitted for every flip.
    event FlipResult(
        address indexed player,
        bool guessHeads,
        bool resultHeads,
        bool won,
        uint256 flips,
        uint256 wins,
        uint256 currentStreak
    );

    /// @notice Emitted the first time an address plays.
    event PlayerJoined(address indexed player);

    /// @notice Flip the coin.
    /// @param guessHeads True to call heads, false to call tails.
    /// @return won Whether the guess matched the coin.
    function flip(bool guessHeads) external returns (bool won) {
        // Coin outcome: keccak256(previous block hash, sender, flip
        // count). On the Diana testnet the BLOCKHASH opcode returns 0
        // (see docs/randomness.md), so this is keccak256(0, sender,
        // totalFlips) — fully deterministic and predictable by anyone.
        // The outcome is still settled on-chain and identical for
        // everyone reading the block.
        bytes32 randomness = keccak256(
            abi.encodePacked(blockhash(block.number - 1), msg.sender, totalFlips)
        );
        bool resultHeads = uint256(randomness) % 2 == 0;
        won = (resultHeads == guessHeads);

        PlayerStats storage s = stats[msg.sender];
        if (!seen[msg.sender]) {
            seen[msg.sender] = true;
            players.push(msg.sender);
            emit PlayerJoined(msg.sender);
        }

        s.flips += 1;
        totalFlips += 1;
        if (won) {
            s.wins += 1;
            totalWins += 1;
            s.currentStreak += 1;
            if (s.currentStreak > s.bestStreak) {
                s.bestStreak = s.currentStreak;
            }
        } else {
            s.currentStreak = 0;
        }

        emit FlipResult(
            msg.sender,
            guessHeads,
            resultHeads,
            won,
            s.flips,
            s.wins,
            s.currentStreak
        );
        return won;
    }

    /// @notice How many distinct players have played.
    function playerCount() external view returns (uint256) {
        return players.length;
    }

    /// @notice Statistics for one player (a convenience wrapper over `stats`).
    function getStats(address player) external view returns (PlayerStats memory) {
        return stats[player];
    }
}
