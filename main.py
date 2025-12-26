import ast
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Float, Integer, Text, ForeignKey, DateTime, case
from sqlalchemy.orm import sessionmaker, declarative_base, Session, relationship
import os
import logging
import json
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import uuid
import random
import string
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy import func
import math
import qrcode
from fastapi.staticfiles import StaticFiles
from sqlalchemy import JSON

IST = timezone(timedelta(hours=5, minutes=30))

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database Configuration
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://root:143%40Vinay@localhost/chinaligths")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

class UserModel(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="store_handler")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(IST))


class CategoryModel(Base):
    __tablename__ = "categories"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(IST))
    
    products = relationship("ProductModel", back_populates="category")

class ProductModel(Base):
    __tablename__ = "products"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    product_code = Column(String(50), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    category_id = Column(String(36), ForeignKey("categories.id"), nullable=False)

    # 💰 Pricing
    cost_price = Column(Float, nullable=False)
    min_selling_price = Column(Float, nullable=False)
    selling_price = Column(Float, nullable=False)
    qr_code_url = Column(String(255), nullable=True)
    images = Column(JSON, nullable=True)
    # 📦 Stock
    stock = Column(Integer, nullable=False, default=0)
    min_stock = Column(Integer, nullable=False, default=5)

    sku = Column(String(100), nullable=False, unique=True)
    image_url = Column(String(500), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(IST),
        nullable=False
    )

    category = relationship("CategoryModel", back_populates="products")

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(String(36), primary_key=True)  # UUID REQUIRED
    product_id = Column(String(36), ForeignKey("products.id"))
    type = Column(String(3))
    quantity = Column(Integer)
    source = Column(String(50))
    reason = Column(String(255))
    created_by = Column(String(36))
    created_at = Column(DateTime, default=lambda: datetime.now(IST))

    stock_before = Column(Integer, nullable=False, default=0)
    stock_after = Column(Integer, nullable=False, default=0)


class CustomerModel(Base):
    __tablename__ = "customers"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(IST))
    
    invoices = relationship("InvoiceModel", back_populates="customer")

class InvoiceModel(Base):
    __tablename__ = "invoices"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_number = Column(String(50), nullable=False, unique=True, index=True)
    customer_id = Column(String(36), ForeignKey("customers.id"), nullable=False)
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(50), nullable=True)
    customer_address = Column(Text, nullable=True)
    items = Column(Text, nullable=False)  # Store as JSON string
    subtotal = Column(Float, nullable=False)
    gst_amount = Column(Float, nullable=False, default=0)
    discount = Column(Float, nullable=False, default=0)
    total = Column(Float, nullable=False)
    payment_status = Column(String(50), nullable=False, default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(IST))
    customer = relationship("CustomerModel", back_populates="invoices") # FIX: Should be back_populates="invoices" if relationship is defined in CustomerModel

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

api_router = APIRouter(prefix="/api")

SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(IST) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def generate_product_code():
    date_part = datetime.now(IST).strftime("%Y%m%d")
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"PRD-{date_part}-{rand}"

def generate_qr(data: dict):
    os.makedirs("static/qr", exist_ok=True)

    qr_text = json.dumps(data, separators=(",", ":"))  # compact JSON
    filename = f"{uuid.uuid4().hex}.png"
    filepath = f"static/qr/{filename}"

    qr = qrcode.QRCode(
        version=None,  # auto-size
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=8,
        border=2,
    )
    qr.add_data(qr_text)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img.save(filepath)

    return f"/static/qr/{filename}"

# Fixed get_current_user to properly handle JWT token errors
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        if not credentials:
            raise credentials_exception
            
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError as e:
        raise credentials_exception
    
    user = db.query(UserModel).filter(UserModel.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# Duplicate function removed to avoid conflict
# def generate_product_code():
#     date_part = datetime.now(IST).strftime("%Y%m%d")
#     rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
#     return f"PRD-{date_part}-{rand}"

# Pydantic Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "store_handler"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class Category(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_at: str

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None

class Product(BaseModel):
    id: str
    product_code: str
    name: str
    description: Optional[str] = None
    category_id: str
    category_name: Optional[str] = None
    cost_price: Optional[float] = None
    min_selling_price: float
    selling_price: float
    stock: int
    min_stock: int
    sku: str
    image_url: Optional[str] = None
    created_at: str
    qr_code_url: Optional[str] = None
    images: Optional[List[str]] = []


class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: str

    cost_price: float
    min_selling_price: float
    selling_price: float

    stock: int
    min_stock: int = 5

    sku: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = []  # max 5


class Customer(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    created_at: str

class CustomerCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None

class InvoiceItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    gst_rate: float
    total: float
    sku: Optional[str] = None

class Invoice(BaseModel):
    id: str
    invoice_number: str
    customer_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    items: List[InvoiceItem]
    subtotal: float
    gst_amount: float
    discount: float
    total: float
    payment_status: str
    created_at: str

class InvoiceCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: Optional[str] = None
    customer_email: str
    customer_address: Optional[str] = None
    items: List[InvoiceItem]
    gst_amount: float = 0
    discount: float = 0
    payment_status: str = "pending"

class DashboardStats(BaseModel):
    total_sales: float
    total_orders: int
    total_customers: int
    low_stock_items: int
    recent_invoices: List[Invoice]

class SalesChartItem(BaseModel):
    name: str
    total: float
    paid: float
    pending: float
    overdue: float

class MaterialInwardRequest(BaseModel):
    product_id: str
    quantity: int

class MaterialOutwardRequest(BaseModel):
    product_id: str
    quantity: int
    reason: str

# ---------------- STATUS UPDATE SCHEMA ----------------
class InvoiceStatusUpdate(BaseModel):
    payment_status: str


class InventoryTransactionResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    product_code: str
    type: str
    quantity: int
    source: Optional[str]
    reason: Optional[str]
    created_by: Optional[str]
    created_at: str

    # ✅ BANK STATEMENT FIELD
    remaining_stock: int


# API Routes
# ================= REGISTER =================
@api_router.post("/auth/register", response_model=Token)
def register(
    user_data: UserRegister,
    db: Session = Depends(get_db)
):
    existing_user = (
        db.query(UserModel)
        .filter(UserModel.email == user_data.email)
        .first()
    )
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(user_data.password)

    new_user = UserModel(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        password=hashed_password,
        created_at=datetime.now(IST)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    access_token = create_access_token(
        data={
            "sub": new_user.email,
            "role": new_user.role
        }
    )

    user = User(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        role=new_user.role,
        created_at=new_user.created_at.isoformat()
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user
    )

# ================= LOGIN =================
@api_router.post("/auth/login", response_model=Token)
def login(
    user_data: UserLogin,
    db: Session = Depends(get_db)
):
    user = (
        db.query(UserModel)
        .filter(UserModel.email == user_data.email)
        .first()
    )

    if not user or not verify_password(
        user_data.password,
        user.password
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(
        data={
            "sub": user.email,
            "role": user.role
        }
    )

    user_obj = User(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at.isoformat()
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_obj
    )

@api_router.get("/categories", response_model=List[Category])
def get_categories(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    categories = db.query(CategoryModel).all()
    return [
        Category(
            id=cat.id,
            name=cat.name,
            description=cat.description,
            created_at=cat.created_at.isoformat()
        )
        for cat in categories
    ]

@api_router.post("/categories", response_model=Category)
def create_category(
    category_data: CategoryCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_category = CategoryModel(
        id=str(uuid.uuid4()),
        name=category_data.name,
        description=category_data.description,
        created_at=datetime.now(IST)
    )
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    
    return Category(
        id=new_category.id,
        name=new_category.name,
        description=new_category.description,
        created_at=new_category.created_at.isoformat()
    )

@api_router.delete("/categories/{category_id}")
def delete_category(
    category_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    category = db.query(CategoryModel).filter(CategoryModel.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    db.delete(category)
    db.commit()
    return {"message": "Category deleted successfully"}
@api_router.get("/products")
def get_products(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    products = db.query(ProductModel).all()
    result = []

    for prod in products:
        data = {
            "id": prod.id,
            "product_code": prod.product_code,
            "name": prod.name,
            "description": prod.description,

            "category_id": prod.category_id,
            "category_name": prod.category.name if prod.category else "Unknown",

            "selling_price": prod.selling_price,
            "min_selling_price": prod.min_selling_price,

            "stock": prod.stock,
            "min_stock": prod.min_stock,

            "sku": prod.sku,
            "image_url": prod.image_url,
            "images": prod.images or [],

            "qr_code_url": prod.qr_code_url,   # ✅ IMPORTANT
            "created_at": prod.created_at.isoformat(),
        }

        # 🔐 ADMIN ONLY
        if current_user.role == "admin":
            data["cost_price"] = prod.cost_price

        result.append(data)

    return result

# -------- MATERIAL INWARD --------

@api_router.post("/inventory/material-inward")
def material_inward(
    request: MaterialInwardRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if request.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

    product = db.query(ProductModel).filter(ProductModel.id == request.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # ✅ BANK STATEMENT LOGIC
    stock_before = product.stock
    stock_after = stock_before + request.quantity

    # update product stock
    product.stock = stock_after

    txn = InventoryTransaction(
        id=str(uuid.uuid4()),
        product_id=request.product_id,
        type="IN",
        quantity=request.quantity,
        source="MATERIAL_INWARD",
        reason=None,
        stock_before=stock_before,
        stock_after=stock_after,
        created_by=current_user.id,
        created_at=datetime.now(),
    )

    db.add(txn)
    db.commit()

    return {
        "message": "Material inward added successfully",
        "stock_before": stock_before,
        "stock_after": stock_after,
    }
# -------- MATERIAL OUTWARD --------
@api_router.post("/inventory/material-outward")
def material_outward(
    request: MaterialOutwardRequest,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if request.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")

    product = db.query(ProductModel).filter(ProductModel.id == request.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.stock < request.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Available: {product.stock}, Requested: {request.quantity}"
        )

    # ✅ BANK STATEMENT LOGIC
    stock_before = product.stock
    stock_after = stock_before - request.quantity

    # update product stock
    product.stock = stock_after

    txn = InventoryTransaction(
        id=str(uuid.uuid4()),
        product_id=request.product_id,
        type="OUT",
        quantity=request.quantity,
        source="MATERIAL_OUTWARD",
        reason=request.reason,
        stock_before=stock_before,
        stock_after=stock_after,
        created_by=current_user.id,
        created_at=datetime.now(),
    )

    db.add(txn)
    db.commit()

    return {
        "message": "Material outward added successfully",
        "stock_before": stock_before,
        "stock_after": stock_after,
    }
@api_router.get("/inventory/transactions")
def get_inventory_transactions(
    page: int = 1,
    limit: int = 30,
    product_id: Optional[str] = None,
    type: Optional[str] = None,
    days: Optional[int] = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    offset = (page - 1) * limit

    base_query = db.query(InventoryTransaction, ProductModel).join(
        ProductModel,
        InventoryTransaction.product_id == ProductModel.id
    )

    if product_id:
        base_query = base_query.filter(
            InventoryTransaction.product_id == product_id
        )

    if type in ["IN", "OUT"]:
        base_query = base_query.filter(
            InventoryTransaction.type == type
        )

    if days:
        start = datetime.now(IST) - timedelta(days=days)
        base_query = base_query.filter(
            InventoryTransaction.created_at >= start
        )

    total = base_query.count()

    transactions = (
        base_query
        .order_by(InventoryTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "data": [
            InventoryTransactionResponse(
                id=txn.id,
                product_id=txn.product_id,
                product_name=prod.name,
                product_code=prod.product_code,
                type=txn.type,
                quantity=txn.quantity,
                source=txn.source,
                reason=txn.reason,
                created_by=txn.created_by,
                created_at=txn.created_at.isoformat(),
                remaining_stock=txn.stock_after,
            )
            for txn, prod in transactions
        ],
        "total": total,
        "page": page,
        "limit": limit
    }
@api_router.post("/products", response_model=Product, status_code=201)
def create_product(
    product_data: ProductCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 🔐 ADMIN ONLY
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    # 💰 PRICE VALIDATION
    if product_data.selling_price < product_data.min_selling_price:
        raise HTTPException(
            status_code=400,
            detail="Selling price cannot be below minimum selling price"
        )

    # 🖼️ IMAGE LIMIT
    if product_data.images and len(product_data.images) > 5:
        raise HTTPException(
            status_code=400,
            detail="Maximum 5 images allowed"
        )

    # 🆔 AUTO CODES
    product_code = generate_product_code()
    sku = product_data.sku or f"SKU-{uuid.uuid4().hex[:8].upper()}"

    # 🔳 QR PAYLOAD (ONLY REQUIRED FIELDS)
    qr_payload = {
        "sku": sku,
        "name": product_data.name,
        "price": product_data.selling_price
    }

    qr_code_url = generate_qr(qr_payload)

    # 📦 CREATE PRODUCT
    new_product = ProductModel(
        id=str(uuid.uuid4()),
        product_code=product_code,
        name=product_data.name,
        description=product_data.description,
        category_id=product_data.category_id,

        cost_price=product_data.cost_price,
        min_selling_price=product_data.min_selling_price,
        selling_price=product_data.selling_price,

        stock=product_data.stock,
        min_stock=product_data.min_stock,

        sku=sku,
        image_url=product_data.image_url,
        images=product_data.images or [],

        qr_code_url=qr_code_url,
        created_at=datetime.now(IST)
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    # 📤 RESPONSE
    return Product(
        id=new_product.id,
        product_code=new_product.product_code,
        name=new_product.name,
        description=new_product.description,
        category_id=new_product.category_id,
        category_name=new_product.category.name if new_product.category else "Unknown",

        cost_price=new_product.cost_price,
        min_selling_price=new_product.min_selling_price,
        selling_price=new_product.selling_price,

        stock=new_product.stock,
        min_stock=new_product.min_stock,

        sku=new_product.sku,
        image_url=new_product.image_url,
        images=new_product.images,
        qr_code_url=new_product.qr_code_url,

        created_at=new_product.created_at.isoformat()
    )


@api_router.put("/products/{product_id}", response_model=Product)
def update_product(
    product_id: str,
    product_data: ProductCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    product.name = product_data.name
    product.description = product_data.description
    product.category_id = product_data.category_id
    product.sku = product_data.sku
    product.image_url = product_data.image_url

    product.cost_price = product_data.cost_price
    product.min_selling_price = product_data.min_selling_price
    product.selling_price = product_data.selling_price

    product.stock = product_data.stock
    product.min_stock = product_data.min_stock

    db.commit()
    db.refresh(product)

    return Product(
        id=product.id,
        product_code=product.product_code,
        name=product.name,
        description=product.description,
        category_id=product.category_id,
        category_name=product.category.name if product.category else "Unknown",
        cost_price=product.cost_price,
        min_selling_price=product.min_selling_price,
        selling_price=product.selling_price,
        stock=product.stock,
        min_stock=product.min_stock,
        sku=product.sku,
        image_url=product.image_url,
        created_at=product.created_at.isoformat()
    )

@api_router.delete("/products/{product_id}")
def delete_product(
    product_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    db.delete(product)
    db.commit()
    return {"message": "Product deleted successfully"}

@api_router.get("/customers", response_model=List[Customer])
def get_customers(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    customers = db.query(CustomerModel).all()
    return [
        Customer(
            id=cust.id,
            name=cust.name,
            email=cust.email,
            phone=cust.phone,
            address=cust.address,
            created_at=cust.created_at.isoformat()
        )
        for cust in customers
    ]

@api_router.post("/customers", response_model=Customer)
def create_customer(
    customer_data: CustomerCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_customer = CustomerModel(
        id=str(uuid.uuid4()),
        name=customer_data.name,
        email=customer_data.email,
        phone=customer_data.phone,
        address=customer_data.address,
        created_at=datetime.now(IST)
    )
    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)
    
    return Customer(
        id=new_customer.id,
        name=new_customer.name,
        email=new_customer.email,
        phone=new_customer.phone,
        address=new_customer.address,
        created_at=new_customer.created_at.isoformat()
    )

@api_router.get("/customers/{customer_id}", response_model=Customer)
def get_customer(
    customer_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    customer = db.query(CustomerModel).filter(CustomerModel.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return Customer(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        address=customer.address,
        created_at=customer.created_at.isoformat()
    )

def generate_invoice_number(db: Session):
    now = datetime.now(IST) # Changed to IST
    fy_year = now.year if now.month >= 4 else now.year - 1
    fy_suffix = f"{fy_year % 100:02d}-{(fy_year + 1) % 100:02d}"
    
    # Count invoices in current FY
    start_date = datetime(fy_year, 4, 1, tzinfo=IST) # Changed to IST
    count = db.query(InvoiceModel).filter(
        InvoiceModel.created_at >= start_date
    ).count()
    
    return f"INV-{fy_suffix}-{count + 1:04d}"

def parse_invoice_items(raw_items):
    """
    Safely parse invoice items from DB.
    Supports:
    - New JSON format
    - Old Python string format
    """
    if not raw_items:
        return []

    try:
        return json.loads(raw_items)          # New invoices
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(raw_items)  # Old invoices (SAFE)
        except Exception:
            return []
# Fixed get_invoices to include JWT authentication and use json instead of eval

@api_router.get("/invoices")
def get_invoices(
    page: int = 1,
    limit: int = 10,
    status: Optional[str] = None,   # paid | overdue | ending | cancelled
    range: Optional[str] = None,    # last10 | last30
    month: Optional[str] = None,    # YYYY-MM
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(InvoiceModel)

    # ================= TIME SETUP (CRITICAL FIX) =================
    now = datetime.now(IST) # Changed to IST

    start_of_today = datetime(
        now.year, now.month, now.day,
        tzinfo=IST # Changed to IST
    )

    end_of_today = start_of_today + timedelta(days=1)

    # ================= STATUS FILTER =================
    if status == "paid":
        query = query.filter(InvoiceModel.payment_status == "paid")

    elif status == "cancelled":
        query = query.filter(InvoiceModel.payment_status == "cancelled")

    elif status == "overdue":
        query = query.filter(
            InvoiceModel.payment_status != "paid",
            InvoiceModel.created_at < start_of_today # Changed to created_at for overdue check
        )

    elif status == "ending":
        query = query.filter(
            InvoiceModel.payment_status != "paid",
            InvoiceModel.created_at.between( # Changed to created_at for ending check
                start_of_today,
                start_of_today + timedelta(days=5)
            )
        )

    # ================= DATE RANGE FILTER =================
    if range == "last10":
        query = query.filter(
            InvoiceModel.created_at >= start_of_today - timedelta(days=9)
        )

    elif range == "last30":
        query = query.filter(
            InvoiceModel.created_at >= start_of_today - timedelta(days=29)
        )

    # ================= MONTH FILTER =================
    if month:
        year, month_num = map(int, month.split("-"))

        start_date = datetime(
            year, month_num, 1, 0, 0, 0,
            tzinfo=IST # Changed to IST
        )
        end_date = start_date + timedelta(days=31)

        query = query.filter(
            InvoiceModel.created_at.between(start_date, end_date)
        )

    # ================= PAGINATION =================
    total = query.count()

    invoices = (
        query
        .order_by(InvoiceModel.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # ================= RESPONSE =================
    return {
        "data": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "customer_id": inv.customer_id,
                "customer_name": inv.customer_name,
                "customer_phone": inv.customer_phone,
                "customer_address": inv.customer_address,
                "items": parse_invoice_items(inv.items),
                "subtotal": inv.subtotal,
                "gst_amount": inv.gst_amount,
                "discount": inv.discount,
                "total": inv.total,
                "payment_status": inv.payment_status,
                "created_at": inv.created_at.isoformat(),
            }
            for inv in invoices
        ],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": math.ceil(total / limit)
        }
    }
@api_router.post("/invoices", response_model=Invoice)
def create_invoice(
    invoice_data: InvoiceCreate,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ================= CUSTOMER =================
    customer = None

    if invoice_data.customer_id:
        customer = db.query(CustomerModel).filter(
            CustomerModel.id == invoice_data.customer_id
        ).first()

    elif invoice_data.customer_phone:
        customer = db.query(CustomerModel).filter(
            CustomerModel.phone == invoice_data.customer_phone
        ).first()

    if not customer:
        customer = CustomerModel(
            id=str(uuid.uuid4()),
            name=invoice_data.customer_name,
            email=invoice_data.customer_email,
            phone=invoice_data.customer_phone,
            address=invoice_data.customer_address,
            created_at=datetime.now(IST)
        )
        db.add(customer)
        db.flush()

    # ================= ITEMS =================
    invoice_items = []
    subtotal = 0

    for item in invoice_data.items:
        if item.sku:
            product = (
                db.query(ProductModel)
                .filter(ProductModel.sku == item.sku)
                .with_for_update()
                .first()
            )
        else:
            product = (
                db.query(ProductModel)
                .filter(ProductModel.id == item.product_id)
                .with_for_update()
                .first()
            )

        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product not found"
            )

        stock_before = product.stock
        stock_after = stock_before - item.quantity

        if stock_after < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.name}"
            )

        # 💰 DB PRICE (TRUSTED)
        price = product.selling_price
        line_total = price * item.quantity
        subtotal += line_total

        product.stock = stock_after

        # 🧾 INVENTORY LEDGER
        db.add(InventoryTransaction(
            id=str(uuid.uuid4()),
            product_id=product.id,
            type="OUT",
            quantity=item.quantity,
            source="INVOICE",
            reason="Invoice Sale",
            stock_before=stock_before,
            stock_after=stock_after,
            created_by=current_user.id,
            created_at=datetime.now(IST)
        ))

        invoice_items.append({
            "product_id": product.id,
            "sku": product.sku,
            "product_name": product.name,
            "quantity": item.quantity,
            "price": price,
            "total": line_total
        })

    # ================= INVOICE =================
    total = subtotal + invoice_data.gst_amount - invoice_data.discount
    invoice_number = generate_invoice_number(db)

    invoice = InvoiceModel(
        id=str(uuid.uuid4()),
        invoice_number=invoice_number,
        customer_id=customer.id,
        customer_name=customer.name,
        customer_phone=customer.phone,
        customer_address=customer.address,
        items=json.dumps(invoice_items),
        subtotal=subtotal,
        gst_amount=invoice_data.gst_amount,
        discount=invoice_data.discount,
        total=total,
        payment_status=invoice_data.payment_status,
        created_at=datetime.now(IST)
    )

    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    return Invoice(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        customer_id=invoice.customer_id,
        customer_name=invoice.customer_name,
        customer_phone=invoice.customer_phone,
        customer_address=invoice.customer_address,
        items=invoice_items,
        subtotal=subtotal,
        gst_amount=invoice.gst_amount,
        discount=invoice.discount,
        total=invoice.total,
        payment_status=invoice.payment_status,
        created_at=invoice.created_at.isoformat()
    )


@api_router.get("/customers/search")
def search_customer_by_phone(
    phone: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    customer = db.query(CustomerModel).filter(CustomerModel.phone == phone).first()

    if not customer:
        return None

    return Customer(
        id=customer.id,
        name=customer.name,
        email=customer.email,
        phone=customer.phone,
        address=customer.address,
        created_at=customer.created_at.isoformat()
    )

@api_router.get("/products/list")
def list_products(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    products = db.query(ProductModel).all()
    return [
        {
            "id": prod.id,
            "product_code": prod.product_code,
            "name": prod.name,
            "sku": prod.sku,
            "stock": prod.stock,
            "min_stock": prod.min_stock,
            "category_name": prod.category.name if prod.category else "Unknown",
        }
        for prod in products
    ]


@api_router.patch("/invoices/{invoice_id}/status")
def update_invoice_status(
    invoice_id: str,
    payment_status: str,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoice = db.query(InvoiceModel).filter(InvoiceModel.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice.payment_status = payment_status
    db.commit()
    return {"message": "Invoice status updated successfully"}

# Re-defining parse_invoice_items to ensure it's available if called before the get_invoices endpoint.
# This is a workaround for potential ordering issues if not explicitly handled.
def parse_invoice_items(raw_items):
    if not raw_items:
        return []
    try:
        return json.loads(raw_items)          # New invoices
    except json.JSONDecodeError:
        try:
            return ast.literal_eval(raw_items)  # Old invoices (SAFE)
        except Exception:
            return []
@api_router.get("/dashboard")
def get_dashboard_stats(
    filter: str = "today",
    year: int | None = None,
    month: int | None = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now = datetime.now(IST)

    # ---------- DATE RANGE ----------
    if filter == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now

    elif filter == "yesterday":
        y = now - timedelta(days=1)
        start = y.replace(hour=0, minute=0, second=0, microsecond=0)
        end = y.replace(hour=23, minute=59, second=59, microsecond=999999)

    elif filter == "last_10_days":
        start = now - timedelta(days=10)
        end = now

    elif filter == "last_30_days":
        start = now - timedelta(days=30)
        end = now

    elif filter == "month":
        if not year or not month:
            raise HTTPException(status_code=400, detail="Year and month required")

        start = datetime(year, month, 1, tzinfo=IST) # Changed to IST
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=IST) # Changed to IST
        else:
            end = datetime(year, month + 1, 1, tzinfo=IST) # Changed to IST

    else:
        raise HTTPException(status_code=400, detail="Invalid filter")

    invoice_q = db.query(InvoiceModel).filter(
        InvoiceModel.payment_status == "paid",
        InvoiceModel.created_at >= start,
        InvoiceModel.created_at < end
    )

    total_sales = invoice_q.with_entities(
        func.coalesce(func.sum(InvoiceModel.total), 0)
    ).scalar()

    total_orders = invoice_q.count()

    total_customers = invoice_q.with_entities(
        func.count(func.distinct(InvoiceModel.customer_id))
    ).scalar()

    low_stock = db.query(ProductModel).filter(
        ProductModel.stock <= ProductModel.min_stock
    ).count()

    return {
        "total_sales": float(total_sales),
        "total_orders": total_orders,
        "total_customers": total_customers,
        "low_stock_items": low_stock
    }

@api_router.get("/dashboard/today")
def dashboard_today(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now = datetime.now(IST)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    invoices_today = db.query(InvoiceModel).filter(
        InvoiceModel.created_at >= start
    ).count()

    items_sold_today = db.query(
        func.coalesce(func.sum(InventoryTransaction.quantity), 0)
    ).filter(
        InventoryTransaction.type == "OUT",
        InventoryTransaction.created_at >= start
    ).scalar()

    new_customers = db.query(CustomerModel).filter(
        CustomerModel.created_at >= start
    ).count()

    inventory_out = db.query(InventoryTransaction).filter(
        InventoryTransaction.type == "OUT",
        InventoryTransaction.created_at >= start
    ).count()

    return {
        "invoices_today": invoices_today,
        "items_sold_today": int(items_sold_today or 0),
        "inventory_out_today": inventory_out,
        "new_customers_today": new_customers
    }

@api_router.get("/dashboard/low-stock")
def low_stock_products(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    products = db.query(ProductModel).filter(
        ProductModel.stock <= ProductModel.min_stock
    ).order_by(ProductModel.stock.asc()).limit(10).all()

    return [
        {
            "product_name": p.name,
            "stock": p.stock,
            "min_stock": p.min_stock
        }
        for p in products
    ]

@api_router.get("/dashboard/top-products")
def top_products(
    limit: int = 5,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    results = (
        db.query(
            ProductModel.name,
            func.sum(InventoryTransaction.quantity).label("qty")
        )
        .join(ProductModel, ProductModel.id == InventoryTransaction.product_id)
        .filter(InventoryTransaction.type == "OUT")
        .group_by(ProductModel.name)
        .order_by(func.sum(InventoryTransaction.quantity).desc())
        .limit(limit)
        .all()
    )

    return [
        { "name": r.name, "quantity": int(r.qty or 0) }
        for r in results
    ]

@api_router.get("/dashboard/inventory-movement")
def inventory_movement(
    days: int = 7,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start = datetime.now(IST) - timedelta(days=days)

    results = (
        db.query(
            func.date(InventoryTransaction.created_at).label("day"),
            func.sum(case((InventoryTransaction.type == "IN", InventoryTransaction.quantity), else_=0)).label("inward"),
            func.sum(case((InventoryTransaction.type == "OUT", InventoryTransaction.quantity), else_=0)).label("outward"),
        )
        .filter(InventoryTransaction.created_at >= start)
        .group_by("day")
        .order_by("day")
        .all()
    )

    return [
        {
            "day": r.day.strftime("%d %b"),
            "inward": int(r.inward or 0),
            "outward": int(r.outward or 0)
        }
        for r in results
    ]

@api_router.get("/dashboard/activity")
def dashboard_activity(
    limit: int = 10,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoices = (
        db.query(InvoiceModel)
        .order_by(InvoiceModel.created_at.desc())
        .limit(limit)
        .all()
    )

    inventory = (
        db.query(InventoryTransaction, ProductModel)
        .join(ProductModel)
        .order_by(InventoryTransaction.created_at.desc())
        .limit(limit)
        .all()
    )

    activity = []

    for inv in invoices:
        activity.append({
            "type": "invoice",
            "text": f"Invoice {inv.invoice_number} – ₹{inv.total}",
            "date": inv.created_at.isoformat()
        })

    for txn, prod in inventory:
        activity.append({
            "type": "inventory",
            "text": f"{txn.type} – {prod.name} ({txn.quantity})",
            "date": txn.created_at.isoformat()
        })

    return sorted(activity, key=lambda x: x["date"], reverse=True)[:limit]

@api_router.get("/dashboard/hourly-sales")
def hourly_sales_today(
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 🔹 Use local server time (IMPORTANT for MySQL)
    now = datetime.now(IST)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    results = (
        db.query(
            func.hour(InvoiceModel.created_at).label("hour"),
            func.sum(InvoiceModel.total).label("total")
        )
        .filter(
            InvoiceModel.created_at >= start,
            InvoiceModel.created_at <= now,
            InvoiceModel.payment_status == "paid"
        )
        .group_by("hour")
        .order_by("hour")
        .all()
    )

    data = []
    for hour, total in results:
        data.append({
            "label": f"{hour:02d}:00–{hour+1:02d}:00",
            "total": float(total or 0)
        })

    return data


@api_router.get("/dashboard/sales", response_model=List[SalesChartItem])
def get_sales_data(
    filter: str = "today",
    year: int | None = None,
    month: int | None = None,
    current_user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now = datetime.now(IST)

    # ---------- DATE RANGE ----------
    if filter == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now

    elif filter == "yesterday":
        y = now - timedelta(days=1)
        start = y.replace(hour=0, minute=0, second=0, microsecond=0)
        end = y.replace(hour=23, minute=59, second=59)

    elif filter == "last_10_days":
        start = now - timedelta(days=10)
        end = now

    elif filter == "last_30_days":
        start = now - timedelta(days=30)
        end = now

    elif filter == "month":
        start = datetime(year, month, 1, tzinfo=IST)
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=IST)
        else:
            end = datetime(year, month + 1, 1, tzinfo=IST)

    else:
        raise HTTPException(status_code=400, detail="Invalid filter")

    results = (
        db.query(
            func.date(InvoiceModel.created_at).label("day"),
            func.sum(InvoiceModel.total).label("total"),
            func.sum(case((InvoiceModel.payment_status == "paid", InvoiceModel.total), else_=0)).label("paid"),
            func.sum(case((InvoiceModel.payment_status == "pending", InvoiceModel.total), else_=0)).label("pending"),
            func.sum(case((InvoiceModel.payment_status == "overdue", InvoiceModel.total), else_=0)).label("overdue"),
        )
        .filter(
            InvoiceModel.created_at >= start,
            InvoiceModel.created_at <= end
        )
        .group_by("day")
        .order_by("day")
        .all()
    )

    return [
        SalesChartItem(
            name=row.day.strftime("%d %b"),
            total=float(row.total or 0),
            paid=float(row.paid or 0),
            pending=float(row.pending or 0),
            overdue=float(row.overdue or 0),
        )
        for row in results
    ]


@api_router.get("/products/sku/{sku}")
def get_product_by_sku(
    sku: str,
    db: Session = Depends(get_db)
):
    # Search SKU case-insensitively for robustness
    product = db.query(ProductModel).filter(
        (ProductModel.sku == sku) | (ProductModel.product_code == sku)
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return {
        "id": product.id,
        "name": product.name,
        "selling_price": product.selling_price,
        "sku": product.sku,
        "stock": product.stock
    }

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
