from fastapi import HTTPException, status

DocumentNotFound = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
UnsupportedFileType = HTTPException(
    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    detail="Unsupported file type. Allowed: text/plain, text/markdown, application/pdf.",
)
