export function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const namedEntityMap: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
  };

  return value
    .replace(
      /&(?:amp|quot|apos|#39|lt|gt|nbsp);/g,
      (match) => namedEntityMap[match] ?? match
    )
    .replace(/&#(\d+);/g, (match, code) => {
      const parsedCode = Number.parseInt(code, 10);
      return Number.isFinite(parsedCode) ? String.fromCharCode(parsedCode) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const parsedCode = Number.parseInt(code, 16);
      return Number.isFinite(parsedCode) ? String.fromCharCode(parsedCode) : match;
    });
}

export function cleanDisplayText(value: string | null | undefined) {
  return decodeHtmlEntities(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
