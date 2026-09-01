from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.purchase import Purchase, PurchaseCreate
from app.services.purchase_service import PurchaseService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[Purchase])
def read_purchases(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return PurchaseService.get_purchases(
        db, skip=skip, limit=limit,
        start_date=start_date, end_date=end_date
    )

@router.post("/", response_model=Purchase)
def create_purchase(
    purchase: PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return PurchaseService.create_purchase(db, purchase=purchase, user_id=current_user.id)

