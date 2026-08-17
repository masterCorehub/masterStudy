/**
 * Retorna a chave de data no formato 'YYYY-MM-DD' respeitando o fuso horário local do usuário.
 * Evita o bug de fuso horário do `toISOString().slice(0, 10)` que avança para o dia seguinte a partir das 21h em UTC-3.
 */
export function getLocalDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return new Date().toLocaleDateString("sv-SE"); // Fallback 'YYYY-MM-DD'
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
