"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { format, parseISO } from "date-fns"
import { toast } from "sonner"

import { useAuthStore } from "@/lib/auth-store"
import { apiFetch } from "@/lib/api"
import { cn, doctorName, initials } from "@/lib/utils"
import {
  StatCard,
  EmptyState,
  HeroBanner,
} from "@/components/dashboard/shared/primitives"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  Stethoscope,
  Search,
  MapPin,
  Phone,
  Mail,
  IndianRupee,
  Star,
  StarHalf,
  BadgeCheck,
  Clock,
  Languages,
  GraduationCap,
  Building2,
  Calendar,
  X,
  Loader2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Users,
  Save,
  Crown,
} from "lucide-react"

// ─────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────
type SortKey = "rating" | "experience" | "fee"

interface CategoryOption {
  value: string
  label: string
  color: string
}

const CATEGORIES: CategoryOption[] = [
  { value: "GENERAL_MEDICINE", label: "General Medicine", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
  { value: "CARDIOLOGY", label: "Cardiology", color: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" },
  { value: "PEDIATRICS", label: "Pediatrics", color: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" },
  { value: "ORTHOPEDICS", label: "Orthopedics", color: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300" },
  { value: "DERMATOLOGY", label: "Dermatology", color: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" },
  { value: "GYNECOLOGY", label: "Gynecology", color: "bg-pink-50 text-pink-700 dark:bg-pink-500/10 dark:text-pink-300" },
  { value: "NEUROLOGY", label: "Neurology", color: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300" },
  { value: "PSYCHIATRY", label: "Psychiatry", color: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300" },
  { value: "ENT", label: "ENT", color: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" },
  { value: "DENTAL", label: "Dental", color: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300" },
  { value: "AYURVEDA", label: "Ayurveda", color: "bg-lime-50 text-lime-700 dark:bg-lime-500/10 dark:text-lime-300" },
  { value: "HOMEOPATHY", label: "Homeopathy", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" },
  { value: "OPHTHALMOLOGY", label: "Ophthalmology", color: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300" },
]

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
)

const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.color])
)

interface DirDoctor {
  id: string
  name: string
  mobile?: string | null
  email?: string | null
  addressLine?: string | null
  landmark?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  capacityPerHour?: number | null
  membershipNumber?: string | null
  membershipVerified?: boolean | null
}

interface DirEntry {
  id: string
  doctorId: string
  specialization: string
  category: string
  city: string
  state: string
  pincode: string
  area?: string | null
  experienceYears: number
  qualifications?: string | null
  languages?: string | null
  consultationFee: number
  isAvailable: boolean
  rating: number
  totalRatings: number
  distanceKm?: number | null
  doctor: DirDoctor
}

interface DirResponse {
  doctors: DirEntry[]
  total: number
  offset: number
  limit: number
}

interface RatingItem {
  id: string
  score: number
  comment?: string | null
  createdAt: string
  from?: { id: string; name: string } | null
}

interface RatingsResponse {
  ratings: RatingItem[]
  avg: number
}

interface MyEntryResponse {
  ok: boolean
  entry?: DirEntry
}

const PAGE_SIZE = 9

// ─────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────
function parseLanguages(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return raw
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.5
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rating ${rating.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        if (i < full)
          return <Star key={i} size={size} className="fill-amber-400 text-amber-400" />
        if (i === full && hasHalf)
          return <StarHalf key={i} size={size} className="fill-amber-400 text-amber-400" />
        return <Star key={i} size={size} className="text-amber-300/50 dark:text-amber-500/30" />
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  Doctor Card (results grid item)
// ─────────────────────────────────────────────────────────
function DoctorCard({
  entry,
  onBook,
  onView,
  index,
}: {
  entry: DirEntry
  onBook: () => void
  onView: () => void
  index: number
}) {
  const langs = parseLanguages(entry.languages)
  const colorClass =
    CATEGORY_COLOR[entry.category] ||
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
  const doc = entry.doctor || ({} as DirDoctor)
  const displayName = doctorName(doc.name || "Doctor")

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Card className="group relative flex h-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 opacity-0 transition-opacity group-hover:opacity-100" />
        <CardContent className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 shrink-0 ring-2 ring-emerald-100 dark:ring-emerald-500/20">
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
                {initials(doc.name || "Dr")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate font-semibold leading-tight">{displayName}</h3>
                {doc.membershipVerified && (
                  <BadgeCheck
                    size={16}
                    className="shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-label="Verified doctor"
                  />
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {entry.specialization}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className={cn("h-5 px-2 text-[10px] font-semibold", colorClass)}>
                  {CATEGORY_LABEL[entry.category] || entry.category}
                </Badge>
                {entry.rating >= 4.5 && entry.totalRatings >= 5 && (
                  <Badge className="h-5 gap-0.5 bg-amber-100 px-2 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <Crown size={10} />
                    Top Rated
                  </Badge>
                )}
                {!entry.isAvailable && (
                  <Badge variant="outline" className="h-5 px-2 text-[10px] text-rose-600 dark:text-rose-400">
                    Offline
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {entry.qualifications && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <GraduationCap size={14} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="line-clamp-2">{entry.qualifications}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
              <span className="text-muted-foreground">{entry.experienceYears}+ yrs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <IndianRupee size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium">{entry.consultationFee}</span>
              <span className="text-muted-foreground">/visit</span>
            </div>
          </div>

          {langs.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs">
              <Languages size={14} className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
              <div className="flex flex-wrap gap-1">
                {langs.slice(0, 4).map((l) => (
                  <span
                    key={l}
                    className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin size={14} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span className="line-clamp-2">
              {[entry.area, entry.city, entry.pincode].filter(Boolean).join(", ") || "Location not specified"}
            </span>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-dashed pt-3">
            <div className="flex items-center gap-1.5">
              <Stars rating={entry.rating} />
              <span className="text-xs font-semibold">{entry.rating.toFixed(1)}</span>
              <span className="text-[10px] text-muted-foreground">({entry.totalRatings})</span>
            </div>
            {typeof entry.distanceKm === "number" && (
              <Badge variant="outline" className="h-5 px-2 text-[10px] text-emerald-700 dark:text-emerald-300">
                <LocateFixed size={10} className="mr-1" />
                {entry.distanceKm < 1
                  ? `${Math.round(entry.distanceKm * 1000)} m`
                  : `${entry.distanceKm.toFixed(1)} km`}
              </Badge>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-9 flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm hover:from-emerald-700 hover:to-teal-700"
              onClick={onBook}
            >
              <Calendar size={14} className="mr-1.5" />
              Book Appointment
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={onView}>
              View Profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────
//  Loading Skeletons
// ─────────────────────────────────────────────────────────
function DoctorSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-2/3 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────
//  Doctor Profile Dialog
// ─────────────────────────────────────────────────────────
function DoctorProfileDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: DirEntry | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [ratings, setRatings] = useState<RatingItem[]>([])
  const [loadingRatings, setLoadingRatings] = useState(false)
  const [avg, setAvg] = useState(0)

  useEffect(() => {
    if (!open || !entry) return
    let cancelled = false
    void (async () => {
      setLoadingRatings(true)
      try {
        const r = await apiFetch<RatingsResponse>(`/api/ratings?toId=${entry.doctorId}`)
        if (cancelled) return
        setRatings(r.ratings || [])
        setAvg(r.avg || 0)
      } catch {
        if (!cancelled) {
          setRatings([])
          setAvg(0)
        }
      } finally {
        if (!cancelled) setLoadingRatings(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, entry])

  if (!entry) return null
  const doc = entry.doctor || ({} as DirDoctor)
  const langs = parseLanguages(entry.languages)
  const colorClass =
    CATEGORY_COLOR[entry.category] ||
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-emerald-100 dark:ring-emerald-500/20">
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white">
                {initials(doc.name || "Dr")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2">
                <span className="truncate">{doctorName(doc.name || "Doctor")}</span>
                {doc.membershipVerified && (
                  <BadgeCheck size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {entry.specialization}
              </DialogDescription>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={cn("h-6 px-2 text-xs font-semibold", colorClass)}>
                  {CATEGORY_LABEL[entry.category] || entry.category}
                </Badge>
                <div className="flex items-center gap-1">
                  <Stars rating={avg || entry.rating} size={14} />
                  <span className="text-xs font-semibold">
                    {(avg || entry.rating).toFixed(1)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    ({ratings.length || entry.totalRatings} ratings)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-emerald-50/40 p-3 dark:bg-emerald-500/5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Clock size={12} /> Experience
              </div>
              <p className="mt-1 text-lg font-bold">{entry.experienceYears}+ years</p>
            </div>
            <div className="rounded-lg border bg-teal-50/40 p-3 dark:bg-teal-500/5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <IndianRupee size={12} /> Consultation
              </div>
              <p className="mt-1 text-lg font-bold">
                ₹{entry.consultationFee}
                <span className="text-xs font-normal text-muted-foreground"> /visit</span>
              </p>
            </div>
            <div className="rounded-lg border bg-amber-50/40 p-3 dark:bg-amber-500/5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Users size={12} /> Capacity
              </div>
              <p className="mt-1 text-lg font-bold">
                {doc.capacityPerHour || "—"}
                <span className="text-xs font-normal text-muted-foreground"> /hr</span>
              </p>
            </div>
          </div>

          {entry.qualifications && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <GraduationCap size={14} className="text-emerald-600 dark:text-emerald-400" />
                Qualifications
              </div>
              <p className="mt-1.5 text-sm">{entry.qualifications}</p>
            </div>
          )}

          {langs.length > 0 && (
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Languages size={14} className="text-violet-600 dark:text-violet-400" />
                Languages Spoken
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {langs.map((l) => (
                  <span
                    key={l}
                    className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin size={14} className="text-rose-600 dark:text-rose-400" />
              Clinic / Location
            </div>
            <div className="mt-1.5 space-y-0.5 text-sm">
              {doc.addressLine && <p className="text-muted-foreground">{doc.addressLine}</p>}
              <p>
                {[entry.area, entry.city, entry.state].filter(Boolean).join(", ")}
                {entry.pincode && ` - ${entry.pincode}`}
              </p>
            </div>
            <Separator className="my-3" />
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {doc.mobile && (
                <a href={`tel:${doc.mobile}`} className="flex items-center gap-2 text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-400">
                  <Phone size={14} className="text-emerald-600 dark:text-emerald-400" />
                  {doc.mobile}
                </a>
              )}
              {doc.email && (
                <a href={`mailto:${doc.email}`} className="flex items-center gap-2 truncate text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-400">
                  <Mail size={14} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">{doc.email}</span>
                </a>
              )}
            </div>
            {doc.membershipNumber && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Membership #: <span className="font-mono">{doc.membershipNumber}</span>
              </p>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Star size={14} className="text-amber-500" />
                Recent Ratings
              </div>
              {loadingRatings && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            </div>
            <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
              {ratings.length === 0 && !loadingRatings && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No ratings yet. Be the first to review after your visit.
                </p>
              )}
              {ratings.map((r) => (
                <div key={r.id} className="rounded-md border bg-muted/30 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {r.from?.name || "Anonymous patient"}
                    </span>
                    <div className="flex items-center gap-1">
                      <Stars rating={r.score} size={11} />
                      <span className="text-[10px] text-muted-foreground">
                        {format(parseISO(r.createdAt), "dd MMM yyyy")}
                      </span>
                    </div>
                  </div>
                  {r.comment && (
                    <p className="mt-1 text-xs text-muted-foreground">&ldquo;{r.comment}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────
//  My Directory Entry Card (for DOCTOR / ORGANIZATION roles)
// ─────────────────────────────────────────────────────────
function MyDirectoryEntryCard({
  onSaved,
}: {
  onSaved?: () => void
}) {
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entry, setEntry] = useState<DirEntry | null>(null)
  const [form, setForm] = useState({
    qualifications: "",
    experienceYears: "",
    consultationFee: "",
    languages: "",
    area: "",
    category: "",
  })

  const loadMyEntry = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await apiFetch<DirResponse>(
        `/api/doctor-directory?search=${encodeURIComponent(user.name || "")}&limit=50`
      )
      const mine = (res.doctors || []).find((d) => d.doctorId === user.id) || null
      setEntry(mine)
      if (mine) {
        setForm({
          qualifications: mine.qualifications || "",
          experienceYears: String(mine.experienceYears || 0),
          consultationFee: String(mine.consultationFee || 0),
          languages: parseLanguages(mine.languages).join(", "),
          area: mine.area || "",
          category: mine.category,
        })
      }
    } catch {
      /* not fatal */
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) loadMyEntry()
  }, [user, loadMyEntry])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      const langs = form.languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      await apiFetch<MyEntryResponse>("/api/doctor-directory", {
        method: "POST",
        body: JSON.stringify({
          doctorId: user.id,
          qualifications: form.qualifications || undefined,
          experienceYears: Number(form.experienceYears) || 0,
          consultationFee: Number(form.consultationFee) || 0,
          languages: langs.length ? langs : undefined,
          area: form.area || undefined,
          category: form.category || undefined,
        }),
      })
      toast.success("Directory entry updated", {
        description: "Your profile is now visible to patients searching the directory.",
      })
      setOpen(false)
      await loadMyEntry()
      onSaved?.()
    } catch (e) {
      toast.error("Failed to update entry", { description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <Card className="mb-4 border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 dark:border-emerald-500/20 dark:from-emerald-500/5 dark:to-teal-500/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope size={16} className="text-emerald-600 dark:text-emerald-400" />
              My Directory Entry
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Keep your directory listing up-to-date so patients can find you.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <SlidersHorizontal size={14} className="mr-1.5" />
            {entry ? "Edit Entry" : "Create Entry"}
          </Button>
        </div>
      </CardHeader>
      {entry && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="mt-0.5 font-semibold">{CATEGORY_LABEL[entry.category] || entry.category}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Experience</p>
              <p className="mt-0.5 font-semibold">{entry.experienceYears}+ yrs</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fee</p>
              <p className="mt-0.5 font-semibold">₹{entry.consultationFee}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Rating</p>
              <p className="mt-0.5 font-semibold">
                {entry.rating.toFixed(1)} <span className="text-muted-foreground">({entry.totalRatings})</span>
              </p>
            </div>
          </div>
        </CardContent>
      )}
      {loading && !entry && (
        <CardContent className="pt-0">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit My Directory Entry</DialogTitle>
            <DialogDescription>
              Update your specialization details. These appear publicly to patients.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Qualifications</Label>
              <Input
                placeholder="MBBS, MD (Medicine)"
                value={form.qualifications}
                onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Experience (years)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="10"
                  value={form.experienceYears}
                  onChange={(e) => setForm({ ...form, experienceYears: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Consultation Fee (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="500"
                  value={form.consultationFee}
                  onChange={(e) => setForm({ ...form, consultationFee: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Languages (comma separated)</Label>
              <Input
                placeholder="English, Hindi, Marathi"
                value={form.languages}
                onChange={(e) => setForm({ ...form, languages: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Area / Locality</Label>
              <Input
                placeholder="Andheri West"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────
//  Filter Bar
// ─────────────────────────────────────────────────────────
function FilterBar({
  filters,
  setFilters,
  onApply,
  onClear,
  applying,
}: {
  filters: {
    search: string
    category: string
    city: string
    pincode: string
    sort: SortKey
  }
  setFilters: (f: typeof filters) => void
  onApply: () => void
  onClear: () => void
  applying: boolean
}) {
  return (
    <Card className="sticky top-2 z-10 border-emerald-100/60 shadow-sm backdrop-blur dark:border-emerald-500/10">
      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Search size={11} className="mr-1 inline" /> Search
            </Label>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, specialization, city…"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onApply()
                }}
                className="h-9 pl-9"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Category
            </Label>
            <Select
              value={filters.category}
              onValueChange={(v) => setFilters({ ...filters, category: v === "__all" ? "" : v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Building2 size={11} className="mr-1 inline" /> City
            </Label>
            <Input
              placeholder="Mumbai"
              value={filters.city}
              onChange={(e) => setFilters({ ...filters, city: e.target.value })}
              className="h-9"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin size={11} className="mr-1 inline" /> Pincode
            </Label>
            <Input
              placeholder="400001"
              value={filters.pincode}
              onChange={(e) => setFilters({ ...filters, pincode: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
              className="h-9"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Sort by
            </Label>
            <Select
              value={filters.sort}
              onValueChange={(v) => setFilters({ ...filters, sort: v as SortKey })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Top Rated</SelectItem>
                <SelectItem value="experience">Most Experienced</SelectItem>
                <SelectItem value="fee">Lowest Fee</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
            <X size={14} className="mr-1" />
            Clear
          </Button>
          <Button size="sm" onClick={onApply} disabled={applying} className="bg-emerald-600 hover:bg-emerald-700">
            {applying ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <SlidersHorizontal size={14} className="mr-1.5" />}
            Apply Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────────────────
export interface DoctorDirectoryProps {
  /** Called when patient clicks "Book Appointment". Parent can switch to booking tab. */
  onBookAppointment?: (doctorId: string) => void
  /** Hide the hero (useful when embedded in a tab that already has a header). */
  hideHero?: boolean
}

export function DoctorDirectory({ onBookAppointment, hideHero }: DoctorDirectoryProps) {
  const user = useAuthStore((s) => s.user)
  const [doctors, setDoctors] = useState<DirEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [seededRef, setSeededRef] = useState(false)

  const [filters, setFilters] = useState({
    search: "",
    category: "",
    city: "",
    pincode: "",
    sort: "rating" as SortKey,
  })
  const [appliedFilters, setAppliedFilters] = useState(filters)

  const [profileEntry, setProfileEntry] = useState<DirEntry | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const canManageEntry = user?.role === "DOCTOR" || user?.role === "ORGANIZATION"

  // NOTE: Do NOT auto-fill city/pincode from the logged-in user's profile.
  // Auto-filling caused 0 results when the user's city didn't match any
  // doctor's city (e.g. user from Delhi, doctors all in Maharashtra).
  // Instead, show ALL doctors by default and let users filter manually.

  const fetchDoctors = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true)
      setApplying(true)
      try {
        const params = new URLSearchParams()
        if (appliedFilters.search) params.set("search", appliedFilters.search)
        if (appliedFilters.category) params.set("category", appliedFilters.category)
        if (appliedFilters.city) params.set("city", appliedFilters.city)
        if (appliedFilters.pincode) params.set("pincode", appliedFilters.pincode)
        params.set("sort", appliedFilters.sort)
        params.set("limit", String(PAGE_SIZE))
        params.set("offset", String(offset))

        const res = await apiFetch<DirResponse>(`/api/doctor-directory?${params.toString()}`)
        let list = res.doctors || []
        let resTotal = res.total || 0

        // Auto-seed on first empty load (only if truly no entries exist)
        if (
          list.length === 0 &&
          total === 0 &&
          !seededRef &&
          !appliedFilters.search &&
          !appliedFilters.category &&
          !appliedFilters.city &&
          !appliedFilters.pincode
        ) {
          setSeededRef(true)
          try {
            await apiFetch("/api/doctor-directory/seed", { method: "POST" })
            const retry = await apiFetch<DirResponse>(`/api/doctor-directory?${params.toString()}`)
            list = retry.doctors || []
            resTotal = retry.total || 0
            setTotal(resTotal)
            setDoctors(list)
            toast.info("Doctor directory seeded", {
              description: "Sample entries created from existing doctors.",
            })
            return
          } catch {
            /* seed failed — show empty state */
          }
        }

        // FALLBACK: If city/pincode filter returned 0 results, retry without
        // location filters so the user still sees all available doctors.
        if (
          list.length === 0 &&
          (appliedFilters.city || appliedFilters.pincode) &&
          !appliedFilters.search &&
          !appliedFilters.category
        ) {
          const fallbackParams = new URLSearchParams()
          if (appliedFilters.search) fallbackParams.set("search", appliedFilters.search)
          if (appliedFilters.category) fallbackParams.set("category", appliedFilters.category)
          fallbackParams.set("sort", appliedFilters.sort)
          fallbackParams.set("limit", String(PAGE_SIZE))
          fallbackParams.set("offset", String(offset))
          const retry = await apiFetch<DirResponse>(
            `/api/doctor-directory?${fallbackParams.toString()}`
          )
          list = retry.doctors || []
          resTotal = retry.total || 0
          if (list.length > 0) {
            toast.info("Showing all doctors", {
              description: `No doctors found in your area — showing all ${resTotal} doctors.`,
            })
          }
        }

        setDoctors(list)
        setTotal(resTotal)
      } catch (e) {
        toast.error("Failed to load doctors", { description: (e as Error).message })
        setDoctors([])
      } finally {
        setLoading(false)
        setApplying(false)
      }
    },
    [appliedFilters, offset, seededRef, total]
  )

  useEffect(() => {
    fetchDoctors()
  }, [appliedFilters, offset])

  const handleApply = () => {
    setOffset(0)
    setAppliedFilters(filters)
  }
  const handleClear = () => {
    setFilters({ search: "", category: "", city: "", pincode: "", sort: "rating" })
    setAppliedFilters({ search: "", category: "", city: "", pincode: "", sort: "rating" })
    setOffset(0)
  }
  const handleBook = (entry: DirEntry) => {
    if (onBookAppointment) {
      onBookAppointment(entry.doctorId)
    } else if (user?.role === "PATIENT") {
      toast("Login as patient to book", {
        description: "Switch to patient dashboard to book appointments.",
      })
    } else if (!user) {
      toast.error("Please log in to book", {
        description: "Only patients can book appointments.",
      })
    } else {
      toast("Login as patient to book", {
        description: "Only patients can book appointments.",
      })
    }
  }
  const handleView = (entry: DirEntry) => {
    setProfileEntry(entry)
    setProfileOpen(true)
  }

  const startIdx = total === 0 ? 0 : offset + 1
  const endIdx = Math.min(offset + doctors.length, total)
  const hasNext = offset + doctors.length < total
  const hasPrev = offset > 0

  const activeFilterCount = useMemo(() => {
    return [
      appliedFilters.search,
      appliedFilters.category,
      appliedFilters.city,
      appliedFilters.pincode,
    ].filter(Boolean).length
  }, [appliedFilters])

  return (
    <div className="space-y-4">
      {!hideHero && (
        <HeroBanner
          title="Find Doctors"
          subtitle="Browse verified doctors by specialization, city, or pincode"
          icon={Stethoscope}
        >
          <div className="hidden sm:block">
            <StatCard
              title="Available"
              value={total}
              icon={BadgeCheck}
              color="bg-white/20 text-white"
            />
          </div>
        </HeroBanner>
      )}

      {canManageEntry && <MyDirectoryEntryCard onSaved={() => fetchDoctors({ silent: true })} />}

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onApply={handleApply}
        onClear={handleClear}
        applying={applying}
      />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-emerald-600" />
                Loading doctors…
              </span>
            ) : (
              <>
                Showing{" "}
                <span className="font-semibold text-foreground">{startIdx}–{endIdx}</span>{" "}
                of <span className="font-semibold text-foreground">{total}</span>
                {activeFilterCount > 0 && (
                  <Badge variant="outline" className="ml-2 h-5 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                    {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                  </Badge>
                )}
              </>
            )}
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <DoctorSkeleton key={i} />
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No doctors found"
            description="Try adjusting your filters — clear the search, change the category, or broaden the pincode / city."
            action={
              <Button variant="outline" size="sm" onClick={handleClear}>
                <X size={14} className="mr-1.5" /> Clear Filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {doctors.map((entry, i) => (
                <DoctorCard
                  key={entry.id}
                  entry={entry}
                  index={i}
                  onBook={() => handleBook(entry)}
                  onView={() => handleView(entry)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev || applying}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            <ChevronLeft size={14} className="mr-1" />
            Previous
          </Button>
          <p className="text-xs text-muted-foreground">
            Page <span className="font-semibold">{Math.floor(offset / PAGE_SIZE) + 1}</span> of{" "}
            <span className="font-semibold">{Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext || applying}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
            <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      )}

      <DoctorProfileDialog entry={profileEntry} open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  )
}

export default DoctorDirectory
