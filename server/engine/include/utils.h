/**
 * @file utils.h
 * @brief Utility functions for feature analysis and calculations
 */

#pragma once

#include "types.h"
#include <map>
#include <unordered_map>
#include <set>
#include <string>
#include <chrono>
#include <vector>

// ============================================================================
// Existing TODO Functions
// ============================================================================

// Count instances per feature type and sort by frequency
std::map<FeatureType, int> countFeatures(const std::vector<SpatialInstance>& instances);

// Calculate dispersion (delta) from feature distribution
double calculateDispersion(const std::map<FeatureType, int>& featureCount);

// Calculate rare intensity for each instance in a colocation
std::unordered_map<FeatureType, double> calcRareIntensity(
	Colocation c,
	const std::map<FeatureType, int>& featureCounts,
	double delta);
