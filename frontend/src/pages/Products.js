"use client"

import { useState, useEffect, useMemo } from "react"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, Edit, Trash2, Search } from "lucide-react"
import { QrCode } from "lucide-react"

const API = `${process.env.REACT_APP_BACKEND_URL}/api`

const Products = () => {
  const user = JSON.parse(localStorage.getItem("user") || "{}")
  const role = user?.role

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [open, setOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [priceSort, setPriceSort] = useState("none")

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category_id: "",
    cost_price: "",
    min_selling_price: "",
    selling_price: "",
    stock: "",
    min_stock: "",
    sku: "",
    image_url: "",
  })

  useEffect(() => {
    // ✅ ADDITION: SET TOKEN HERE
    const token = localStorage.getItem("token")
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`
    }

    fetchProducts()
    fetchCategories()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${API}/products`)
      setProducts(res.data)
    } catch {
      toast.error("Failed to load products")
    }
  }

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${API}/categories`)
      setCategories(res.data)
    } catch {
      toast.error("Failed to load categories")
    }
  }

  const filteredProducts = useMemo(() => {
    let data = [...products]

    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.product_code?.toLowerCase().includes(q) ||
          p.category_name?.toLowerCase().includes(q),
      )
    }

    if (categoryFilter !== "all") {
      data = data.filter((p) => p.category_id === categoryFilter)
    }

    if (priceSort === "low-high") {
      data.sort((a, b) => a.selling_price - b.selling_price)
    } else if (priceSort === "high-low") {
      data.sort((a, b) => b.selling_price - a.selling_price)
    } else {
      data.sort((a, b) => a.name.localeCompare(b.name))
    }

    return data
  }, [products, search, categoryFilter, priceSort])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const payload = {
      name: formData.name,
      description: formData.description,
      category_id: formData.category_id,
      selling_price: Number(formData.selling_price),
      min_selling_price: Number(formData.min_selling_price),
      stock: Number(formData.stock),
      min_stock: Number(formData.min_stock),
      sku: formData.sku,
      image_url: formData.image_url,
    }

    if (role === "admin") {
      payload.cost_price = Number(formData.cost_price)
    }

    try {
      if (editingProduct) {
        await axios.put(`${API}/products/${editingProduct.id}`, payload)
        toast.success("Product updated successfully")
      } else {
        await axios.post(`${API}/products`, payload)
        toast.success("Product created successfully")
      }

      fetchProducts()
      resetForm()
      setOpen(false)
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save product")
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)

    setFormData({
      name: product.name || "",
      description: product.description || "",
      category_id: product.category_id || "",
      selling_price: product.selling_price?.toString() || "",
      min_selling_price: product.min_selling_price?.toString() || "",
      stock: product.stock?.toString() || "",
      min_stock: product.min_stock?.toString() || "",
      sku: product.sku || "",
      image_url: product.image_url || "",
      cost_price: role === "admin" ? product.cost_price?.toString() || "" : "",
    })

    setOpen(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return

    try {
      await axios.delete(`${API}/products/${id}`)
      toast.success("Product deleted")
      fetchProducts()
    } catch {
      toast.error("Failed to delete product")
    }
  }

  const resetForm = () => {
    setEditingProduct(null)
    setFormData({
      name: "",
      description: "",
      category_id: "",
      cost_price: "",
      min_selling_price: "",
      selling_price: "",
      stock: "",
      min_stock: "",
      sku: "",
      image_url: "",
    })
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Products</h1>
          <p className="text-muted-foreground">Manage your product inventory</p>
        </div>

        {role === "admin" && (
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v)
              if (!v) resetForm()
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* BASIC */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Product Name</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label>SKU</Label>
                    <Input
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Category</Label>
                  <Select
  value={formData.category_id}
  onValueChange={(v) =>
    setFormData({ ...formData, category_id: v })
  }
>
  {/* 🔹 KEEP TRIGGER DEFAULT */}
  <SelectTrigger>
    <SelectValue placeholder="Select category" />
  </SelectTrigger>

  {/* 🔹 BLACK DROPDOWN ONLY */}
  <SelectContent className="bg-black text-white border border-gray-700">
    {categories.map((c) => (
      <SelectItem
        key={c.id}
        value={c.id}
        className="focus:bg-gray-800 data-[state=checked]:bg-gray-700"
      >
        {c.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>

                </div>

                {/* PRICING */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cost Price</Label>
                    <Input
                      type="number"
                      value={formData.cost_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cost_price: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div>
                    <Label>Minimum Selling Price</Label>
                    <Input
                      type="number"
                      value={formData.min_selling_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_selling_price: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div>
                    <Label>Selling Price</Label>
                    <Input
                      type="number"
                      value={formData.selling_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          selling_price: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>

                {/* STOCK */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Stock</Label>
                    <Input
                      type="number"
                      value={formData.stock}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stock: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div>
                    <Label>Minimum Stock Alert</Label>
                    <Input
                      type="number"
                      value={formData.min_stock}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_stock: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full">
                  {editingProduct ? "Update Product" : "Create Product"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, code, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

       <Select value={categoryFilter} onValueChange={setCategoryFilter}>
  <SelectTrigger className="w-full sm:w-48 bg-black text-white border border-gray-700 focus:ring-0">
    <SelectValue
      placeholder="All Categories"
      className="text-gray-400"
    />
  </SelectTrigger>

  <SelectContent className="bg-black text-white border border-gray-700">
    <SelectItem
      value="all"
      className="text-white hover:bg-gray-800 focus:bg-gray-800"
    >
      All Categories
    </SelectItem>

    {categories.map((c) => (
      <SelectItem
        key={c.id}
        value={c.id}
        className="text-white hover:bg-gray-800 focus:bg-gray-800"
      >
        {c.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>


        <Select value={priceSort} onValueChange={setPriceSort}>
  <SelectTrigger className="w-full sm:w-48 bg-black text-white border border-gray-700 focus:ring-0">
    <SelectValue placeholder="Sort by Price" />
  </SelectTrigger>

  <SelectContent className="bg-black text-white border border-gray-700">
    <SelectItem
      value="none"
      className="text-white hover:bg-gray-800 focus:bg-gray-800"
    >
      Default Sort
    </SelectItem>

    <SelectItem
      value="low-high"
      className="text-white hover:bg-gray-800 focus:bg-gray-800"
    >
      Price: Low to High
    </SelectItem>

    <SelectItem
      value="high-low"
      className="text-white hover:bg-gray-800 focus:bg-gray-800"
    >
      Price: High to Low
    </SelectItem>
  </SelectContent>
</Select>

      </div>

      {/* TABLE */}
      <Card>
        <CardHeader>
          <CardTitle>Product List ({filteredProducts.length})</CardTitle>
        </CardHeader>

        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-sm text-muted-foreground">
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Code</th>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-left">SKU</th>
                <th className="p-2 text-left">QR</th>

                {role === "admin" && <th className="p-2 text-left">Cost</th>}
                {role === "admin" && <th className="p-2 text-left">Min Selling</th>}
                <th className="p-2 text-left">Sell</th>
                <th className="p-2 text-left">Stock</th>
                {role === "admin" && <th className="p-2 text-left">Min Stock</th>}
                <th className="p-2 text-left">Status</th>
                {role === "admin" && <th className="p-2 text-right">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((p, i) => (
                <tr key={p.id} className="border-b hover:bg-muted/40">
                  <td className="p-2">{i + 1}</td>
                  <td className="p-2 font-mono text-sm">{p.product_code}</td>
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2">{p.category_name}</td>
                  <td className="p-2 font-mono text-sm">{p.sku}</td>
                  <td className="p-2">
  {p.qr_code_url ? (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <QrCode className="w-4 h-4 mr-1" />
          View
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{p.name} – QR Code</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <img
            src={`${process.env.REACT_APP_BACKEND_URL}${p.qr_code_url}`}
            alt="QR Code"
            className="w-48 h-48"
          />

          <p className="font-mono text-sm">{p.sku}</p>

          <Button
            onClick={() =>
              window.open(
                `${process.env.REACT_APP_BACKEND_URL}${p.qr_code_url}`,
                "_blank"
              )
            }
          >
            Download QR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  ) : (
    <span className="text-muted-foreground text-sm">N/A</span>
  )}
</td>

                  {role === "admin" && <td className="p-2">₹{p.cost_price}</td>}

                  {role === "admin" && <td className="p-2">₹{p.min_selling_price}</td>}

                  <td className="p-2 font-semibold">₹{p.selling_price}</td>

                  <td className={`p-2 font-semibold ${p.stock <= p.min_stock ? "text-red-600" : "text-green-600"}`}>
                    {p.stock}
                  </td>

                  {role === "admin" && <td className="p-2 text-muted-foreground">{p.min_stock}</td>}

                  <td className="p-2">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        p.stock <= p.min_stock ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      }`}
                    >
                      {p.stock <= p.min_stock ? "Low Stock" : "In Stock"}
                    </span>
                  </td>

                  {role === "admin" && (
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(p)}>
                          <Edit className="w-4 h-4 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No products found matching your filters</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Products
