/**
 * Doctor Seed Script — populates the database with 1049 active practicing
 * doctors from the MMR (Mumbai Metropolitan Region) registry.
 *
 * Usage:
 *   1. Place this file at the project root (next to package.json).
 *   2. Place doctors-seed.json at the project root (same folder).
 *   3. Make sure your .env has DATABASE_URL and DIRECT_URL set (Supabase).
 *   4. Run:  bun run seed-doctors.ts
 *
 * What it does:
 *   - Reads doctors-seed.json (1049 doctors parsed from the PDF)
 *   - Checks if already seeded (idempotent — safe to run multiple times)
 *   - Inserts each doctor as an Account with role="DOCTOR"
 *   - Uses the doctor's MMR-DOC-XXXX ID as their password (hashed with scrypt)
 *   - Sets membershipVerified=true, govtIdType="MEDICAL_COUNCIL"
 *
 * Doctor login credentials (for testing):
 *   Email: mmr-doc-0001@mmr-health.in  (lowercase of their MMR-DOC-XXXX ID)
 *   Password: MMR-DOC-0001  (their ID — they can change it after first login)
 *
 * The seed is idempotent: if you run it twice, the second run detects the
 * already-seeded doctors by their email and skips.
 */

import { readFileSync } from "fs"
import { db } from "./src/lib/db"
import { hashPassword } from "./src/lib/crypto"

interface DoctorRow {
  doctorId: string
  name: string
  qualifications: string
  specialization: string
  hospital: string
  zone: string
  subdistrict: string
  district: string
  phone: string
  email: string
  mobile: string
  passwordHash: string
  addressLine: string
  city: string
  state: string
  pincode: string
  capacityPerHour: number
}

async function main() {
  console.log("=== Doctor Seed Script ===")
  console.log("Reading doctors-seed.json...")

  const doctors: DoctorRow[] = JSON.parse(
    readFileSync("./doctors-seed.json", "utf8")
  )
  console.log(`Loaded ${doctors.length} doctors from JSON`)

  // Check existing doctors
  const existing = await db.account.count({ where: { role: "DOCTOR" } })
  console.log(`Existing doctors in DB: ${existing}`)

  // Idempotency check: if the first doctor's email already exists, skip
  const sampleEmail = doctors[0].email
  const alreadySeeded = await db.account.findUnique({ where: { email: sampleEmail } })
  if (alreadySeeded) {
    console.log(`\nAlready seeded (found ${sampleEmail}). Skipping.`)
    console.log("To re-seed, delete existing doctor accounts first.")
    return
  }

  // Insert in batches of 50 to avoid overwhelming the connection pool
  const BATCH = 50
  let inserted = 0
  let skipped = 0

  for (let i = 0; i < doctors.length; i += BATCH) {
    const batch = doctors.slice(i, i + BATCH)
    try {
      await db.$transaction(
        batch.map((d) =>
          db.account.create({
            data: {
              email: d.email,
              mobile: d.mobile,
              passwordHash: d.passwordHash,
              role: "DOCTOR",
              name: d.name,
              addressLine: d.addressLine,
              city: d.city,
              state: d.state,
              pincode: d.pincode,
              specialization: d.specialization,
              capacityPerHour: d.capacityPerHour,
              membershipNumber: d.doctorId,
              membershipVerified: true,
              govtIdType: "MEDICAL_COUNCIL",
              govtIdNumber: d.doctorId,
              abdmId: `MMR-${d.doctorId.slice(-4)}`,
            },
          })
        )
      )
      inserted += batch.length
      if (inserted % 100 === 0 || inserted === doctors.length) {
        console.log(`  Inserted ${inserted}/${doctors.length}`)
      }
    } catch (batchErr) {
      // Batch failed — fall back to individual inserts to skip the problematic one
      console.error(`Batch ${i}-${i + BATCH} failed, trying individual inserts...`)
      for (const d of batch) {
        try {
          await db.account.create({
            data: {
              email: d.email,
              mobile: d.mobile,
              passwordHash: d.passwordHash,
              role: "DOCTOR",
              name: d.name,
              addressLine: d.addressLine,
              city: d.city,
              state: d.state,
              pincode: d.pincode,
              specialization: d.specialization,
              capacityPerHour: d.capacityPerHour,
              membershipNumber: d.doctorId,
              membershipVerified: true,
              govtIdType: "MEDICAL_COUNCIL",
              govtIdNumber: d.doctorId,
              abdmId: `MMR-${d.doctorId.slice(-4)}`,
            },
          })
          inserted++
        } catch (indErr) {
          skipped++
          console.error(
            `  Skipped ${d.doctorId}:`,
            indErr instanceof Error ? indErr.message : ""
          )
        }
      }
    }
  }

  console.log(`\n=== Seed Complete ===`)
  console.log(`Inserted: ${inserted}`)
  console.log(`Skipped:  ${skipped}`)

  const total = await db.account.count({ where: { role: "DOCTOR" } })
  console.log(`Total doctors in DB now: ${total}`)

  // Show specialty distribution
  const specs = await db.account.groupBy({
    by: ["specialization"],
    where: { role: "DOCTOR" },
    _count: { specialization: true },
    orderBy: { _count: { specialization: "desc" } },
  })
  console.log("\nSpecialty distribution:")
  specs.forEach((s) => console.log(`  ${s._count.specialization}x ${s.specialization}`))

  console.log("\n=== Sample Login (for testing) ===")
  console.log("Email:    mmr-doc-0001@mmr-health.in")
  console.log("Password: MMR-DOC-0001")
}

main()
  .catch((e) => {
    console.error("FATAL:", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
