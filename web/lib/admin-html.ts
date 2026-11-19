// Escape-by-default HTML templating for the script-free /admin document.
// Every interpolated value is escaped unless it is itself an `html` result, so
// account data (emails, names, usernames) can never become markup.

export class SafeHtml {
  readonly value: string;
  constructor(value: string) { this.value = value; }
  toString(): string { return this.value; }
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, char => ENTITIES[char]);
}

function part(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(part).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  return new SafeHtml(strings.reduce((out, text, index) => out + text + (index < values.length ? part(values[index]) : ""), ""));
}
