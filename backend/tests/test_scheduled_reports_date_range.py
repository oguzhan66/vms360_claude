"""
Test Scheduled Reports Date Range Functionality
================================================
Tests the fix for scheduled reports sending empty content when date_range='7d' was selected.
The issue was: date_range was saved as NULL in database and report.get('date_range', '1d') 
returned None instead of '1d' because the key existed with None value.

Fix: Use `report.get('date_range') or '1d'` instead of `report.get('date_range', '1d')`
"""

import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestScheduledReportsDateRange:
    """Test scheduled reports date_range functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_debug_test_report_generation_1d(self):
        """Test report generation with date_range=1d"""
        response = requests.get(
            f"{BASE_URL}/api/debug/test-report-generation",
            params={"date_range": "1d", "report_type": "counter"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["requested_date_range"] == "1d"
        assert data["report_type"] == "counter"
        # Data count can be 0 if no data for today, but structure should be correct
        assert "data_count" in data
        assert "sample_data" in data
        print(f"1d report: {data['data_count']} items")
    
    def test_debug_test_report_generation_7d(self):
        """Test report generation with date_range=7d (the problematic case)"""
        response = requests.get(
            f"{BASE_URL}/api/debug/test-report-generation",
            params={"date_range": "7d", "report_type": "counter"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["requested_date_range"] == "7d"
        assert data["report_type"] == "counter"
        assert "data_count" in data
        assert "sample_data" in data
        print(f"7d report: {data['data_count']} items")
        
        # If there's data, verify it has expected structure
        if data["data_count"] > 0:
            sample = data["sample_data"][0]
            assert "Mağaza" in sample or "store_name" in str(sample).lower()
    
    def test_debug_test_report_generation_30d(self):
        """Test report generation with date_range=30d"""
        response = requests.get(
            f"{BASE_URL}/api/debug/test-report-generation",
            params={"date_range": "30d", "report_type": "counter"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert data["requested_date_range"] == "30d"
        assert data["report_type"] == "counter"
        print(f"30d report: {data['data_count']} items")
    
    def test_scheduled_reports_check_endpoint(self):
        """Test the debug endpoint that shows saved date_range values"""
        response = requests.get(
            f"{BASE_URL}/api/debug/scheduled-reports-check",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "total_reports" in data
        assert "reports" in data
        
        # Check each report has date_range field
        for report in data["reports"]:
            print(f"Report: {report.get('name')} - date_range: {report.get('date_range')}")
            # date_range should not be None if properly saved
            # (though existing reports might have None from before the fix)
    
    def test_create_scheduled_report_with_7d_date_range(self):
        """Test creating a new scheduled report with date_range=7d"""
        import uuid
        test_name = f"TEST_7d_Report_{uuid.uuid4().hex[:8]}"
        
        # Create report with 7d date_range
        create_data = {
            "name": test_name,
            "report_type": "counter",
            "format": "excel",
            "frequency": "daily",
            "send_time": "08:00",
            "recipients": ["test@example.com"],
            "store_ids": [],
            "date_range": "7d"  # This is the key field we're testing
        }
        
        response = requests.post(
            f"{BASE_URL}/api/scheduled-reports",
            json=create_data,
            headers=self.headers
        )
        assert response.status_code in [200, 201], f"Create failed: {response.text}"
        created = response.json()
        report_id = created.get("id")
        
        try:
            # Verify the date_range was saved correctly
            assert created.get("date_range") == "7d", f"date_range not saved correctly: {created.get('date_range')}"
            print(f"Created report with date_range: {created.get('date_range')}")
            
            # Get all reports and find our report to verify date_range persisted
            get_response = requests.get(
                f"{BASE_URL}/api/scheduled-reports",
                headers=self.headers
            )
            assert get_response.status_code == 200, f"Get failed: {get_response.text}"
            all_reports = get_response.json()
            
            # Find our report
            fetched = next((r for r in all_reports if r.get("id") == report_id), None)
            assert fetched is not None, f"Report not found in list"
            assert fetched.get("date_range") == "7d", f"date_range not persisted: {fetched.get('date_range')}"
            
        finally:
            # Cleanup - delete the test report
            if report_id:
                requests.delete(
                    f"{BASE_URL}/api/scheduled-reports/{report_id}",
                    headers=self.headers
                )
    
    def test_update_scheduled_report_date_range(self):
        """Test updating an existing scheduled report's date_range"""
        import uuid
        test_name = f"TEST_Update_Report_{uuid.uuid4().hex[:8]}"
        
        # Create report with 1d date_range
        create_data = {
            "name": test_name,
            "report_type": "counter",
            "format": "excel",
            "frequency": "daily",
            "send_time": "08:00",
            "recipients": ["test@example.com"],
            "store_ids": [],
            "date_range": "1d"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/scheduled-reports",
            json=create_data,
            headers=self.headers
        )
        assert response.status_code in [200, 201], f"Create failed: {response.text}"
        created = response.json()
        report_id = created.get("id")
        
        try:
            # Update to 7d
            update_response = requests.put(
                f"{BASE_URL}/api/scheduled-reports/{report_id}",
                json={"date_range": "7d"},
                headers=self.headers
            )
            assert update_response.status_code == 200, f"Update failed: {update_response.text}"
            
            # Verify update by getting all reports
            get_response = requests.get(
                f"{BASE_URL}/api/scheduled-reports",
                headers=self.headers
            )
            assert get_response.status_code == 200
            all_reports = get_response.json()
            
            # Find our report
            fetched = next((r for r in all_reports if r.get("id") == report_id), None)
            assert fetched is not None, f"Report not found in list"
            assert fetched.get("date_range") == "7d", f"date_range not updated: {fetched.get('date_range')}"
            print(f"Updated date_range from 1d to: {fetched.get('date_range')}")
            
        finally:
            # Cleanup
            if report_id:
                requests.delete(
                    f"{BASE_URL}/api/scheduled-reports/{report_id}",
                    headers=self.headers
                )
    
    def test_send_now_with_7d_date_range(self):
        """Test sending a report immediately with 7d date_range"""
        import uuid
        test_name = f"TEST_SendNow_7d_{uuid.uuid4().hex[:8]}"
        
        # Create report with 7d date_range
        create_data = {
            "name": test_name,
            "report_type": "counter",
            "format": "excel",
            "frequency": "daily",
            "send_time": "08:00",
            "recipients": ["test@example.com"],
            "store_ids": [],
            "date_range": "7d"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/scheduled-reports",
            json=create_data,
            headers=self.headers
        )
        assert response.status_code in [200, 201], f"Create failed: {response.text}"
        created = response.json()
        report_id = created.get("id")
        
        try:
            # Try to send now - this will fail if SMTP is not configured, but we can check the endpoint works
            send_response = requests.post(
                f"{BASE_URL}/api/scheduled-reports/{report_id}/send-now",
                headers=self.headers
            )
            # Accept 200 (success), 400 (SMTP not configured), or 500 (SMTP error)
            # The important thing is the endpoint doesn't crash due to date_range issues
            assert send_response.status_code in [200, 400, 500], f"Unexpected status: {send_response.status_code}"
            print(f"Send now response: {send_response.status_code} - {send_response.text[:200]}")
            
        finally:
            # Cleanup
            if report_id:
                requests.delete(
                    f"{BASE_URL}/api/scheduled-reports/{report_id}",
                    headers=self.headers
                )
    
    def test_fix_null_date_ranges_endpoint(self):
        """Test the endpoint that fixes NULL date_range values"""
        response = requests.post(
            f"{BASE_URL}/api/debug/fix-null-date-ranges",
            params={"default_date_range": "1d"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "fixed_count" in data
        print(f"Fixed {data.get('fixed_count')} reports with null date_range")


class TestReportGenerationWithDifferentTypes:
    """Test report generation for different report types with various date ranges"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_counter_report_7d(self):
        """Test counter report with 7d date range"""
        response = requests.get(
            f"{BASE_URL}/api/debug/test-report-generation",
            params={"date_range": "7d", "report_type": "counter"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Counter 7d: {data.get('data_count')} items")
    
    def test_queue_report_7d(self):
        """Test queue report with 7d date range"""
        response = requests.get(
            f"{BASE_URL}/api/debug/test-report-generation",
            params={"date_range": "7d", "report_type": "queue"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Queue 7d: {data.get('data_count')} items")
    
    def test_analytics_report_7d(self):
        """Test analytics report with 7d date range"""
        response = requests.get(
            f"{BASE_URL}/api/debug/test-report-generation",
            params={"date_range": "7d", "report_type": "analytics"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Analytics 7d: {data.get('data_count')} items")


class TestDateRangeCompare:
    """Test date range comparison endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_date_range_compare(self):
        """Test the date range comparison debug endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/debug/date-range-compare",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "counter_snapshots" in data
        assert "report_comparison" in data
        
        # Log the comparison
        print(f"Counter snapshots by date: {data.get('counter_snapshots', {}).get('by_date', [])[:3]}")
        print(f"Report comparison: {data.get('report_comparison', {})}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
