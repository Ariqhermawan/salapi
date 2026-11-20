// Excel export of real Salapi accounts. A minimal .xlsx writer (a ZIP of
// SpreadsheetML parts, built with node:zlib) so no spreadsheet dependency is
// needed: real columns, styled header, frozen first row, AutoFilter, and real
// Excel dates, so the filter groups signups by year and month.
import { deflateRawSync } from "node:zlib";
import { providerLabel, wibMonth, type AdminAccountRow, type Lookup } from "./admin-users.ts";

type Cell = { text: string; style?: number } | { num: number; style?: number } | null;
interface Sheet { name: string; widths: number[]; rows: Cell[][]; table?: boolean }

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const EXCEL_UNIX_EPOCH = 25569; // serial of 1970-01-01
// Style ids, matching the cellXfs order in STYLES below.
const HEADER = 1, DATETIME = 2, MONTH = 3, MONO = 4, INTEGER = 5, TITLE = 6, LABEL = 7;

/** Excel serial date-time in WIB, or null for a missing/invalid timestamp. */
export function excelWib(iso: string | null | undefined): number | null {
  const time = Date.parse(iso ?? "");
  return Number.isFinite(time) ? (time + WIB_OFFSET_MS) / DAY_MS + EXCEL_UNIX_EPOCH : null;
}

/** Which signups an export covers; all fields optional (validated by parseAdminQuery). */
export interface ExportPeriod { month?: string; from?: string; to?: string }

/** e.g. "salapi-akun-asli-2026-11-20.xlsx", or with the period: "salapi-akun-asli-2026-11_2026-11-01-2026-11-15-2026-11-20.xlsx". */
export function xlsxFilename(now: Date, period: ExportPeriod = {}): string {
  const scope = [period.month, period.from || period.to ? `${period.from || "awal"}-${period.to || "kini"}` : ""].filter(Boolean).join("_");
  return `salapi-akun-asli-${scope ? `${scope}-` : ""}${new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10)}.xlsx`;
}

/** "Semua", or e.g. "Bulan 2026-11 · 2026-11-01 sampai 2026-11-15". */
export function periodLabel(period: ExportPeriod): string {
  const parts = [period.month ? `Bulan ${period.month}` : "", period.from || period.to ? `${period.from || "awal"} sampai ${period.to || "hari ini"}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Semua tanggal";
}

/** Excel serial of the first day of a "YYYY-MM" month. */
export function excelMonth(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return Date.UTC(year, index - 1, 1) / DAY_MS + EXCEL_UNIX_EPOCH;
}

const text = (value: string, style?: number): Cell => ({ text: value, style });
const num = (value: number | null, style?: number): Cell => (value === null ? null : { num: value, style });
const failed = text("gagal dimuat");
const fromLookup = <T>(value: Lookup<T>, ok: (value: T) => Cell, none: Cell = null): Cell =>
  value.status === "ok" ? ok(value.value) : value.status === "none" ? none : failed;

/** Two sheets: one row per real account, and a summary with totals per signup month. */
export function adminUsersXlsx(rows: readonly AdminAccountRow[], adminIds: ReadonlySet<string>, now: Date, period: ExportPeriod = {}): Buffer {
  const header = ["Tanggal daftar (WIB)", "Bulan daftar", "Email", "Username", "Wallet address", "Tx terkirim", "Login via", "Terakhir masuk (WIB)", "Admin", "User ID"];
  const accounts: Cell[][] = rows.map(({ user, wallet, username, sentTx }) => {
    const created = Number.isFinite(Date.parse(user.created_at)) ? user.created_at : null;
    return [
      num(excelWib(created), DATETIME),
      created ? num(excelMonth(wibMonth(created)), MONTH) : null,
      text(user.email ?? ""),
      fromLookup(username, handle => text(`@${handle}`)),
      fromLookup(wallet, address => text(address, MONO)),
      // An account Testnet doesn't know (yet) has sent nothing.
      fromLookup(sentTx, count => num(count, INTEGER), num(0, INTEGER)),
      text(providerLabel(user)),
      num(excelWib(user.last_sign_in_at), DATETIME),
      adminIds.has(user.id.toLowerCase()) ? text("Ya") : null,
      text(user.id, MONO),
    ];
  });

  const months = new Map<string, { accounts: number; tx: number }>();
  let totalTx = 0, failedTx = 0;
  for (const { user, sentTx } of rows) {
    const key = Number.isFinite(Date.parse(user.created_at)) ? wibMonth(user.created_at) : "";
    const entry = months.get(key) ?? { accounts: 0, tx: 0 };
    const tx = sentTx.status === "ok" ? sentTx.value : 0;
    months.set(key, { accounts: entry.accounts + 1, tx: entry.tx + tx });
    totalTx += tx;
    if (sentTx.status === "error") failedTx += 1;
  }
  const summary: Cell[][] = [
    [text("Salapi · Akun asli", TITLE)],
    [text("Diekspor (WIB)", LABEL), num(excelWib(now.toISOString()), DATETIME)],
    [text("Filter tanggal daftar", LABEL), text(periodLabel(period))],
    [],
    [text("Total akun asli", LABEL), num(rows.length, INTEGER)],
    [text("Total tx terkirim", LABEL), num(totalTx, INTEGER)],
    ...(failedTx ? [[text("Akun dengan tx gagal dimuat", LABEL), num(failedTx, INTEGER)]] : []),
    [],
    [text("Bulan daftar", HEADER), text("Akun", HEADER), text("Tx terkirim", HEADER)],
    ...[...months].sort(([a], [b]) => b.localeCompare(a)).map(([month, totals]) =>
      [month ? num(excelMonth(month), MONTH) : text("Tidak diketahui"), num(totals.accounts, INTEGER), num(totals.tx, INTEGER)]),
  ];
  return xlsx([
    { name: "Akun asli", widths: [20, 13, 34, 22, 60, 12, 11, 20, 8, 38], rows: [header.map(title => text(title, HEADER)), ...accounts], table: true },
    { name: "Ringkasan", widths: [28, 20, 14], rows: summary },
  ]);
}

// ---------------------------------------------------------------- writer

const xmlEscape = (value: string): string => value
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] as string);

function column(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function cellXml(cell: Cell, ref: string): string {
  if (!cell) return "";
  const style = cell.style ? ` s="${cell.style}"` : "";
  return "num" in cell
    ? `<c r="${ref}"${style}><v>${cell.num}</v></c>`
    : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.text)}</t></is></c>`;
}

function sheetXml(sheet: Sheet, selected: boolean): string {
  const last = `${column(sheet.widths.length - 1)}${Math.max(sheet.rows.length, 1)}`;
  const rows = sheet.rows.map((cells, r) => `<row r="${r + 1}">${cells.map((cell, c) => cellXml(cell, `${column(c)}${r + 1}`)).join("")}</row>`).join("");
  const cols = sheet.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const pane = sheet.table ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheetViews><sheetView workbookViewId="0"${selected ? ` tabSelected="1"` : ""}>${pane}</sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>`
    + (sheet.table ? `<autoFilter ref="A1:${last}"/>` : "") + `</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd mmm yyyy hh:mm"/><numFmt numFmtId="165" formatCode="mmm yyyy"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="10"/><name val="Consolas"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function xlsx(sheets: Sheet[]): Buffer {
  const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  const ns = `xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const filters = sheets.map((sheet, i) => sheet.table
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${sheet.name}'!$A$1:$${column(sheet.widths.length - 1)}$${sheet.rows.length}</definedName>` : "").join("");
  return zip([
    ["[Content_Types].xml", `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${head}<workbook ${ns}><sheets>${sheets.map((sheet, i) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ""}</workbook>`],
    ["xl/_rels/workbook.xml.rels", `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet, i === 0)]),
  ]);
}

export function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

/** Deflated ZIP (no zip64: fine far below 4 GB / 65k entries). */
function zip(entries: [string, string][]): Buffer {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const raw = Buffer.from(content, "utf8"), packed = deflateRawSync(raw), path = Buffer.from(name, "utf8");
    const fields = (header: Buffer, at: number) => {
      header.writeUInt16LE(20, at); header.writeUInt16LE(0x0800, at + 2); header.writeUInt16LE(8, at + 4);
      header.writeUInt16LE(0, at + 6); header.writeUInt16LE(0x21, at + 8); header.writeUInt32LE(crc32(raw), at + 10);
      header.writeUInt32LE(packed.length, at + 14); header.writeUInt32LE(raw.length, at + 18); header.writeUInt16LE(path.length, at + 22);
    };
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); fields(head, 4);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); fields(dir, 6); dir.writeUInt32LE(offset, 42);
    local.push(head, path, packed);
    central.push(dir, path);
    offset += head.length + path.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
