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

/**
 * One pass of the reader.
 *
 * `literal` holds the indices of quote characters to read as ordinary text
 * rather than as the start of a quoted field. `openedAt` comes back set when
 * the pass ran to the end of the file still inside a quoted field, naming the
 * quote that opened it.
 */
function readCsv(
  source: string,
  delimiter: "," | ";" | "\t",
  literal: Set<number>,
): { rows: string[][]; openedAt: number | null } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let openedAt: number | null = null;

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
        openedAt = null;
      }
      continue;
    }

    if (char === '"' && cell === "" && !literal.has(index)) {
      quoted = true;
      openedAt = index;
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

  return { rows: rows.filter((entry) => entry.some((value) => value.trim() !== "")), openedAt: quoted ? openedAt : null };
}

/** A small RFC-style reader. Wearable exports quote freely and embed newlines
 * in notes; Strong also emits semicolon variants, and .tsv is accepted by the UI. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfe_ff ? text.slice(1) : text;
  const delimiter = delimiterOf(source);
  // A quote that is never closed used to swallow every remaining line into one
  // cell: one stray quotation mark in one row silently dropped the whole rest
  // of the file, and the dialog reported nothing skipped. A newline cannot
  // simply end a quoted field — wearable notes genuinely contain them — so
  // instead, when a pass runs off the end still inside a quoted field, the
  // quote that opened it is marked as ordinary text and the file is read
  // again. The damage stops at the row that is actually malformed. Each pass
  // retires one stray quote, so this terminates; the cap is a backstop.
  const literal = new Set<number>();
  let result = readCsv(source, delimiter, literal);
  for (let attempt = 0; result.openedAt !== null && attempt < 50; attempt += 1) {
    literal.add(result.openedAt);
    result = readCsv(source, delimiter, literal);
  }
  return result.rows;
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
