/**
 * @file report_writer.cpp
 * @brief Implementation of the peak memory probe and the two result writers
 */

#include "report_writer.h"

#include <cmath>
#include <cstdio>
#include <fstream>
#include <iomanip>
#include <limits>
#include <sstream>

#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#else
#include <string>
#endif

namespace {

    // Publish `content` at `path` through a temporary sibling file so a run that
    // dies mid-write never leaves a truncated result behind.
    bool publishAtomically(const std::string& path, const std::string& content) {
        const std::string tempPath = path + ".partial";

        {
            std::ofstream out(tempPath, std::ios::binary | std::ios::trunc);
            if (!out.is_open()) return false;
            out << content;
            out.flush();
            if (!out.good()) return false;
        }

        std::remove(path.c_str());
        return std::rename(tempPath.c_str(), path.c_str()) == 0;
    }

    std::string escapeJson(const std::string& value) {
        std::string escaped;
        escaped.reserve(value.size() + 8);
        for (unsigned char ch : value) {
            switch (ch) {
            case '"':  escaped += "\\\""; break;
            case '\\': escaped += "\\\\"; break;
            case '\b': escaped += "\\b"; break;
            case '\f': escaped += "\\f"; break;
            case '\n': escaped += "\\n"; break;
            case '\r': escaped += "\\r"; break;
            case '\t': escaped += "\\t"; break;
            default:
                if (ch < 0x20) {
                    std::ostringstream unicode;
                    unicode << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                        << static_cast<int>(ch);
                    escaped += unicode.str();
                }
                else {
                    escaped += static_cast<char>(ch);
                }
            }
        }
        return escaped;
    }

    // JSON has no representation for infinity or NaN; emit null so the document
    // stays parseable instead of producing a token no reader accepts.
    std::string jsonNumber(double value, int precision = 10) {
        if (!std::isfinite(value)) return "null";
        std::ostringstream out;
        out << std::setprecision(precision) << value;
        return out.str();
    }

}

size_t peakMemoryMegabytes() {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS memCounter;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &memCounter, sizeof(memCounter))) {
        return static_cast<size_t>(memCounter.PeakWorkingSetSize / 1024 / 1024);
    }
    return 0;
#else
    // VmHWM is the peak resident set size, the Linux counterpart of the Windows
    // peak working set. Reported in kB.
    std::ifstream status("/proc/self/status");
    if (!status.is_open()) return 0;

    std::string label;
    while (status >> label) {
        if (label == "VmHWM:") {
            size_t kilobytes = 0;
            if (status >> kilobytes) return kilobytes / 1024;
            return 0;
        }
        status.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
    }
    return 0;
#endif
}

bool writeTextReport(const std::string& path, const RunReport& report) {
    std::ostringstream out;

    out << "=== FINAL REPORT ===\n";
    out << "Dataset Path:      " << report.datasetPath << "\n";
    out << "Total Instances:   " << report.totalInstances << "\n";
    out << "Neighbor Distance: " << report.neighborDistance << "\n";
    out << "Min Prevalence:    " << report.minPrevalence << "\n";
    out << "Percentage Data:    " << (report.percentageInstances * 100) << "%\n";
    out << "Global Dispersion (kappa): " << std::fixed << std::setprecision(4)
        << report.kappa << "\n";
    out << "----------------------------------------\n";

    out << "Execution Time: " << std::fixed << std::setprecision(3)
        << report.totalSeconds << " s\n";
    out << "  Load:           " << report.loadSeconds << " s\n";
    out << "  Neighbor Graph: " << report.neighborSeconds << " s\n";
    out << "  Maximal Clique: " << report.cliqueSeconds << " s\n";
    out << "  Mining:         " << report.mineSeconds << " s\n";
    out << "  Result Export:  " << report.exportSeconds << " s\n";

    out << "Peak Memory Usage: " << report.peakMemoryMb << " MB\n";

    out << "Patterns Found: " << report.patterns.size() << "\n";
    out << "----------------------------------------\n";

    if (!report.patterns.empty()) {
        int idx = 1;
        for (const auto& item : report.patterns) {
            const Colocation& features = item.pattern.features;
            out << "[" << idx++ << "] {";
            for (size_t i = 0; i < features.size(); ++i) {
                out << (i > 0 ? ", " : "") << features[i];
            }
            out << "}";
            if (item.pattern.hasWpi) {
                out << "  WPI=" << std::setprecision(6) << item.pattern.wpi
                    << std::setprecision(3);
            }
            if (item.pattern.deduced) {
                out << "  (deduced)";
            }
            out << "\n";
        }
    }
    else {
        out << "No patterns found.\n";
    }

    return publishAtomically(path, out.str());
}

bool writeJsonReport(const std::string& path, const RunReport& report) {
    std::ostringstream out;

    out << "{\n";
    out << "  \"dataset_path\": \"" << escapeJson(report.datasetPath) << "\",\n";
    out << "  \"neighbor_distance\": " << jsonNumber(report.neighborDistance) << ",\n";
    out << "  \"min_prevalence\": " << jsonNumber(report.minPrevalence) << ",\n";
    out << "  \"percentage_instances\": " << jsonNumber(report.percentageInstances) << ",\n";
    out << "  \"kappa\": " << jsonNumber(report.kappa) << ",\n";
    out << "  \"total_instances\": " << report.totalInstances << ",\n";
    out << "  \"maximal_clique_patterns\": " << report.maximalCliquePatterns << ",\n";
    out << "  \"peak_memory_mb\": " << report.peakMemoryMb << ",\n";

    out << "  \"timings_s\": {\n";
    out << "    \"load\": " << jsonNumber(report.loadSeconds, 6) << ",\n";
    out << "    \"neighbor_graph\": " << jsonNumber(report.neighborSeconds, 6) << ",\n";
    out << "    \"maximal_clique\": " << jsonNumber(report.cliqueSeconds, 6) << ",\n";
    out << "    \"mining\": " << jsonNumber(report.mineSeconds, 6) << ",\n";
    out << "    \"export\": " << jsonNumber(report.exportSeconds, 6) << ",\n";
    out << "    \"total\": " << jsonNumber(report.totalSeconds, 6) << "\n";
    out << "  },\n";

    out << "  \"feature_counts\": {";
    bool firstFeature = true;
    for (const auto& entry : report.featureCounts) {
        out << (firstFeature ? "\n" : ",\n");
        firstFeature = false;
        out << "    \"" << escapeJson(entry.first) << "\": " << entry.second;
    }
    out << (firstFeature ? "}" : "\n  }") << ",\n";

    out << "  \"pattern_count\": " << report.patterns.size() << ",\n";
    out << "  \"patterns\": [";

    bool firstPattern = true;
    for (const auto& item : report.patterns) {
        out << (firstPattern ? "\n" : ",\n");
        firstPattern = false;

        out << "    {\"features\": [";
        for (size_t i = 0; i < item.pattern.features.size(); ++i) {
            if (i > 0) out << ", ";
            out << "\"" << escapeJson(item.pattern.features[i]) << "\"";
        }
        out << "], \"size\": " << item.pattern.features.size();
        out << ", \"wpi\": "
            << (item.pattern.hasWpi ? jsonNumber(item.pattern.wpi) : std::string("null"));
        out << ", \"deduced\": " << (item.pattern.deduced ? "true" : "false");

        out << ", \"participating\": {";
        bool firstEntry = true;
        for (const auto& entry : item.participating) {
            if (!firstEntry) out << ", ";
            firstEntry = false;
            out << "\"" << escapeJson(entry.first) << "\": [";
            for (size_t i = 0; i < entry.second.size(); ++i) {
                if (i > 0) out << ",";
                out << entry.second[i];
            }
            out << "]";
        }
        out << "}}";
    }

    out << (firstPattern ? "]\n" : "\n  ]\n");
    out << "}\n";

    return publishAtomically(path, out.str());
}
