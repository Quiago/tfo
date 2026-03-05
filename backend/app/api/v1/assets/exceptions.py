from fastapi import HTTPException, status

AssetNotFound = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
AssetAlreadyExists = HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An asset with this ID already exists")
PropertyNotFound = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found on this asset")
PropertyAlreadyExists = HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A property with this name already exists on this asset")
PropertyNotWritable = HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="This property is marked as read-only")
DiscoveryRequired = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No discovery cache found for this connector. Call POST /connectors/{id}/discover first.")
