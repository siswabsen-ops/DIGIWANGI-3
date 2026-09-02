const fs = require('fs');
const path = require('path');

const csvContent = fs.readFileSync(path.join(__dirname, '../raw_students.csv'), 'utf8');
const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

function parseCsvLine(line) {
  const parts = [];
  let inQuotes = false;
  let curr = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      parts.push(curr.trim());
      curr = '';
    } else {
      curr += c;
    }
  }
  parts.push(curr.trim());
  return parts;
}

const header = parseCsvLine(lines[0]);
console.log('Header:', header);

const parsedCsv = [];
const seenNis = new Set();

for (let idx = 1; idx < lines.length; idx++) {
  const parts = parseCsvLine(lines[idx]);
  if (parts.length < 10) continue;
  
  const no = parts[0];
  const nama = parts[1];
  const nipd = parts[2];
  const jk = parts[3];
  const nisn = parts[4];
  const tempatLahir = parts[5] || 'Garut';
  const tanggalLahir = parts[6] || '';
  const nik = parts[7] || '';
  const agama = parts[8] || 'Islam';
  const hp = parts[11] || '';
  const email = parts[12] || '';
  const rawKelas = parts[15] || '';

  if (!nama || !nisn) continue;

  let cleanKelas = rawKelas;
  const m = rawKelas.match(/Kelas\s*(\d)\s*-?\s*([A-Za-z])/i);
  if (m) {
    cleanKelas = `Kelas ${m[1]}-${m[2].toUpperCase()}`;
  }

  // Generate WA number if not present or format HP
  let waNumber = hp;
  if (waNumber && waNumber.startsWith('8')) {
    waNumber = '0' + waNumber;
  }
  if (!waNumber || waNumber.length < 5) {
    // Generate standard parent WhatsApp number from NISN
    waNumber = `0812${nisn.slice(-8)}`;
  }

  const studentObj = {
    id: `sis-${String(parsedCsv.length + 1).padStart(3, '0')}`,
    nis: nisn.length > 0 ? nisn : nipd,
    nama: nama.trim().toUpperCase(),
    kelas: cleanKelas,
    jenisKelamin: jk === 'P' || jk === 'Perempuan' ? 'P' : 'L',
    waOrangTua: waNumber,
    tempatLahir: tempatLahir.trim(),
    tanggalLahir: tanggalLahir.trim()
  };

  // Check duplicate
  const key = `${studentObj.nama}_${studentObj.kelas}`;
  if (!seenNis.has(key)) {
    seenNis.add(key);
    parsedCsv.push(studentObj);
  }
}

console.log('Parsed valid students from CSV:', parsedCsv.length);

const classCounts = {};
parsedCsv.forEach(s => {
  classCounts[s.kelas] = (classCounts[s.kelas] || 0) + 1;
});
console.log('Class breakdown in CSV:', classCounts);

// Load existing realStudents to check Kelas 6-A
const existing = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/lib/realStudents.json'), 'utf8'));
const existing6A = existing.filter(s => s.kelas === 'Kelas 6-A' || s.kelas === 'Kelas 6A');
console.log('Existing 6-A count:', existing6A.length);

// If CSV did not include Kelas 6-A, we preserve existing Kelas 6-A students, excluding any that are already in other classes (like 6-B)
const finalStudents = [];
let idCounter = 1;

// Group by standard order: 1-A, 1-B, 2-A, 2-B, 3-A, 3-B, 4-A, 4-B, 5-A, 5-B, 6-A, 6-B
const standardClasses = [
  'Kelas 1-A', 'Kelas 1-B',
  'Kelas 2-A', 'Kelas 2-B',
  'Kelas 3-A', 'Kelas 3-B',
  'Kelas 4-A', 'Kelas 4-B',
  'Kelas 5-A', 'Kelas 5-B',
  'Kelas 6-A', 'Kelas 6-B'
];

standardClasses.forEach(cls => {
  let listForClass = parsedCsv.filter(s => s.kelas === cls);
  if (listForClass.length === 0 && cls === 'Kelas 6-A') {
    // Filter out students who are registered in 6-B or other classes
    listForClass = existing6A
      .filter(s => !parsedCsv.some(p => p.nis === s.nis || p.nama.toUpperCase() === s.nama.toUpperCase()))
      .map(s => ({
        ...s,
        kelas: 'Kelas 6-A'
      }));
  }

  listForClass.forEach(s => {
    finalStudents.push({
      ...s,
      id: `sis-${String(idCounter++).padStart(3, '0')}`
    });
  });
});

console.log('Total combined students:', finalStudents.length);
const finalCounts = {};
finalStudents.forEach(s => {
  finalCounts[s.kelas] = (finalCounts[s.kelas] || 0) + 1;
});
console.log('Final class breakdown:', finalCounts);

// Write to src/lib/realStudents.json
fs.writeFileSync(path.join(__dirname, '../src/lib/realStudents.json'), JSON.stringify(finalStudents, null, 2));
console.log('Successfully updated src/lib/realStudents.json!');
