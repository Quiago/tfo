from fastapi import HTTPException, status

ConversationNotFound = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Conversation not found",
)

ConversationAccessDenied = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Access denied to this conversation",
)

ModelNotReady = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="No LLM model loaded. Call POST /llms/load first.",
)

MemoryNotFound = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Memory entry not found",
)

MemoryAccessDenied = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Access denied to this memory entry",
)
