from fastapi import HTTPException, status

ConnectorNotFound = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Connector not found",
)

ConnectorAlreadyExists = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="A connector with this ID already exists",
)

ConnectorInactive = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="Connector is inactive",
)

UnsupportedConnectorType = HTTPException(
    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    detail="Unsupported connector type",
)

BackendNotImplemented = HTTPException(
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    detail="This connector backend is not yet implemented",
)

ConnectorUnreachable = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="Could not reach the external system",
)

ConnectorReadError = HTTPException(
    status_code=status.HTTP_502_BAD_GATEWAY,
    detail="Error reading from the external system",
)

ConnectorWriteError = HTTPException(
    status_code=status.HTTP_502_BAD_GATEWAY,
    detail="Error writing to the external system",
)
