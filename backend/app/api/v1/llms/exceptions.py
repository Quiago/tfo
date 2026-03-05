from fastapi import HTTPException, status

ModelNotInCatalog = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="El modelo no existe en el catálogo.",
)

ModelNotDownloaded = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="El modelo no está descargado en disco. Revisa los logs del startup.",
)

EngineNotReady = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="El engine LLM no está listo. Puede estar cargando un modelo.",
)

SwapInProgress = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="Ya hay un swap de modelo en progreso. Intenta de nuevo en unos segundos.",
)
