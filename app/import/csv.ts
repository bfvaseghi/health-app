/** Delimiter used by the first logical row, ignoring punctuation inside quotes. */
function delimiterOf(source: string): "," | ";" | "\t" {
  const counts = new Map<"," | ";" | "\t", number>([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) break;
    if (!quoted && counts.has(char as "," | ";" | "\t")) {
      const delimiter = char as "," | ";" | "\t";
      counts.set(delimiter, (counts.get(delimiter) ?? 0) + 1);
    }
  }
  // Comma wins a tie, preserving ordinary one-column and RFC 4180 files.
  return ([",", ";", "\t"] as const).reduce((best, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best,
  );
}

/** A small RFC-style reader. Wearable exports quote freely and embed newlines
 * in notes; Strong also emits semicolon variants, and .tsv is accepted by the UI. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfe_ff ? text.slice(1) : text;
  const delimiter = delimiterOf(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

/** Header text reduced to something two exports can agree on. */
export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type Table = { headers: string[]; rows: string[][] };

/** Splits the header row off, tolerating exports that pad rows with empty cells. */
export function toTable(text: string): Table | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const headers = rows[0].map((header) => header.trim());
  const width = headers.length;
  return {
    headers,
    rows: rows.slice(1).map((row) => (row.length >= width ? row.slice(0, width) : [...row, ...Array(width - row.length).fill("")])),
  };
}
