/**
 * @file config.cpp
 * @brief Implementation of configuration file loading
 */

#include "config.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <stdexcept>


namespace {

    // Strip a leading UTF-8 BOM, surrounding whitespace, and a trailing CR left
    // by a CRLF file read on a platform that does not translate line endings.
    // A stray CR silently corrupts a path and sends the miner at the wrong file.
    std::string trim(const std::string& value) {
        size_t begin = 0;
        size_t end = value.size();

        if (end - begin >= 3 &&
            static_cast<unsigned char>(value[begin]) == 0xEF &&
            static_cast<unsigned char>(value[begin + 1]) == 0xBB &&
            static_cast<unsigned char>(value[begin + 2]) == 0xBF) {
            begin += 3;
        }

        auto isBlank = [](char ch) {
            return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n';
            };

        while (begin < end && isBlank(value[begin])) ++begin;
        while (end > begin && isBlank(value[end - 1])) --end;

        return value.substr(begin, end - begin);
    }

}

/**
 * @brief Load configuration from a file
 * @param configPath Path to the configuration file
 * @return AppConfig Configuration object with loaded values
 *
 * Parses key=value pairs from the configuration file. Lines starting with '#'
 * are treated as comments. A missing or unreadable file is an error: running
 * with defaults would mine a dataset the caller never asked for.
 */
AppConfig ConfigLoader::load(const std::string& configPath) {
    AppConfig config;
    std::ifstream file(configPath);

    if (!file.is_open()) {
        throw std::runtime_error("Config file not found: " + configPath);
    }

    std::string line;
    while (std::getline(file, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;

        std::istringstream is_line(line);
        std::string key;

        if (std::getline(is_line, key, '=')) {
            std::string value;
            if (std::getline(is_line, value)) {
                key = trim(key);
                value = trim(value);

                if (key == "dataset_path") config.datasetPath = value;
                else if (key == "output_path") config.outputPath = value;
                else if (key == "json_output_path") config.jsonOutputPath = value;
                else if (key == "neighbor_distance") config.neighborDistance = std::stod(value);
                else if (key == "min_prevalence") config.minPrev = std::stod(value);
                else if (key == "min_cond_prob") config.minCondProb = std::stod(value);
                else if (key == "percentage_instances") config.percentageData = std::stod(value);
                else if (key == "debug_mode") config.debugMode = (value == "true" || value == "1");
            }
        }
    }

    return config;
}
