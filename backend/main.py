from fastapi import FastAPI
from app.routes.issues import router as issues_router
app = FastAPI()

app.include_router(issues_router)

items = [

]

@app.get("/health")
async def health_check():
    return {"status": "ok"}