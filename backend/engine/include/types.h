/**
 * @file types.h
 * @brief Core data type definitions for spatial colocation pattern mining
 *
 * This file defines the fundamental data structures and type aliases used throughout
 * the maximal clique-based colocation mining algorithm implementation.
 */

#pragma once
#include <string>
#include <vector>
#include <map>

 // ============================================================================
 // Type Aliases
 // ============================================================================

 /** @brief Type alias for feature types (e.g., "Restaurant", "Hotel") */
using FeatureType = std::string;

/** @brief Type alias for instance identifiers (e.g., "A1", "B2") */
using InstanceID = std::string;

/** @brief Type alias for a colocation pattern (set of feature types) */
using Colocation = std::vector<FeatureType>;

/** @brief Type alias for a colocation instance (set of spatial instance pointers) */
using ColocationInstance = std::vector<const struct SpatialInstance*>;

// ============================================================================
// Data Structures
// ============================================================================

/**
 * @brief Structure representing a spatial data instance
 *
 * Each spatial instance has a feature type, unique identifier, and 2D coordinates.
 */
struct SpatialInstance {
    FeatureType type;  ///< Feature type of this instance (e.g., "A", "B")
    InstanceID id;     ///< Unique identifier (e.g., "A1", "B2")
    int number;        ///< Numeric part of the identifier, as read from the CSV
    double x, y;       ///< 2D spatial coordinates
};

/**
 * @brief Structure representing a star neighborhood
 *
 * A star neighborhood consists of a center instance and all its neighboring instances
 * within the distance threshold.
 */
struct NeighborSet {
    const SpatialInstance* center;                      ///< Center instance
    std::vector<const SpatialInstance*> neighbors;      ///< All neighbors within distance threshold
};

/**
 * @brief comparator for prioritizing colocations in a priority queue
 * Rules:
 * 1. Prioritize larger Colocation sizes.
 * 2. If sizes are equal, prioritize smaller lexicographical order (A before B).
 */
struct ColocationPriorityComp {
    bool operator()(const Colocation& a, const Colocation& b) const {
        // If sizes are different: The smaller one has lower priority (return true)
        if (a.size() != b.size()) {
            return a.size() < b.size();
        }
        return a > b;
    }
};