/**
 * @file report_writer.h
 * @brief Result reporting: peak memory probe, human-readable report, JSON result
 *
 * Both writers publish through a temporary file followed by a rename, so a run
 * that is killed mid-write leaves the previous file intact rather than a
 * half-written one that a caller could mistake for a finished result.
 */

#pragma once

#include "miner.h"
#include "types.h"
#include <map>
#include <string>
#include <vector>

 /** @brief One pattern plus the instances that participate in it, per feature. */
struct PatternExport {
    MinedPattern pattern;
    std::map<FeatureType, std::vector<int>> participating;  ///< feature -> instance numbers
};

/** @brief Everything a finished run reports about itself. */
struct RunReport {
    std::string datasetPath;
    double neighborDistance = 0.0;
    double minPrevalence = 0.0;
    double percentageInstances = 1.0;

    double kappa = 0.0;
    size_t totalInstances = 0;
    size_t maximalCliquePatterns = 0;

    double loadSeconds = 0.0;
    double neighborSeconds = 0.0;
    double cliqueSeconds = 0.0;
    double mineSeconds = 0.0;
    double exportSeconds = 0.0;
    double totalSeconds = 0.0;

    size_t peakMemoryMb = 0;

    std::map<FeatureType, int> featureCounts;
    std::vector<PatternExport> patterns;
};

/** @brief Peak resident memory of this process in MB, 0 when unavailable. */
size_t peakMemoryMegabytes();

/** @brief Write the human-readable report. Returns false on I/O failure. */
bool writeTextReport(const std::string& path, const RunReport& report);

/** @brief Write the machine-readable result. Returns false on I/O failure. */
bool writeJsonReport(const std::string& path, const RunReport& report);
