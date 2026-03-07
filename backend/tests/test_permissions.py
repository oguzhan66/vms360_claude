"""
Test suite for VMS360 Operator Permission Feature
Tests:
- Admin can see all stores
- Operator can only see authorized stores
- Permission fields in user API
- Permission changes take effect immediately
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful - role: {data['user']['role']}")
    
    def test_operator_login(self):
        """Test operator login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "operator",
            "password": "12345"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "operator"
        print(f"✓ Operator login successful - role: {data['user']['role']}")


class TestUserPermissions:
    """User permission API tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def operator_token(self):
        """Get operator token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "operator",
            "password": "12345"
        })
        return response.json()["access_token"]
    
    def test_users_api_returns_permission_fields(self, admin_token):
        """Test that users API returns permission fields"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        users = response.json()
        
        # Check that permission fields exist
        for user in users:
            assert "allowed_region_ids" in user
            assert "allowed_city_ids" in user
            assert "allowed_store_ids" in user
            print(f"✓ User {user['username']} has permission fields")
    
    def test_operator_has_store_permission(self, admin_token):
        """Test that operator has Forum Kadikoy store permission"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = response.json()
        
        operator = next((u for u in users if u["username"] == "operator"), None)
        assert operator is not None
        assert len(operator["allowed_store_ids"]) > 0
        print(f"✓ Operator has {len(operator['allowed_store_ids'])} store permission(s)")
        print(f"  Store IDs: {operator['allowed_store_ids']}")


class TestStorePermissionFiltering:
    """Test store data filtering based on permissions"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def operator_token(self):
        """Get operator token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "operator",
            "password": "12345"
        })
        return response.json()["access_token"]
    
    def test_admin_sees_all_stores_in_summary(self, admin_token):
        """Admin should see all stores (2 stores)"""
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        total_stores = data["counter_summary"]["total_stores"]
        assert total_stores == 2, f"Expected 2 stores, got {total_stores}"
        
        store_names = [s["store_name"] for s in data["stores"]]
        assert "Forum Kadikoy" in store_names
        assert "Test Mağaza 2" in store_names
        print(f"✓ Admin sees {total_stores} stores: {store_names}")
    
    def test_operator_sees_only_authorized_stores_in_summary(self, operator_token):
        """Operator should see only authorized stores (1 store - Forum Kadikoy)"""
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        total_stores = data["counter_summary"]["total_stores"]
        assert total_stores == 1, f"Expected 1 store, got {total_stores}"
        
        store_names = [s["store_name"] for s in data["stores"]]
        assert "Forum Kadikoy" in store_names
        assert "Test Mağaza 2" not in store_names
        print(f"✓ Operator sees {total_stores} store(s): {store_names}")
    
    def test_admin_sees_all_stores_in_live_counter(self, admin_token):
        """Admin should see all stores in live counter data"""
        response = requests.get(
            f"{BASE_URL}/api/live/counter",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) == 2, f"Expected 2 stores, got {len(data)}"
        store_names = [s["store_name"] for s in data]
        print(f"✓ Admin sees {len(data)} stores in live counter: {store_names}")
    
    def test_operator_sees_only_authorized_stores_in_live_counter(self, operator_token):
        """Operator should see only authorized stores in live counter data"""
        response = requests.get(
            f"{BASE_URL}/api/live/counter",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) == 1, f"Expected 1 store, got {len(data)}"
        assert data[0]["store_name"] == "Forum Kadikoy"
        print(f"✓ Operator sees {len(data)} store in live counter: {data[0]['store_name']}")
    
    def test_admin_sees_all_stores_in_live_queue(self, admin_token):
        """Admin should see all stores in live queue data"""
        response = requests.get(
            f"{BASE_URL}/api/live/queue",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) == 2, f"Expected 2 stores, got {len(data)}"
        print(f"✓ Admin sees {len(data)} stores in live queue")
    
    def test_operator_sees_only_authorized_stores_in_live_queue(self, operator_token):
        """Operator should see only authorized stores in live queue data"""
        response = requests.get(
            f"{BASE_URL}/api/live/queue",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) == 1, f"Expected 1 store, got {len(data)}"
        assert data[0]["store_name"] == "Forum Kadikoy"
        print(f"✓ Operator sees {len(data)} store in live queue: {data[0]['store_name']}")


class TestPermissionUpdate:
    """Test permission update functionality"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        return response.json()["access_token"]
    
    def test_update_user_permissions(self, admin_token):
        """Test updating user permissions"""
        # Get operator user ID
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = response.json()
        operator = next((u for u in users if u["username"] == "operator"), None)
        assert operator is not None
        
        # Get stores
        response = requests.get(
            f"{BASE_URL}/api/stores",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        stores = response.json()
        forum_kadikoy = next((s for s in stores if s["name"] == "Forum Kadikoy"), None)
        assert forum_kadikoy is not None
        
        # Update operator permissions (ensure Forum Kadikoy is set)
        response = requests.put(
            f"{BASE_URL}/api/users/{operator['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "full_name": operator["full_name"],
                "role": operator["role"],
                "allowed_store_ids": [forum_kadikoy["id"]]
            }
        )
        assert response.status_code == 200
        updated_user = response.json()
        assert forum_kadikoy["id"] in updated_user["allowed_store_ids"]
        print(f"✓ Updated operator permissions - allowed stores: {updated_user['allowed_store_ids']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
