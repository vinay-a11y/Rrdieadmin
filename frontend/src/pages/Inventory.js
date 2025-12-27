"use client"

import { useEffect, useRef, useState } from "react"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Search,
} from "lucide-react"

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`

export default function Inventory() {
  const [activeTab, setActiveTab] = useState("inward")

  const [products, setProducts] = useState([])
  const [transactions, setTransactions] = useState([])

  // 🔍 Product auto-complete
  const [productSearch, setProductSearch] = useState("")
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)

  // History filters
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")

  // Pagination
  const [page, setPage] = useState(1)
  const limit = 30
  const [total, setTotal] = useState(0)

  const searchRef = useRef(null)

  // ================= FETCH PRODUCTS =================
  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API}/products/list`)
      setProducts(res.data || [])
    } catch {
      toast.error("Failed to load products")
    }
  }

  // ================= CLICK OUTSIDE =================
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ================= FILTER PRODUCTS =================
  const filteredProducts = products.filter((p) => {
    const q = productSearch.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.product_code.toLowerCase().includes(q)
    )
  })

  const selectProduct = (p) => {
    setSelectedProduct(p)
    setProductSearch(`${p.name} (${p.sku})`)
    setShowSuggestions(false)
  }

  // ================= FETCH TRANSACTIONS =================
 useEffect(() => {
  if (activeTab === "history") fetchTransactions()
}, [activeTab, page, filterType, searchTerm])

  const fetchTransactions = async () => {
    try {
      setLoading(true)

      const params = { page, limit }
      if (filterType !== "all") params.type = filterType

      const res = await axios.get(`${API}/inventory/transactions`, { params })
      let data = res.data.data || []

      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        data = data.filter(
          (t) =>
            t.product_name.toLowerCase().includes(s) ||
            t.product_code.toLowerCase().includes(s) ||
            t.reason?.toLowerCase().includes(s)
        )
      }

      setTransactions(data)
      setTotal(res.data.total)
    } catch {
      toast.error("Failed to load transaction history")
    } finally {
      setLoading(false)
    }
  }

  // ================= SUBMIT =================
  const resetForm = () => {
    setSelectedProduct(null)
    setProductSearch("")
    setQuantity("")
    setReason("")
  }

  const submitInward = async () => {
    if (!selectedProduct || !quantity) {
      toast.error("Please fill all required fields")
      return
    }

    await axios.post(`${API}/inventory/material-inward`, {
      product_id: selectedProduct.id,
      quantity: Number(quantity),
    })

    toast.success("Material inward added successfully")
    resetForm()
    fetchProducts()
  }

  const submitOutward = async () => {
    if (!selectedProduct || !quantity || !reason) {
      toast.error("Please fill all required fields")
      return
    }

    await axios.post(`${API}/inventory/material-outward`, {
      product_id: selectedProduct.id,
      quantity: Number(quantity),
      reason,
    })

    toast.success("Material outward added successfully")
    resetForm()
    fetchProducts()
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-4xl font-bold">Inventory Management</h1>

      {/* TABS */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === "inward" ? "default" : "outline"}
          onClick={() => setActiveTab("inward")}
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Material Inward
        </Button>
        <Button
          variant={activeTab === "outward" ? "default" : "outline"}
          onClick={() => setActiveTab("outward")}
        >
          <ArrowUpFromLine className="w-4 h-4 mr-2" />
          Material Outward
        </Button>
        <Button
          variant={activeTab === "history" ? "default" : "outline"}
          onClick={() => setActiveTab("history")}
        >
          <History className="w-4 h-4 mr-2" />
          Transaction History
        </Button>
      </div>

      {/* INWARD / OUTWARD */}
      {(activeTab === "inward" || activeTab === "outward") && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>
              {activeTab === "inward"
                ? "Add Material Inward"
                : "Add Material Outward"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* PRODUCT AUTO COMPLETE */}
            <div ref={searchRef} className="relative">
              <Label>Product</Label>
              <Input
                placeholder="Search by name / SKU / code"
                value={productSearch}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => {
                  setProductSearch(e.target.value)
                  setShowSuggestions(true)
                }}
              />

              {showSuggestions && filteredProducts.length > 0 && (
                <div className="absolute z-20 w-full bg-background border rounded-md shadow-md mt-1 max-h-60 overflow-auto">
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => selectProduct(p)}
                      className="px-3 py-2 cursor-pointer hover:bg-muted"
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.sku} • {p.product_code} • Stock: {p.stock}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedProduct && (
              <div className="p-3 bg-muted rounded-md flex justify-between">
                <span>Current Stock</span>
                <span className="font-bold">{selectedProduct.stock}</span>
              </div>
            )}

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            {activeTab === "outward" && (
              <div>
                <Label>Reason</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}

            <Button
              className="w-full"
              disabled={loading}
              onClick={activeTab === "inward" ? submitInward : submitOutward}
            >
              Submit
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ================= HISTORY ================= */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* ✅ FILTER DROPDOWN RESTORED */}
            <Select
              value={filterType}
              onValueChange={(v) => {
                setFilterType(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="IN">Inward</SelectItem>
                <SelectItem value="OUT">Outward</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Product</th>
                    <th className="p-2">Code</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Stock</th>
                    <th className="p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="p-2">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className="p-2">{t.type}</td>
                      <td className="p-2">{t.product_name}</td>
                      <td className="p-2">{t.product_code}</td>
                      <td className="p-2 text-right">{t.quantity}</td>
                      <td className="p-2 text-right">{t.remaining_stock}</td>
                      <td className="p-2">{t.reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {transactions.length === 0 && (
                <div className="py-10 text-center text-muted-foreground">
                  No transactions found
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex justify-end gap-3 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
