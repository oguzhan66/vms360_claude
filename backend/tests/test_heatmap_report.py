"""
Test suite for VMS360 Heatmap On-Demand Report Generation feature
Tests the new architecture: Floor selection -> Date range -> Generate Report
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data - Forum Kadikoy store with AVM Ana Koridor floor
TEST_STORE_ID = "16d18512-6191-4f60-8425-595d9da0ec0f"
TEST_FLOOR_ID = "c713f669-075f-4e06-b252-9b5fd57ac1eb"  # AVM Ana Koridor


class TestHeatmapStoresWithFloors:
    """Test /api/heatmap/stores-with-floors endpoint"""
    
    def test_get_stores_with_floors_success(self):
        """Test that stores with floors are returned correctly"""
        response = requests.get(f"{BASE_URL}/api/heatmap/stores-with-floors")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        
        # Verify Forum Kadikoy store exists
        forum_kadikoy = next((s for s in data if s['store_id'] == TEST_STORE_ID), None)
        assert forum_kadikoy is not None
        assert forum_kadikoy['store_name'] == 'Forum Kadikoy'
        assert 'floors' in forum_kadikoy
        assert len(forum_kadikoy['floors']) > 0
        
    def test_stores_have_required_fields(self):
        """Test that store data has all required fields"""
        response = requests.get(f"{BASE_URL}/api/heatmap/stores-with-floors")
        assert response.status_code == 200
        
        data = response.json()
        for store in data:
            assert 'store_id' in store
            assert 'store_name' in store
            assert 'floors' in store
            assert 'city_name' in store
            assert 'region_name' in store
            
    def test_floors_have_required_fields(self):
        """Test that floor data has all required fields"""
        response = requests.get(f"{BASE_URL}/api/heatmap/stores-with-floors")
        assert response.status_code == 200
        
        data = response.json()
        forum_kadikoy = next((s for s in data if s['store_id'] == TEST_STORE_ID), None)
        
        for floor in forum_kadikoy['floors']:
            assert 'floor_id' in floor
            assert 'floor_name' in floor
            assert 'floor_number' in floor
            assert 'has_plan' in floor


class TestHeatmapLive:
    """Test /api/heatmap/live/{floor_id} endpoint"""
    
    def test_get_live_heatmap_success(self):
        """Test getting live heatmap data for a floor"""
        response = requests.get(f"{BASE_URL}/api/heatmap/live/{TEST_FLOOR_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert data['floor_id'] == TEST_FLOOR_ID
        assert data['floor_name'] == 'AVM Ana Koridor'
        assert 'cameras' in data
        assert 'width_meters' in data
        assert 'height_meters' in data
        assert 'timestamp' in data
        
    def test_live_heatmap_has_camera_data(self):
        """Test that live heatmap includes camera positions"""
        response = requests.get(f"{BASE_URL}/api/heatmap/live/{TEST_FLOOR_ID}")
        assert response.status_code == 200
        
        data = response.json()
        cameras = data.get('cameras', [])
        
        # AVM Ana Koridor should have cameras
        if len(cameras) > 0:
            cam = cameras[0]
            assert 'position_x' in cam
            assert 'position_y' in cam
            assert 'direction' in cam
            assert 'fov_angle' in cam
            
    def test_live_heatmap_invalid_floor(self):
        """Test that invalid floor ID returns 404"""
        response = requests.get(f"{BASE_URL}/api/heatmap/live/invalid-floor-id")
        assert response.status_code == 404


class TestHeatmapRange:
    """Test /api/heatmap/range/{floor_id} endpoint - Main report generation"""
    
    def test_get_heatmap_range_success(self):
        """Test generating heatmap report for date range"""
        params = {
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z',
            'interval_minutes': 60
        }
        response = requests.get(f"{BASE_URL}/api/heatmap/range/{TEST_FLOOR_ID}", params=params)
        assert response.status_code == 200
        
        data = response.json()
        assert data['floor_id'] == TEST_FLOOR_ID
        assert 'timeline_data' in data
        assert 'date_from' in data
        assert 'date_to' in data
        assert 'total_snapshots' in data
        
    def test_heatmap_range_has_floor_dimensions(self):
        """Test that range response includes floor dimensions for canvas"""
        params = {
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response = requests.get(f"{BASE_URL}/api/heatmap/range/{TEST_FLOOR_ID}", params=params)
        assert response.status_code == 200
        
        data = response.json()
        assert 'width_meters' in data
        assert 'height_meters' in data
        assert 'grid_size' in data
        assert data['width_meters'] == 40.0
        assert data['height_meters'] == 12.0
        
    def test_heatmap_range_timeline_structure(self):
        """Test timeline data structure for playback"""
        params = {
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response = requests.get(f"{BASE_URL}/api/heatmap/range/{TEST_FLOOR_ID}", params=params)
        assert response.status_code == 200
        
        data = response.json()
        timeline = data.get('timeline_data', [])
        
        if len(timeline) > 0:
            frame = timeline[0]
            assert 'timestamp' in frame
            assert 'total_in' in frame
            assert 'cameras' in frame
            
    def test_heatmap_range_invalid_floor(self):
        """Test that invalid floor ID returns 404"""
        params = {
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response = requests.get(f"{BASE_URL}/api/heatmap/range/invalid-floor-id", params=params)
        assert response.status_code == 404
        
    def test_heatmap_range_invalid_date_format(self):
        """Test that invalid date format returns 400"""
        params = {
            'date_from': 'invalid-date',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response = requests.get(f"{BASE_URL}/api/heatmap/range/{TEST_FLOOR_ID}", params=params)
        assert response.status_code == 400
        
    def test_heatmap_range_includes_zones(self):
        """Test that range response includes zones for masking"""
        params = {
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response = requests.get(f"{BASE_URL}/api/heatmap/range/{TEST_FLOOR_ID}", params=params)
        assert response.status_code == 200
        
        data = response.json()
        assert 'zones' in data
        

class TestHeatmapPdfExport:
    """Test /api/heatmap/export/pdf endpoint"""
    
    def test_pdf_export_success(self):
        """Test PDF export with valid data"""
        payload = {
            'store_id': TEST_STORE_ID,
            'floor_id': TEST_FLOOR_ID,
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z',
            'canvas_image': None  # Optional
        }
        response = requests.post(f"{BASE_URL}/api/heatmap/export/pdf", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'success'
        assert 'pdf_base64' in data
        assert 'filename' in data
        assert len(data['pdf_base64']) > 0
        
    def test_pdf_export_invalid_floor(self):
        """Test PDF export with invalid floor ID"""
        payload = {
            'store_id': TEST_STORE_ID,
            'floor_id': 'invalid-floor-id',
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response = requests.post(f"{BASE_URL}/api/heatmap/export/pdf", json=payload)
        assert response.status_code == 404
        
    def test_pdf_export_invalid_store(self):
        """Test PDF export with invalid store ID"""
        payload = {
            'store_id': 'invalid-store-id',
            'floor_id': TEST_FLOOR_ID,
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response = requests.post(f"{BASE_URL}/api/heatmap/export/pdf", json=payload)
        assert response.status_code == 404


class TestHeatmapComparison:
    """Test comparison functionality - fetching two date ranges"""
    
    def test_comparison_two_ranges(self):
        """Test fetching data for two different date ranges for comparison"""
        # Primary range
        params1 = {
            'date_from': '2025-01-01T00:00:00Z',
            'date_to': '2025-01-15T23:59:59Z'
        }
        response1 = requests.get(f"{BASE_URL}/api/heatmap/range/{TEST_FLOOR_ID}", params=params1)
        assert response1.status_code == 200
        
        # Comparison range
        params2 = {
            'date_from': '2025-01-16T00:00:00Z',
            'date_to': '2025-01-31T23:59:59Z'
        }
        response2 = requests.get(f"{BASE_URL}/api/heatmap/range/{TEST_FLOOR_ID}", params=params2)
        assert response2.status_code == 200
        
        data1 = response1.json()
        data2 = response2.json()
        
        # Both should have timeline data
        assert 'timeline_data' in data1
        assert 'timeline_data' in data2


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
