from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services.dashboard_service import DashboardService
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()

@router.get("/summary")
def get_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return DashboardService.get_sales_summary(db)

@router.get("/sales-chart")
def get_sales_chart(days: int = 7, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return DashboardService.get_sales_by_day(db, days=days)

@router.get("/sales-by-payment")
def get_sales_by_payment(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return DashboardService.get_sales_by_payment(db, days=days)

@router.get("/sales-by-month")
def get_sales_by_month(months: int = 12, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return DashboardService.get_sales_by_month(db, months=months)

@router.get("/top-products")
def get_top_products(limit: int = 5, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return DashboardService.get_top_products(db, limit=limit)
