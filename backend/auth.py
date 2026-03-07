"""Authentication utilities"""
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import secrets
import hashlib

SECRET_KEY = os.environ.get("SECRET_KEY", "vms360-secret-key-change-in-production")
REFRESH_SECRET_KEY = os.environ.get("REFRESH_SECRET_KEY", "vms360-refresh-secret-key")
ALGORITHM = "HS256"

# P1: Token süreleri güncellendi
ACCESS_TOKEN_EXPIRE_MINUTES = 15  # 15 dakika
REFRESH_TOKEN_EXPIRE_DAYS = 7    # 7 gün

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def hash_token(token: str) -> str:
    """Hash refresh token for secure storage"""
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create short-lived access token (15 minutes)"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,
        "type": "access"
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create long-lived refresh token (7 days)"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    # Add unique jti (JWT ID) for token rotation
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_hex(16)
    })
    encoded_jwt = jwt.encode(to_encode, REFRESH_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_refresh_token(token: str) -> Optional[dict]:
    """Decode and validate refresh token"""
    try:
        payload = jwt.decode(token, REFRESH_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None:
            return None
        return {"username": username, "role": role}
    except JWTError:
        return None


async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Giriş gerekli")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        token_type: str = payload.get("type", "access")
        
        if username is None:
            raise HTTPException(status_code=401, detail="Geçersiz token")
        if token_type != "access":
            raise HTTPException(status_code=401, detail="Geçersiz token türü")
        
        return {"username": username, "role": role}
    except JWTError as e:
        # Check if token expired
        if "expired" in str(e).lower():
            raise HTTPException(status_code=401, detail="Token süresi doldu")
        raise HTTPException(status_code=401, detail="Geçersiz token")


async def require_admin(user: dict = Depends(require_auth)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    return user
