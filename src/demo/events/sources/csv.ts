/**
 * CSV → rows, for `Datasets.readTable({ format: "CSV" })`.
 *
 * A real RFC 4180 reader rather than `text.split("\n")`: event descriptions and
 * GeoJSON cells are exactly the values that contain quoted commas and line
 * breaks, and a line-based split tears those rows in half.
 */

export function parseCsv(text: string): Record<string, string>[] {
  const records = parseCsvRecords(text);
  if (records.length === 0) {return [];}
  const [header, ...body] = records;
  return body
    .filter((record) => !(record.length === 1 && record[0] === ""))
    .map((record) => {
      const row: Record<string, string> = {};
      header.forEach((name, index) => {
        row[name] = record[index] ?? "";
      });
      return row;
    });
}

export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  // A byte-order mark would otherwise become part of the first column's name.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") {i++;}
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}
