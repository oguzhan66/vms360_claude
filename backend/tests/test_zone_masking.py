"""
Zone Masking Feature Tests
Tests for zone CRUD operations and heatmap zone integration
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
FLOOR_ID = "c713f669-075f-4e06-b252-9b5fd57ac1eb"  # Test floor with existing zones


class TestZoneCRUD:
    """Zone Create, Read, Update, Delete operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_zone_ids = []
        yield
        # Cleanup: Delete any test zones created
        for zone_id in self.created_zone_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/floors/{FLOOR_ID}/zones/{zone_id}")
            except:
                pass
    
    def test_get_floor_zones(self):
        """Test GET /api/floors/{floor_id}/zones - Get existing zones"""
        response = self.session.get(f"{BASE_URL}/api/floors/{FLOOR_ID}/zones")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "floor_id" in data
        assert "floor_name" in data
        assert "zones" in data
        assert "total" in data
        assert data["floor_id"] == FLOOR_ID
        assert isinstance(data["zones"], list)
        assert data["total"] >= 0
        
        # Verify zone structure if zones exist
        if len(data["zones"]) > 0:
            zone = data["zones"][0]
            assert "id" in zone
            assert "name" in zone
            assert "type" in zone
            assert "color" in zone
            assert "points" in zone
            assert "show_heatmap" in zone
    
    def test_create_zone(self):
        """Test POST /api/floors/{floor_id}/zones - Create a new zone"""
        zone_data = {
            "name": f"TEST_Zone_{uuid.uuid4().hex[:8]}",
            "type": "corridor",
            "color": "#ff5500",
            "show_heatmap": True,
            "points": [
                {"x": 10, "y": 0},
                {"x": 15, "y": 0},
                {"x": 15, "y": 2},
                {"x": 10, "y": 2}
            ]
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/floors/{FLOOR_ID}/zones",
            json=zone_data
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["status"] == "success"
        assert "zone" in data
        
        created_zone = data["zone"]
        assert "id" in created_zone
        assert created_zone["name"] == zone_data["name"]
        assert created_zone["type"] == zone_data["type"]
        assert created_zone["color"] == zone_data["color"]
        assert created_zone["show_heatmap"] == zone_data["show_heatmap"]
        assert len(created_zone["points"]) == 4
        
        # Store for cleanup
        self.created_zone_ids.append(created_zone["id"])
        
        # Verify zone was persisted by fetching it
        get_response = self.session.get(f"{BASE_URL}/api/floors/{FLOOR_ID}/zones")
        assert get_response.status_code == 200
        zones = get_response.json()["zones"]
        zone_ids = [z["id"] for z in zones]
        assert created_zone["id"] in zone_ids
    
    def test_update_zone(self):
        """Test PUT /api/floors/{floor_id}/zones/{zone_id} - Update a zone"""
        # First create a zone
        zone_data = {
            "name": f"TEST_Zone_Update_{uuid.uuid4().hex[:8]}",
            "type": "corridor",
            "color": "#ff0000",
            "show_heatmap": True,
            "points": [{"x": 5, "y": 5}, {"x": 10, "y": 5}, {"x": 10, "y": 8}, {"x": 5, "y": 8}]
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/floors/{FLOOR_ID}/zones",
            json=zone_data
        )
        assert create_response.status_code == 200
        zone_id = create_response.json()["zone"]["id"]
        self.created_zone_ids.append(zone_id)
        
        # Update the zone
        update_data = {
            "name": "TEST_Zone_Updated_Name",
            "color": "#00ff00",
            "show_heatmap": False
        }
        
        update_response = self.session.put(
            f"{BASE_URL}/api/floors/{FLOOR_ID}/zones/{zone_id}",
            json=update_data
        )
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        data = update_response.json()
        assert data["status"] == "success"
        
        # Verify update was persisted
        get_response = self.session.get(f"{BASE_URL}/api/floors/{FLOOR_ID}/zones")
        zones = get_response.json()["zones"]
        updated_zone = next((z for z in zones if z["id"] == zone_id), None)
        
        assert updated_zone is not None
        assert updated_zone["name"] == "TEST_Zone_Updated_Name"
        assert updated_zone["color"] == "#00ff00"
        assert updated_zone["show_heatmap"] == False
    
    def test_delete_zone(self):
        """Test DELETE /api/floors/{floor_id}/zones/{zone_id} - Delete a zone"""
        # First create a zone
        zone_data = {
            "name": f"TEST_Zone_Delete_{uuid.uuid4().hex[:8]}",
            "type": "plaza",
            "color": "#0000ff",
            "show_heatmap": True,
            "points": [{"x": 20, "y": 0}, {"x": 25, "y": 0}, {"x": 25, "y": 3}, {"x": 20, "y": 3}]
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/floors/{FLOOR_ID}/zones",
            json=zone_data
        )
        assert create_response.status_code == 200
        zone_id = create_response.json()["zone"]["id"]
        
        # Delete the zone
        delete_response = self.session.delete(
            f"{BASE_URL}/api/floors/{FLOOR_ID}/zones/{zone_id}"
        )
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        data = delete_response.json()
        assert data["status"] == "success"
        
        # Verify zone was deleted
        get_response = self.session.get(f"{BASE_URL}/api/floors/{FLOOR_ID}/zones")
        zones = get_response.json()["zones"]
        zone_ids = [z["id"] for z in zones]
        assert zone_id not in zone_ids
    
    def test_delete_nonexistent_zone(self):
        """Test DELETE with non-existent zone ID returns 404"""
        fake_zone_id = str(uuid.uuid4())
        response = self.session.delete(
            f"{BASE_URL}/api/floors/{FLOOR_ID}/zones/{fake_zone_id}"
        )
        assert response.status_code == 404


class TestHeatmapZoneIntegration:
    """Tests for heatmap API returning zones data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_live_heatmap_returns_zones(self):
        """Test GET /api/heatmap/live/{floor_id} returns zones array"""
        response = self.session.get(f"{BASE_URL}/api/heatmap/live/{FLOOR_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify heatmap response structure
        assert "floor_id" in data
        assert "floor_name" in data
        assert "store_id" in data
        assert "store_name" in data
        assert "width_meters" in data
        assert "height_meters" in data
        assert "grid_size" in data
        assert "cameras" in data
        assert "timestamp" in data
        assert "total_visitors" in data
        
        # CRITICAL: Verify zones are included
        assert "zones" in data, "Heatmap API must return zones array for zone masking feature"
        assert isinstance(data["zones"], list)
        
        # Verify zone structure if zones exist
        if len(data["zones"]) > 0:
            zone = data["zones"][0]
            assert "id" in zone
            assert "name" in zone
            assert "type" in zone
            assert "color" in zone
            assert "points" in zone
            assert "show_heatmap" in zone
            
            # Verify points structure
            if len(zone["points"]) > 0:
                point = zone["points"][0]
                assert "x" in point
                assert "y" in point
    
    def test_heatmap_range_returns_zones(self):
        """Test GET /api/heatmap/range/{floor_id} returns zones array"""
        from datetime import datetime, timedelta
        
        date_from = (datetime.now() - timedelta(days=1)).isoformat()
        date_to = datetime.now().isoformat()
        
        response = self.session.get(
            f"{BASE_URL}/api/heatmap/range/{FLOOR_ID}",
            params={
                "date_from": date_from,
                "date_to": date_to,
                "interval_minutes": 60
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify zones are included in range response
        assert "zones" in data, "Heatmap range API must return zones array"
        assert isinstance(data["zones"], list)
    
    def test_zones_have_show_heatmap_flag(self):
        """Test that zones have show_heatmap flag for masking control"""
        response = self.session.get(f"{BASE_URL}/api/heatmap/live/{FLOOR_ID}")
        assert response.status_code == 200
        
        data = response.json()
        zones = data.get("zones", [])
        
        for zone in zones:
            assert "show_heatmap" in zone, f"Zone {zone.get('name')} missing show_heatmap flag"
            assert isinstance(zone["show_heatmap"], bool)


class TestFloorEndpoints:
    """Tests for floor endpoints related to zones"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_get_floor_includes_zones(self):
        """Test GET /api/floors/{floor_id} includes zones"""
        response = self.session.get(f"{BASE_URL}/api/floors/{FLOOR_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "zones" in data, "Floor response should include zones array"
        assert isinstance(data["zones"], list)
    
    def test_update_floor_zones(self):
        """Test PUT /api/floors/{floor_id} can update zones array"""
        # Get current floor data
        get_response = self.session.get(f"{BASE_URL}/api/floors/{FLOOR_ID}")
        assert get_response.status_code == 200
        current_zones = get_response.json().get("zones", [])
        
        # Update with same zones (no actual change, just verify endpoint works)
        update_response = self.session.put(
            f"{BASE_URL}/api/floors/{FLOOR_ID}",
            json={"zones": current_zones}
        )
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"


class TestZoneValidation:
    """Tests for zone validation and edge cases"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_zone_ids = []
        yield
        # Cleanup
        for zone_id in self.created_zone_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/floors/{FLOOR_ID}/zones/{zone_id}")
            except:
                pass
    
    def test_create_zone_with_different_types(self):
        """Test creating zones with different type values"""
        zone_types = ["corridor", "plaza", "entrance", "shop", "restricted", "general"]
        
        for zone_type in zone_types:
            zone_data = {
                "name": f"TEST_Zone_Type_{zone_type}_{uuid.uuid4().hex[:4]}",
                "type": zone_type,
                "color": "#ffffff",
                "show_heatmap": True,
                "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}]
            }
            
            response = self.session.post(
                f"{BASE_URL}/api/floors/{FLOOR_ID}/zones",
                json=zone_data
            )
            assert response.status_code == 200, f"Failed to create zone with type '{zone_type}'"
            
            zone_id = response.json()["zone"]["id"]
            self.created_zone_ids.append(zone_id)
    
    def test_create_zone_with_show_heatmap_false(self):
        """Test creating zone with show_heatmap=false (excluded from heatmap)"""
        zone_data = {
            "name": f"TEST_Zone_NoHeatmap_{uuid.uuid4().hex[:8]}",
            "type": "restricted",
            "color": "#ff0000",
            "show_heatmap": False,
            "points": [{"x": 30, "y": 0}, {"x": 35, "y": 0}, {"x": 35, "y": 2}, {"x": 30, "y": 2}]
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/floors/{FLOOR_ID}/zones",
            json=zone_data
        )
        assert response.status_code == 200
        
        zone = response.json()["zone"]
        self.created_zone_ids.append(zone["id"])
        
        assert zone["show_heatmap"] == False
    
    def test_get_zones_for_nonexistent_floor(self):
        """Test GET zones for non-existent floor returns 404"""
        fake_floor_id = str(uuid.uuid4())
        response = self.session.get(f"{BASE_URL}/api/floors/{fake_floor_id}/zones")
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
