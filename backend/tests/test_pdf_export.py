"""
Test PDF Export functionality for VMS360 Retail Panel
Tests the heatmap PDF export API endpoint
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://store-analytics-10.preview.emergentagent.com')

class TestPDFExport:
    """PDF Export API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get stores with floors
        stores_response = self.session.get(f"{BASE_URL}/api/heatmap/stores-with-floors")
        assert stores_response.status_code == 200, f"Failed to get stores: {stores_response.text}"
        
        stores = stores_response.json()
        assert len(stores) > 0, "No stores found"
        
        # Use first store with floors
        self.store = stores[0]
        self.store_id = self.store["store_id"]
        self.store_name = self.store["store_name"]
        
        assert len(self.store["floors"]) > 0, "No floors found for store"
        self.floor = self.store["floors"][0]
        self.floor_id = self.floor["floor_id"]
        self.floor_name = self.floor["floor_name"]
        
        print(f"\nTest setup: Store={self.store_name}, Floor={self.floor_name}")
    
    def test_pdf_export_endpoint_exists(self):
        """Test that PDF export endpoint exists and accepts POST requests"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        # Should return 200 or valid error (not 404/405)
        assert response.status_code in [200, 400, 422], f"Unexpected status: {response.status_code}"
        print(f"✓ PDF export endpoint exists, status: {response.status_code}")
    
    def test_pdf_export_returns_success(self):
        """Test that PDF export returns success status"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "success", f"Expected success status, got: {data}"
        print(f"✓ PDF export returned success status")
    
    def test_pdf_export_contains_pdf_base64(self):
        """Test that PDF export returns base64 encoded PDF"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        data = response.json()
        assert "pdf_base64" in data, "Response missing pdf_base64 field"
        assert len(data["pdf_base64"]) > 0, "pdf_base64 is empty"
        
        # Verify it's valid base64
        try:
            decoded = base64.b64decode(data["pdf_base64"])
            assert len(decoded) > 0, "Decoded PDF is empty"
            # Check PDF magic bytes
            assert decoded[:4] == b'%PDF', "Decoded content is not a valid PDF"
            print(f"✓ PDF base64 is valid, size: {len(decoded)} bytes")
        except Exception as e:
            pytest.fail(f"Invalid base64 content: {e}")
    
    def test_pdf_export_contains_filename(self):
        """Test that PDF export returns proper filename"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        data = response.json()
        assert "filename" in data, "Response missing filename field"
        
        filename = data["filename"]
        assert filename.endswith(".pdf"), f"Filename should end with .pdf: {filename}"
        assert "heatmap_report" in filename, f"Filename should contain 'heatmap_report': {filename}"
        
        # Check if store name is in filename
        # Note: Store name might have spaces replaced
        print(f"✓ Filename is valid: {filename}")
    
    def test_pdf_export_filename_contains_store_name(self):
        """Test that PDF filename contains store name"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        data = response.json()
        filename = data.get("filename", "")
        
        # Store name should be in filename (Forum Kadikoy)
        store_name_part = self.store_name.replace(" ", "_").lower()
        filename_lower = filename.lower()
        
        # Check if any part of store name is in filename
        store_words = self.store_name.lower().split()
        found = any(word in filename_lower for word in store_words)
        
        assert found or self.store_name in filename, f"Store name '{self.store_name}' not found in filename: {filename}"
        print(f"✓ Store name found in filename: {filename}")
    
    def test_pdf_export_filename_contains_floor_name(self):
        """Test that PDF filename contains floor name"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        data = response.json()
        filename = data.get("filename", "")
        
        # Floor name should be in filename (AVM Ana Koridor)
        floor_words = self.floor_name.lower().split()
        filename_lower = filename.lower()
        
        found = any(word in filename_lower for word in floor_words)
        
        assert found or self.floor_name in filename, f"Floor name '{self.floor_name}' not found in filename: {filename}"
        print(f"✓ Floor name found in filename: {filename}")
    
    def test_pdf_export_with_canvas_image(self):
        """Test PDF export with canvas image included"""
        # Create a simple base64 PNG image (1x1 red pixel)
        test_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z",
            "canvas_image": test_image
        })
        
        assert response.status_code == 200, f"PDF export with image failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "success", f"Expected success status, got: {data}"
        assert "pdf_base64" in data, "Response missing pdf_base64 field"
        print(f"✓ PDF export with canvas image successful")
    
    def test_pdf_export_invalid_store_id(self):
        """Test PDF export with invalid store ID returns 404"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": "invalid-store-id-12345",
            "floor_id": self.floor_id,
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        assert response.status_code == 404, f"Expected 404 for invalid store, got: {response.status_code}"
        print(f"✓ Invalid store ID returns 404")
    
    def test_pdf_export_invalid_floor_id(self):
        """Test PDF export with invalid floor ID returns 404"""
        response = self.session.post(f"{BASE_URL}/api/heatmap/export/pdf", json={
            "store_id": self.store_id,
            "floor_id": "invalid-floor-id-12345",
            "date_from": "2025-01-20T00:00:00Z",
            "date_to": "2025-01-23T23:59:59Z"
        })
        
        assert response.status_code == 404, f"Expected 404 for invalid floor, got: {response.status_code}"
        print(f"✓ Invalid floor ID returns 404")


class TestHeatmapStoresWithFloors:
    """Test heatmap stores-with-floors endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_stores_with_floors_endpoint(self):
        """Test that stores-with-floors endpoint returns data"""
        response = self.session.get(f"{BASE_URL}/api/heatmap/stores-with-floors")
        
        assert response.status_code == 200, f"Failed to get stores: {response.text}"
        
        stores = response.json()
        assert isinstance(stores, list), "Response should be a list"
        print(f"✓ Found {len(stores)} stores with floors")
    
    def test_stores_with_floors_structure(self):
        """Test that stores-with-floors returns proper structure"""
        response = self.session.get(f"{BASE_URL}/api/heatmap/stores-with-floors")
        
        assert response.status_code == 200, f"Failed to get stores: {response.text}"
        
        stores = response.json()
        if len(stores) > 0:
            store = stores[0]
            
            # Check required fields
            assert "store_id" in store, "Missing store_id"
            assert "store_name" in store, "Missing store_name"
            assert "floors" in store, "Missing floors"
            
            print(f"✓ Store structure is valid: {store['store_name']}")
            
            if len(store["floors"]) > 0:
                floor = store["floors"][0]
                assert "floor_id" in floor, "Missing floor_id"
                assert "floor_name" in floor, "Missing floor_name"
                print(f"✓ Floor structure is valid: {floor['floor_name']}")


class TestLogoVisibility:
    """Test logo visibility in the application"""
    
    def test_logo_url_accessible(self):
        """Test that the logo URL is accessible"""
        logo_url = "https://customer-assets.emergentagent.com/job_retail-footfall/artifacts/bjfv2q4b_image.png"
        
        response = requests.get(logo_url)
        assert response.status_code == 200, f"Logo URL not accessible: {response.status_code}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "image" in content_type, f"Logo is not an image: {content_type}"
        
        print(f"✓ Logo URL is accessible, content-type: {content_type}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
