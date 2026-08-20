/**
 * @file neighbor_graph.cpp
 * @brief Implementation: Build spatial neighbor graph from instances
 */

#include "neighbor_graph.h"
#include <cmath>
#include <algorithm>
#include <unordered_map>

// Calculate Euclidean distance between two spatial instances
double NeighborGraph::euclideanDist(const SpatialInstance& a, const SpatialInstance& b) {
	return std::sqrt(std::pow(a.x - b.x, 2) + std::pow(a.y - b.y, 2));
};

// Find all neighbor pairs within distance threshold
std::vector<std::pair<SpatialInstance, SpatialInstance>> NeighborGraph::findNeighborPair(
	const std::vector<SpatialInstance>& instances,
	double distanceThreshold) {
	/// using plan sweep
	std::vector<std::pair<SpatialInstance, SpatialInstance>> pairs;

	// Create a copy to sort by X coordinate for Plane Sweep
	std::vector<SpatialInstance> sortedInstances = instances;
	std::sort(sortedInstances.begin(), sortedInstances.end(),
		[](const SpatialInstance& a, const SpatialInstance& b) {
			return a.x < b.x;
		});

	// Plane Sweep Algorithm
	for (size_t i = 0; i < sortedInstances.size(); ++i) {
		for (size_t j = i + 1; j < sortedInstances.size(); ++j) {
			// Optimization: Break if X distance exceeds threshold
			if (sortedInstances[j].x - sortedInstances[i].x > distanceThreshold) {
				break;
			}

			// Check Y distance
			if (std::abs(sortedInstances[j].y - sortedInstances[i].y) <= distanceThreshold) {
				// Check exact Euclidean distance
				if (euclideanDist(sortedInstances[i], sortedInstances[j]) <= distanceThreshold &&
					sortedInstances[i].type != sortedInstances[j].type) {
					pairs.push_back({ sortedInstances[i], sortedInstances[j] });
				}
			}
		}
	}
	return pairs;
};

// Build neighbor graph: create NeighborSet for each instance
std::vector<NeighborSet> NeighborGraph::buildNeighborGraph(
	const std::vector<SpatialInstance>& instances,
	double distanceThreshold) {
		//////// TODO: Implement (3)//////////

	// 1. Find all neighbor pairs
	auto pairs = findNeighborPair(instances, distanceThreshold);

	// 2. Map InstanceID to memory address for stable graph construction
	std::unordered_map<InstanceID, const SpatialInstance*> ptrMap;
	for (size_t i = 0; i < instances.size(); ++i) {
		ptrMap[instances[i].id] = &instances[i];
	}

	// 3. Build Adjacency List
	std::unordered_map<const SpatialInstance*, std::vector<const SpatialInstance*>> adjList;
	// Initialize for all instances
	for (const auto& inst : instances) {
		adjList[&inst] = std::vector<const SpatialInstance*>();
	}

	for (const auto& p : pairs) {
		const SpatialInstance* p1 = ptrMap[p.first.id];
		const SpatialInstance* p2 = ptrMap[p.second.id];
		if (p1 && p2) {
			adjList[p1].push_back(p2);
			adjList[p2].push_back(p1);
		}
	}

	// 4. Construct NeighborSets
	std::vector<NeighborSet> neighborSets;
	neighborSets.reserve(instances.size());
	for (const auto& inst : instances) {
		NeighborSet ns;
		ns.center = &inst;
		ns.neighbors = adjList[&inst];
		neighborSets.push_back(ns);
	}

	return neighborSets;
};
