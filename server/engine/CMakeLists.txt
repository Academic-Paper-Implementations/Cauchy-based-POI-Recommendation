# ==============================================================================
# Project Configuration
# ==============================================================================
cmake_minimum_required (VERSION 3.10)

project ("Colocation Mining with Maximal Clique & Rare Feature")

set (CMAKE_CXX_STANDARD 17)
set (CMAKE_CXX_STANDARD_REQUIRED ON)

if (NOT CMAKE_BUILD_TYPE)
    set (CMAKE_BUILD_TYPE Release)
endif()

# =============================================================================
# Include & Source
# ==============================================================================
include_directories ("${CMAKE_SOURCE_DIR}/include")
file(GLOB SOURCE_FILES "${CMAKE_SOURCE_DIR}/src/*.cpp")

# ==============================================================================
# Build Target
# ==============================================================================
# Datasets and config files are supplied by the server layer at run time, so no
# resources are copied next to the binary.
add_executable (colocation_miner ${SOURCE_FILES})

# ==============================================================================
# Differential test harness (not part of the product binary)
# ==============================================================================
# diff_clique runs the Fast-BK hybrid and the preserved legacy BK-Pivot oracle on
# identical input and asserts their raw clique output is exactly equal. It links
# the shared pipeline sources minus main.cpp / report_writer.cpp (it supplies its
# own main) plus the legacy oracle under tests/. Built with DIFF_CLIQUE_INSTRUMENT
# so the clique source exposes its BK-RCD invocation counter; the product target
# above is built without that macro, so the shipped behaviour is unchanged.
add_executable (diff_clique
    tests/diff_clique.cpp
    tests/maximal_clique_hashmap_legacy.cpp
    src/maximal_clique_hashmap.cpp
    src/neighbor_graph.cpp
    src/data_loader.cpp)
target_include_directories (diff_clique PRIVATE
    "${CMAKE_SOURCE_DIR}/include"
    "${CMAKE_SOURCE_DIR}/tests")
target_compile_definitions (diff_clique PRIVATE DIFF_CLIQUE_INSTRUMENT)
