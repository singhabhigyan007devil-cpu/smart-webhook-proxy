import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from backend.app.limiter import limiter
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import bcrypt
from backend.app.db import get_db
from backend.app.models import User
from backend.app.schemas import AuthRegister, AuthLogin, AuthResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")



@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register_user(request: Request, payload: AuthRegister, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == payload.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_password = get_password_hash(payload.password)
    api_key = f"hs_{uuid.uuid4().hex}"
    
    new_user = User(
        id=str(uuid.uuid4()),
        email=payload.email,
        password_hash=hashed_password,
        api_key=api_key,
        tier="free"
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return AuthResponse(api_key=new_user.api_key, email=new_user.email)

@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login_user(request: Request, payload: AuthLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        
    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        
    return AuthResponse(api_key=user.api_key, email=user.email)


from backend.app.routers.endpoints import get_current_user

@router.get("/me", response_model=AuthResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return AuthResponse(api_key=current_user.api_key, email=current_user.email)


import uuid

@router.post("/rotate-key", response_model=AuthResponse)
@limiter.limit("5/minute")
async def rotate_api_key(request: Request, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Generate new api_key
    new_api_key = str(uuid.uuid4())
    current_user.api_key = new_api_key
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return AuthResponse(api_key=new_api_key, email=current_user.email)
