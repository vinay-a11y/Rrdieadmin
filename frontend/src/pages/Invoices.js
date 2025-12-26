  "use client"

  import { useEffect, useState, useRef } from "react"
  import axios from "axios"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
  import { toast } from "sonner"
  import { Plus, Trash2, Search, Download, Eye, FileText, ScanLine, Loader2, Camera, X } from "lucide-react"
  import { Html5Qrcode } from "html5-qrcode"

  const API = `http://192.168.0.237:8000/api`

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
        const itemGst = (item.total * item.gst_rate) / 100
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
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">Invoice Management</h1>
            <p className="text-muted-foreground">Create and manage invoices with GST</p>
          </div>
          <div className="flex gap-2">
            <Button variant={activeTab === "create" ? "default" : "outline"} onClick={() => setActiveTab("create")}>
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
            <Button variant={activeTab === "list" ? "default" : "outline"} onClick={() => setActiveTab("list")}>
              <FileText className="w-4 h-4 mr-2" />
              View Invoices
            </Button>
          </div>
        </div>

        {activeTab === "create" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Customer Phone</Label>
                    <Input
                      placeholder="Enter phone number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onBlur={(e) => searchCustomerByPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Customer Name *</Label>
                    <Input
                      placeholder="Enter name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      placeholder="customer@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Address</Label>
                    <Input
                      placeholder="Enter address"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>Invoice Items</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <ScanLine className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Scan QR or Enter SKU..."
                      className="pl-9"
                      value={skuInput}
                      onChange={(e) => setSkuInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleSkuScan(skuInput)
                        }
                      }}
                    />
                    {isScanning && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin" />}
                  </div>
                  <Button
                    variant={showCamera ? "destructive" : "secondary"}
                    onClick={() => setShowCamera(!showCamera)}
                    disabled={isScanning}
                  >
                    {showCamera ? <X className="w-4 h-4 mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                    {showCamera ? "Close Camera" : "Open Camera"}
                  </Button>
                  <Button onClick={addLineItem} variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Manual Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {showCamera && (
                  <div className="mb-6 relative mx-auto max-w-md overflow-hidden rounded-lg border-2 border-primary bg-black aspect-square flex items-center justify-center">
                    {cameraLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                        <Loader2 className="w-8 h-8 animate-spin text-white" />
                      </div>
                    )}
                    <div id="reader" className="w-full h-full"></div>
                    <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none z-20">
                      <p className="text-white text-xs bg-black/50 inline-block px-2 py-1 rounded">
                        Align QR code inside the box
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {lineItems.map((item, index) => (
                    <div key={index} className="flex gap-4 items-end border-b pb-4">
                      <div className="flex-1">
                        <Label>Product</Label>
                        <Select
                          value={String(item.product_id)}
                          onValueChange={(v) => updateLineItem(index, "product_id", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name} - ₹{p.selling_price}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-24">
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(index, "quantity", Number(e.target.value))}
                          min="1"
                        />
                      </div>
                      <div className="w-32">
                        <Label>Price</Label>
                        <Input
                          type="number"
                          value={item.price}
                          onChange={(e) => updateLineItem(index, "price", Number(e.target.value))}
                        />
                      </div>
                      <div className="w-24">
                        <Label>GST %</Label>
                        <Select
                          value={item.gst_rate.toString()}
                          onValueChange={(v) => updateLineItem(index, "gst_rate", Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5%</SelectItem>
                            <SelectItem value="12">12%</SelectItem>
                            <SelectItem value="18">18%</SelectItem>
                            <SelectItem value="28">28%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32">
                        <Label>Total</Label>
                        <Input value={`₹${item.total.toFixed(2)}`} disabled />
                      </div>
                      <Button size="sm" variant="destructive" onClick={() => removeLineItem(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {lineItems.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No items added. Click "Add Item" to start.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Discount (₹)</Label>
                    <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} min="0" />
                  </div>
                  <div>
                    <Label>Payment Status</Label>
                    <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                      <SelectTrigger>
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

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>GST Amount:</span>
                    <span>₹{gstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Discount:</span>
                    <span>-₹{discount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>₹{total.toFixed(2)}</span>
                  </div>
                </div>

                <Button className="w-full" size="lg" onClick={handleCreateInvoice} disabled={loading}>
                  {loading ? "Creating..." : "Create Invoice"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "list" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice number, customer name, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Status */}
              <Select
                onValueChange={(v) => {
                  setPage(1)
                  setStatusFilter(v)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="ending">Ending</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              {/* Date Range */}
              <Select
                onValueChange={(v) => {
                  setPage(1)
                  setRangeFilter(v)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last10">Last 10 Days</SelectItem>
                  <SelectItem value="last30">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>

              {/* Month */}
              <Input
                type="month"
                value={monthFilter}
                onChange={(e) => {
                  setPage(1)
                  setMonthFilter(e.target.value)
                }}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Invoices ({filteredInvoices.length})</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b text-sm text-muted-foreground">
                      <th className="p-2 text-left">Invoice #</th>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Customer</th>
                      <th className="p-2 text-left">Phone</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices
                      .filter((inv) => inv && inv.id)
                      .map((inv) => (
                        <tr key={inv.id} className="border-b hover:bg-muted/40">
                          <td className="p-2 font-mono text-sm">{inv.invoice_number}</td>
                          <td className="p-2 text-sm">{new Date(inv.created_at).toLocaleDateString()}</td>
                          <td className="p-2 font-medium">{inv.customer_name}</td>
                          <td className="p-2 text-sm">{inv.customer_phone || "N/A"}</td>
                          <td className="p-2 text-right font-semibold">₹{inv.total.toFixed(2)}</td>
                          <td className="p-2">
                            <Select
                              value={inv.payment_status || "pending"}
                              onValueChange={(v) => {
                                updateInvoiceStatus(inv.id, v)

                                // update local state immediately (no crash)
                                setInvoices((prev) =>
                                  prev.map((i) => (i.id === inv.id ? { ...i, payment_status: v } : i)),
                                )
                              }}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="overdue">Overdue</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>

                          <td className="p-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => setViewInvoice(inv)}>
                                <Eye className="w-4 h-4 mr-1" /> View
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => generatePDF(inv)}>
                                <Download className="w-4 h-4 mr-1" /> PDF
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-4">
                  <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    Prev
                  </Button>

                  <span className="text-sm">
                    Page {pagination.page} of {pagination.total_pages}
                  </span>

                  <Button variant="outline" disabled={page === pagination.total_pages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>

                {filteredInvoices.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground">No invoices found</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {viewInvoice && (
          <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Invoice Details - {viewInvoice.invoice_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Customer Name</p>
                    <p className="font-medium">{viewInvoice.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{viewInvoice.customer_phone || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">{new Date(viewInvoice.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Status</p>
                    <p className="font-medium capitalize">{viewInvoice.payment_status}</p>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Items</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Product</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Price</th>
                        <th className="text-right p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewInvoice.items.map((item, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{item.product_name}</td>
                          <td className="text-right p-2">{item.quantity}</td>
                          <td className="text-right p-2">₹{item.price.toFixed(2)}</td>
                          <td className="text-right p-2">₹{item.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₹{viewInvoice.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST:</span>
                      <span>₹{viewInvoice.gst_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Discount:</span>
                      <span>-₹{viewInvoice.discount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total:</span>
                      <span>₹{viewInvoice.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full" onClick={() => generatePDF(viewInvoice)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    )
  }
