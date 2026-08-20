/**
 * @file time_clique.cpp
 * @brief Head-to-head clique-stage timing: Fast-BK hybrid vs legacy BK-Pivot,
 *        on the same machine and the same loaded graph, so the comparison is
 *        apples-to-apples (independent of the unchanged mining stage and of
 *        whatever machine state the README table was measured under).
 *
 * Usage: time_clique <miner_csv> <eps> [runs]
 * Prints wall-clock seconds for each enumerator and the resulting clique count.
 */

#include "maximal_clique_hashmap.h"
#include "maximal_clique_hashmap_legacy.h"
#include "data_loader.h"
#include "neighbor_graph.h"
#include "types.h"

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

int main(int argc, char** argv) {
    if (argc < 3) {
        std::cerr << "usage: time_clique <miner_csv> <eps> [runs]\n";
        return 2;
    }
    std::string csv = argv[1];
    double eps = std::atof(argv[2]);

    std::vector<SpatialInstance> instances = DataLoader::load_csv(csv);
    NeighborGraph graph;
    std::vector<NeighborSet> ns = graph.buildNeighborGraph(instances, eps);
    std::cout << "csv=" << csv << " eps=" << eps
              << " instances=" << instances.size() << "\n";

    using clock = std::chrono::steady_clock;

    // Fast-BK hybrid.
    {
        MaximalCliqueHashmap fresh;
        auto t0 = clock::now();
        auto res = fresh.executeBK(ns);
        auto t1 = clock::now();
        double s = std::chrono::duration<double>(t1 - t0).count();
        std::cout << "  Fast-BK : " << s << " s  (cliques=" << res.size() << ")\n";
    }

    // Legacy BK-Pivot.
    {
        MaximalCliqueHashmapLegacy legacy;
        auto t0 = clock::now();
        auto res = legacy.executeBK(ns);
        auto t1 = clock::now();
        double s = std::chrono::duration<double>(t1 - t0).count();
        std::cout << "  BK-Pivot: " << s << " s  (cliques=" << res.size() << ")\n";
    }

    return 0;
}
