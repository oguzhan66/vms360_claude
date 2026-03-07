"""Authentication routes"""
from fastapi import APIRouter, HTTPException, Depends, Response
from typing import List
from datetime import datetime, timezone

from database import db
from models import UserCreate, UserLogin, UserResponse, UserUpdate
from auth import (
    verify_password, get_password_hash, create_access_token, create_refresh_token,
    decode_refresh_token, hash_token, require_auth, require_admin,
    ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login")
async def login(credentials: UserLogin, response: Response):
    """User login - returns access_token and refresh_token"""
    user = await db.users.find_one({"username": credentials.username}, {"_id": 0})
    if not user or not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Hesap devre dışı")
    
    token_data = {"sub": user["username"], "role": user.get("role", "operator")}
    
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)
    
    # Store hashed refresh token in DB for validation/revocation
    await db.refresh_tokens.update_one(
        {"username": user["username"]},
        {
            "$set": {
                "token_hash": hash_token(refresh_token),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc).replace(microsecond=0) + 
                             __import__('datetime').timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
            }
        },
        upsert=True
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # seconds
        "user": {
            "username": user["username"],
            "full_name": user.get("full_name", ""),
            "role": user.get("role", "operator")
        }
    }


@router.post("/refresh")
async def refresh_tokens(refresh_token: str):
    """Get new access token using refresh token"""
    payload = decode_refresh_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş refresh token")
    
    username = payload.get("sub")
    
    # Verify refresh token is in DB and not revoked
    stored = await db.refresh_tokens.find_one({"username": username}, {"_id": 0})
    if not stored or stored.get("token_hash") != hash_token(refresh_token):
        raise HTTPException(status_code=401, detail="Refresh token geçersiz veya iptal edilmiş")
    
    # Get user to ensure still active
    user = await db.users.find_one({"username": username}, {"_id": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Kullanıcı hesabı devre dışı")
    
    token_data = {"sub": username, "role": user.get("role", "operator")}
    
    # Create new tokens (token rotation)
    new_access_token = create_access_token(data=token_data)
    new_refresh_token = create_refresh_token(data=token_data)
    
    # Update stored refresh token
    await db.refresh_tokens.update_one(
        {"username": username},
        {
            "$set": {
                "token_hash": hash_token(new_refresh_token),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc).replace(microsecond=0) + 
                             __import__('datetime').timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()
            }
        }
    )
    
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.post("/logout")
async def logout(user: dict = Depends(require_auth)):
    """Logout - revoke refresh token"""
    await db.refresh_tokens.delete_one({"username": user["username"]})
    return {"message": "Çıkış yapıldı"}


@router.get("/me")
async def get_me(user: dict = Depends(require_auth)):
    """Get current user info with permissions"""
    db_user = await db.users.find_one({"username": user["username"]}, {"_id": 0, "password_hash": 0})
    if not db_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    # Add computed permissions
    from permissions import get_user_permissions_summary
    permissions = await get_user_permissions_summary(user)
    db_user["permissions"] = permissions
    
    return db_user


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, current_user: dict = Depends(require_admin)):
    """Register new user (Admin only)"""
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanımda")
    
    import uuid
    user_dict = {
        "id": str(uuid.uuid4()),
        "username": user_data.username,
        "password_hash": get_password_hash(user_data.password),
        "full_name": user_data.full_name,
        "role": user_data.role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "allowed_region_ids": user_data.allowed_region_ids,
        "allowed_city_ids": user_data.allowed_city_ids,
        "allowed_store_ids": user_data.allowed_store_ids
    }
    await db.users.insert_one(user_dict)
    return UserResponse(**user_dict)


# User management routes (could be in separate users router)
users_router = APIRouter(prefix="/users", tags=["Users"])


@users_router.get("", response_model=List[UserResponse])
async def get_users(user: dict = Depends(require_admin)):
    """Get all users (Admin only)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return users


@users_router.delete("/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_admin)):
    """Delete user (Admin only)"""
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return {"message": "Kullanıcı silindi"}


@users_router.put("/{user_id}/toggle")
async def toggle_user(user_id: str, user: dict = Depends(require_admin)):
    """Toggle user active status (Admin only)"""
    db_user = await db.users.find_one({"id": user_id})
    if not db_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    new_status = not db_user.get("is_active", True)
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": new_status}})
    return {"message": "Durum güncellendi", "is_active": new_status}


@users_router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, user_data: UserUpdate, current_user: dict = Depends(require_admin)):
    """Update user (Admin only)"""
    db_user = await db.users.find_one({"id": user_id})
    if not db_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    
    update_data = {}
    if user_data.full_name is not None:
        update_data["full_name"] = user_data.full_name
    if user_data.role is not None:
        update_data["role"] = user_data.role
    if user_data.password is not None:
        update_data["password_hash"] = get_password_hash(user_data.password)
    if user_data.allowed_region_ids is not None:
        update_data["allowed_region_ids"] = user_data.allowed_region_ids
    if user_data.allowed_city_ids is not None:
        update_data["allowed_city_ids"] = user_data.allowed_city_ids
    if user_data.allowed_store_ids is not None:
        update_data["allowed_store_ids"] = user_data.allowed_store_ids
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return UserResponse(**updated_user)
