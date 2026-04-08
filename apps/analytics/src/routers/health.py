from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "healthy", "service": "analytics"}


@router.get("/ready")
async def ready() -> dict:
    return {"status": "ready"}
