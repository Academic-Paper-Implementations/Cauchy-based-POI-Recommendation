/**
 * @file neighbor_graph.h
 * @brief Neighbor graph construction for spatial instances
 */

#pragma once
#include "types.h"
#include <vector>

/**
 * @brief Class for building spatial neighbor graphs
 */
class NeighborGraph {
private:
	// Calculate Euclidean distance between two instances
	double euclideanDist(const SpatialInstance& a, const SpatialInstance& b);

	// Find all neighbor pairs within distance threshold
	std::vector<std::pair<SpatialInstance, SpatialInstance>> findNeighborPair(
		const std::vector<SpatialInstance>& instances,
		double distanceThreshold);

public:
	// Build neighbor graph: for each instance, find all neighbors within threshold
	std::vector<NeighborSet> buildNeighborGraph(
		const std::vector<SpatialInstance>& instances,
		double distanceThreshold);
};