"use client"

import { useEffect, useState, useRef } from "react"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, Trash2, Search, Download, Eye, FileText, ScanLine, Loader2, X, Menu } from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const API = `${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/api`

export default function Invoice() {
  const [activeTab, setActiveTab] = useState("create")
  const [invoices, setInvoices] = useState([])
  const [products, setProducts] = useState([])
  const [open, setOpen] = useState(false)
  const [viewInvoice, setViewInvoice] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState(null)
  const [rangeFilter, setRangeFilter] = useState(null)
  const [monthFilter, setMonthFilter] = useState(null)
  const [limit, setLimit] = useState(10)
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1 })
  const [discount, setDiscount] = useState(0)
  const [paymentStatus, setPaymentStatus] = useState("pending")

  // Customer fields
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerAddress, setCustomerAddress] = useState("")
  const [customerId, setCustomerId] = useState(null)

  // Invoice fields
  const [lineItems, setLineItems] = useState([])
  const [skuInput, setSkuInput] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [lastScannedSku, setLastScannedSku] = useState(null)
  const [lastScanTime, setLastScanTime] = useState(0)
  const scannerRef = useRef(null)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`
    }

    fetchProducts()
  }, [])
  useEffect(() => {
    fetchInvoices()
  }, [page, statusFilter, rangeFilter, monthFilter])

  const fetchInvoices = async () => {
    try {
      setLoading(true)

      const res = await axios.get(`${API}/invoices`, {
        params: {
          page,
          limit,
          status: statusFilter || undefined,
          range: rangeFilter || undefined,
          month: monthFilter || undefined,
        },
      })

      const parsedInvoices = (res.data?.data || []).map((inv) => {
        let items = []

        try {
          if (Array.isArray(inv.items)) {
            items = inv.items
          } else if (typeof inv.items === "string") {
            items = JSON.parse(inv.items)
          }
        } catch (e) {
          console.error("Item parse failed", e)
          items = []
        }

        return {
          ...inv,
          items,
          payment_status: inv.payment_status || "pending",
        }
      })

      setInvoices(parsedInvoices)
      setPagination(res.data.pagination)
    } catch (err) {
      console.error("Invoice fetch failed", err)
      toast.error(err?.response?.data?.detail || "Failed to load invoices")
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API}/products`)
      setProducts(res.data)
    } catch (err) {
      console.error("Product fetch failed", err)
      toast.error("Failed to load products")
    }
  }

  const searchCustomerByPhone = async (phone) => {
    if (phone.length < 10) return

    try {
      const res = await axios.get(`${API}/customers/search?phone=${phone}`)

      if (res.data) {
        setCustomerId(res.data.id)
        setCustomerName(res.data.name)
        setCustomerEmail(res.data.email)
        setCustomerAddress(res.data.address || "")
        toast.success("Customer found!")
      } else {
        setCustomerId(null)
        setCustomerName("")
        setCustomerEmail("")
        setCustomerAddress("")
        toast.info("New customer - please fill details")
      }
    } catch (err) {
      console.error("Customer search failed", err)
      toast.error("Customer lookup failed")
    }
  }

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        product_id: "",
        product_name: "",
        quantity: 1,
        price: 0,
        gst_rate: 18,
        total: 0,
      },
    ])
  }

  const updateLineItem = (index, field, value) => {
    const updated = [...lineItems]
    updated[index][field] = value

    // Auto-fill product details when product is selected
    if (field === "product_id") {
      const product = products.find((p) => String(p.id) === String(value))
      if (product) {
        updated[index].product_name = product.name
        updated[index].price = product.selling_price
        updated[index].total = product.selling_price * updated[index].quantity
      }
    }

    // Recalculate total when quantity or price changes
    if (field === "quantity" || field === "price") {
      updated[index].total = updated[index].price * updated[index].quantity
    }

    setLineItems(updated)
  }

  const handleSkuScan = async (skuInputRaw) => {
    if (!skuInputRaw) return

    let sku = skuInputRaw
    try {
      // If the QR contains JSON like {"sku": "...", "name": "..."}, extract only the SKU
      const parsed = JSON.parse(skuInputRaw)
      if (parsed && typeof parsed === "object") {
        sku = parsed.sku || parsed.id || skuInputRaw
      }
    } catch (e) {
      // Not JSON, use the raw string as SKU
    }

    const now = Date.now()
    if (sku === lastScannedSku && now - lastScanTime < 2000) {
      return
    }

    setIsScanning(true)
    setLastScannedSku(sku)
    setLastScanTime(now)

    try {
      const response = await fetch(`${API}/products/sku/${encodeURIComponent(sku)}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      })

      if (!response.ok) {
        throw new Error("Product not found")
      }

      const product = await response.json()

      // Check if item already exists in the invoice
      const existingItemIndex = lineItems.findIndex((item) => String(item.product_id) === String(product.id))

      if (existingItemIndex > -1) {
        // Increment quantity if already exists
        const updatedItems = [...lineItems]

        updatedItems[existingItemIndex].quantity += 1
        updatedItems[existingItemIndex].total =
          updatedItems[existingItemIndex].price * updatedItems[existingItemIndex].quantity

        setLineItems(updatedItems)
      } else {
        // Add as new item
        setLineItems((prev) => [
          ...prev,
          {
            product_id: product.id,
            product_name: product.name,
            quantity: 1,
            price: product.selling_price,
            gst_rate: 18,
            total: product.selling_price,
            sku: product.sku,
          },
        ])
      }

      setSkuInput("") // Clear input after scan
      toast.success(`Added: ${product.name}`)

      if (window.navigator.vibrate) {
        window.navigator.vibrate(100)
      }

      try {
        const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3")
        audio.volume = 0.2
        audio.play()
      } catch (e) {
        // ignore audio errors
      }
    } catch (err) {
      console.error("Scan error:", err)
      toast.error("Could not find product with this SKU")
    } finally {
      setIsScanning(false)
    }
  }

  useEffect(() => {
    let html5QrCode = null

    if (showCamera) {
      const startScanner = async () => {
        setCameraLoading(true)
        try {
          html5QrCode = new Html5Qrcode("reader")
          scannerRef.current = html5QrCode

          const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          }

          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              // Successfully scanned!
              handleSkuScan(decodedText)
              // Optionally close camera after success or keep it open for multiple scans
              // setShowCamera(false)
            },
            (errorMessage) => {
              // ignore scan errors
            },
          )
          setCameraLoading(false)
        } catch (err) {
          console.error("Failed to start camera:", err)
          toast.error("Could not access camera")
          setShowCamera(false)
        }
      }

      startScanner()
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode
          .stop()
          .then(() => {
            html5QrCode.clear()
          })
          .catch((err) => console.error("Failed to clear scanner", err))
      }
    }
  }, [showCamera])

  const removeLineItem = (index) => {
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0)
    const gstAmount = lineItems.reduce((sum, item) => {
      const itemGst = (item.total * (item.gst_rate || 18)) / 100
      return sum + itemGst
    }, 0)
    const total = subtotal + gstAmount - discount
    return { subtotal, gstAmount, total }
  }

  const resetForm = () => {
    setCustomerPhone("")
    setCustomerName("")
    setCustomerEmail("")
    setCustomerAddress("")
    setCustomerId(null)
    setLineItems([])
    setDiscount(0)
    setPaymentStatus("pending")
    setSkuInput("") // Clear SKU input on reset
  }

  const handleCreateInvoice = async () => {
    if (!customerName || !customerEmail || lineItems.length === 0) {
      toast.error("Please fill all required fields and add at least one item")
      return
    }

    const { gstAmount } = calculateTotals()

    try {
      const payload = {
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        customer_address: customerAddress,
        items: lineItems.map((item) => ({
          product_id: String(item.product_id),
          product_name: item.product_name,
          quantity: Number(item.quantity),
          price: Number(item.price),
          gst_rate: Number(item.gst_rate || 18),
          total: Number(item.total),
          sku: item.sku,
        })),
        gst_amount: gstAmount,
        discount: Number(discount),
        payment_status: paymentStatus,
      }

      await axios.post(`${API}/invoices`, payload)

      toast.success("Invoice created successfully!")
      resetForm()
      fetchInvoices()
      setActiveTab("list")
    } catch (err) {
      console.error("[v0] Invoice creation error:", err)
      toast.error(err?.response?.data?.detail || "Failed to create invoice")
    }
  }
  const generatePDF = (invoice) => {
    const printWindow = window.open("", "_blank")
    const { subtotal, gstAmount, total } = calculateInvoiceTotals(invoice)

    const pdfContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; }
          .invoice-container { max-width: 800px; margin: 0 auto; border: 2px solid #333; padding: 30px; }
          .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
          .company-name { font-size: 32px; font-weight: bold; color: #000; margin-bottom: 5px; }
          .company-tagline { font-size: 14px; color: #666; margin-bottom: 10px; }
          .company-details { font-size: 12px; color: #666; }
          .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .info-block { flex: 1; }
          .info-block h3 { font-size: 14px; margin-bottom: 10px; color: #000; border-bottom: 2px solid #000; padding-bottom: 5px; }
          .info-block p { font-size: 12px; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          thead { background: #000; color: #fff; }
          th, td { padding: 12px; text-align: left; border: 1px solid #ddd; }
          th { font-weight: bold; }
          .text-right { text-align: right; }
          .totals { margin-top: 20px; float: right; width: 300px; }
          .totals table { margin: 0; }
          .totals td { padding: 8px; }
          .totals .total-row { font-weight: bold; font-size: 16px; background: #f0f0f0; }
          .footer { clear: both; margin-top: 50px; padding-top: 20px; border-top: 2px solid #000; }
          .signature { display: flex; justify-content: space-between; margin-top: 40px; }
          .signature-block { text-align: center; }
          .signature-line { border-top: 1px solid #000; width: 200px; margin-top: 50px; padding-top: 5px; }
          .terms { font-size: 10px; color: #666; margin-top: 20px; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
          .badge-paid { background: #4CAF50; color: white; }
          .badge-pending { background: #FF9800; color: white; }
          .badge-overdue { background: #F44336; color: white; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="header">
            <div class="company-name">R RIDE GARAGE</div>
            <div class="company-tagline">Your Trusted Auto Care Partner</div>
            <div class="company-details">
              <p>123 Main Street, Cityname, State - 123456</p>
              <p>Phone: +91 98765 43210 | Email: contact@rridegarage.com</p>
              <p>GSTIN: 29ABCDE1234F1Z5</p>
            </div>
          </div>

          <div class="invoice-info">
            <div class="info-block">
              <h3>INVOICE TO</h3>
              <p><strong>${invoice.customer_name}</strong></p>
              <p>${invoice.customer_phone || "N/A"}</p>
              <p>${invoice.customer_address || "N/A"}</p>
            </div>
            <div class="info-block" style="text-align: right;">
              <h3>INVOICE DETAILS</h3>
              <p><strong>Invoice No:</strong> ${invoice.invoice_number}</p>
              <p><strong>Date:</strong> ${new Date(invoice.created_at).toLocaleDateString()}</p>
              <p><strong>Status:</strong> 
                <span class="badge badge-${invoice.payment_status}">
                  ${invoice.payment_status.toUpperCase()}
                </span>
              </p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Price</th>
                <th class="text-right">GST %</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items
                .map(
                  (item, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${item.product_name}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">₹${item.price.toFixed(2)}</td>
                  <td class="text-right">${item.gst_rate}%</td>
                  <td class="text-right">₹${item.total.toFixed(2)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>

          <div class="totals">
            <table>
              <tr>
                <td>Subtotal:</td>
                <td class="text-right">₹${subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td>GST Amount:</td>
                <td class="text-right">₹${gstAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td>Discount:</td>
                <td class="text-right">-₹${invoice.discount.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td>Total Amount:</td>
                <td class="text-right">₹${total.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <div class="footer">
            <div class="terms">
              <h4>Terms & Conditions:</h4>
              <p>1. Payment is due within 30 days of invoice date.</p>
              <p>2. Late payments may incur additional charges.</p>
              <p>3. Goods once sold will not be taken back or exchanged.</p>
              <p>4. All disputes subject to local jurisdiction only.</p>
            </div>

            <div class="signature">
              <div class="signature-block">
                <div class="signature-line">Customer Signature</div>
              </div>
              <div class="signature-block">
                <div class="signature-line">Authorized Signatory</div>
                <p style="margin-top: 10px; font-weight: bold;">R RIDE GARAGE</p>
              </div>
            </div>
          </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #000; color: #fff; border: none; cursor: pointer; border-radius: 5px;">
            Print Invoice
          </button>
          <button onclick="window.close()" style="padding: 10px 20px; background: #666; color: #fff; border: none; cursor: pointer; border-radius: 5px; margin-left: 10px;">
            Close
          </button>
        </div>
      </body>
      </html>
    `

    printWindow.document.write(pdfContent)
    printWindow.document.close()
  }

  const updateInvoiceStatus = async (invoiceId, newStatus) => {
    try {
      await axios.put(`${API}/invoices/${invoiceId}/status`, {
        payment_status: newStatus,
      })

      toast.success("Invoice status updated")
      fetchInvoices() // refresh list
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update status")
    }
  }

  const calculateInvoiceTotals = (invoice) => {
    const subtotal = invoice.items.reduce((sum, item) => sum + item.total, 0)
    const gstAmount = invoice.gst_amount
    const total = subtotal + gstAmount - invoice.discount
    return { subtotal, gstAmount, total }
  }

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer_phone?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const { subtotal, gstAmount, total } = calculateTotals()

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Header / Nav */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">R RIDE GARAGE</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">Invoice Management System</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="hidden sm:block">
              <TabsList className="bg-secondary/50">
                <TabsTrigger value="create" className="data-[state=active]:bg-background">
                  Create Invoice
                </TabsTrigger>
                <TabsTrigger value="list" className="data-[state=active]:bg-background">
                  Manage Invoices
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="icon" className="sm:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="sm:hidden mb-4">
            <TabsList className="w-full bg-secondary/50 grid grid-cols-2">
              <TabsTrigger value="create">Create</TabsTrigger>
              <TabsTrigger value="list">Manage</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="create" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Customer Info Card */}
              <Card className="border-border/40 bg-card/50 shadow-sm backdrop-blur-sm lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Customer Details</CardTitle>
                  <CardDescription>Enter client information or search by phone</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        placeholder="Search by phone..."
                        className="pl-9"
                        value={customerPhone}
                        onChange={(e) => {
                          setCustomerPhone(e.target.value)
                          searchCustomerByPhone(e.target.value)
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      placeholder="Customer Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address (Optional)</Label>
                    <Input
                      id="address"
                      placeholder="Street, City, Zip"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Items & SKU Card */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="border-border/40 bg-card/50 shadow-sm backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-lg font-semibold">Invoice Items</CardTitle>
                      <CardDescription>Add products manually or scan SKU</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowCamera(true)}>
                        <ScanLine className="mr-2 h-4 w-4" />
                        Scan
                      </Button>
                      <Button size="sm" onClick={addLineItem} className="bg-primary text-primary-foreground">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Item
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 flex flex-wrap gap-4">
                      <div className="flex-1 min-w-[200px]">
                        <Label htmlFor="sku" className="sr-only">
                          SKU Scan
                        </Label>
                        <div className="relative">
                          <Input
                            id="sku"
                            placeholder="Type SKU or scan..."
                            value={skuInput}
                            onChange={(e) => setSkuInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSkuScan(skuInput)
                            }}
                          />
                          {isScanning && (
                            <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-primary" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto -mx-6 px-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/40 text-muted-foreground">
                            <th className="pb-3 text-left font-medium">Product</th>
                            <th className="pb-3 text-right font-medium">Qty</th>
                            <th className="pb-3 text-right font-medium">Price</th>
                            <th className="pb-3 text-right font-medium">GST %</th>
                            <th className="pb-3 text-right font-medium">Total</th>
                            <th className="pb-3 text-center font-medium w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {lineItems.map((item, index) => (
                            <tr key={index} className="group transition-colors hover:bg-muted/30">
                              <td className="py-4 pr-4">
                                <Select
                                  value={String(item.product_id)}
                                  onValueChange={(val) => updateLineItem(index, "product_id", val)}
                                >
                                  <SelectTrigger className="border-none bg-transparent hover:bg-secondary/50 p-0 px-2 h-9 shadow-none ring-offset-0 focus:ring-0">
                                    <SelectValue placeholder="Select Product" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products.map((p) => (
                                      <SelectItem key={p.id} value={String(p.id)}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-4 pr-4 text-right">
                                <Input
                                  type="number"
                                  className="w-16 ml-auto h-9 text-right bg-transparent border-none shadow-none focus-visible:ring-1"
                                  value={item.quantity}
                                  onChange={(e) => updateLineItem(index, "quantity", Number(e.target.value))}
                                />
                              </td>
                              <td className="py-4 pr-4 text-right">
                                <Input
                                  type="number"
                                  className="w-24 ml-auto h-9 text-right bg-transparent border-none shadow-none focus-visible:ring-1"
                                  value={item.price}
                                  onChange={(e) => updateLineItem(index, "price", Number(e.target.value))}
                                />
                              </td>
                              <td className="py-4 pr-4 text-right">
                                <Input
                                  type="number"
                                  className="w-16 ml-auto h-9 text-right bg-transparent border-none shadow-none focus-visible:ring-1"
                                  value={item.gst_rate}
                                  onChange={(e) => updateLineItem(index, "gst_rate", Number(e.target.value))}
                                />
                              </td>
                              <td className="py-4 pr-4 text-right font-medium">₹{item.total.toFixed(2)}</td>
                              <td className="py-4 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeLineItem(index)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {lineItems.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                                No items added yet. Use the buttons above to start.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Summary Card */}
                <Card className="border-border/40 bg-card/50 shadow-sm backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Payment Status</Label>
                          <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                            <SelectTrigger className="bg-secondary/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                              <SelectItem value="overdue">Overdue</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Discount (₹)</Label>
                          <Input
                            type="number"
                            className="bg-secondary/50"
                            placeholder="0.00"
                            value={discount}
                            onChange={(e) => setDiscount(Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="rounded-xl bg-secondary/30 p-6 space-y-3">
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Subtotal</span>
                          <span>₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>GST Amount</span>
                          <span>₹{gstAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Discount</span>
                          <span className="text-destructive">-₹{Number(discount).toFixed(2)}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between text-xl font-bold text-primary">
                          <span>Grand Total</span>
                          <span>₹{total.toFixed(2)}</span>
                        </div>
                        <Button
                          className="w-full mt-4 bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                          size="lg"
                          onClick={handleCreateInvoice}
                        >
                          Create & Save Invoice
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="list" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Filter Bar */}
            <Card className="border-border/40 bg-card/50 shadow-sm backdrop-blur-sm">
              <CardContent className="p-4 flex flex-wrap gap-4 items-center justify-between">
                <div className="relative flex-1 min-w-[300px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search invoices by number, name or phone..."
                    className="pl-9 bg-secondary/30"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? null : v)}>
                    <SelectTrigger className="w-[140px] bg-secondary/30">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => fetchInvoices()} className="bg-secondary/30">
                    <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Invoices List */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredInvoices.map((invoice) => (
                <Card
                  key={invoice.id}
                  className="group border-border/40 bg-card/50 transition-all hover:bg-card hover:shadow-md hover:border-primary/20"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="font-mono text-xs bg-secondary/50">
                        #{invoice.invoice_number}
                      </Badge>
                      <Badge
                        className={cn(
                          "capitalize",
                          invoice.payment_status === "paid"
                            ? "bg-primary text-primary-foreground"
                            : invoice.payment_status === "overdue"
                              ? "bg-destructive text-destructive-foreground"
                              : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                        )}
                      >
                        {invoice.payment_status}
                      </Badge>
                    </div>
                    <CardTitle className="mt-2 text-lg">{invoice.customer_name}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <span>{new Date(invoice.created_at).toLocaleDateString()}</span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                      <span>{invoice.items.length} items</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-2xl font-bold text-primary">
                        ₹{invoice.total_amount?.toFixed(2) || "0.00"}
                      </div>
                      <div className="text-xs text-muted-foreground">{invoice.customer_phone}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setViewInvoice(invoice)
                          setOpen(true)
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-transparent"
                        onClick={() => generatePDF(invoice)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredInvoices.length === 0 && !loading && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  No invoices found matching your search.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* View Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl bg-card border-border/40 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">Invoice Details</DialogTitle>
              <Badge variant="outline" className="font-mono">
                #{viewInvoice?.invoice_number}
              </Badge>
            </div>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-secondary/30 p-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Bill To</h4>
                  <p className="font-bold">{viewInvoice.customer_name}</p>
                  <p className="text-sm">{viewInvoice.customer_phone}</p>
                  <p className="text-sm text-muted-foreground">{viewInvoice.customer_email}</p>
                </div>
                <div className="text-right">
                  <h4 className="text-sm font-medium text-muted-foreground">Date</h4>
                  <p className="font-bold">{new Date(viewInvoice.created_at).toLocaleDateString()}</p>
                  <h4 className="mt-2 text-sm font-medium text-muted-foreground">Status</h4>
                  <div className="flex justify-end mt-1">
                    <Select
                      value={viewInvoice.payment_status}
                      onValueChange={(val) => updateInvoiceStatus(viewInvoice.id, val)}
                    >
                      <SelectTrigger className="w-[120px] h-8 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold px-1">Line Items</h4>
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="py-2 px-4 text-left">Item</th>
                        <th className="py-2 px-4 text-right">Qty</th>
                        <th className="py-2 px-4 text-right">Price</th>
                        <th className="py-2 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {viewInvoice.items.map((item, i) => (
                        <tr key={i}>
                          <td className="py-2 px-4">{item.product_name}</td>
                          <td className="py-2 px-4 text-right">{item.quantity}</td>
                          <td className="py-2 px-4 text-right">₹{item.price.toFixed(2)}</td>
                          <td className="py-2 px-4 text-right">₹{item.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col items-end space-y-2">
                <div className="flex justify-between w-full max-w-[240px] text-sm">
                  <span className="text-muted-foreground">GST Amount</span>
                  <span>₹{viewInvoice.gst_amount?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-full max-w-[240px] text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-destructive">-₹{viewInvoice.discount?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-full max-w-[240px] text-xl font-bold text-primary">
                  <span>Total</span>
                  <span>₹{viewInvoice.total_amount?.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border/40">
                <Button className="flex-1 bg-primary text-primary-foreground" onClick={() => generatePDF(viewInvoice)}>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </Button>
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={showCamera} onOpenChange={setShowCamera}>
        <DialogContent className="sm:max-w-md bg-card p-0 overflow-hidden border-border/40">
          <div className="relative">
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-4 top-4 z-50 rounded-full h-8 w-8 bg-background/50 backdrop-blur-md border border-white/10"
              onClick={() => setShowCamera(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <div id="reader" className="w-full overflow-hidden bg-black aspect-square"></div>
            {cameraLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
            <div className="p-6 bg-card border-t border-border/40">
              <h3 className="font-semibold text-center mb-1">Scanner Active</h3>
              <p className="text-xs text-muted-foreground text-center">
                Position the product barcode/QR code within the frame to scan.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
