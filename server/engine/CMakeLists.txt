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
