import logging

from sqlmodel import Session, select

from app.api.v1.auth import exceptions
from app.api.v1.auth.schemas import PreferencesUpdate, UserLogin, UserRegister
from app.core import security
from app.models.user import User

logger = logging.getLogger(__name__)


def get_user_by_email(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email)).first()


def get_user_by_id(session: Session, user_id: int) -> User | None:
    return session.get(User, user_id)


def register(session: Session, data: UserRegister) -> User:
    if get_user_by_email(session, data.email):
        logger.warning("register_failed_duplicate", extra={"email": data.email})
        raise exceptions.UserAlreadyExists
    user = User(email=data.email, hashed_password=security.hash_password(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    logger.info("user_registered", extra={"id": user.id})
    return user


def login(session: Session, data: UserLogin) -> str:
    user = get_user_by_email(session, data.email)
    if not user or not security.verify_password(data.password, user.hashed_password):
        logger.warning("login_failed_invalid_credentials", extra={"email": data.email})
        raise exceptions.InvalidCredentials
    if not user.is_active:
        logger.warning("login_failed_inactive_user", extra={"email": data.email})
        raise exceptions.InactiveUser
    logger.info("user_logged_in", extra={"user_id": user.id})
    return security.create_access_token(user.id)


def update_preferences(session: Session, user: User, data: PreferencesUpdate) -> User:
    # Only update fields that were explicitly included in the request payload
    if "preferred_connector_id" in data.model_fields_set:
        user.preferred_connector_id = data.preferred_connector_id
    if "platform_mode" in data.model_fields_set and data.platform_mode is not None:
        user.platform_mode = data.platform_mode
    session.add(user)
    session.commit()
    session.refresh(user)
    logger.info("user_preferences_updated", extra={"user_id": user.id})
    return user


def delete_user(session: Session, user_id: int, current_user: User) -> None:
    if current_user.id != user_id:
        logger.warning("delete_user_forbidden", extra={"user_id": user_id})
        raise exceptions.NotAuthorized
    user = get_user_by_id(session, user_id)
    if not user:
        raise exceptions.UserNotFound
    session.delete(user)
    session.commit()
    logger.info("user_deleted", extra={"user_id": user_id})
