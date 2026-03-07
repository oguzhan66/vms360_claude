"""
VMS360 Retail Panel - Backend API Tests
Tests for authentication, analytics, reports, and permissions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response should contain access_token"
        assert "user" in data, "Response should contain user info"
        assert data["user"]["role"] == "admin", "User role should be admin"
        assert data["user"]["username"] == "admin", "Username should be admin"
    
    def test_operator_login_success(self):
        """Test operator login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "operator",
            "password": "12345"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Response should contain access_token"
        assert "user" in data, "Response should contain user info"
        assert data["user"]["role"] == "operator", "User role should be operator"
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


class TestAnalyticsEndpoints:
    """Test analytics endpoints with authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_dashboard_summary_returns_local_warehouse(self):
        """Test /api/analytics/dashboard-summary returns data_source: local_warehouse"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard-summary",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "data_source" in data, "Response should contain data_source"
        assert data["data_source"] == "local_warehouse", f"Expected local_warehouse, got {data['data_source']}"
        assert "quick_stats" in data, "Response should contain quick_stats"
        assert "total_stores" in data["quick_stats"], "quick_stats should contain total_stores"
    
    def test_hourly_traffic(self):
        """Test /api/analytics/hourly-traffic endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/hourly-traffic",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "hourly_data" in data, "Response should contain hourly_data"
        assert "data_source" in data, "Response should contain data_source"
    
    def test_trends(self):
        """Test /api/analytics/trends endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/trends?period=week",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "daily_data" in data, "Response should contain daily_data"
        assert "data_source" in data, "Response should contain data_source"
    
    def test_demographics(self):
        """Test /api/analytics/demographics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/demographics",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "gender_data" in data, "Response should contain gender_data"
        assert "data_source" in data, "Response should contain data_source"
    
    def test_comparison(self):
        """Test /api/analytics/comparison endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/comparison?compare_type=week",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "current_period" in data, "Response should contain current_period"
        assert "previous_period" in data, "Response should contain previous_period"


class TestReportsEndpoints:
    """Test reports endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_reports_summary(self):
        """Test /api/reports/summary endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "counter_summary" in data, "Response should contain counter_summary"
        assert "data_source" in data, "Response should contain data_source"
    
    def test_reports_counter_with_date_range(self):
        """Test /api/reports/counter endpoint with date_range parameter"""
        response = requests.get(
            f"{BASE_URL}/api/reports/counter?date_range=1w",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "report_type" in data, "Response should contain report_type"
        assert data["report_type"] == "counter", "report_type should be counter"
        assert "date_range" in data, "Response should contain date_range"
        assert data["date_range"] == "1w", "date_range should be 1w"
        assert "data_source" in data, "Response should contain data_source"
    
    def test_reports_queue(self):
        """Test /api/reports/queue endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/reports/queue?date_range=1d",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report_type" in data, "Response should contain report_type"
        assert data["report_type"] == "queue", "report_type should be queue"
    
    def test_reports_analytics(self):
        """Test /api/reports/analytics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/reports/analytics?date_range=1w",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "report_type" in data, "Response should contain report_type"
        assert data["report_type"] == "analytics", "report_type should be analytics"


class TestOperatorPermissions:
    """Test operator user permissions and filtering"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get operator auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "operator",
            "password": "12345"
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Operator authentication failed")
    
    def test_operator_can_access_dashboard_summary(self):
        """Test operator can access dashboard summary"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard-summary",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Operator should get filtered data based on permissions
        assert "quick_stats" in data, "Response should contain quick_stats"
    
    def test_operator_can_access_reports_summary(self):
        """Test operator can access reports summary"""
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"


class TestLocationEndpoints:
    """Test location hierarchy endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_regions(self):
        """Test /api/regions endpoint"""
        response = requests.get(f"{BASE_URL}/api/regions", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_get_cities(self):
        """Test /api/cities endpoint"""
        response = requests.get(f"{BASE_URL}/api/cities", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
    
    def test_get_stores(self):
        """Test /api/stores endpoint"""
        response = requests.get(f"{BASE_URL}/api/stores", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"


class TestUnauthenticatedAccess:
    """Test that endpoints require authentication"""
    
    def test_dashboard_summary_requires_auth(self):
        """Test dashboard-summary requires authentication"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard-summary")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_reports_summary_requires_auth(self):
        """Test reports/summary requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/summary")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
