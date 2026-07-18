"""Ecosystem API: tips, exports, marketplace, wallet, invoices."""

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.database import get_db
from app.models.schemas import User
from app.services import ecosystem as eco

router = APIRouter(prefix="/ecosystem", tags=["ecosystem"])


class TipRequest(BaseModel):
    credits: int = Field(ge=1, le=10)
    public_message: str | None = Field(default=None, max_length=200)


class ExportRequest(BaseModel):
    export_type: str = Field(pattern="^(hq_mp3|hq_wav|stems|commercial_license)$")


class RecipeTemplateCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str | None = None
    spec: dict = Field(default_factory=dict)
    price_credits: int = Field(default=0, ge=0, le=50)


class WorkPackCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    work_ids: list[str] = Field(min_length=1, max_length=20)
    price_credits: int = Field(ge=5, le=50)


class InvoiceRequestBody(BaseModel):
    order_id: str
    title: str
    email: str
    tax_id: str | None = None


class SupportTicketBody(BaseModel):
    category: str = Field(default="refund", pattern="^(refund|billing|technical)$")
    subject: str = Field(min_length=2, max_length=255)
    body: str = Field(min_length=10, max_length=2000)
    order_id: str | None = None


class ResolveTicketBody(BaseModel):
    resolution: str = Field(pattern="^(approved|rejected|credits_granted|stripe_refunded)$")
    admin_note: str | None = Field(default=None, max_length=1000)
    credits_compensation: int = Field(default=0, ge=0, le=100)
    attempt_stripe_refund: bool = False


@router.post("/works/{work_id}/tip")
def tip_work(work_id: str, payload: TipRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.tip_creator(
        db,
        user,
        work_id=work_id,
        credits=payload.credits,
        public_message=payload.public_message,
        is_public=bool(payload.public_message),
    )


@router.get("/works/{work_id}/public-tips")
def public_tips_for_work(work_id: str, db: Session = Depends(get_db)):
    return {"tips": eco.list_public_tips_for_work(db, work_id)}


@router.post("/works/{work_id}/export")
def export_work(work_id: str, payload: ExportRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.export_work(db, user, work_id, payload.export_type)


@router.get("/work-packs")
def list_work_packs(db: Session = Depends(get_db)):
    return eco.list_work_packs(db)


@router.get("/users/{username}/work-packs")
def list_user_work_packs(username: str, db: Session = Depends(get_db)):
    return eco.list_work_packs_for_user(db, username=username)


@router.get("/templates")
def list_templates(db: Session = Depends(get_db)):
    return eco.list_recipe_templates(db)


@router.post("/templates")
def create_template(payload: RecipeTemplateCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.create_recipe_template(
        db, user, title=payload.title, description=payload.description, spec=payload.spec, price_credits=payload.price_credits
    )


@router.post("/templates/{template_id}/purchase")
def buy_template(template_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.purchase_recipe_template(db, user, template_id)


@router.post("/work-packs")
def create_work_pack(payload: WorkPackCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.create_paid_work_pack(db, user, title=payload.title, work_ids=payload.work_ids, price_credits=payload.price_credits)


@router.post("/work-packs/{pack_id}/purchase")
def buy_work_pack(pack_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.purchase_work_pack(db, user, pack_id)


@router.get("/wallet")
def get_wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.get_creator_wallet(db, user.id)


@router.get("/member-quotas")
def member_export_quotas(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.get_member_export_quotas(db, user)


@router.get("/exports")
def my_exports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"exports": eco.list_user_exports(db, user.id)}


@router.post("/invoices")
def create_invoice(payload: InvoiceRequestBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return eco.request_invoice(
        db, user, order_id=payload.order_id, title=payload.title, email=payload.email, tax_id=payload.tax_id
    )


@router.get("/invoices")
def my_invoices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"invoices": eco.list_user_invoices(db, user.id)}


@router.get("/support-tickets")
def my_support_tickets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"tickets": eco.list_support_tickets(db, user.id)}


@router.post("/support-tickets")
def create_support_ticket(
    payload: SupportTicketBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return eco.create_support_ticket(
        db,
        user,
        category=payload.category,
        subject=payload.subject,
        body=payload.body,
        order_id=payload.order_id,
    )


@router.get("/admin/support-tickets")
def admin_list_support_tickets(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"tickets": eco.list_open_support_tickets(db)}


@router.post("/admin/support-tickets/{ticket_id}/resolve")
async def admin_resolve_support_ticket(
    ticket_id: str,
    payload: ResolveTicketBody,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    import uuid

    from app.models.schemas import PaymentOrder, SupportTicket
    from app.services.payment_orders import stripe_refund_for_order

    try:
        tid = uuid.UUID(ticket_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid ticket id") from exc
    ticket = db.query(SupportTicket).filter(SupportTicket.id == tid).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    stripe_refund_id = None
    if payload.attempt_stripe_refund and ticket.order_id:
        order = db.query(PaymentOrder).filter(PaymentOrder.out_trade_no == ticket.order_id).first()
        if order:
            refund = await stripe_refund_for_order(order)
            stripe_refund_id = refund.get("refund_id")
            if stripe_refund_id:
                payload.resolution = "stripe_refunded"

    return eco.resolve_support_ticket(
        db,
        tid,
        resolution=payload.resolution,
        admin_note=payload.admin_note,
        credits_compensation=payload.credits_compensation,
        stripe_refund_id=stripe_refund_id,
    )


@router.get("/admin/cn-recurring-waitlist")
def admin_cn_recurring_waitlist(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"entries": eco.list_cn_recurring_waitlist(db)}


@router.post("/challenges/{challenge_id}/distribute-prizes")
def distribute_prizes(challenge_id: str, _admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    import uuid

    try:
        cid = uuid.UUID(challenge_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid challenge id") from exc
    count = eco.distribute_challenge_prizes(db, cid)
    return {"winners_granted": count}
