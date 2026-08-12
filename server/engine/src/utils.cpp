/**
 * @file utils.cpp
 * @brief Implementation: Feature counting, dispersion calculation, and rare intensity
 *
 * The dispersion and rare-intensity formulas follow the paper definitions:
 *
 *   Global Pairwise Dispersion is the arithmetic mean of pairwise frequency
 *   RATIOS (not the RMS of pairwise log-count differences):
 *       kappa = 2/(m(m-1)) * sum_{i<j} cnt(tau_j)/cnt(tau_i)
 *
 *   Rare Intensity uses the within-pattern ratio r = cnt(tau)/cnt(tau_min)
 *   directly (not its logarithm), through a Cauchy kernel:
 *       weight = 1 + ((r-1)/kappa)^2   ->   RI = 1/weight
 *
 * Miner::computeWeightedPI inverts RI to obtain the weight, so this file always
 * returns an intensity, never a weight.
 */

#include "utils.h"
#include <unordered_map>
#include <set>
#include <chrono>
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <cmath>
#include <vector>
#include <numeric>

// Smallest intensity handed back to the caller. Without a floor, an extreme
// frequency ratio drives the intensity to (near) zero and the caller's
// reciprocal collapses the weight instead of growing it, inverting the
// intended effect of the rule.
static const double MIN_INTENSITY = 1e-300;

// Count instances per feature type
std::map<FeatureType, int> countFeatures(
	const std::vector<SpatialInstance>& instances) {
	std::map<FeatureType, int> counts;
	for (const auto& instance : instances) {
		counts[instance.type]++;
	}
	return counts;
};

// Global Pairwise Dispersion: mean of all pairwise frequency ratios, with the
// feature frequencies indexed in ascending order so every ratio is >= 1.
double calculateDispersion(const std::map<FeatureType, int>& featureCount) {
	if (featureCount.empty()) return 0.0;
	if (featureCount.size() == 1) return 0.0;

	std::vector<double> frequencies;
	frequencies.reserve(featureCount.size());
	for (const auto& pair : featureCount) {
		frequencies.push_back(static_cast<double>(pair.second));
	}
	std::sort(frequencies.begin(), frequencies.end());

	double sumRatios = 0.0;
	size_t m = frequencies.size();
	for (size_t i = 0; i < m; ++i) {
		if (frequencies[i] <= 0.0) continue;
		for (size_t j = i + 1; j < m; ++j) {
			sumRatios += frequencies[j] / frequencies[i];
		}
	}

	double factor = 2.0 / (static_cast<double>(m) * (static_cast<double>(m) - 1.0));
	return factor * sumRatios;
};

// Rare intensity per feature of a candidate pattern (Cauchy kernel).
std::unordered_map<FeatureType, double> calcRareIntensity(
	Colocation c,
	const std::map<FeatureType, int>& featureCounts,
	double delta) {
	std::unordered_map<FeatureType, double> intensityMap;
	if (c.empty()) return intensityMap;

	int minCount = -1;
	for (const auto& f : c) {
		if (featureCounts.find(f) != featureCounts.end()) {
			int count = featureCounts.at(f);
			if (minCount == -1 || count < minCount) {
				minCount = count;
			}
		}
	}
	if (minCount <= 0) return intensityMap;

	if (delta == 0.0) delta = 1e-9;

	for (const auto& f : c) {
		if (featureCounts.find(f) == featureCounts.end()) continue;
		int count = featureCounts.at(f);
		if (count <= 0) continue;

		// Within-pattern frequency ratio r = cnt(tau) / cnt(tau_min)
		double r = static_cast<double>(count) / static_cast<double>(minCount);
		double z = (r - 1.0) / delta;

		// weight = 1 + ((r-1)/kappa)^2  ->  RI = 1 / weight
		double ri = 1.0 / (1.0 + z * z);
		intensityMap[f] = (ri < MIN_INTENSITY) ? MIN_INTENSITY : ri;
	}

	return intensityMap;
};
