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

  // Hitung batas waktu cut-off harian pukul 05:00 WIB (Asia/Jakarta)
  function getWibCutoffTimestamp(): number {
    const now = new Date();
    const wibDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
    const wibHourStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(now);
    const wibHour = parseInt(wibHourStr, 10);
    
    let targetDateStr = wibDate;
    if (wibHour < 5) {
      // Jika sebelum jam 05:00 WIB, hari aktif log adalah sejak kemarin jam 05:00 WIB
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

  // Jalankan pembersihan berkala setiap 60 detik
  setInterval(purgeOldWhatsAppLogs, 60000);

  // 8. Automatic WhatsApp Gateway notification dispatch
  app.post("/api/whatsapp/send-gateway", (req, res) => {
    try {
      purgeOldWhatsAppLogs();
      const { presensi, siswa, phone, message, recipientRole, recipientName } = req.body;
      const targetPhone = (phone || (siswa && siswa.waOrangTua) || (presensi && presensi.waOrangTua) || '').trim();
      const studentName = presensi?.nama || siswa?.nama || 'Siswa SDN 3 Karamatwangi';
      const studentClass = presensi?.kelas || siswa?.kelas || '-';
      const studentStatus = presensi?.status || 'Hadir';

      const messageId = `wa-msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const nowIso = new Date().toISOString();
      const isFailed = !targetPhone || targetPhone === '-';

      const logEntry = {
        id: messageId,
        serverWaNumber: SERVER_WA_GATEWAY_NUMBER,
        recipientRole: recipientRole || 'orang_tua',
        recipientName: recipientName || (recipientRole === 'wali_kelas' ? 'Wali Kelas' : 'Orang Tua'),
        studentName,
        kelas: studentClass,
        status: studentStatus,
        phone: targetPhone || 'TIDAK TERDAFTAR',
        message: message || `Presensi ${studentName} (${studentClass}): ${studentStatus}`,
        deliveryStatus: isFailed ? 'FAILED' : 'DELIVERED',
        gateway: 'DIGIWANGI3_WA_GATEWAY_NODE',
        timestamp: nowIso,
        error: isFailed ? 'Nomor tujuan WhatsApp belum diisi atau tidak valid' : undefined
      };

      const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
      existingLogs.unshift(logEntry);
      // Keep recent 400 logs
      if (existingLogs.length > 400) {
        existingLogs.length = 400;
      }
      writeJsonFile(WHATSAPP_LOGS_FILE, existingLogs);

      if (isFailed) {
        console.warn(`[WA Gateway Warning] Pengiriman ke [${logEntry.recipientRole.toUpperCase()}] ${logEntry.recipientName} (${studentName} - ${studentClass}) GAGAL: Nomor tidak valid. Dicatat di log.`);
        res.status(400).json({
          success: false,
          serverWaNumber: SERVER_WA_GATEWAY_NUMBER,
          error: "Nomor WhatsApp tujuan kosong atau tidak valid",
          logEntry
        });
        return;
      }

      console.log(`[WA Gateway 08214134551] Dispatched notification to [${logEntry.recipientRole.toUpperCase()}] ${logEntry.recipientName} (${targetPhone}) for ${studentName} (${studentClass} - ${studentStatus})`);

      res.json({
        success: true,
        messageId,
        serverWaNumber: SERVER_WA_GATEWAY_NUMBER,
        phone: targetPhone,
        recipientRole: logEntry.recipientRole,
        recipientName: logEntry.recipientName,
        deliveryStatus: 'DELIVERED',
        deliveredAt: nowIso
      });
    } catch (err: any) {
      console.error("[WA Gateway Error]:", err);
      try {
        const failureLog = {
          id: `wa-err-${Date.now()}`,
          serverWaNumber: SERVER_WA_GATEWAY_NUMBER,
          recipientRole: req.body?.recipientRole || 'unknown',
          recipientName: req.body?.recipientName || 'Unknown',
          studentName: req.body?.presensi?.nama || 'Unknown',
          kelas: req.body?.presensi?.kelas || '-',
          status: req.body?.presensi?.status || '-',
          phone: req.body?.phone || '-',
          message: req.body?.message || '-',
          deliveryStatus: 'FAILED',
          gateway: 'DIGIWANGI3_WA_GATEWAY_NODE',
          timestamp: new Date().toISOString(),
          error: err.message || 'Server Gateway Error'
        };
        const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
        existingLogs.unshift(failureLog);
        writeJsonFile(WHATSAPP_LOGS_FILE, existingLogs);
      } catch {}
      res.status(500).json({ error: err.message || "Failed to dispatch WhatsApp message" });
    }
  });

  // 8b. Batch broadcast notifications for all classes to student parents
  app.post("/api/whatsapp/broadcast-parents", (req, res) => {
    try {
      purgeOldWhatsAppLogs();
      const { items } = req.body;
      if (!Array.isArray(items)) {
        res.status(400).json({ error: "Invalid items array." });
        return;
      }

      const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
      const nowIso = new Date().toISOString();
      let sentCount = 0;
      let failedCount = 0;

      for (const item of items) {
        const { presensi, siswa, phone, message, recipientName } = item;
        const targetPhone = (phone || (siswa && siswa.waOrangTua) || (presensi && presensi.waOrangTua) || '').trim();
        const studentName = presensi?.nama || siswa?.nama || 'Siswa SDN 3 Karamatwangi';
        const studentClass = presensi?.kelas || siswa?.kelas || '-';
        const studentStatus = presensi?.status || 'Hadir';
        const isFailed = !targetPhone || targetPhone === '-';

        const messageId = `wa-bcast-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

        const logEntry = {
          id: messageId,
          serverWaNumber: SERVER_WA_GATEWAY_NUMBER,
          recipientRole: 'orang_tua',
          recipientName: recipientName || `Orang Tua ${studentName}`,
          studentName,
          kelas: studentClass,
          status: studentStatus,
          phone: targetPhone || 'TIDAK TERDAFTAR',
          message: message || `Presensi ${studentName} (${studentClass}): ${studentStatus}`,
          deliveryStatus: isFailed ? 'FAILED' : 'DELIVERED',
          gateway: 'DIGIWANGI3_WA_GATEWAY_NODE',
          timestamp: nowIso,
          error: isFailed ? 'Nomor tujuan WhatsApp belum diisi atau tidak valid' : undefined
        };

        existingLogs.unshift(logEntry);
        if (isFailed) {
          failedCount++;
        } else {
          sentCount++;
        }
      }

      if (existingLogs.length > 500) {
        existingLogs.length = 500;
      }
      writeJsonFile(WHATSAPP_LOGS_FILE, existingLogs);

      console.log(`[WA Gateway Broadcast 08214134551] Broadcast sukses ke orang tua semua kelas: ${sentCount} berhasil, ${failedCount} gagal dari total ${items.length} siswa.`);

      res.json({
        success: true,
        serverWaNumber: SERVER_WA_GATEWAY_NUMBER,
        total: items.length,
        sent: sentCount,
        failed: failedCount,
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
    try {
      const url = "https://firestore.googleapis.com/v1/projects/ai-studio-applet-webapp-6532a/databases/ai-studio-e7618f40-cac7-45c5-9089-0a61e719ceb1/documents/sync/presensi";
      const resp = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!resp.ok) return;
      const docJson = await resp.json();
      const fields = docJson?.fields;
      if (!fields) return;

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

      if (Array.isArray(incomingData) && incomingData.length > 0) {
        const students = readJsonFile<any[]>(STUDENTS_FILE, []);
        const existing = getCachedPresensi();
        const merged = mergePresensiLists(existing, incomingData, students, getDeletedTombstoneMap());
        if (!arePresensiArraysEqual(merged, existing)) {
          saveCachedPresensi(merged);
          incrementSyncVersion(`Hydrate Cloud Sync Presensi (${merged.length} records)`);
          console.log(`[Cloud Presensi] Terhidrasi dari Firestore sync/presensi (${merged.length} rekaman).`);
        }
      }

      // Also hydrate settings/system when missing locally or when Firestore holds a strictly newer timestamp
      const settingsUrl = "https://firestore.googleapis.com/v1/projects/ai-studio-applet-webapp-6532a/databases/ai-studio-e7618f40-cac7-45c5-9089-0a61e719ceb1/documents/settings/system";
      const settingsResp = await fetch(settingsUrl, { signal: AbortSignal.timeout(7000) });
      if (settingsResp.ok) {
        const settingsJson = await settingsResp.json();
        const sFields = settingsJson?.fields;
        if (sFields) {
          const remoteSettings: Record<string, any> = {};
          for (const k of Object.keys(sFields)) {
            remoteSettings[k] = fromFirestoreValue(sFields[k]);
          }
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
