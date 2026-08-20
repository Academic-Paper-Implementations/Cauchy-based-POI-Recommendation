/**
 * @file main.cpp
 * @brief Entry point for co-location mining
 *
 * Stage markers are printed to stdout as they are reached. The server layer
 * reads them to report which stage a job is in; the miner has no percentage to
 * report, so it reports stages and nothing it cannot measure.
 *
 * Exit codes: 0 success, 1 bad configuration or missing input, 2 write failure.
 */

#include "config.h"
#include "data_loader.h"
#include "neighbor_graph.h"
#include "maximal_clique_hashmap.h"
#include "miner.h"
#include "report_writer.h"
#include "types.h"
#include "utils.h"
#include <algorithm>
#include <chrono>
#include <exception>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

namespace {

    using Clock = std::chrono::high_resolution_clock;

    double secondsSince(const Clock::time_point& start) {
        return std::chrono::duration<double>(Clock::now() - start).count();
    }

    void stage(const std::string& name) {
        std::cout << "[stage] " << name << std::endl;
    }

    bool fileExists(const std::string& path) {
        std::ifstream probe(path, std::ios::binary);
        return probe.good();
    }

}

int main(int argc, char* argv[]) {
    auto programStart = Clock::now();

    std::string config_path = (argc > 1) ? argv[1] : "./config/config.txt";

    AppConfig config;
    try {
        config = ConfigLoader::load(config_path);
    }
    catch (const std::exception& error) {
        std::cerr << "Config error: " << error.what() << "\n";
        return 1;
    }

    if (config.datasetPath.empty()) {
        std::cerr << "Config error: dataset_path is not set in " << config_path << "\n";
        return 1;
    }
    if (!fileExists(config.datasetPath)) {
        std::cerr << "Config error: dataset not found: " << config.datasetPath << "\n";
        return 1;
    }

    RunReport report;
    report.datasetPath = config.datasetPath;
    report.neighborDistance = config.neighborDistance;
    report.minPrevalence = config.minPrev;
    report.percentageInstances = config.percentageData;

    try {
        // --- Step 1: Load data ---
        stage("load");
        auto stepStart = Clock::now();
        auto instances = DataLoader::load_csv(config.datasetPath, config.percentageData);
        report.loadSeconds = secondsSince(stepStart);
        report.totalInstances = instances.size();

        if (instances.empty()) {
            std::cerr << "Data error: no instances loaded from " << config.datasetPath << "\n";
            return 1;
        }

        // --- Step 2: Pre-processing (indexing and structures) ---
        auto featureCount = countFeatures(instances);
        report.featureCounts = featureCount;

        double delta = calculateDispersion(featureCount);
        report.kappa = delta;

        stage("neighbor_graph");
        stepStart = Clock::now();
        NeighborGraph neighborGraph;
        auto graph = neighborGraph.buildNeighborGraph(instances, config.neighborDistance);
        report.neighborSeconds = secondsSince(stepStart);

        stage("maximal_clique");
        stepStart = Clock::now();
        MaximalCliqueHashmap mcHashmap;
        auto hashMap = mcHashmap.executeBK(graph);
        auto candidateQueue = mcHashmap.extractInitialCandidates(hashMap);
        report.cliqueSeconds = secondsSince(stepStart);
        report.maximalCliquePatterns = hashMap.size();

        // --- Step 3: Mining prevalent co-location patterns ---
        stage("mining");
        stepStart = Clock::now();
        Miner miner;
        auto colocations = miner.minePCPs(
            candidateQueue,
            hashMap,
            featureCount,
            delta,
            config.minPrev
        );
        report.mineSeconds = secondsSince(stepStart);

        // --- Step 4: Collect participating instances for every accepted pattern ---
        // Deduced patterns never had their instances queried during mining; the
        // map view needs them all, so they are gathered here, after mining, and
        // timed separately so the mining measurement stays comparable.
        stage("export");
        stepStart = Clock::now();
        report.patterns.reserve(colocations.size());
        for (const auto& pattern : colocations) {
            PatternExport exported;
            exported.pattern = pattern;

            auto participating = miner.queryInstances(pattern.features, hashMap);
            for (const auto& entry : participating) {
                auto& numbers = exported.participating[entry.first];
                numbers.reserve(entry.second.size());
                for (const auto* instance : entry.second) {
                    numbers.push_back(instance->number);
                }
                std::sort(numbers.begin(), numbers.end());
            }

            report.patterns.push_back(std::move(exported));
        }
        report.exportSeconds = secondsSince(stepStart);

        report.totalSeconds = secondsSince(programStart);
        report.peakMemoryMb = peakMemoryMegabytes();

        if (!writeTextReport(config.outputPath, report)) {
            std::cerr << "Cannot write report to " << config.outputPath << "\n";
            return 2;
        }
        if (!config.jsonOutputPath.empty() &&
            !writeJsonReport(config.jsonOutputPath, report)) {
            std::cerr << "Cannot write JSON result to " << config.jsonOutputPath << "\n";
            return 2;
        }
    }
    catch (const std::exception& error) {
        std::cerr << "Run failed: " << error.what() << "\n";
        return 1;
    }

    stage("done");
    std::cout << "Patterns found: " << report.patterns.size()
        << " | report: " << config.outputPath << "\n";
    return 0;
}
