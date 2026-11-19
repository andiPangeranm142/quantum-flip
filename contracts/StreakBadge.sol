// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IQuantumFlip
/// @notice The minimal interface StreakBadge needs from the QuantumFlip
///      game contract: per-player statistics, including the best win
///      streak. This is the ONLY flip data StreakBadge reads on-chain.
interface IQuantumFlip {
    struct PlayerStats {
        uint256 flips;
        uint256 wins;
        uint256 currentStreak;
        uint256 bestStreak;
    }

    function getStats(address player) external view returns (PlayerStats memory);
}

/// @title StreakBadge
/// @notice On-chain streak badges for Quantum Flip. A player claims a badge
///      tier once their best win streak in the QuantumFlip contract reaches
///      the tier's threshold. Eligibility is checked ON-CHAIN at claim
///      time by reading `QuantumFlip.getStats(msg.sender).bestStreak` —
///      no off-chain oracle, no admin, no allowlist.
///
/// @dev Honest limits (see README):
///      - The badge proves only that the claimant's `bestStreak` in the
///        flip contract reached the threshold. It says nothing about
///        luck or skill: on the Diana testnet flip outcomes are fully
///        deterministic (BLOCKHASH returns 0), so streaks — and
///        therefore badges — can be ground at will. See
///        docs/randomness.md.
///      - The flip contract exposes only aggregate per-player stats
///        (flips, wins, currentStreak, bestStreak). StreakBadge can
///        therefore NOT verify individual flip outcomes, the order of
///        flips, or when a streak happened — only the recorded
///        bestStreak value. Badges are keyed to bestStreak alone.
///      - Badges are non-transferable records (not ERC-721 tokens):
///        `badgesOf(player)` returns which tiers a player holds.
///        There is no owner, no funds are held, and nothing can be
///        revoked or re-issued once claimed.
contract StreakBadge {
    /// @notice The QuantumFlip contract this badge contract reads from.
    IQuantumFlip public immutable quantumFlip;

    /// @notice Badge tiers. The tier id is its index in this list.
    struct Tier {
        string name;
        uint256 minBestStreak;
    }

    /// @notice The three badge tiers, in ascending order.
    Tier[] public tiers;

    /// @notice Whether `player` holds the badge for tier `tierId`.
    mapping(address => mapping(uint256 => bool)) public hasBadge;

    /// @notice How many badges of each tier have been issued.
    mapping(uint256 => uint256) public issuedCount;

    /// @notice Total badges issued across all tiers and players.
    uint256 public totalIssued;

    /// @notice Emitted when a badge is claimed.
    event BadgeIssued(
        address indexed player,
        uint256 indexed tierId,
        uint256 bestStreak
    );

    /// @param quantumFlipAddress The deployed QuantumFlip contract.
    constructor(address quantumFlipAddress) {
        require(quantumFlipAddress != address(0), "StreakBadge: zero flip address");
        quantumFlip = IQuantumFlip(quantumFlipAddress);
        tiers.push(Tier("Double Up", 2));
        tiers.push(Tier("Hat Trick", 3));
        tiers.push(Tier("Hot Streak", 5));
    }

    /// @notice How many badge tiers exist.
    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    /// @notice Which tiers `player` is currently eligible for, from their
    ///      recorded bestStreak in the flip contract. A tier is eligible
    ///      when bestStreak >= its threshold, whether or not it was
    ///      already claimed.
    function eligibleTiers(address player) external view returns (bool[] memory) {
        uint256 best = quantumFlip.getStats(player).bestStreak;
        bool[] memory eligible = new bool[](tiers.length);
        for (uint256 i = 0; i < tiers.length; i++) {
            eligible[i] = best >= tiers[i].minBestStreak;
        }
        return eligible;
    }

    /// @notice Which tiers `player` holds (has claimed).
    function badgesOf(address player) external view returns (bool[] memory) {
        bool[] memory held = new bool[](tiers.length);
        for (uint256 i = 0; i < tiers.length; i++) {
            held[i] = hasBadge[player][i];
        }
        return held;
    }

    /// @notice Claim the badge for tier `tierId`. Reverts unless the
    ///      caller's bestStreak in the flip contract meets the tier's
    ///      threshold and the caller does not already hold the badge.
    /// @param tierId The tier to claim (0 = Double Up, 1 = Hat Trick,
    ///      2 = Hot Streak).
    function claim(uint8 tierId) external {
        require(tierId < tiers.length, "StreakBadge: unknown tier");
        require(!hasBadge[msg.sender][tierId], "StreakBadge: already claimed");
        uint256 best = quantumFlip.getStats(msg.sender).bestStreak;
        require(
            best >= tiers[tierId].minBestStreak,
            "StreakBadge: best streak too low"
        );
        hasBadge[msg.sender][tierId] = true;
        issuedCount[tierId] += 1;
        totalIssued += 1;
        emit BadgeIssued(msg.sender, tierId, best);
    }
}
