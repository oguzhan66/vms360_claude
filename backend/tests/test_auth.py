"""
Authentication and User Management Tests for VMS360 Dashboard
Tests: Login, User CRUD, Role-based access control
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://store-analytics-10.preview.emergentagent.com')

class TestAuthLogin:
    """Authentication login tests"""
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "12345"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "admin"
        assert data["user"]["full_name"] == "Sistem Yöneticisi"
        assert len(data["access_token"]) > 0
    
    def test_operator_login_success(self):
        """Test operator login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "operator",
            "password": "12345"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == "operator"
        assert data["user"]["role"] == "operator"
        assert data["user"]["full_name"] == "Operatör Kullanıcı"
    
    def test_login_invalid_username(self):
        """Test login with invalid username"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "nonexistent",
            "password": "12345"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
    
    def test_login_invalid_password(self):
        """Test login with invalid password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
    
    def test_login_empty_credentials(self):
        """Test login with empty credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "",
            "password": ""
        })
        # Should fail with 401 or 422
        assert response.status_code in [401, 422]


class TestAuthMe:
    """Test /auth/me endpoint"""
    
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
    
    def test_get_me_admin(self, admin_token):
        """Test getting current admin user info"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        assert "password_hash" not in data  # Should not expose password hash
    
    def test_get_me_operator(self, operator_token):
        """Test getting current operator user info"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["username"] == "operator"
        assert data["role"] == "operator"
    
    def test_get_me_no_token(self):
        """Test getting user info without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
    
    def test_get_me_invalid_token(self):
        """Test getting user info with invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        assert response.status_code == 401


class TestUserManagement:
    """User CRUD operations tests (admin only)"""
    
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
    
    def test_get_users_admin(self, admin_token):
        """Test admin can get all users"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2  # At least admin and operator
        
        # Check user structure
        usernames = [u["username"] for u in data]
        assert "admin" in usernames
        assert "operator" in usernames
        
        # Verify no password hash exposed
        for user in data:
            assert "password_hash" not in user
    
    def test_get_users_operator_forbidden(self, operator_token):
        """Test operator cannot get all users"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 403
    
    def test_create_user_admin(self, admin_token):
        """Test admin can create new user"""
        import uuid
        test_username = f"TEST_user_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "password": "testpass123",
                "full_name": "Test User",
                "role": "operator"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["username"] == test_username
        assert data["full_name"] == "Test User"
        assert data["role"] == "operator"
        assert "id" in data
        
        # Cleanup - delete the test user
        user_id = data["id"]
        cleanup_response = requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert cleanup_response.status_code == 200
    
    def test_create_user_operator_forbidden(self, operator_token):
        """Test operator cannot create users"""
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            headers={"Authorization": f"Bearer {operator_token}"},
            json={
                "username": "TEST_forbidden_user",
                "password": "testpass123",
                "full_name": "Forbidden User",
                "role": "operator"
            }
        )
        assert response.status_code == 403
    
    def test_update_user_admin(self, admin_token):
        """Test admin can update user"""
        import uuid
        test_username = f"TEST_update_{uuid.uuid4().hex[:8]}"
        
        # Create user first
        create_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "password": "testpass123",
                "full_name": "Original Name",
                "role": "operator"
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Update user
        update_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "full_name": "Updated Name",
                "password": "newpassword123"
            }
        )
        assert update_response.status_code == 200
        
        updated_data = update_response.json()
        assert updated_data["full_name"] == "Updated Name"
        
        # Verify login with new password works
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_username,
            "password": "newpassword123"
        })
        assert login_response.status_code == 200, "Login with new password should work"
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_toggle_user_status(self, admin_token):
        """Test admin can toggle user active status"""
        import uuid
        test_username = f"TEST_toggle_{uuid.uuid4().hex[:8]}"
        
        # Create user
        create_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "password": "testpass123",
                "full_name": "Toggle Test User",
                "role": "operator"
            }
        )
        user_id = create_response.json()["id"]
        
        # Toggle to inactive
        toggle_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}/toggle",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert toggle_response.status_code == 200
        assert toggle_response.json()["is_active"] == False
        
        # Verify inactive user cannot login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_username,
            "password": "testpass123"
        })
        assert login_response.status_code == 401, "Inactive user should not be able to login"
        
        # Toggle back to active
        toggle_response2 = requests.put(
            f"{BASE_URL}/api/users/{user_id}/toggle",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert toggle_response2.status_code == 200
        assert toggle_response2.json()["is_active"] == True
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_delete_user_admin(self, admin_token):
        """Test admin can delete user"""
        import uuid
        test_username = f"TEST_delete_{uuid.uuid4().hex[:8]}"
        
        # Create user
        create_response = requests.post(
            f"{BASE_URL}/api/auth/register",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "username": test_username,
                "password": "testpass123",
                "full_name": "Delete Test User",
                "role": "operator"
            }
        )
        user_id = create_response.json()["id"]
        
        # Delete user
        delete_response = requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_response.status_code == 200
        
        # Verify user is deleted - login should fail
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_username,
            "password": "testpass123"
        })
        assert login_response.status_code == 401


class TestRoleBasedAccess:
    """Test role-based access control for admin-only endpoints"""
    
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
    
    def test_operator_can_access_live_data(self, operator_token):
        """Test operator can access live data endpoints"""
        # Counter data
        response = requests.get(
            f"{BASE_URL}/api/live/counter",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        # Should work (200) or return empty data
        assert response.status_code == 200
        
        # Queue data
        response = requests.get(
            f"{BASE_URL}/api/live/queue",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 200
    
    def test_operator_can_access_reports(self, operator_token):
        """Test operator can access report endpoints"""
        response = requests.get(
            f"{BASE_URL}/api/reports/summary",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 200
    
    def test_operator_cannot_access_users(self, operator_token):
        """Test operator cannot access user management"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        assert response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
