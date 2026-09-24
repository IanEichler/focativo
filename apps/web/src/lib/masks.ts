import { onlyDigits } from "./br-documents";

/** Formata progressivamente enquanto o usuário digita — sempre a partir dos dígitos crus, nunca do texto já mascarado. */
export function maskPhone(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length === 0) return "";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (digits.length <= 2) return `(${ddd}`;
  if (rest.length === 0) return `(${ddd}) `;
  if (digits.length <= 10) {
    return rest.length > 4 ? `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}` : `(${ddd}) ${rest}`;
  }
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

/** CPF (11 dígitos) ou CNPJ (12-14): a máscara muda de formato sozinha ao passar de 11 dígitos. */
export function maskCpfCnpj(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 14);
  if (digits.length <= 11) {
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
    let out = parts.join(".");
    if (digits.length > 9) out += `-${digits.slice(9, 11)}`;
    return out;
  }
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8)].filter(Boolean);
  let out = parts.join(".");
  if (digits.length > 8) out += `/${digits.slice(8, 12)}`;
  if (digits.length > 12) out += `-${digits.slice(12, 14)}`;
  return out;
}
