import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class VMSDashboardTester:
    def __init__(self, base_url="https://store-analytics-10.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.created_ids = {
            'vms': [],
            'regions': [],
            'cities': [],
            'districts': [],
            'stores': [],
            'cameras': []
        }

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, params: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json() if response.text else {}
            except:
                response_data = {"raw_response": response.text}

            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response_data and isinstance(response_data, dict):
                    if 'id' in response_data:
                        print(f"   Created ID: {response_data['id']}")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")

            self.test_results.append({
                'name': name,
                'method': method,
                'endpoint': endpoint,
                'expected_status': expected_status,
                'actual_status': response.status_code,
                'success': success,
                'response_data': response_data
            })

            return success, response_data

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({
                'name': name,
                'method': method,
                'endpoint': endpoint,
                'expected_status': expected_status,
                'actual_status': 0,
                'success': False,
                'error': str(e)
            })
            return False, {}

    def test_basic_endpoints(self):
        """Test basic API endpoints"""
        print("\n=== TESTING BASIC ENDPOINTS ===")
        
        # Test root endpoint
        self.run_test("API Root", "GET", "", 200)
        
        # Test VMS endpoints
        success, vms_list = self.run_test("Get VMS List", "GET", "vms", 200)
        
        return success

    def test_vms_management(self):
        """Test VMS CRUD operations"""
        print("\n=== TESTING VMS MANAGEMENT ===")
        
        # Create VMS
        vms_data = {
            "name": "Test VMS Server",
            "url": "http://test.example.com:11012",
            "username": "testuser",
            "password": "testpass"
        }
        success, vms = self.run_test("Create VMS", "POST", "vms", 200, vms_data)
        if success and 'id' in vms:
            vms_id = vms['id']
            self.created_ids['vms'].append(vms_id)
            
            # Get specific VMS
            self.run_test("Get VMS by ID", "GET", f"vms/{vms_id}", 200)
            
            # Update VMS
            update_data = {"name": "Updated Test VMS"}
            self.run_test("Update VMS", "PUT", f"vms/{vms_id}", 200, update_data)
            
            # Test VMS connection (will likely fail for test server)
            self.run_test("Test VMS Connection", "GET", f"vms/{vms_id}/test", 200)
            
            # Delete VMS
            self.run_test("Delete VMS", "DELETE", f"vms/{vms_id}", 200)

    def test_location_management(self):
        """Test location hierarchy (Region > City > District)"""
        print("\n=== TESTING LOCATION MANAGEMENT ===")
        
        # Create Region
        region_data = {"name": "Test Region"}
        success, region = self.run_test("Create Region", "POST", "regions", 200, region_data)
        if success and 'id' in region:
            region_id = region['id']
            self.created_ids['regions'].append(region_id)
            
            # Get regions
            self.run_test("Get Regions", "GET", "regions", 200)
            
            # Create City
            city_data = {"name": "Test City", "parent_id": region_id}
            success, city = self.run_test("Create City", "POST", "cities", 200, city_data)
            if success and 'id' in city:
                city_id = city['id']
                self.created_ids['cities'].append(city_id)
                
                # Get cities
                self.run_test("Get Cities", "GET", "cities", 200)
                self.run_test("Get Cities by Region", "GET", "cities", 200, params={"region_id": region_id})
                
                # Create District
                district_data = {"name": "Test District", "parent_id": city_id}
                success, district = self.run_test("Create District", "POST", "districts", 200, district_data)
                if success and 'id' in district:
                    district_id = district['id']
                    self.created_ids['districts'].append(district_id)
                    
                    # Get districts
                    self.run_test("Get Districts", "GET", "districts", 200)
                    self.run_test("Get Districts by City", "GET", "districts", 200, params={"city_id": city_id})

    def test_store_management(self):
        """Test store CRUD operations"""
        print("\n=== TESTING STORE MANAGEMENT ===")
        
        # First ensure we have location and VMS data
        if not self.created_ids['districts'] or not self.created_ids['vms']:
            print("⚠️  Skipping store tests - missing district or VMS data")
            return
            
        district_id = self.created_ids['districts'][0]
        vms_id = self.created_ids['vms'][0]
        
        # Create Store
        store_data = {
            "name": "Test Store",
            "district_id": district_id,
            "vms_id": vms_id,
            "capacity": 150,
            "queue_threshold": 8
        }
        success, store = self.run_test("Create Store", "POST", "stores", 200, store_data)
        if success and 'id' in store:
            store_id = store['id']
            self.created_ids['stores'].append(store_id)
            
            # Get stores
            self.run_test("Get All Stores", "GET", "stores", 200)
            self.run_test("Get Store by ID", "GET", f"stores/{store_id}", 200)
            self.run_test("Get Stores by District", "GET", "stores", 200, params={"district_id": district_id})
            
            # Update Store
            update_data = {
                "name": "Updated Test Store",
                "district_id": district_id,
                "vms_id": vms_id,
                "capacity": 200,
                "queue_threshold": 10
            }
            self.run_test("Update Store", "PUT", f"stores/{store_id}", 200, update_data)

    def test_camera_management(self):
        """Test camera CRUD operations"""
        print("\n=== TESTING CAMERA MANAGEMENT ===")
        
        if not self.created_ids['stores']:
            print("⚠️  Skipping camera tests - missing store data")
            return
            
        store_id = self.created_ids['stores'][0]
        
        # Create Camera
        camera_data = {
            "store_id": store_id,
            "camera_vms_id": "CAM001",
            "name": "Test Camera 1",
            "type": "counter"
        }
        success, camera = self.run_test("Create Camera", "POST", "cameras", 200, camera_data)
        if success and 'id' in camera:
            camera_id = camera['id']
            self.created_ids['cameras'].append(camera_id)
            
            # Get cameras
            self.run_test("Get All Cameras", "GET", "cameras", 200)
            self.run_test("Get Cameras by Store", "GET", "cameras", 200, params={"store_id": store_id})

    def test_live_data_endpoints(self):
        """Test live data endpoints"""
        print("\n=== TESTING LIVE DATA ENDPOINTS ===")
        
        # Test counter data
        self.run_test("Get Live Counter Data", "GET", "live/counter", 200)
        
        # Test queue data
        self.run_test("Get Live Queue Data", "GET", "live/queue", 200)
        
        # Test analytics data
        self.run_test("Get Live Analytics Data", "GET", "live/analytics", 200)

    def test_reports_endpoints(self):
        """Test report endpoints"""
        print("\n=== TESTING REPORTS ENDPOINTS ===")
        
        # Test summary report
        self.run_test("Get Summary Report", "GET", "reports/summary", 200)
        
        # Test export endpoints
        self.run_test("Export JSON Report", "GET", "reports/export", 200, params={"format": "json"})
        self.run_test("Export CSV Report", "GET", "reports/export", 200, params={"format": "csv"})

    def test_settings_endpoints(self):
        """Test settings endpoints"""
        print("\n=== TESTING SETTINGS ENDPOINTS ===")
        
        # Get settings
        success, settings = self.run_test("Get Settings", "GET", "settings", 200)
        
        # Update settings
        if success:
            settings_data = {
                "id": "global_settings",
                "refresh_interval": 45,
                "capacity_warning_percent": 85,
                "capacity_critical_percent": 98,
                "email_notifications": True,
                "notification_email": "test@example.com"
            }
            self.run_test("Update Settings", "PUT", "settings", 200, settings_data)

    def test_hierarchy_endpoint(self):
        """Test hierarchy endpoint"""
        print("\n=== TESTING HIERARCHY ENDPOINT ===")
        
        self.run_test("Get Full Hierarchy", "GET", "hierarchy", 200)

    def cleanup_test_data(self):
        """Clean up created test data"""
        print("\n=== CLEANING UP TEST DATA ===")
        
        # Delete in reverse order of dependencies
        for camera_id in self.created_ids['cameras']:
            self.run_test(f"Cleanup Camera {camera_id}", "DELETE", f"cameras/{camera_id}", 200)
            
        for store_id in self.created_ids['stores']:
            self.run_test(f"Cleanup Store {store_id}", "DELETE", f"stores/{store_id}", 200)
            
        for district_id in self.created_ids['districts']:
            self.run_test(f"Cleanup District {district_id}", "DELETE", f"districts/{district_id}", 200)
            
        for city_id in self.created_ids['cities']:
            self.run_test(f"Cleanup City {city_id}", "DELETE", f"cities/{city_id}", 200)
            
        for region_id in self.created_ids['regions']:
            self.run_test(f"Cleanup Region {region_id}", "DELETE", f"regions/{region_id}", 200)
            
        for vms_id in self.created_ids['vms']:
            self.run_test(f"Cleanup VMS {vms_id}", "DELETE", f"vms/{vms_id}", 200)

def main():
    print("🚀 Starting VMS Dashboard API Tests")
    print("=" * 50)
    
    tester = VMSDashboardTester()
    
    try:
        # Run all test suites
        tester.test_basic_endpoints()
        tester.test_vms_management()
        tester.test_location_management()
        tester.test_store_management()
        tester.test_camera_management()
        tester.test_live_data_endpoints()
        tester.test_reports_endpoints()
        tester.test_settings_endpoints()
        tester.test_hierarchy_endpoint()
        
    finally:
        # Always try to cleanup
        tester.cleanup_test_data()
    
    # Print final results
    print(f"\n📊 FINAL RESULTS")
    print("=" * 50)
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%" if tester.tests_run > 0 else "0%")
    
    # Show failed tests
    failed_tests = [t for t in tester.test_results if not t['success']]
    if failed_tests:
        print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
        for test in failed_tests:
            error_msg = test.get('error', f'Status {test.get("actual_status", "unknown")}')
            print(f"  - {test['name']}: {error_msg}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())