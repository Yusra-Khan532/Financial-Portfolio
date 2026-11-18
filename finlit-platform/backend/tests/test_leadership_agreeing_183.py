"""Task #183 (live issue): a Leader is never shown at minus points against its peers, nor a Laggard at plus points. When the label held over by the
two-week rule disagrees with this week's 12-month gap, this week's own answer is shown; the stored label and the rule stay as they are."""
from finlit.leadership_api import agreeing


def test_a_leader_behind_its_peers_shows_this_weeks_answer():
    assert agreeing("leader", "in_line", -0.180542) == "in_line"      # RPEL on 15 Nov: 7th of 45, −18.1 pts against the peer average
    assert agreeing("leader", "in_line", 0.0) == "in_line"


def test_a_laggard_ahead_of_its_peers_shows_this_weeks_answer():
    assert agreeing("laggard", "leader", 0.12) == "leader"            # ICICIBANK on 15 Nov: published Laggard, this week Leader


def test_labels_that_agree_with_the_gap_stay_and_missing_figures_change_nothing():
    assert agreeing("leader", "in_line", 0.05) == "leader"           # the two-week rule still holds a Leader that is ahead
    assert agreeing("laggard", "in_line", -0.02) == "laggard"
    assert agreeing("in_line", "leader", -0.3) == "in_line"
    assert agreeing("leader", None, -0.2) == "leader" and agreeing("leader", "in_line", None) == "leader"
