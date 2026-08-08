import { PrismaClient } from "@prisma/client"
const db = new PrismaClient({ log: ["error", "warn"] })
function ts() { return new Date().toISOString().split("T")[1].slice(0, 8) }
function classify(s: string): string {
  s = (s || "").toLowerCase()
  if (s.includes("cardio")) return "CARDIOLOGY"
  if (s.includes("pedia")) return "PEDIATRICS"
  if (s.includes("ortho")) return "ORTHOPEDICS"
  if (s.includes("derma")) return "DERMATOLOGY"
  if (s.includes("gyn")) return "GYNECOLOGY"
  if (s.includes("neuro")) return "NEUROLOGY"
  if (s.includes("psy")) return "PSYCHIATRY"
  if (s.includes("ent") || s.includes("otorhin")) return "ENT"
  if (s.includes("dent")) return "DENTAL"
  if (s.includes("ophthal")) return "OPHTHALMOLOGY"
  if (s.includes("gastro")) return "GASTROENTEROLOGY"
  if (s.includes("pulmo")) return "PULMONOLOGY"
  if (s.includes("uro")) return "UROLOGY"
  if (s.includes("surg")) return "GENERAL_SURGERY"
  return "GENERAL_MEDICINE"
}
async function main() {
  console.log(`[${ts()}] === Doctor Directory Seed ===`)
  const doctors = await db.account.findMany({
    where: { role: "DOCTOR" },
    select: { id: true, name: true, specialization: true, city: true, state: true, pincode: true, landmark: true },
  })
  console.log(`[${ts()}] Found ${doctors.length} doctors`)
  const existing = await db.doctorDirectoryEntry.findMany({ select: { doctorId: true } })
  const existingIds = new Set(existing.map(e => e.doctorId))
  const toCreate = doctors.filter(d => !existingIds.has(d.id)).map(d => {
    const spec = d.specialization || "General Medicine"
    return {
      doctorId: d.id, specialization: spec, category: classify(spec),
      city: d.city || "", state: d.state || "", pincode: d.pincode || "",
      area: d.landmark || null,
      searchVector: `${d.name} ${spec} ${d.city} ${d.pincode}`.toLowerCase(),
    }
  })
  console.log(`[${ts()}] Creating ${toCreate.length} directory entries...`)
  const BATCH = 100
  let created = 0
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH)
    const n = Math.floor(i / BATCH) + 1
    const total = Math.ceil(toCreate.length / BATCH)
    try {
      const r = await db.doctorDirectoryEntry.createMany({ data: batch, skipDuplicates: true })
      created += r.count
      console.log(`[${ts()}]   Batch ${n}/${total}: ${r.count} created (total: ${created})`)
    } catch (e) { console.error(`Batch ${n} failed:`, e) }
  }
  console.log(`\n[${ts()}] Done! Created: ${created}`)
  const total = await db.doctorDirectoryEntry.count()
  console.log(`Total directory entries: ${total}`)
}
const timer = setTimeout(() => { console.error("Timed out"); process.exit(2) }, 5 * 60 * 1000)
main().catch(e => { console.error("FATAL:", e); process.exit(1) }).finally(() => { clearTimeout(timer); db.$disconnect() })