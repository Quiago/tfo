from fastapi import HTTPException, status

UserAlreadyExists = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="A user with this email already exists.",
)

InvalidCredentials = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid email or password.",
    headers={"WWW-Authenticate": "Bearer"},
)

InvalidToken = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials.",
    headers={"WWW-Authenticate": "Bearer"},
)

UserNotFound = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="User not found.",
)

InactiveUser = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Inactive user.",
)

NotAuthorized = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Not authorized to perform this action.",
)
