from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.api.v1.auth import schemas, service
from app.api.v1.auth.dependencies import get_current_user
from app.db.engine import get_session
from app.models.user import User

router = APIRouter()


@router.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register(data: schemas.UserRegister, session: Session = Depends(get_session)):
    return service.register(session, data)


@router.post("/login", response_model=schemas.TokenResponse)
def login(data: schemas.UserLogin, session: Session = Depends(get_session)):
    token = service.login(session, data)
    return schemas.TokenResponse(access_token=token)


@router.get("/me", response_model=schemas.UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """Returns the currently authenticated user's profile."""
    return current_user


@router.get("/logout", status_code=status.HTTP_200_OK)
def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Successfully logged out."}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    service.delete_user(session, user_id, current_user)
