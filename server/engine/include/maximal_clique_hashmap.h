/**
 * @file maximal_clique_hashmap.h
 * @brief Maximal clique enumeration and hashmap construction
 */

#pragma once

#include "types.h"
#include <vector>
#include <unordered_map>
#include <map>
#include <set>
#include <queue>

/**
 * @brief Class for maximal clique-based hashmap construction
 */
class MaximalCliqueHashmap {
private:
	// Execute Bron-Kerbosch algorithm to find maximal cliques
	// std::vector<std::vector<ColocationInstance>> executeDivBK(const std::vector<NeighborSet>& neighborSets);

public:
	std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>> executeBK(const std::vector<NeighborSet>& neighborSets);

	// Extract initial candidate colocations from hashmap
	std::priority_queue<Colocation, std::vector<Colocation>, ColocationPriorityComp> extractInitialCandidates(
		const std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>>& hashMap);
};