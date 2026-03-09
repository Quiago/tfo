from fastapi import HTTPException, status

DocumentNotFound = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
UnsupportedFileType = HTTPException(
    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    detail="Unsupported file type. Allowed: txt, md, rst, csv, tsv, json, yaml, xml, pdf, docx, pptx, xlsx, xls, html, rtf, epub.",
)
