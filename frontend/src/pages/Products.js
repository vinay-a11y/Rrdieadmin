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
  const [uploading, setUploading] = useState(false)
  const [imagePreviews, setImagePreviews] = useState([])
  const [variantOpen, setVariantOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)

  const [variants, setVariants] = useState([]) // Default to empty array for optional variants

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category_id: "",
    cost_price: "",
    min_selling_price: "",
    selling_price: "",
    stock: "0", // Added stock field for base product
    min_stock: "",
    sku: "",
    images: [],
  })

  // ================================
  // STEP 1: Detect Services Category
  // ================================
  const servicesCategory = categories.find((c) => c.name.toLowerCase() === "services")

  const isServiceSelected = !!servicesCategory && formData.category_id === servicesCategory.id

  useEffect(() => {
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

  const removeImage = (index) => {
    const updatedImages = formData.images.filter((_, i) => i !== index)

    setFormData((prev) => ({
      ...prev,
      images: updatedImages,
    }))

    setImagePreviews(updatedImages)
  }

  const handleImageUpload = async (file) => {
    if (!file) return

    if (formData.images.length >= 5) {
      toast.error("Maximum 5 images allowed")
      return
    }

    const token = localStorage.getItem("token")
    const formDataUpload = new FormData()
    formDataUpload.append("file", file)

    try {
      setUploading(true)

      const res = await axios.post(`${API}/upload/product-image`, formDataUpload, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      })

      setFormData((prev) => {
        const newImages = [...prev.images, res.data.url].slice(0, 5)
        return {
          ...prev,
          images: newImages,
        }
      })

      setImagePreviews((prev) => [...prev, res.data.url].slice(0, 5))

      toast.success("Image uploaded")
    } catch {
      toast.error("Image upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleVariantImageUpload = async (file, index) => {
    if (!file) return

    const token = localStorage.getItem("token")
    const formDataUpload = new FormData()
    formDataUpload.append("file", file)

    try {
      const res = await axios.post(`${API}/upload/variant-image`, formDataUpload, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      })

      const copy = [...variants]
      copy[index].image_url = res.data.url
      setVariants(copy)

      toast.success("Variant image uploaded")
    } catch {
      toast.error("Variant image upload failed")
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

    const hasValidVariants = variants.some((v) => v.v_sku && v.v_sku.trim() !== "")

    const finalVariants =
      isServiceSelected || !hasValidVariants
        ? []
        : variants
            .filter((v) => v.v_sku && v.v_sku.trim() !== "")
            .map((v) => ({
              v_sku: v.v_sku || "",
              variant_name: v.variant_name || null,
              color: v.color || null,
              size: v.size || null,
              stock: Number.parseInt(v.stock || 0),
              image_url: v.image_url || null,
              qr_code_url: null,
            }))

    const payload = {
      name: formData.name,
      description: formData.description || null,
      category_id: formData.category_id,

      cost_price: Number.parseFloat(formData.cost_price || 0),
      selling_price: Number.parseFloat(formData.selling_price || 0),
      min_selling_price: Number.parseFloat(formData.min_selling_price || 0),

      min_stock: isServiceSelected ? 0 : Number.parseInt(formData.min_stock || 0),
      sku: formData.sku || "",
      images: formData.images || [],

      is_service: isServiceSelected ? 1 : 0,
      variants: finalVariants,
      qr_code_url: null, // Added to match backend schema expectations
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
      setVariants([
        {
          v_sku: "",
          variant_name: "",
          color: "",
          size: "",
          stock: 0,
          image_url: "",
        },
      ])
      setOpen(false)
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save product")
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)

    const isService = product.is_service === 1 || product.category_name?.toLowerCase() === "services"

    setFormData({
      name: product.name || "",
      description: product.description || "",
      category_id: product.category_id || "",
      selling_price: product.selling_price?.toString() || "",
      min_selling_price: product.min_selling_price?.toString() || "",
      stock: isService ? "0" : product.stock?.toString() || "",
      min_stock: isService ? "0" : product.min_stock?.toString() || "",
      sku: product.sku || "",
      images: Array.isArray(product.images) ? product.images : [],
      cost_price: role === "admin" ? product.cost_price?.toString() || "" : "",
    })

    if (!isService && Array.isArray(product.variants)) {
      setVariants(
        product.variants.map((v) => ({
          v_sku: v.v_sku || "",
          variant_name: v.variant_name || "",
          color: v.color || "",
          size: v.size || "",
          stock: Number(v.stock) || 0,
          image_url: v.image_url || "",
          qr_code_url: v.qr_code_url || null,
        })),
      )
    } else {
      setVariants([
        {
          v_sku: "",
          variant_name: "",
          color: "",
          size: "",
          stock: 0,
          image_url: "",
        },
      ])
    }

    setImagePreviews(Array.isArray(product.images) ? product.images : [])
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
    setImagePreviews([])

    setFormData({
      name: "",
      description: "",
      category_id: "",
      cost_price: "",
      min_selling_price: "",
      selling_price: "",
      stock: "0", // Reset stock to default value
      min_stock: "",
      sku: "",
      images: [],
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

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    onValueChange={(v) => {
                      const selectedCategory = categories.find((c) => c.id === v)
                      const isService = selectedCategory?.name?.toLowerCase() === "services"

                      setFormData({
                        ...formData,
                        category_id: v,
                        stock: isService ? "0" : formData.stock,
                        min_stock: isService ? "0" : formData.min_stock,
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>

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

                {/* PRODUCT IMAGE */}
                <div className="space-y-2">
                  <Label>Product Image</Label>

                  <div className="flex gap-3 items-center">
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={uploading || formData.images.length >= 5}
                      onChange={(e) => handleImageUpload(e.target.files[0])}
                    />
                  </div>

                  {uploading && <p className="text-sm text-muted-foreground">Uploading image…</p>}

                  <div className="flex gap-2 flex-wrap">
                    {imagePreviews.map((img, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={img || "/placeholder.svg"}
                          className={`w-24 h-24 object-cover rounded border ${
                            index === 0 ? "ring-2 ring-green-500" : ""
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center"
                        >
                          ✕
                        </button>

                        {index === 0 && (
                          <span className="absolute bottom-1 left-1 bg-green-600 text-white text-xs px-1 rounded">
                            Main
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* PRICING */}
                <div className="grid grid-cols-2 gap-4">
                  {role === "admin" && (
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
                  )}

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

                {/* VARIANTS */}
                {!isServiceSelected && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg">Variants (Optional)</Label>
                      <span className="text-xs text-muted-foreground">Leave V-SKU empty to skip variants</span>
                    </div>

                    {variants.map((v, index) => (
                      <div key={index} className="grid grid-cols-6 gap-2 border p-3 rounded-md">
                        <Input
                          placeholder="V-SKU"
                          value={v.v_sku}
                          onChange={(e) => {
                            const copy = [...variants]
                            copy[index].v_sku = e.target.value
                            setVariants(copy)
                          }}
                        />

                        <Input
                          placeholder="Name"
                          value={v.variant_name}
                          onChange={(e) => {
                            const copy = [...variants]
                            copy[index].variant_name = e.target.value
                            setVariants(copy)
                          }}
                        />

                        <Input
                          placeholder="Color"
                          value={v.color}
                          onChange={(e) => {
                            const copy = [...variants]
                            copy[index].color = e.target.value
                            setVariants(copy)
                          }}
                        />

                        <Input
                          placeholder="Size"
                          value={v.size}
                          onChange={(e) => {
                            const copy = [...variants]
                            copy[index].size = e.target.value
                            setVariants(copy)
                          }}
                        />

                        <Input
                          type="number"
                          placeholder="Stock"
                          value={v.stock}
                          onChange={(e) => {
                            const copy = [...variants]
                            copy[index].stock = Number(e.target.value)
                            setVariants(copy)
                          }}
                        />

                        <div className="flex flex-col gap-1">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleVariantImageUpload(e.target.files[0], index)}
                          />

                          {v.image_url && (
                            <img
                              src={v.image_url || "/placeholder.svg"}
                              alt="Variant"
                              className="w-12 h-12 object-cover rounded border"
                            />
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setVariants(variants.filter((_, i) => i !== index))}
                          disabled={variants.length === 1}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setVariants([
                          ...variants,
                          {
                            v_sku: "",
                            variant_name: "",
                            color: "",
                            size: "",
                            stock: 0,
                            image_url: "",
                          },
                        ])
                      }
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Variant
                    </Button>
                  </div>
                )}

                {/* STOCK */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Stock</Label>
                    <Input
                      type="number"
                      value={formData.stock}
                      disabled={isServiceSelected}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stock: e.target.value,
                        })
                      }
                      required={!isServiceSelected}
                    />

                    {isServiceSelected && (
                      <p className="text-xs text-muted-foreground mt-1">Services do not use inventory stock</p>
                    )}
                  </div>

                  <div>
                    <Label>Minimum Stock Alert</Label>
                    <Input
                      type="number"
                      value={formData.min_stock}
                      disabled={isServiceSelected}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_stock: e.target.value,
                        })
                      }
                      required={!isServiceSelected}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={uploading}>
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
            <SelectValue placeholder="All Categories" className="text-gray-400" />
          </SelectTrigger>

          <SelectContent className="bg-black text-white border border-gray-700">
            <SelectItem value="all" className="text-white hover:bg-gray-800 focus:bg-gray-800">
              All Categories
            </SelectItem>

            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-white hover:bg-gray-800 focus:bg-gray-800">
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
            <SelectItem value="none" className="text-white hover:bg-gray-800 focus:bg-gray-800">
              Default Sort
            </SelectItem>

            <SelectItem value="low-high" className="text-white hover:bg-gray-800 focus:bg-gray-800">
              Price: Low to High
            </SelectItem>

            <SelectItem value="high-low" className="text-white hover:bg-gray-800 focus:bg-gray-800">
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
                <th className="p-2 text-left">Image</th>

                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-left">SKU</th>
                <th className="p-2 text-left">QR</th>

                {role === "admin" && <th className="p-2 text-left">Cost</th>}
                {role === "admin" && <th className="p-2 text-left">Min Selling</th>}
                <th className="p-2 text-left">Sell</th>
                <th className="p-2 text-left">Stock</th>
                <th className="p-2 text-left">Variants</th>

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
                  <td className="p-2 font-medium">
                    {p.name}
                    {p.variants?.length > 0 && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                        {p.variants.length} variants
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {Array.isArray(p.images) && p.images.length > 0 ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            View Images
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>{p.name} – Images</DialogTitle>
                          </DialogHeader>

                          <div className="flex gap-4 overflow-x-auto pb-2">
                            {p.images.map((img, idx) => (
                              <img
                                key={idx}
                                src={img || "/placeholder.svg"}
                                alt={`Product ${idx}`}
                                className="h-40 w-auto rounded-lg border object-cover flex-shrink-0"
                              />
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span className="text-muted-foreground text-sm">No images</span>
                    )}
                  </td>

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
                            <img src={p.qr_code_url || "/placeholder.svg"} alt="QR Code" />
                            <p className="font-mono text-sm">{p.sku}</p>

                            <Button onClick={() => window.open(p.qr_code_url, "_blank")}>Download QR</Button>
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
                  <td className="p-2">
                    {Array.isArray(p.variants) && p.variants.length > 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedProduct(p)
                          setVariantOpen(true)
                        }}
                      >
                        View ({p.variants.length})
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
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

      <Dialog open={variantOpen} onOpenChange={setVariantOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Variants – {selectedProduct?.name}</DialogTitle>
          </DialogHeader>

          {!selectedProduct?.variants?.length ? (
            <p className="text-muted-foreground">No variants found</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-sm text-muted-foreground">
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">V-SKU</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Color</th>
                  <th className="p-2 text-left">Size</th>
                  <th className="p-2 text-left">Stock</th>
                  <th className="p-2 text-left">Image</th>
                  <th className="p-2 text-left">QR</th>
                </tr>
              </thead>

              <tbody>
                {selectedProduct.variants.map((v, i) => (
                  <tr key={v.v_sku} className="border-b">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2 font-mono text-sm">{v.v_sku}</td>
                    <td className="p-2">{v.variant_name || "-"}</td>
                    <td className="p-2">{v.color || "-"}</td>
                    <td className="p-2">{v.size || "-"}</td>

                    <td className={`p-2 font-semibold ${v.stock <= 0 ? "text-red-600" : "text-green-600"}`}>
                      {v.stock}
                    </td>

                    <td className="p-2 flex gap-2 items-center">
                      {v.image_url ? (
                        <img
                          src={v.image_url || "/placeholder.svg"}
                          className="w-12 h-12 object-cover rounded border"
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">N/A</span>
                      )}
                    </td>

                    <td className="p-2">
                      {v.qr_code_url ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <QrCode className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </DialogTrigger>

                          <DialogContent className="max-w-sm">
                            <DialogHeader>
                              <DialogTitle>Variant QR – {v.v_sku}</DialogTitle>
                            </DialogHeader>

                            <div className="flex flex-col items-center gap-3">
                              <img src={v.qr_code_url || "/placeholder.svg"} alt="Variant QR" />
                              <p className="font-mono text-sm">{v.v_sku}</p>

                              <Button onClick={() => window.open(v.qr_code_url, "_blank")}>Download QR</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <span className="text-muted-foreground text-sm">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Products
