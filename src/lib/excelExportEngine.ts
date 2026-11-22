import ExcelJS from 'exceljs';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function triggerExcelBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 1000);
}

// Palet Warna Resmi DIGIWANGI 3 — Clean Emerald Institutional
export const DIGI_COLORS = {
  EMERALD_HEADER: 'FF0D6E51',
  EMERALD_TITLE: 'FF0D6E51',
  EMERALD_BORDER_HEADER: 'FF148564',
  MINT_SUMMARY_BG: 'FFECFDF5',
  MINT_SUMMARY_BORDER: 'FF86EFAC',
  MINT_TOTAL_BG: 'FFD1FAE5',
  MINT_TOTAL_TEXT: 'FF065F46',
  TEXT_DARK: 'FF1E293B',
  TEXT_MUTED: 'FF475569',
  GRID_BORDER: 'FFCBD5E1',
  ZEBRA_ALT: 'FFFAFCFB'
};

export interface ExcelColumnMeta {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  isTextId?: boolean;
  isNumeric?: boolean;
  isPercent?: boolean;
  wrapText?: boolean;
}

export interface ExcelCellStyleOverride {
  fillHex?: string;
  fontHex?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ExcelLegendItem {
  code: string;
  label: string;
  fillHex: string;
  fontHex: string;
}

export interface StyledSheetConfig {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  tabColor?: string;
  title: string;
  subtitle?: string;
  metaInfo: string;
  headers: string[];
  rows: (string | number)[][];
  totalRow?: (string | number)[];
  columnMeta?: ExcelColumnMeta[];
  cellStyler?: (
    rowIndex: number,
    colIndex: number,
    value: string | number,
    row: (string | number)[]
  ) => ExcelCellStyleOverride | undefined;
  legendItems?: ExcelLegendItem[];
  signatureLeftLabel?: string;
  signatureLeftName?: string;
  signatureRightLabel?: string;
  signatureRightName?: string;
  orientation?: 'landscape' | 'portrait';
}

export function sanitizeSheetName(raw: string): string {
  const cleaned = (raw || 'Sheet')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

export function getUniqueSheetName(wb: ExcelJS.Workbook, raw: string): string {
  const base = sanitizeSheetName(raw);
  if (!wb.getWorksheet(base)) return base;
  for (let i = 2; i < 99; i++) {
    const candidate = sanitizeSheetName(`${base.slice(0, 27)} (${i})`);
    if (!wb.getWorksheet(candidate)) return candidate;
  }
  return sanitizeSheetName(`S-${Date.now()}`);
}

export function createConfiguredWorkbook(creator: string = 'DIGIWANGI 3 - SDN 3 Karamatwangi'): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.lastModifiedBy = creator;
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

export async function workbookToXlsxBuffer(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const buf = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export async function downloadWorkbookXlsx(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const safeName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const data = await workbookToXlsxBuffer(workbook);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: XLSX_MIME_TYPE });
  triggerExcelBlobDownload(blob, safeName);
}

export function styleStatusCodeCell(val: string | number): ExcelCellStyleOverride | undefined {
  const s = String(val || '').trim();
  if (!s) return { align: 'center' };
  const up = s.toUpperCase();
  if (up === 'H' || up === 'HADIR' || up === '✔') {
    return { fillHex: 'FFECFDF5', fontHex: 'FF0D6E51', bold: true, align: 'center' };
  }
  if (up === 'T' || up === 'TERLAMBAT') {
    return { fillHex: 'FFFEF3C7', fontHex: 'FF92400E', bold: true, align: 'center' };
  }
  if (up === 'S' || up === 'SAKIT') {
    return { fillHex: 'FFE0E7FF', fontHex: 'FF3730A3', bold: true, align: 'center' };
  }
  if (up === 'I' || up === 'IZIN') {
    return { fillHex: 'FFE0F2FE', fontHex: 'FF0369A1', bold: true, align: 'center' };
  }
  if (up === 'A' || up === 'ALFA') {
    return { fillHex: 'FFFEE2E2', fontHex: 'FF991B1B', bold: true, align: 'center' };
  }
  if (up === 'BELUM ABSEN' || up === '-') {
    return { fillHex: 'FFF8FAFC', fontHex: 'FF64748B', bold: false, align: 'center' };
  }
  return undefined;
}

export const styleAttendanceStatusCell = styleStatusCodeCell;

export function styleMetodeCell(val: string | number): ExcelCellStyleOverride | undefined {
  const s = String(val || '').toLowerCase();
  if (s.includes('qr') || s.includes('scan')) {
    return { fontHex: 'FF0D6E51', bold: true, align: 'center' };
  }
  if (s.includes('manual') || s.includes('tap') || s.includes('wali')) {
    return { fontHex: 'FF92400E', bold: true, align: 'center' };
  }
  return { align: 'center', fontHex: DIGI_COLORS.TEXT_MUTED };
}

export function styleQualificationOrRateCell(val: string | number): ExcelCellStyleOverride | undefined {
  if (typeof val === 'number') {
    return { bold: true, align: 'center', fontHex: val >= 0.8 ? 'FF0D6E51' : val >= 0.6 ? 'FF92400E' : DIGI_COLORS.TEXT_DARK };
  }
  const s = String(val || '').toLowerCase();
  if (s.includes('sangat baik') || s.includes('sangat tinggi') || s.includes('tuntas') || s === 'b') {
    return { fillHex: 'FFECFDF5', fontHex: 'FF0D6E51', bold: true, align: 'center' };
  }
  if (s.includes('baik') || s.includes('tinggi') || s === 'm') {
    return { fillHex: 'FFECFDF5', fontHex: 'FF047857', bold: true, align: 'center' };
  }
  if (s.includes('cukup') || s.includes('sedang berjalan') || s === 's') {
    return { fillHex: 'FFFEF3C7', fontHex: 'FF92400E', bold: true, align: 'center' };
  }
  if (s.includes('rendah') || s.includes('perlu') || s.includes('belum') || s === 'k') {
    return { fillHex: 'FFFEE2E2', fontHex: 'FF991B1B', bold: true, align: 'center' };
  }
  return undefined;
}

export const THIN_GRID_BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: DIGI_COLORS.GRID_BORDER } };
export const HEADER_GRID_BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: DIGI_COLORS.EMERALD_BORDER_HEADER } };
export const TOTAL_TOP_BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF6EE7B7' } };
export const TOTAL_BOTTOM_BORDER: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: DIGI_COLORS.EMERALD_HEADER } };

/**
 * Membangun 1 worksheet dengan gaya bersih Emerald-Putih khas DIGIWANGI 3
 */
export function buildStyledWorksheet(config: StyledSheetConfig): ExcelJS.Worksheet {
  const {
    workbook,
    sheetName,
    tabColor = DIGI_COLORS.EMERALD_HEADER,
    title,
    metaInfo,
    headers,
    rows,
    totalRow,
    columnMeta = [],
    cellStyler,
    legendItems = [],
    signatureLeftLabel = 'Mengetahui,\nKepala Sekolah',
    signatureLeftName = 'Cucu Maspika, S.Pd.I., M.Pd., MCE.',
    signatureRightLabel = 'Cisurupan, Garut\nGuru / Wali Kelas',
    signatureRightName = '',
    orientation = 'landscape'
  } = config;

  const uniqueName = getUniqueSheetName(workbook, sheetName);
  const totalCols = Math.max(4, headers.length);

  const ws = workbook.addWorksheet(uniqueName, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
    }
  });

  // Top breathing space
  ws.addRow([]).height = 8;

  // Title (Clean Emerald centered)
  const titleRow = ws.addRow([title]);
  ws.mergeCells(2, 1, 2, totalCols);
  titleRow.height = 24;
  const tc = titleRow.getCell(1);
  tc.font = { name: 'Calibri', size: 13, bold: true, color: { argb: DIGI_COLORS.EMERALD_TITLE } };
  tc.alignment = { vertical: 'middle', horizontal: 'center' };

  // Subtitle / Meta
  const metaRow = ws.addRow([metaInfo]);
  ws.mergeCells(3, 1, 3, totalCols);
  metaRow.height = 18;
  const mc = metaRow.getCell(1);
  mc.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: DIGI_COLORS.TEXT_MUTED } };
  mc.alignment = { vertical: 'middle', horizontal: 'center' };

  ws.addRow([]).height = 6;

  // Table Header Row (Row 5)
  const headerRowIdx = 5;
  const headerRow = ws.addRow(headers);
  headerRow.height = 24;
  for (let c = 1; c <= headers.length; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DIGI_COLORS.EMERALD_HEADER } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: HEADER_GRID_BORDER,
      left: HEADER_GRID_BORDER,
      right: HEADER_GRID_BORDER,
      bottom: HEADER_GRID_BORDER
    };
  }

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx, showGridLines: true }];
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: headers.length }
  };

  const maxLengths = headers.map((h) => Math.max(5, h.length + 3));

  rows.forEach((rowValues, rIdx) => {
    const sanitizedValues = rowValues.map((val, cIdx) => {
      const meta = columnMeta[cIdx];
      if (meta?.isTextId) {
        return val === undefined || val === null ? '' : String(val).replace(/^'/, '');
      }
      if (meta?.isPercent && typeof val === 'string' && val.endsWith('%')) {
        const parsed = parseFloat(val.replace('%', ''));
        if (!isNaN(parsed)) return parsed / 100;
      }
      return val;
    });

    const excelRow = ws.addRow(sanitizedValues);
    let maxLines = 1;

    sanitizedValues.forEach((val, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const meta = columnMeta[cIdx];
      const override = cellStyler ? cellStyler(rIdx, cIdx, val, sanitizedValues) : undefined;

      const textLen = meta?.isPercent && typeof val === 'number' ? 6 : String(val ?? '').length;
      if (textLen + 3 > maxLengths[cIdx]) {
        maxLengths[cIdx] = textLen + 3;
      }

      const align = override?.align || meta?.align || (meta?.isNumeric || meta?.isPercent ? 'center' : 'left');
      const wrap = Boolean(meta?.wrapText);

      if (wrap && meta?.maxWidth && textLen > meta.maxWidth) {
        maxLines = Math.max(maxLines, Math.min(3, Math.ceil(textLen / (meta.maxWidth - 2))));
      }

      if (meta?.isTextId) {
        cell.numFmt = '@';
      } else if (meta?.isPercent && typeof val === 'number') {
        cell.numFmt = '0%';
      } else if (meta?.isNumeric && typeof val === 'number') {
        cell.numFmt = '#,##0';
      }

      cell.font = {
        name: 'Calibri',
        size: 9.5,
        bold: override?.bold ?? false,
        color: { argb: override?.fontHex || DIGI_COLORS.TEXT_DARK }
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: override?.fillHex || 'FFFFFFFF' }
      };
      cell.alignment = { vertical: 'middle', horizontal: align, wrapText: wrap };
      cell.border = {
        top: THIN_GRID_BORDER,
        left: THIN_GRID_BORDER,
        right: THIN_GRID_BORDER,
        bottom: THIN_GRID_BORDER
      };
    });

    excelRow.height = Math.max(19, maxLines * 14 + 4);
  });

  if (totalRow && totalRow.length > 0) {
    const sanitizedTotal = totalRow.map((val, cIdx) => {
      const meta = columnMeta[cIdx];
      if (meta?.isPercent && typeof val === 'string' && val.endsWith('%')) {
        const parsed = parseFloat(val.replace('%', ''));
        if (!isNaN(parsed)) return parsed / 100;
      }
      return val;
    });
    const tRow = ws.addRow(sanitizedTotal);
    tRow.height = 22;
    sanitizedTotal.forEach((val, cIdx) => {
      const cell = tRow.getCell(cIdx + 1);
      const meta = columnMeta[cIdx];
      if (meta?.isPercent && typeof val === 'number') {
        cell.numFmt = '0%';
      } else if (meta?.isNumeric && typeof val === 'number') {
        cell.numFmt = '#,##0';
      }
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: DIGI_COLORS.MINT_TOTAL_TEXT } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DIGI_COLORS.MINT_TOTAL_BG } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: meta?.align || (meta?.isNumeric || meta?.isPercent ? 'center' : 'left')
      };
      cell.border = {
        top: TOTAL_TOP_BORDER,
        bottom: TOTAL_BOTTOM_BORDER,
        left: THIN_GRID_BORDER,
        right: THIN_GRID_BORDER
      };
    });
  }

  for (let c = 0; c < headers.length; c++) {
    const meta = columnMeta[c];
    const col = ws.getColumn(c + 1);
    if (meta?.width) {
      col.width = meta.width;
    } else {
      const minW = meta?.minWidth ?? 8;
      const maxW = meta?.maxWidth ?? 38;
      col.width = Math.max(minW, Math.min(maxW, maxLengths[c]));
    }
  }

  if (legendItems.length > 0) {
    ws.addRow([]).height = 6;
    const legendStr = 'Keterangan Kode: ' + legendItems.map((l) => `${l.code} = ${l.label}`).join('  |  ');
    const lRow = ws.addRow([legendStr]);
    ws.mergeCells(lRow.number, 1, lRow.number, totalCols);
    lRow.height = 17;
    lRow.getCell(1).font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: DIGI_COLORS.TEXT_MUTED } };
    lRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  }

  if (signatureRightName || signatureLeftName) {
    ws.addRow([]).height = 12;
    const rightCol = Math.max(Math.floor(totalCols * 0.72), totalCols - 3);
    const leftLines = signatureLeftLabel.split('\n');
    const rightLines = signatureRightLabel.split('\n');

    const sig1 = ws.addRow([]);
    sig1.height = 16;
    sig1.getCell(2).value = leftLines[0] || '';
    sig1.getCell(2).font = { name: 'Calibri', size: 9.5, color: { argb: DIGI_COLORS.TEXT_DARK } };
    sig1.getCell(rightCol).value = rightLines[0] || '';
    sig1.getCell(rightCol).font = { name: 'Calibri', size: 9.5, color: { argb: DIGI_COLORS.TEXT_DARK } };

    const sig2 = ws.addRow([]);
    sig2.height = 16;
    sig2.getCell(2).value = leftLines[1] || '';
    sig2.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: DIGI_COLORS.TEXT_DARK } };
    sig2.getCell(rightCol).value = rightLines[1] || '';
    sig2.getCell(rightCol).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: DIGI_COLORS.TEXT_DARK } };

    ws.addRow([]).height = 20;
    ws.addRow([]).height = 18;

    const sigName = ws.addRow([]);
    sigName.height = 18;
    sigName.getCell(2).value = signatureLeftName;
    sigName.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, underline: true, color: { argb: DIGI_COLORS.TEXT_DARK } };
    sigName.getCell(rightCol).value = signatureRightName || '...............................................';
    sigName.getCell(rightCol).font = { name: 'Calibri', size: 9.5, bold: true, underline: true, color: { argb: DIGI_COLORS.TEXT_DARK } };
  }

  return ws;
}
