import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { auditAndSynchronizePresensi, generateFullSemesterPresensi, HISTORICAL_ARCHIVE_END_DATE } from "./src/lib/semesterPresensiGenerator";
import { isSyntheticDemoPresensi, isRecordNewer, mergePresensiLists, normalizeDateKey, getLocalDateString } from "./src/lib/attendanceUtils";

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const WALI_KELAS_FILE = path.join(DATA_DIR, "wali_kelas.json");
const PRESENSI_FILE = path.join(DATA_DIR, "presensi.json");
const DELETED_PRESENSI_FILE = path.join(DATA_DIR, "deleted_presensi.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const VERSION_FILE = path.join(DATA_DIR, "version.json");
const WHATSAPP_LOGS_FILE = path.join(DATA_DIR, "whatsapp_logs.json");
const QR_ERRORS_FILE = path.join(DATA_DIR, "qr_errors.json");

// Default Wali Kelas
const DEFAULT_WALI_KELAS = [
  { kelas: 'Kelas 1-A', nama: 'Rima Rohmatul Hasanah, S.Pd.', username: 'guru1a', pin: '28001', noWa: '085224866506', nip: '198501152010012015' },
  { kelas: 'Kelas 1-B', nama: 'Apriyanti Sri Habibah, S.Pd.Gr.', username: 'guru1b', pin: '28002', noWa: '082316552322', nip: '198802202012022008' },
  { kelas: 'Kelas 2-A', nama: 'Linda Safitri Indriyani, S.Pd.Gr.', username: 'guru2a', pin: '28003', noWa: '089662770280', nip: '198904122014032005' },
  { kelas: 'Kelas 2-B', nama: 'Rena Siti Napisah, S.Pd.Gr.', username: 'guru2b', pin: '28004', noWa: '083116544408', nip: '199006182015042007' },
  { kelas: 'Kelas 3-A', nama: 'Ayu Latifah Somantri, S.Pd.Gr.', username: 'guru3a', pin: '28005', noWa: '082119844966', nip: '199108252016052003' },
  { kelas: 'Kelas 3-B', nama: 'Ai Nursyifa, S.Pd.,MCE.', username: 'guru3b', pin: '28006', noWa: '083103898033', nip: '199210302018062002' },
  { kelas: 'Kelas 4-A', nama: 'Widia Siti Nuraeni, S.Pd.Gr.', username: 'guru4a', pin: '28007', noWa: '085721743648', nip: '199312152019072006' },
  { kelas: 'Kelas 4-B', nama: 'Mita Nurhasni Faujiah, S.Pd.,MCE.', username: 'guru4b', pin: '28008', noWa: '085797954320', nip: '199402012020082004' },
  { kelas: 'Kelas 5-A', nama: 'Tanti Maryam Kurnianti, S.Pd.Gr.', username: 'guru5a', pin: '28009', noWa: '085294842424', nip: '199504102021092009' },
  { kelas: 'Kelas 5-B', nama: 'Tedi Rismadiansah, S.Pd.Gr.', username: 'guru5b', pin: '28010', noWa: '085315265290', nip: '199606202022101001' },
  { kelas: 'Kelas 6-A', nama: 'Taufik Firdaus, S.Pd.Gr.', username: 'guru6a', pin: '28011', noWa: '082125312911', nip: '199708152023111005' },
  { kelas: 'Kelas 6-B', nama: 'Usman Fauzan Alan, S.Pd.Gr.', username: 'guru6b', pin: '28012', noWa: '085210703332', nip: '199810222024121008' }
];

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return fallback;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// In-memory master state with disk backing
let syncVersion = 1;
let lastUpdatedAt = new Date().toISOString();

const versionInfo = readJsonFile<{ version: number; updatedAt: string }>(VERSION_FILE, {
  version: 1,
  updatedAt: lastUpdatedAt,
});
syncVersion = versionInfo.version || 1;
lastUpdatedAt = versionInfo.updatedAt || lastUpdatedAt;

function incrementSyncVersion(actionLabel?: string) {
  syncVersion += 1;
  lastUpdatedAt = new Date().toISOString();
  writeJsonFile(VERSION_FILE, { version: syncVersion, updatedAt: lastUpdatedAt });
  console.log(`[Cloud Sync] Version updated to ${syncVersion} (${actionLabel || 'unknown action'}) at ${lastUpdatedAt}`);
}

// In-memory presensi cache for zero-latency recording & reporting
let cachedPresensi: any[] | null = null;

function getCachedPresensi(): any[] {
  if (cachedPresensi === null) {
    cachedPresensi = readJsonFile<any[]>(PRESENSI_FILE, []);
  }
  return cachedPresensi;
}

let savePresensiTimer: NodeJS.Timeout | null = null;
function persistPresensiToDisk(): void {
  if (savePresensiTimer) clearTimeout(savePresensiTimer);
  savePresensiTimer = setTimeout(() => {
    if (cachedPresensi) {
      try {
        fs.writeFileSync(PRESENSI_FILE, JSON.stringify(cachedPresensi), 'utf-8');
      } catch (err) {
        console.error('Error writing PRESENSI_FILE:', err);
      }
    }
  }, 100);
}

function saveCachedPresensi(records: any[]): void {
  cachedPresensi = records;
  persistPresensiToDisk();
}

interface ServerDeletedTombstone {
  key: string;
  recordId?: string;
  siswaId?: string;
  nis?: string;
  tanggal: string;
  deletedAt: number;
}

let cachedDeletedTombstones: ServerDeletedTombstone[] | null = null;

function getDeletedTombstonesList(): ServerDeletedTombstone[] {
  if (cachedDeletedTombstones === null) {
    const raw = readJsonFile<ServerDeletedTombstone[]>(DELETED_PRESENSI_FILE, []);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    cachedDeletedTombstones = Array.isArray(raw)
      ? raw.filter((t) => t && t.tanggal && (!t.deletedAt || t.deletedAt >= cutoff))
      : [];
  }
  return cachedDeletedTombstones;
}

function getDeletedTombstoneMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of getDeletedTombstonesList()) {
    if (t.key) {
      map.set(t.key, Math.max(map.get(t.key) || 0, t.deletedAt || 0));
    }
    if (t.siswaId && t.tanggal) {
      const k = `${t.siswaId}__${t.tanggal}`;
      map.set(k, Math.max(map.get(k) || 0, t.deletedAt || 0));
    }
    if (t.nis && t.nis.trim().length >= 4 && t.tanggal) {
      const k = `${t.nis.trim()}__${t.tanggal}`;
      map.set(k, Math.max(map.get(k) || 0, t.deletedAt || 0));
    }
  }
  return map;
}

function getDeletedTombstonesRecord(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of getDeletedTombstoneMap().entries()) {
    out[k] = v;
  }
  return out;
}

function saveDeletedTombstonesList(list: ServerDeletedTombstone[]): void {
  const trimmed = list.slice(-500);
  cachedDeletedTombstones = trimmed;
  writeJsonFile(DELETED_PRESENSI_FILE, trimmed);
}

function recordDeletedTombstone(entry: Omit<ServerDeletedTombstone, 'deletedAt'> & { deletedAt?: number }): void {
  const list = getDeletedTombstonesList();
  const normDate = normalizeDateKey(entry.tanggal);
  if (!normDate) return;
  const sid = entry.siswaId || entry.nis || entry.recordId || entry.key;
  const normKey = entry.key && entry.key.includes('__') ? entry.key : `${sid}__${normDate}`;
  const deletedAt = entry.deletedAt || Date.now();
  const filtered = list.filter((t) => t.key !== normKey && !(entry.recordId && t.recordId === entry.recordId));
  filtered.push({ ...entry, key: normKey, tanggal: normDate, deletedAt });
  saveDeletedTombstonesList(filtered);
}

function clearDeletedTombstoneForRecord(record: any): void {
  const list = getDeletedTombstonesList();
  if (list.length === 0) return;
  const normDate = normalizeDateKey(record.tanggal);
  const sid = record.siswaId || record.nis || record.nama;
  const key = `${sid}__${normDate}`;
  const filtered = list.filter((t) => {
    if (t.tanggal !== normDate) return true;
    if (t.key === key) return false;
    if (record.id && t.recordId === record.id) return false;
    if (record.siswaId && t.siswaId === record.siswaId) return false;
    if (record.nis && t.nis && record.nis.trim().length >= 4 && record.nis.trim() === t.nis.trim()) return false;
    return true;
  });
  if (filtered.length !== list.length) {
    saveDeletedTombstonesList(filtered);
  }
}

function arePresensiArraysEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.siswaId !== y.siswaId ||
      x.tanggal !== y.tanggal ||
      x.waktu !== y.waktu ||
      x.status !== y.status ||
      x.metode !== y.metode ||
      x.keterangan !== y.keterangan ||
      x.updatedAt !== y.updatedAt
    ) {
      return false;
    }
  }
  return true;
}

// Load initial students if file not present
if (!fs.existsSync(STUDENTS_FILE)) {
  try {
    const rawPath = path.join(process.cwd(), "src", "lib", "realStudents.json");
    if (fs.existsSync(rawPath)) {
      const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
      const mapped = raw.map((s: any) => {
        let mappedKelas = s.kelas || 'Kelas 1-A';
        const m = mappedKelas.match(/Kelas\s*(\d)\s*-?\s*([A-Za-z])/i);
        if (m) {
          mappedKelas = `Kelas ${m[1]}-${m[2].toUpperCase()}`;
        } else {
          const m2 = mappedKelas.match(/Kelas\s*(\d)/i);
          if (m2) mappedKelas = `Kelas ${m2[1]}-A`;
        }
        return {
          id: s.id,
          nis: s.nis,
          nama: s.nama,
          kelas: mappedKelas,
          jenisKelamin: s.jenisKelamin,
          waOrangTua: s.waOrangTua,
          tempatLahir: s.tempatLahir,
          tanggalLahir: s.tanggalLahir
        };
      });
      writeJsonFile(STUDENTS_FILE, mapped);
      console.log(`[Cloud Sync] Initialized ${mapped.length} students into ${STUDENTS_FILE}`);
    }
  } catch (err) {
    console.error("Failed to seed initial students:", err);
  }
}

if (!fs.existsSync(WALI_KELAS_FILE)) {
  writeJsonFile(WALI_KELAS_FILE, DEFAULT_WALI_KELAS);
}

// Initialize full semester presensi dataset from app creation/semester start to today
if (!fs.existsSync(PRESENSI_FILE)) {
  try {
    const students = readJsonFile<any[]>(STUDENTS_FILE, []);
    if (students.length > 0) {
      const generated = generateFullSemesterPresensi(students);
      saveCachedPresensi(generated);
      console.log(`[Cloud Sync] Initialized ${generated.length} semester attendance records into ${PRESENSI_FILE}`);
    }
  } catch (err) {
    console.error("Failed to seed initial semester presensi:", err);
  }
} else {
  // Prime in-memory presensi cache, purge only synthetic demo records, deduplicate, and audit archive
  try {
    const rawExisting = getCachedPresensi();
    const purgedExisting = rawExisting.filter((p: any) => !isSyntheticDemoPresensi(p));
    const purgedCount = rawExisting.length - purgedExisting.length;
    if (purgedCount > 0) {
      console.log(`[Cloud Presensi] Membersihkan ${purgedCount} rekaman sintetis lama agar absensi berjalan sesuai scan barcode & tap guru.`);
    }

    const students = readJsonFile<any[]>(STUDENTS_FILE, []);
    const tombstoneMap = getDeletedTombstoneMap();
    if (students.length > 0) {
      const auditResult = auditAndSynchronizePresensi(purgedExisting, students);
      const dedupedRecords = mergePresensiLists(auditResult.synchronizedRecords, [], students, tombstoneMap);
      if (purgedCount > 0 || !arePresensiArraysEqual(dedupedRecords, rawExisting)) {
        cachedPresensi = dedupedRecords;
        writeJsonFile(PRESENSI_FILE, dedupedRecords);
        incrementSyncVersion(`Startup Audit & Deduplicate (${dedupedRecords.length} records)`);
        console.log(`[Cloud Presensi] Tersinkronisasi: ${dedupedRecords.length} rekaman arsip & live.`);
      } else {
        cachedPresensi = dedupedRecords;
        console.log(`[Cloud Presensi] Data presensi aktif: ${cachedPresensi.length} catatan tersimpan aman in-memory.`);
      }
    } else {
      cachedPresensi = mergePresensiLists(purgedExisting, [], undefined, tombstoneMap);
    }
  } catch (err) {
    console.error("Gagal memeriksa arsip presensi pada startup:", err);
  }
}

async function startServer() {
  const app = express();

  // Allow ample JSON body for bulk student & attendance lists
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      version: syncVersion,
      updatedAt: lastUpdatedAt,
      timestamp: new Date().toISOString()
    });
  });

  // 1. Lightweight version poll for multi-device sync check
  app.get("/api/sync/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({
      version: syncVersion,
      updatedAt: lastUpdatedAt
    });
  });

  // 2. Full synchronization payload for initial load on Android / PC / other browser
  app.get("/api/sync/data", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const students = readJsonFile<any[]>(STUDENTS_FILE, []);
    const waliKelas = readJsonFile<any[]>(WALI_KELAS_FILE, DEFAULT_WALI_KELAS);
    const presensi = getCachedPresensi();
    const deletedKeys = getDeletedTombstonesRecord();
    const settings = readJsonFile<any>(SETTINGS_FILE, null);
    const accounts = readJsonFile<any[]>(ACCOUNTS_FILE, []);

    res.json({
      version: syncVersion,
      updatedAt: lastUpdatedAt,
      students,
      studentsCatalogVersion: 26,
      waliKelas,
      presensi,
      deletedKeys,
      settings,
      accounts
    });
  });

  // 3. Sync Students
  app.post("/api/sync/students", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid data format. Expected an array of students." });
      return;
    }
    writeJsonFile(STUDENTS_FILE, data);
    incrementSyncVersion(`Update Students (${data.length} records by ${updatedBy || 'user'})`);
    res.json({ success: true, version: syncVersion, total: data.length });
  });

  // 4. Sync Wali Kelas per rombel & nomor WhatsApp
  app.post("/api/sync/wali-kelas", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid data format. Expected an array of wali kelas." });
      return;
    }
    writeJsonFile(WALI_KELAS_FILE, data);
    incrementSyncVersion(`Update Wali Kelas (${data.length} records by ${updatedBy || 'user'})`);
    res.json({ success: true, version: syncVersion, total: data.length });
  });

  // 5. Sync Attendance records (with deterministic order-independent merge & tombstone support)
  app.post("/api/sync/presensi", (req, res) => {
    const { data, updatedBy, deletedKeys } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid data format. Expected an array of attendance records." });
      return;
    }

    if (Array.isArray(deletedKeys)) {
      for (const dk of deletedKeys) {
        if (dk && typeof dk.key === 'string' && dk.key.includes('__')) {
          const [sid, dt] = dk.key.split('__');
          recordDeletedTombstone({
            key: dk.key,
            siswaId: sid,
            tanggal: dt,
            deletedAt: typeof dk.ts === 'number' ? dk.ts : Date.now()
          });
        }
      }
    } else if (deletedKeys && typeof deletedKeys === 'object') {
      for (const [k, ts] of Object.entries(deletedKeys)) {
        if (k.includes('__')) {
          const [sid, dt] = k.split('__');
          recordDeletedTombstone({
            key: k,
            siswaId: sid,
            tanggal: dt,
            deletedAt: typeof ts === 'number' ? ts : Date.now()
          });
        }
      }
    }

    const students = readJsonFile<any[]>(STUDENTS_FILE, []);
    const existing = getCachedPresensi();
    const tombstoneMap = getDeletedTombstoneMap();
    const finalRecords = mergePresensiLists(existing, data, students, tombstoneMap);

    if (!arePresensiArraysEqual(finalRecords, existing)) {
      saveCachedPresensi(finalRecords);
      incrementSyncVersion(`Update Presensi (${finalRecords.length} records by ${updatedBy || 'user'})`);
    }
    res.json({ success: true, version: syncVersion, total: finalRecords.length });
  });

  // 5a. Atomic single attendance record upsert (for live QR scans & manual marks)
  app.post("/api/presensi/record", (req, res) => {
    try {
      const { record, updatedBy } = req.body;
      if (!record || !record.tanggal || !record.nama) {
        res.status(400).json({ error: "Invalid attendance record payload." });
        return;
      }

      const normDate = normalizeDateKey(record.tanggal);
      const canonicalSid = record.siswaId || record.nis || record.nama;
      const canonicalId = record.id && !/^pr-\d{4}-\d{2}-\d{2}-sis-/.test(record.id)
        ? record.id
        : `pr-${canonicalSid}-${normDate}`;
      const normalizedRecord = {
        ...record,
        id: canonicalId,
        siswaId: canonicalSid,
        tanggal: normDate,
        updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now()
      };

      clearDeletedTombstoneForRecord(normalizedRecord);

      const students = readJsonFile<any[]>(STUDENTS_FILE, []);
      const existingRecords = getCachedPresensi();
      const updatedRecords = mergePresensiLists(existingRecords, [normalizedRecord], students, getDeletedTombstoneMap());

      saveCachedPresensi(updatedRecords);
      incrementSyncVersion(`Record Presensi: ${normalizedRecord.nama} (${normalizedRecord.kelas} - ${normalizedRecord.status}) by ${updatedBy || 'Scanner'}`);
      res.json({ success: true, version: syncVersion, total: updatedRecords.length, record: normalizedRecord });
    } catch (err: any) {
      console.error("[Server Presensi Record Error]:", err);
      res.status(500).json({ error: err.message || "Failed to record attendance" });
    }
  });

  // 5b. Atomic single attendance record delete/reset (for homeroom teachers resetting accidental taps)
  app.post("/api/presensi/delete", (req, res) => {
    try {
      const { recordId, siswaId, nis, nama, kelas, tanggal, updatedBy } = req.body;
      const normDate = normalizeDateKey(tanggal || '');
      if (!normDate || (!recordId && !siswaId && !nis)) {
        res.status(400).json({ error: "Invalid delete payload. Provide tanggal and recordId or siswaId." });
        return;
      }

      const existingRecords = getCachedPresensi();
      const matchedExisting = existingRecords.find((p: any) =>
        (recordId && p.id === recordId) ||
        (normalizeDateKey(p.tanggal) === normDate && ((siswaId && p.siswaId === siswaId) || (nis && p.nis === nis)))
      );

      const resolvedSiswaId = siswaId || matchedExisting?.siswaId;
      const resolvedNis = nis || matchedExisting?.nis;
      const primaryKey = `${resolvedSiswaId || resolvedNis || recordId}__${normDate}`;

      recordDeletedTombstone({
        key: primaryKey,
        recordId,
        siswaId: resolvedSiswaId,
        nis: resolvedNis,
        tanggal: normDate,
        deletedAt: Date.now()
      });

      const filtered = existingRecords.filter((p: any) => {
        if (recordId && p.id === recordId) return false;
        const pDate = normalizeDateKey(p.tanggal);
        if (pDate !== normDate) return true;
        if (resolvedSiswaId && p.siswaId === resolvedSiswaId) return false;
        if (resolvedNis && resolvedNis.trim().length >= 4 && p.nis && p.nis.trim() === resolvedNis.trim() && (!resolvedSiswaId || !p.siswaId)) {
          return false;
        }
        if (!resolvedSiswaId && nama && kelas && p.nama === nama && p.kelas === kelas) return false;
        return true;
      });

      saveCachedPresensi(filtered);
      incrementSyncVersion(`Reset Presensi (${resolvedSiswaId || recordId} on ${normDate}) by ${updatedBy || 'Wali Kelas'}`);
      res.json({ success: true, version: syncVersion, total: filtered.length });
    } catch (err: any) {
      console.error("[Server Presensi Delete Error]:", err);
      res.status(500).json({ error: err.message || "Failed to delete attendance record" });
    }
  });

  // 5c. Audit & Synchronize Presensi across daily, weekly, monthly, semester
  app.post("/api/sync/presensi/audit-sync", (req, res) => {
    try {
      const { presensi, students, updatedBy } = req.body;
      const studentList = Array.isArray(students) && students.length > 0 ? students : readJsonFile<any[]>(STUDENTS_FILE, []);
      const existingPresensi = Array.isArray(presensi) && presensi.length > 0 ? presensi : getCachedPresensi();

      const auditResult = auditAndSynchronizePresensi(existingPresensi, studentList, {
        forceRegenerateVaried: req.body?.forceRegenerateVaried ?? false
      });
      saveCachedPresensi(auditResult.synchronizedRecords);
      incrementSyncVersion(`Audit & Synchronize Semester Presensi (${auditResult.synchronizedRecords.length} records by ${updatedBy || 'System'})`);
      res.json({
        success: true,
        version: syncVersion,
        total: auditResult.synchronizedRecords.length,
        synchronizedRecords: auditResult.synchronizedRecords,
        totalDays: auditResult.totalDays,
        totalStudents: auditResult.totalStudents,
        totalRecords: auditResult.totalRecords,
        addedDaysCount: auditResult.addedDaysCount,
        repairedRecordsCount: auditResult.repairedRecordsCount,
        schoolDates: auditResult.schoolDates,
        presensi: auditResult.synchronizedRecords,
        details: auditResult
      });
    } catch (err: any) {
      console.error("[Cloud Sync] Audit-sync error:", err);
      res.status(500).json({ error: err.message || "Failed to audit and synchronize attendance records" });
    }
  });

  // 6. Sync System Settings
  app.post("/api/sync/settings", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!data || typeof data !== "object") {
      res.status(400).json({ error: "Invalid settings object." });
      return;
    }
    const existingSettings = readJsonFile<any>(SETTINGS_FILE, null);
    const incomingTs = typeof data.updatedAt === "number" && !isNaN(data.updatedAt) ? data.updatedAt : Date.now();
    const existingTs = typeof existingSettings?.updatedAt === "number" && !isNaN(existingSettings.updatedAt) ? existingSettings.updatedAt : 0;

    // Never allow an explicitly older timestamped snapshot to revert newer settings
    if (typeof data.updatedAt === "number" && existingTs > 0 && incomingTs < existingTs) {
      res.json({ success: true, version: syncVersion, settings: existingSettings, ignoredStale: true });
      return;
    }

    const savedSettings = {
      ...data,
      updatedAt: incomingTs
    };
    writeJsonFile(SETTINGS_FILE, savedSettings);
    incrementSyncVersion(`Update Settings by ${updatedBy || 'user'}`);
    res.json({ success: true, version: syncVersion, settings: savedSettings });
  });

  // 7. Sync Operator Accounts
  app.post("/api/sync/accounts", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid accounts array." });
      return;
    }
    writeJsonFile(ACCOUNTS_FILE, data);
    incrementSyncVersion(`Update Accounts (${data.length} records by ${updatedBy || 'user'})`);
    res.json({ success: true, version: syncVersion });
  });

  const SERVER_WA_GATEWAY_NUMBER = "08214134551";
  const PLACEHOLDER_WA_KEYS = new Set(["", "KARA3_WS_GATEWAY_v2", "DEMO_KEY"]);

  function formatServerWaPhone(raw?: string): string {
    if (!raw) return "";
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === "-" || trimmed.toUpperCase() === "TIDAK TERDAFTAR") return "";
    let clean = trimmed.replace(/\D/g, "");
    if (clean.length < 9) return "";
    if (clean.startsWith("0")) clean = "62" + clean.slice(1);
    else if (!clean.startsWith("62")) clean = "62" + clean;
    if (clean.length < 10 || clean.length > 16 || clean === "6281234567890") return "";
    return clean;
  }

  function resolveServerGatewayConfig(clientConfig?: any): {
    provider: string;
    apiKey: string;
    gatewayUrl: string;
    serverWaNumber: string;
  } {
    const savedSettings = readJsonFile<any>(SETTINGS_FILE, {});
    const envFonnte = (process.env.FONNTE_TOKEN || "").trim();
    const envWaToken = (process.env.WA_GATEWAY_TOKEN || "").trim();
    const envWaUrl = (process.env.WA_GATEWAY_URL || "").trim();

    const rawProvider = String(
      clientConfig?.provider || savedSettings?.waGatewayProvider || (envFonnte ? "fonnte" : (envWaUrl ? "webhook" : "direct"))
    ).trim().toLowerCase();

    const rawKey = String(
      (clientConfig?.apiKey && !PLACEHOLDER_WA_KEYS.has(String(clientConfig.apiKey).trim()) ? clientConfig.apiKey : "") ||
      (savedSettings?.waApiKey && !PLACEHOLDER_WA_KEYS.has(String(savedSettings.waApiKey).trim()) ? savedSettings.waApiKey : "") ||
      envFonnte ||
      envWaToken ||
      ""
    ).trim();

    const gatewayUrl = String(
      clientConfig?.gatewayUrl || savedSettings?.waGatewayUrl || envWaUrl || ""
    ).trim();

    const serverWaNumber = String(
      clientConfig?.serverWaNumber || savedSettings?.serverWaNumber || SERVER_WA_GATEWAY_NUMBER
    ).trim();

    return { provider: rawProvider, apiKey: rawKey, gatewayUrl, serverWaNumber };
  }

  async function dispatchExternalWaFromServer(
    cleanPhone: string,
    message: string,
    meta: { studentName: string; kelas: string; status: string; tanggal?: string; waktu?: string },
    config: { provider: string; apiKey: string; gatewayUrl: string; serverWaNumber: string }
  ): Promise<{ delivered: boolean; deliveryStatus: "DELIVERED" | "PENDING" | "FAILED"; gateway: string; messageId?: string; error?: string }> {
    const hasToken = Boolean(config.apiKey) && !PLACEHOLDER_WA_KEYS.has(config.apiKey);
    const hasWebhook = config.provider === "webhook" && Boolean(config.gatewayUrl);

    if (config.provider === "direct" || (!hasToken && !hasWebhook)) {
      return {
        delivered: false,
        deliveryStatus: "PENDING",
        gateway: "DIRECT_WA_QUEUE"
      };
    }

    try {
      if (config.provider === "fonnte" && hasToken) {
        const form = new URLSearchParams();
        form.set("target", cleanPhone);
        form.set("message", message);
        form.set("countryCode", "62");
        const resp = await fetch(config.gatewayUrl || "https://api.fonnte.com/send", {
          method: "POST",
          headers: { Authorization: config.apiKey },
          body: form,
          signal: AbortSignal.timeout(10000)
        });
        const json: any = await resp.json().catch(() => ({}));
        if (resp.ok && json?.status !== false) {
          return {
            delivered: true,
            deliveryStatus: "DELIVERED",
            gateway: "FONNTE_API",
            messageId: String(json?.id || `fonnte-${Date.now()}`)
          };
        }
        return {
          delivered: false,
          deliveryStatus: "FAILED",
          gateway: "FONNTE_API",
          error: json?.reason || json?.detail || `HTTP ${resp.status}`
        };
      }

      if (config.provider === "wablas" && hasToken) {
        const base = (config.gatewayUrl || "https://solo.wablas.com").replace(/\/+$/, "");
        const endpoint = base.endsWith("/api/send-message") ? base : `${base}/api/send-message`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: config.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ phone: cleanPhone, message }),
          signal: AbortSignal.timeout(10000)
        });
        const json: any = await resp.json().catch(() => ({}));
        if (resp.ok && json?.status !== false) {
          return {
            delivered: true,
            deliveryStatus: "DELIVERED",
            gateway: "WABLAS_API",
            messageId: String(json?.data?.id || `wablas-${Date.now()}`)
          };
        }
        return {
          delivered: false,
          deliveryStatus: "FAILED",
          gateway: "WABLAS_API",
          error: json?.message || `HTTP ${resp.status}`
        };
      }

      if (config.provider === "webhook" && config.gatewayUrl) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (hasToken) headers.Authorization = `Bearer ${config.apiKey}`;
        const resp = await fetch(config.gatewayUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phone: cleanPhone,
            target: cleanPhone,
            message,
            studentName: meta.studentName,
            kelas: meta.kelas,
            status: meta.status,
            tanggal: meta.tanggal,
            waktu: meta.waktu,
            serverWaNumber: config.serverWaNumber
          }),
          signal: AbortSignal.timeout(10000)
        });
        const json: any = await resp.json().catch(() => ({}));
        if (resp.ok) {
          return {
            delivered: true,
            deliveryStatus: "DELIVERED",
            gateway: "CUSTOM_WEBHOOK",
            messageId: String(json?.messageId || `wh-${Date.now()}`)
          };
        }
        return {
          delivered: false,
          deliveryStatus: "FAILED",
          gateway: "CUSTOM_WEBHOOK",
          error: json?.error || `HTTP ${resp.status}`
        };
      }

      return {
        delivered: false,
        deliveryStatus: "PENDING",
        gateway: "DIRECT_WA_QUEUE"
      };
    } catch (err: any) {
      return {
        delivered: false,
        deliveryStatus: "FAILED",
        gateway: config.provider.toUpperCase(),
        error: err?.message || "Gateway HTTP request failed"
      };
    }
  }

  // Hitung batas waktu cut-off harian pukul 05:00 WIB (Asia/Jakarta)
  function getWibCutoffTimestamp(): number {
    const now = new Date();
    const wibDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
    const wibHourStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(now);
    const wibHour = parseInt(wibHourStr, 10);
    
    let targetDateStr = wibDate;
    if (wibHour < 5) {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      targetDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(yesterday);
    }
    return new Date(`${targetDateStr}T05:00:00+07:00`).getTime();
  }

  // Fungsi auto-reset data notifikasi WA harian pukul 05:00 WIB agar tidak menumpuk
  function purgeOldWhatsAppLogs(): any[] {
    const cutoffTime = getWibCutoffTimestamp();
    const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
    const freshLogs = existingLogs.filter((log: any) => {
      const t = new Date(log.timestamp).getTime();
      return !isNaN(t) && t >= cutoffTime;
    });

    if (freshLogs.length !== existingLogs.length) {
      writeJsonFile(WHATSAPP_LOGS_FILE, freshLogs);
      console.log(`[WA Gateway Auto-Reset 05:00] Berhasil mereset bersih ${existingLogs.length - freshLogs.length} notifikasi hari sebelumnya. Log hari ini aktif: ${freshLogs.length}.`);
    }
    return freshLogs;
  }

  setInterval(purgeOldWhatsAppLogs, 60000);

  // 8. Automatic WhatsApp Gateway notification dispatch
  app.post("/api/whatsapp/send-gateway", async (req, res) => {
    try {
      purgeOldWhatsAppLogs();
      const { presensi, siswa, phone, message, recipientRole, recipientName, gatewayConfig } = req.body;
      const cleanPhone = formatServerWaPhone(phone || siswa?.waOrangTua || presensi?.waOrangTua);
      const studentName = presensi?.nama || siswa?.nama || "Siswa SDN 3 Karamatwangi";
      const studentClass = presensi?.kelas || siswa?.kelas || "-";
      const studentStatus = presensi?.status || "Hadir";
      const config = resolveServerGatewayConfig(gatewayConfig);

      const nowIso = new Date().toISOString();
      const msgText = message || `Presensi ${studentName} (${studentClass}): ${studentStatus}`;

      if (!cleanPhone) {
        const failId = `wa-fail-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const failLog = {
          id: failId,
          serverWaNumber: config.serverWaNumber,
          recipientRole: recipientRole || "orang_tua",
          recipientName: recipientName || "Orang Tua",
          studentName,
          kelas: studentClass,
          status: studentStatus,
          phone: "TIDAK TERDAFTAR",
          message: msgText,
          deliveryStatus: "FAILED",
          gateway: "VALIDATION",
          timestamp: nowIso,
          error: "Nomor WA Orang Tua belum diisi atau tidak valid"
        };
        const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
        existingLogs.unshift(failLog);
        if (existingLogs.length > 400) existingLogs.length = 400;
        writeJsonFile(WHATSAPP_LOGS_FILE, existingLogs);

        res.json({
          success: false,
          messageId: failId,
          serverWaNumber: config.serverWaNumber,
          phone: "",
          recipientRole: failLog.recipientRole,
          recipientName: failLog.recipientName,
          deliveryStatus: "FAILED",
          gateway: "VALIDATION",
          error: failLog.error
        });
        return;
      }

      const dispatchRes = await dispatchExternalWaFromServer(
        cleanPhone,
        msgText,
        { studentName, kelas: studentClass, status: studentStatus, tanggal: presensi?.tanggal, waktu: presensi?.waktu },
        config
      );

      const messageId = dispatchRes.messageId || `wa-msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const logEntry = {
        id: messageId,
        serverWaNumber: config.serverWaNumber,
        recipientRole: recipientRole || "orang_tua",
        recipientName: recipientName || (recipientRole === "wali_kelas" ? "Wali Kelas" : "Orang Tua"),
        studentName,
        kelas: studentClass,
        status: studentStatus,
        phone: cleanPhone,
        message: msgText,
        deliveryStatus: dispatchRes.deliveryStatus,
        gateway: dispatchRes.gateway,
        timestamp: nowIso,
        error: dispatchRes.error
      };

      const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
      existingLogs.unshift(logEntry);
      if (existingLogs.length > 400) existingLogs.length = 400;
      writeJsonFile(WHATSAPP_LOGS_FILE, existingLogs);

      res.json({
        success: dispatchRes.deliveryStatus !== "FAILED",
        messageId,
        serverWaNumber: config.serverWaNumber,
        phone: cleanPhone,
        recipientRole: logEntry.recipientRole,
        recipientName: logEntry.recipientName,
        deliveryStatus: dispatchRes.deliveryStatus,
        gateway: dispatchRes.gateway,
        error: dispatchRes.error,
        deliveredAt: nowIso
      });
    } catch (err: any) {
      console.error("[WA Gateway Error]:", err);
      res.status(500).json({ error: err.message || "Failed to dispatch WhatsApp message" });
    }
  });

  // 8b. Batch broadcast notifications for all classes to student parents
  app.post("/api/whatsapp/broadcast-parents", async (req, res) => {
    try {
      purgeOldWhatsAppLogs();
      const { items, gatewayConfig } = req.body;
      if (!Array.isArray(items)) {
        res.status(400).json({ error: "Invalid items array." });
        return;
      }

      const config = resolveServerGatewayConfig(gatewayConfig);
      const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
      const nowIso = new Date().toISOString();
      let sentApi = 0;
      let queuedDirect = 0;
      let failedCount = 0;
      const results: Array<{ phone: string; deliveryStatus: string; gateway: string; error?: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const { presensi, siswa, phone, message, recipientName } = item;
        const cleanPhone = formatServerWaPhone(phone || siswa?.waOrangTua || presensi?.waOrangTua);
        const studentName = presensi?.nama || siswa?.nama || "Siswa SDN 3 Karamatwangi";
        const studentClass = presensi?.kelas || siswa?.kelas || "-";
        const studentStatus = presensi?.status || "Hadir";
        const msgText = message || `Presensi ${studentName} (${studentClass}): ${studentStatus}`;

        if (!cleanPhone) {
          failedCount++;
          const failEntry = {
            id: `wa-bcast-fail-${Date.now()}-${i}`,
            serverWaNumber: config.serverWaNumber,
            recipientRole: "orang_tua",
            recipientName: recipientName || `Orang Tua ${studentName}`,
            studentName,
            kelas: studentClass,
            status: studentStatus,
            phone: "TIDAK TERDAFTAR",
            message: msgText,
            deliveryStatus: "FAILED",
            gateway: "VALIDATION",
            timestamp: nowIso,
            error: "Nomor WA Orang Tua belum diisi atau tidak valid"
          };
          existingLogs.unshift(failEntry);
          results.push({ phone: "", deliveryStatus: "FAILED", gateway: "VALIDATION", error: failEntry.error });
          continue;
        }

        const dispatchRes = await dispatchExternalWaFromServer(
          cleanPhone,
          msgText,
          { studentName, kelas: studentClass, status: studentStatus, tanggal: presensi?.tanggal, waktu: presensi?.waktu },
          config
        );

        const messageId = dispatchRes.messageId || `wa-bcast-${Date.now()}-${i}`;
        const logEntry = {
          id: messageId,
          serverWaNumber: config.serverWaNumber,
          recipientRole: "orang_tua",
          recipientName: recipientName || `Orang Tua ${studentName}`,
          studentName,
          kelas: studentClass,
          status: studentStatus,
          phone: cleanPhone,
          message: msgText,
          deliveryStatus: dispatchRes.deliveryStatus,
          gateway: dispatchRes.gateway,
          timestamp: nowIso,
          error: dispatchRes.error
        };
        existingLogs.unshift(logEntry);
        results.push({ phone: cleanPhone, deliveryStatus: dispatchRes.deliveryStatus, gateway: dispatchRes.gateway, error: dispatchRes.error });

        if (dispatchRes.deliveryStatus === "DELIVERED") {
          sentApi++;
        } else if (dispatchRes.deliveryStatus === "PENDING") {
          queuedDirect++;
        } else {
          failedCount++;
        }

        if (dispatchRes.deliveryStatus === "DELIVERED" && i < items.length - 1) {
          await new Promise((r) => setTimeout(r, 120));
        }
      }

      if (existingLogs.length > 500) existingLogs.length = 500;
      writeJsonFile(WHATSAPP_LOGS_FILE, existingLogs);

      res.json({
        success: true,
        serverWaNumber: config.serverWaNumber,
        total: items.length,
        sent: sentApi,
        sentApi,
        queuedDirect,
        failed: failedCount,
        results,
        timestamp: nowIso
      });
    } catch (err: any) {
      console.error("[WA Gateway Broadcast Error]:", err);
      res.status(500).json({ error: err.message || "Failed to broadcast WhatsApp messages to parents" });
    }
  });

  // 8c. Fetch WhatsApp Gateway delivery logs (ter-filter per hari cut-off 05:00 WIB)
  app.get("/api/whatsapp/logs", (_req, res) => {
    const logs = purgeOldWhatsAppLogs();
    res.json({
      success: true,
      total: logs.length,
      logs: logs.slice(0, 150),
      serverWaNumber: SERVER_WA_GATEWAY_NUMBER,
      gatewayStatus: 'ACTIVE_CONNECTED',
      autoResetInfo: 'Setiap hari pukul 05:00 WIB log notifikasi otomatis direset bersih.'
    });
  });

  // 8c. Manual reset tombol bersih notifikasi WhatsApp
  app.post("/api/whatsapp/clear", (_req, res) => {
    writeJsonFile(WHATSAPP_LOGS_FILE, []);
    console.log("[WA Gateway Manual Reset] Seluruh notifikasi WhatsApp gateway berhasil dibersihkan manual.");
    res.json({
      success: true,
      message: "Seluruh riwayat notifikasi WhatsApp berhasil dibersihkan bersih.",
      serverWaNumber: SERVER_WA_GATEWAY_NUMBER
    });
  });

  // 9. QR Error Logs (Rekam QR Code Ditolak / Kartu Tidak Resmi)
  app.get("/api/qr-errors", (req, res) => {
    const errors = readJsonFile<any[]>(QR_ERRORS_FILE, []);
    const dateFilter = req.query.date as string;
    if (dateFilter) {
      const filtered = errors.filter((e) => (e.date || '').slice(0, 10) === dateFilter.slice(0, 10));
      res.json({ success: true, errors: filtered });
    } else {
      res.json({ success: true, errors });
    }
  });

  app.post("/api/qr-errors", (req, res) => {
    try {
      const errorRecord = req.body;
      if (!errorRecord || !errorRecord.code) {
        res.status(400).json({ error: "Invalid error payload" });
        return;
      }
      const errors = readJsonFile<any[]>(QR_ERRORS_FILE, []);
      const newEntry = {
        id: errorRecord.id || `err-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: errorRecord.timestamp || new Date().toLocaleTimeString('id-ID'),
        date: normalizeDateKey(errorRecord.date || '') || getLocalDateString(new Date()),
        code: errorRecord.code,
        reason: errorRecord.reason || 'Kode ini bukan NIS, NISN, NIK atau ID resmi Siswa SDN 3 KARAMATWANGI.',
        operator: errorRecord.operator || 'Scanner Piket',
        kelasHint: errorRecord.kelasHint || 'Tidak Teridentifikasi',
        createdAt: new Date().toISOString()
      };
      errors.push(newEntry);
      writeJsonFile(QR_ERRORS_FILE, errors.slice(-200));
      res.json({ success: true, error: newEntry });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to record QR error" });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Non-blocking startup Firestore REST hydration when local live records are missing
  const fromFirestoreValue = (val: any): any => {
    if (!val || typeof val !== "object") return val;
    if ("stringValue" in val) return val.stringValue;
    if ("integerValue" in val) return Number(val.integerValue);
    if ("doubleValue" in val) return Number(val.doubleValue);
    if ("booleanValue" in val) return Boolean(val.booleanValue);
    if ("nullValue" in val) return null;
    if ("timestampValue" in val) return val.timestampValue;
    if ("arrayValue" in val) {
      return Array.isArray(val.arrayValue?.values) ? val.arrayValue.values.map(fromFirestoreValue) : [];
    }
    if ("mapValue" in val) {
      const out: Record<string, any> = {};
      const fields = val.mapValue?.fields || {};
      for (const k of Object.keys(fields)) {
        out[k] = fromFirestoreValue(fields[k]);
      }
      return out;
    }
    return val;
  };

  const hydrateFromFirestoreOnce = async () => {
    const baseFirestore = "https://firestore.googleapis.com/v1/projects/ai-studio-applet-webapp-6532a/databases/ai-studio-e7618f40-cac7-45c5-9089-0a61e719ceb1";
    const decodeDocFields = (fields: any): Record<string, any> => {
      const out: Record<string, any> = {};
      if (!fields || typeof fields !== "object") return out;
      for (const k of Object.keys(fields)) out[k] = fromFirestoreValue(fields[k]);
      return out;
    };

    try {
      const incomingCloudRecords: any[] = [];
      const todayWib = getLocalDateString(new Date());
      const [ty, tm, td] = todayWib.split("-").map(Number);
      const yDt = new Date(Date.UTC(ty || 2026, (tm || 1) - 1, (td || 1) - 1));
      const yesterdayWib = `${yDt.getUTCFullYear()}-${String(yDt.getUTCMonth() + 1).padStart(2, "0")}-${String(yDt.getUTCDate()).padStart(2, "0")}`;

      // 1. Fetch sync/presensi + sync/day_index in parallel
      const [syncPresensiResp, dayIndexResp] = await Promise.all([
        fetch(`${baseFirestore}/documents/sync/presensi`, { signal: AbortSignal.timeout(7000) }).catch(() => null),
        fetch(`${baseFirestore}/documents/sync/day_index`, { signal: AbortSignal.timeout(7000) }).catch(() => null)
      ]);

      if (syncPresensiResp && syncPresensiResp.ok) {
        const docJson = await syncPresensiResp.json();
        const fields = docJson?.fields;
        if (fields) {
          const incomingData = fields.data ? fromFirestoreValue(fields.data) : [];
          const incomingDeleted = fields.deletedKeys ? fromFirestoreValue(fields.deletedKeys) : [];
          if (Array.isArray(incomingDeleted)) {
            for (const dk of incomingDeleted) {
              if (dk && typeof dk.key === "string" && dk.key.includes("__")) {
                const [sid, dt] = dk.key.split("__");
                recordDeletedTombstone({
                  key: dk.key,
                  siswaId: sid,
                  tanggal: dt,
                  deletedAt: typeof dk.ts === "number" ? dk.ts : Date.now()
                });
              }
            }
          }
          if (Array.isArray(incomingData)) {
            incomingCloudRecords.push(...incomingData);
          }
        }
      }

      // 2. Fetch all indexed daily shards (sync/day_{YYYY-MM-DD})
      const shardDatesSet = new Set<string>([todayWib, yesterdayWib]);
      if (dayIndexResp && dayIndexResp.ok) {
        const idxJson = await dayIndexResp.json();
        const datesObj = idxJson?.fields?.dates ? fromFirestoreValue(idxJson.fields.dates) : {};
        if (datesObj && typeof datesObj === "object") {
          for (const d of Object.keys(datesObj)) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= "2026-11-01") shardDatesSet.add(d);
          }
        }
      }

      const shardDates = Array.from(shardDatesSet).sort().slice(-90);
      for (let i = 0; i < shardDates.length; i += 8) {
        const chunk = shardDates.slice(i, i + 8);
        const shardResps = await Promise.all(
          chunk.map((d) =>
            fetch(`${baseFirestore}/documents/sync/day_${d}`, { signal: AbortSignal.timeout(6000) })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        );
        for (const sJson of shardResps) {
          const sFields = sJson?.fields;
          if (!sFields) continue;
          const shardDate = sFields.tanggal ? fromFirestoreValue(sFields.tanggal) : "";
          const recsObj = sFields.records ? fromFirestoreValue(sFields.records) : {};
          const delsObj = sFields.deleted ? fromFirestoreValue(sFields.deleted) : {};
          if (delsObj && typeof delsObj === "object" && shardDate) {
            for (const [sid, ts] of Object.entries(delsObj)) {
              if (typeof ts === "number") {
                recordDeletedTombstone({ key: `${sid}__${shardDate}`, siswaId: sid, tanggal: shardDate, deletedAt: ts });
              }
            }
          }
          if (recsObj && typeof recsObj === "object") {
            for (const rec of Object.values(recsObj)) {
              if (rec && typeof rec === "object") incomingCloudRecords.push(rec);
            }
          }
        }
      }

      // 3. Also query recent direct presensi docs for today & yesterday to recover any orphaned gate scans
      for (const targetD of [todayWib, yesterdayWib]) {
        const qResp = await fetch(`${baseFirestore}/documents:runQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: "presensi" }],
              where: {
                fieldFilter: {
                  field: { fieldPath: "tanggal" },
                  op: "EQUAL",
                  value: { stringValue: targetD }
                }
              },
              limit: 500
            }
          }),
          signal: AbortSignal.timeout(6000)
        }).catch(() => null);
        if (qResp && qResp.ok) {
          const rows: any = await qResp.json().catch(() => []);
          if (Array.isArray(rows)) {
            for (const row of rows) {
              if (row?.document?.fields) {
                incomingCloudRecords.push(decodeDocFields(row.document.fields));
              }
            }
          }
        }
      }

      if (incomingCloudRecords.length > 0) {
        const students = readJsonFile<any[]>(STUDENTS_FILE, []);
        const existing = getCachedPresensi();
        const merged = mergePresensiLists(existing, incomingCloudRecords, students, getDeletedTombstoneMap());
        if (!arePresensiArraysEqual(merged, existing)) {
          saveCachedPresensi(merged);
          incrementSyncVersion(`Hydrate Cloud Shards & Presensi (${merged.length} records)`);
          console.log(`[Cloud Presensi] Terhidrasi dari Firestore shards & live docs (${merged.length} rekaman).`);
        }
      }

      // 4. Hydrate settings/system when missing locally or when Firestore holds a strictly newer timestamp
      const settingsResp = await fetch(`${baseFirestore}/documents/settings/system`, { signal: AbortSignal.timeout(7000) }).catch(() => null);
      if (settingsResp && settingsResp.ok) {
        const settingsJson = await settingsResp.json();
        const sFields = settingsJson?.fields;
        if (sFields) {
          const remoteSettings = decodeDocFields(sFields);
          const localSettings = readJsonFile<any>(SETTINGS_FILE, null);
          const localTs = typeof localSettings?.updatedAt === "number" ? localSettings.updatedAt : 0;
          const remoteTs = typeof remoteSettings.updatedAt === "number" ? remoteSettings.updatedAt : 0;
          if (!localSettings || (remoteTs > localTs && Array.isArray(remoteSettings.jadwalList))) {
            writeJsonFile(SETTINGS_FILE, remoteSettings);
            incrementSyncVersion("Hydrate System Settings from Firestore");
            console.log(`[Cloud Settings] Terhidrasi dari Firestore settings/system.`);
          }
        }
      }
    } catch {
      // Non-blocking fallback
    }
  };

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SDN 3 Karamatwangi Server running on http://0.0.0.0:${PORT}`);
    hydrateFromFirestoreOnce().catch(() => {});
  });
}

startServer();
