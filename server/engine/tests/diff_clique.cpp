/**
 * @file diff_clique.cpp
 * @brief Differential test harness for the Fast-BK hybrid clique port.
 *
 * Runs the new MaximalCliqueHashmap (Fast-BK hybrid) and the legacy
 * MaximalCliqueHashmapLegacy (plain BK-Pivot oracle) on identical input and
 * asserts their raw executeBK() output is EXACTLY equal: same Colocation keys,
 * and for each key the same per-FeatureType sets of instances (compared by the
 * globally-unique SpatialInstance.id, not raw pointer values).
 *
 * This is the primary correctness gate for the port — a clique-enumeration bug
 * that the final pattern count could mask is caught here at the raw-clique level.
 *
 * Fixtures: a tiny hand-verified synthetic graph plus four real datasets
 * (Toronto, base Philadelphia, Philadelphia-cuisine, New Orleans). Exit 0 only
 * when every case matches; non-zero with a readable diff on any mismatch.
 *
 * Build (see CMakeLists.txt diff_clique target): compiled with
 * -DDIFF_CLIQUE_INSTRUMENT so g_diff_rcd_calls counts BK-RCD invocations.
 */

#include "maximal_clique_hashmap.h"
#include "maximal_clique_hashmap_legacy.h"
#include "data_loader.h"
#include "neighbor_graph.h"
#include "types.h"

#include <cstdlib>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <unordered_set>
#include <vector>

// Instrumentation counter defined in the (instrumented) clique source.
extern long long g_diff_rcd_calls;

namespace {

using ResultMap =
    std::map<Colocation, std::unordered_map<FeatureType, std::set<const SpatialInstance*>>>;

// A fully-ordered, pointer-free view of a ResultMap keyed by stable identity:
// Colocation -> FeatureType -> sorted set of instance ids ("A1", "B2", ...).
using NormMap = std::map<Colocation, std::map<FeatureType, std::set<std::string>>>;

NormMap normalize(const ResultMap& rm) {
    NormMap out;
    for (const auto& [colo, inner] : rm) {
        auto& o = out[colo];
        for (const auto& [ft, instSet] : inner) {
            auto& ids = o[ft];
            for (const auto* inst : instSet) {
                ids.insert(inst->id);
            }
        }
    }
    return out;
}

std::string coloToString(const Colocation& c) {
    std::string s = "{";
    for (size_t i = 0; i < c.size(); ++i) {
        if (i) s += ",";
        s += c[i];
    }
    s += "}";
    return s;
}

// Print the first difference between two normalized maps. Returns true if equal.
bool reportDiff(const NormMap& a, const NormMap& b, const std::string& label) {
    if (a == b) return true;

    std::cerr << "  [MISMATCH] " << label << "\n";

    // Colocation keys only in one side.
    for (const auto& [colo, inner] : a) {
        if (!b.count(colo)) {
            std::cerr << "    only in NEW:    colocation " << coloToString(colo) << "\n";
        }
    }
    for (const auto& [colo, inner] : b) {
        if (!a.count(colo)) {
            std::cerr << "    only in LEGACY: colocation " << coloToString(colo) << "\n";
        }
    }
    // Shared keys with differing instance content.
    for (const auto& [colo, innerA] : a) {
        auto itB = b.find(colo);
        if (itB == b.end()) continue;
        const auto& innerB = itB->second;
        if (innerA == innerB) continue;
        std::cerr << "    differs at colocation " << coloToString(colo) << "\n";
        for (const auto& [ft, idsA] : innerA) {
            auto itFt = innerB.find(ft);
            if (itFt == innerB.end()) {
                std::cerr << "      feature " << ft << ": present in NEW, absent in LEGACY\n";
                continue;
            }
            if (idsA != itFt->second) {
                const auto& idsB = itFt->second;
                std::cerr << "      feature " << ft << ": differs\n";
                for (const auto& id : idsA) {
                    if (!idsB.count(id)) std::cerr << "        only in NEW:    " << id << "\n";
                }
                for (const auto& id : idsB) {
                    if (!idsA.count(id)) std::cerr << "        only in LEGACY: " << id << "\n";
                }
            }
        }
        for (const auto& [ft, idsB] : innerB) {
            if (!innerA.count(ft)) {
                std::cerr << "      feature " << ft << ": present in LEGACY, absent in NEW\n";
            }
        }
    }
    return false;
}

// Assert instance ids are globally unique so identity-by-id cannot collapse two
// distinct instances into one and mask a real mismatch as a false match.
bool assertUniqueIds(const std::vector<SpatialInstance>& instances, const std::string& label) {
    std::unordered_set<std::string> seen;
    seen.reserve(instances.size() * 2);
    for (const auto& inst : instances) {
        if (!seen.insert(inst.id).second) {
            std::cerr << "  [FATAL] duplicate instance id '" << inst.id << "' in " << label
                      << " — comparison identity is not unique.\n";
            return false;
        }
    }
    return true;
}

// Run both enumerators on one neighbor-set graph and compare. Returns true on match.
bool compareOnGraph(const std::vector<NeighborSet>& ns, const std::string& label) {
    MaximalCliqueHashmap fresh;
    MaximalCliqueHashmapLegacy legacy;

    long long rcdBefore = g_diff_rcd_calls;
    ResultMap newRes = fresh.executeBK(ns);
    long long rcdAfter = g_diff_rcd_calls;
    ResultMap oldRes = legacy.executeBK(ns);

    NormMap n = normalize(newRes);
    NormMap o = normalize(oldRes);

    bool ok = reportDiff(n, o, label);
    std::cout << "  " << (ok ? "OK   " : "FAIL ") << label
              << " | colocations new=" << n.size() << " legacy=" << o.size()
              << " | rcd_calls=" << (rcdAfter - rcdBefore) << "\n";
    return ok;
}

// ---- Synthetic graph -------------------------------------------------------
// Distinct feature types (only different-type instances are ever neighbours in
// the real pipeline, so distinct types keep the synthetic graph realistic and
// make each maximal clique map to a distinct colocation).
//
// Edges: triangle A-B-C, triangle C-D-E (sharing C), and an isolated edge F-G.
// Maximal cliques (size >= 2): {A,B,C}, {C,D,E}, {F,G}.
//
// A,B not adjacent to D,E, so {A,B,C,D} is not a clique -> the two triangles do
// not merge; this exercises RCD/Pivot on small dense-and-sparse pieces.
bool runSynthetic() {
    std::vector<SpatialInstance> inst;
    auto add = [&](const std::string& type) {
        SpatialInstance s;
        s.type = type;
        s.number = 1;
        s.id = type + "1";
        s.x = 0.0;
        s.y = 0.0;
        inst.push_back(s);
    };
    add("A"); add("B"); add("C"); add("D"); add("E"); add("F"); add("G");
    // Index: A=0 B=1 C=2 D=3 E=4 F=5 G=6. Kept alive for the pointers below.

    auto* A = &inst[0];
    auto* B = &inst[1];
    auto* C = &inst[2];
    auto* D = &inst[3];
    auto* E = &inst[4];
    auto* F = &inst[5];
    auto* G = &inst[6];

    // Undirected adjacency, symmetric.
    std::map<const SpatialInstance*, std::vector<const SpatialInstance*>> adj;
    auto link = [&](const SpatialInstance* u, const SpatialInstance* v) {
        adj[u].push_back(v);
        adj[v].push_back(u);
    };
    link(A, B); link(B, C); link(A, C);   // triangle ABC
    link(C, D); link(D, E); link(C, E);   // triangle CDE
    link(F, G);                            // isolated edge

    std::vector<NeighborSet> ns;
    for (auto* p : {A, B, C, D, E, F, G}) {
        NeighborSet s;
        s.center = p;
        s.neighbors = adj[p];
        ns.push_back(s);
    }

    // Expected maximal cliques as normalized colocations.
    NormMap expected;
    expected[{"A", "B", "C"}] = {{"A", {"A1"}}, {"B", {"B1"}}, {"C", {"C1"}}};
    expected[{"C", "D", "E"}] = {{"C", {"C1"}}, {"D", {"D1"}}, {"E", {"E1"}}};
    expected[{"F", "G"}] = {{"F", {"F1"}}, {"G", {"G1"}}};

    MaximalCliqueHashmap fresh;
    ResultMap newRes = fresh.executeBK(ns);
    NormMap got = normalize(newRes);

    bool matchExpected = reportDiff(got, expected, "synthetic vs hand-verified");
    bool matchLegacy = compareOnGraph(ns, "synthetic new-vs-legacy");
    std::cout << "  synthetic hand-verified: " << (matchExpected ? "OK" : "FAIL") << "\n";
    return matchExpected && matchLegacy;
}

// ---- Real fixtures ---------------------------------------------------------
struct Fixture {
    std::string name;
    std::string csv;
    double eps;
};

bool runFixture(const Fixture& f) {
    std::cout << "Fixture " << f.name << " (eps=" << f.eps << ")\n";
    std::vector<SpatialInstance> instances = DataLoader::load_csv(f.csv);
    if (instances.empty()) {
        std::cerr << "  [FATAL] no instances loaded from " << f.csv << "\n";
        return false;
    }
    if (!assertUniqueIds(instances, f.name)) return false;

    NeighborGraph graph;
    std::vector<NeighborSet> ns = graph.buildNeighborGraph(instances, f.eps);
    return compareOnGraph(ns, f.name);
}

}  // namespace

int main(int argc, char** argv) {
    // Datasets root: argv[1] overrides; else the repo's runtime datasets dir.
    std::string root =
        (argc > 1)
            ? std::string(argv[1])
            : std::string("D:/01_learning/ai_ml/spatial_data_mining/spatial_web/server/runtime/datasets");
    if (!root.empty() && root.back() != '/' && root.back() != '\\') root += '/';

    std::cout << "=== diff_clique: Fast-BK hybrid vs legacy BK-Pivot ===\n";
    std::cout << "datasets root: " << root << "\n\n";

    bool allOk = true;

    // Synthetic first — fast, catches RCD edge cases the real data may not.
    std::cout << "Synthetic graph\n";
    allOk &= runSynthetic();
    std::cout << "\n";

    std::vector<Fixture> fixtures = {
        {"new-orleans", root + "new-orleans/miner.csv", 100.0},
        {"philadelphia-cuisine", root + "philadelphia-cuisine/miner.csv", 100.0},
        {"toronto", root + "toronto/miner.csv", 120.0},
        {"philadelphia", root + "philadelphia/miner.csv", 80.0},
    };

    for (const auto& f : fixtures) {
        allOk &= runFixture(f);
        std::cout << "\n";
    }

    std::cout << "Total BK-RCD invocations across all cases: " << g_diff_rcd_calls << "\n";
    if (g_diff_rcd_calls == 0) {
        std::cerr << "[WARN] BK-RCD was never invoked — the highest-risk path is untested.\n";
        allOk = false;
    }

    std::cout << (allOk ? "\nRESULT: ALL MATCH\n" : "\nRESULT: MISMATCH\n");
    return allOk ? 0 : 1;
}
