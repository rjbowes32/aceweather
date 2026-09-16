from __future__ import annotations

import unittest
from unittest.mock import patch

from api import atlas


class AtlasApiTests(unittest.TestCase):
    @patch("api.atlas.lib.build_cropdynamics_json")
    def test_build_payload_includes_current_rain(self, build_rain) -> None:
        build_rain.return_value = {
            "date_range": {"start": "2026-08-01", "end": "2026-08-29", "days": 29},
            "locations": [{"query": "Sleaford", "rain_mm": 66.2, "high_c": 24.0, "low_c": 12.0}],
        }

        payload = atlas.build_payload("https://example.test")

        self.assertEqual(payload["schema_version"], "atlas.v1")
        self.assertTrue(payload["recent_rain"]["available"])
        self.assertEqual(payload["freshness"]["recent_rain"]["state"], "current")
        self.assertEqual(payload["freshness"]["recent_rain"]["as_of"], "2026-08-29")

    @patch("api.atlas.lib.build_cropdynamics_json", side_effect=OSError("provider down"))
    def test_build_payload_keeps_snapshot_when_rain_fails(self, _build_rain) -> None:
        payload = atlas.build_payload("https://example.test")

        self.assertEqual(payload["schema_version"], "atlas.v1")
        self.assertEqual(payload["headline"]["wheat_yield_t_ha"], 6.8)
        self.assertFalse(payload["recent_rain"]["available"])
        self.assertEqual(payload["freshness"]["recent_rain"]["state"], "unavailable")


if __name__ == "__main__":
    unittest.main()
