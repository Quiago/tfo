import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.api.v1.auth.exceptions import InactiveUser, InvalidToken, UserNotFound
from app.core import security
from app.db.engine import get_session
from app.models.user import User

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    try:
        user_id = security.decode_token(credentials.credentials)
    except jwt.PyJWTError:
        raise InvalidToken
    user = session.get(User, user_id)
    if not user:
        raise UserNotFound
    if not user.is_active:
        raise InactiveUser
    return user
