/**
 * @file miner.h
 * @brief Prevalent colocation pattern mining
 */

#pragma once
#include "types.h"
#include <set>
#include <map>
#include <unordered_map>
#include <queue>
#include <vector>

/**
 * @brief A pattern accepted as prevalent, with the evidence behind it.
 *
 * A pattern can enter the result in two ways, and the difference matters to
 * every consumer of the result:
 *
 *  - its own weighted participation index reached the threshold (`hasWpi` is
 *    true, `deduced` is false), or
 *  - it was accepted as a subset of a prevalent pattern through Lemma 2
 *    (`deduced` is true), in which case no WPI was computed for it and
 *    `hasWpi` stays false. Skipping that computation is the point of the
 *    optimisation, so the flag — not a fabricated 0 — is what callers get.
 *
 * `hasWpi` can also be true on a deduced pattern when the traversal reached it
 * independently and computed a WPI that did not reach the threshold.
 */
struct MinedPattern {
	Colocation features;   ///< Feature set of the pattern
	double wpi = 0.0;      ///< Weighted participation index, valid only if hasWpi
	bool hasWpi = false;   ///< Whether a WPI was actually computed
	bool deduced = false;  ///< Membership rests on Lemma 2, not on its own WPI
};

/**
 * @brief Class for mining prevalent colocation patterns
 */
class Miner {
private:
	// Compute weighted participation index for a colocation
	double computeWeightedPI(
		const std::map<FeatureType, std::set<const SpatialInstance*>>& partInstances,
		Colocation c,
		const std::unordered_map<FeatureType, double>& rareIntensityMap,
		const std::map<FeatureType, int>& featureCounts);

	// Generate all size-1 subsets of a colocation
	std::set<Colocation> generateSubsets(const Colocation& c);

	// Deduce prevalent subsets using downward closure property
	std::set<Colocation> deducePrevalentSubsets(std::set<Colocation>& subsets, const Colocation& c, const std::map<FeatureType, int>& featureCounts);

public:
	// Query instances of a colocation from hashmap
	std::map<FeatureType, std::set<const SpatialInstance*>> queryInstances(
		Colocation c,
		const std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>>& hashMap);

	// Mine prevalent colocation patterns (main algorithm)
	std::vector<MinedPattern> minePCPs(
		std::priority_queue<Colocation, std::vector<Colocation>, ColocationPriorityComp>& candidateColocations,
		const std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>>& hashMap,
		const std::map<FeatureType, int>& featureCounts,
		double delta,
		double min_prev
	);
};
