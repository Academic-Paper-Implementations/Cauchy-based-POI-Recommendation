/**
 * @file config.h
 * @brief Configuration management for the joinless colocation mining application
 *
 * This file defines the configuration structure and loader for runtime parameters.
 */

#pragma once
#include <iostream>
#include <fstream>
#include <string>
#include <sstream>

 /**
  * @brief Configuration structure for application settings
  *
  * Contains all runtime parameters for the joinless colocation mining algorithm,
  * including I/O paths, algorithm thresholds, and system settings.
  */
struct AppConfig {
    // I/O Settings
    std::string datasetPath;    ///< Path to input CSV dataset file
    std::string outputPath;     ///< Path to output results file (human-readable report)
    std::string jsonOutputPath; ///< Path to machine-readable JSON result; empty disables it

    // Algorithm Parameters
    double neighborDistance;    ///< Distance threshold for spatial neighbors
    double minPrev;            ///< Minimum prevalence threshold (0.0 to 1.0)
    double minCondProb;        ///< Minimum conditional probability for rules (0.0 to 1.0)
	double percentageData;        ///< Percentage of number of instances in each feature of data to use for mining (0.0 to 1.0)

    // System Settings
    bool debugMode;            ///< Enable debug output messages

    /**
     * @brief Constructor with default values
     *
     * Initializes configuration with sensible defaults that can be overridden
     * by loading from a configuration file.
     */
    // No default dataset: a missing or unreadable dataset must fail loudly
    // rather than silently mine some other file.
    AppConfig()
        : datasetPath(""),
        outputPath("results.txt"),
        jsonOutputPath(""),
        neighborDistance(5.0),
        minPrev(0.6),
        minCondProb(0.5),
		percentageData(1.0),
        debugMode(false) {
    }
};


/**
 * @brief ConfigLoader class for loading application configuration from a file
 *
 * Provides static methods to parse configuration files in key=value format.
 */
class ConfigLoader {
public:
    /**
     * @brief Load configuration from a file
     *
     * Parses a configuration file with key=value pairs. Lines starting with '#'
     * are treated as comments. If the file cannot be opened, default values are used.
     *
     * @param configPath Path to the configuration file
     * @return AppConfig Configuration object with loaded or default values
     */
    static AppConfig load(const std::string& configPath);
};