"""Rare labelling: the threshold the UI slider moves."""

from __future__ import annotations

from backend.rare_labeling import label_rare, percentile, rare_threshold

# The 20 Philadelphia category counts, as the miner reports them.
PHILADELPHIA = {
    "Restaurants": 1933, "Food": 1008, "Shopping": 1006, "Home Services": 839,
    "Beauty & Spas": 734, "Health & Medical": 704, "Local Services": 625,
    "Automotive": 541, "Active Life": 367, "Event Planning & Services": 357,
    "Nightlife": 304, "Arts & Entertainment": 222, "Bars": 209,
    "Coffee & Tea": 199, "Hair Salons": 195, "Pizza": 190, "Sandwiches": 153,
    "American (Traditional)": 132, "Breakfast & Brunch": 119, "American (New)": 91,
}


def test_first_quartile_of_philadelphia():
    assert rare_threshold(PHILADELPHIA, 25.0, 30) == 193.75


def test_default_labels_the_five_smallest_categories():
    rare, threshold = label_rare(PHILADELPHIA)
    assert threshold == 193.75
    assert rare == {
        "Pizza", "Sandwiches", "American (Traditional)",
        "Breakfast & Brunch", "American (New)",
    }


def test_percentile_interpolates_like_numpy():
    assert percentile([1.0, 2.0, 3.0, 4.0], 50.0) == 2.5
    assert percentile([10.0], 25.0) == 10.0
    assert percentile([], 25.0) == 0.0


def test_min_count_floors_the_threshold():
    counts = {"a": 5, "b": 6, "c": 500, "d": 900}
    # The 25th percentile lands at 5.75, below the floor, so the floor decides.
    assert rare_threshold(counts, 25.0, 30) == 30.0
    rare, _ = label_rare(counts, 25.0, 30)
    assert rare == {"a", "b"}


def test_moving_the_percentile_moves_the_label_set():
    wide, _ = label_rare(PHILADELPHIA, 50.0, 30)
    narrow, _ = label_rare(PHILADELPHIA, 10.0, 30)
    assert narrow < wide, "a lower percentile must label fewer features rare"
