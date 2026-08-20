/**
 * @file maximal_clique_hashmap_legacy.h
 * @brief Legacy BK-Pivot clique enumeration, preserved as a differential-test
 *        oracle for the Fast-BK hybrid port. NOT compiled into the product
 *        binary (lives under tests/, outside the src/*.cpp glob).
 *
 * This is a rename-only copy of the pre-port MaximalCliqueHashmap so the
 * diff_clique harness can run both enumerators on identical input and assert
 * their raw executeBK() output is exactly equal.
 */

#pragma once

#include "types.h"
#include <vector>
#include <unordered_map>
#include <map>
#include <set>
#include <queue>

/**
 * @brief Legacy (plain BK-Pivot) maximal clique-based hashmap construction.
 *        Same public interface as MaximalCliqueHashmap; kept as an oracle.
 */
class MaximalCliqueHashmapLegacy {
public:
	std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>> executeBK(const std::vector<NeighborSet>& neighborSets);

	std::priority_queue<Colocation, std::vector<Colocation>, ColocationPriorityComp> extractInitialCandidates(
		const std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>>& hashMap);
};
