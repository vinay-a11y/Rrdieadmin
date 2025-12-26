"use client"

import { useEffect, useState } from "react"
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

  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)

  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")

  // ✅ PAGINATION STATE
  const [page, setPage] = useState(1)
  const [limit] = useState(30)
  const [total, setTotal] = useState(0)

  const token = localStorage.getItem("access_token")

  // ================= FETCH PRODUCTS =================
  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API}/products/list`)
      setProducts(res.data)
    } catch {
      toast.error("Failed to load products")
    }
  }

  // ================= FETCH TRANSACTIONS =================
  useEffect(() => {
    if (activeTab === "history") {
      fetchTransactions()
    }
  }, [activeTab, page, filterType])

  const fetchTransactions = async () => {
    try {
      setLoading(true)

      const params = {
        page,
        limit,
      }

      if (filterType !== "all") {
        params.type = filterType
      }

      const res = await axios.get(`${API}/inventory/transactions`, {
        params,
      })

      let data = res.data.data || []

      // 🔍 CLIENT SEARCH (on paginated data)
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        data = data.filter(
          (t) =>
            t.product_name.toLowerCase().includes(search) ||
            t.product_code.toLowerCase().includes(search) ||
            t.reason?.toLowerCase().includes(search)
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

  // ================= FORM HANDLERS =================
  const resetForm = () => {
    setProductId("")
    setQuantity("")
    setReason("")
  }

  const submitInward = async () => {
    if (!productId || !quantity) {
      toast.error("Please fill all required fields")
      return
    }

    try {
      await axios.post(`${API}/inventory/material-inward`, {
        product_id: productId,
        quantity: Number(quantity),
      })

      toast.success("Material inward added successfully")
      resetForm()
      fetchProducts()
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Inward operation failed")
    }
  }

  const submitOutward = async () => {
    if (!productId || !quantity || !reason) {
      toast.error("Please fill all required fields")
      return
    }

    try {
      await axios.post(`${API}/inventory/material-outward`, {
        product_id: productId,
        quantity: Number(quantity),
        reason,
      })

      toast.success("Material outward added successfully")
      resetForm()
      fetchProducts()
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Outward operation failed")
    }
  }

  const selectedProduct = products.find((p) => p.id === productId)
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground">
          Manage material inward, outward, and transaction history
        </p>
      </div>

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

      {/* INWARD / OUTWARD FORM */}
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
            <div>
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} - {p.product_code} (Stock: {p.stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProduct && (
              <div className="p-3 bg-muted rounded-md">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Current Stock</span>
                  <span
                    className={`font-bold ${
                      selectedProduct.stock <= selectedProduct.min_stock
                        ? "text-destructive"
                        : "text-green-600"
                    }`}
                  >
                    {selectedProduct.stock}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
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

      {/* HISTORY */}
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

            <Select
              value={filterType}
              onValueChange={(v) => {
                setFilterType(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
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

              {/* PAGINATION */}
              {totalPages > 1 && (
                <div className="flex justify-end items-center gap-3 mt-4">
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
