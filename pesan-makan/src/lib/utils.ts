export function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateID(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function detectCategory(name: string): "makanan" | "minuman" {
  const lower = name.toLowerCase().trim();

  // 1. Food keywords take top precedence
  const foodKeywords = [
    "nasi", "ayam", "geprek", "boneless", "boneles", "sate", "taichan", "mie", "mi ",
    "bakso", "baso", "soto", "bebek", "ikan", "lele", "gurame", "nila", "tahu", "tempe",
    "telur", "telor", "daging", "sapi", "kambing", "steak", "burger", "pizza", "pasta",
    "spaghetti", "roti", "toast", "gorengan", "kentang", "french fries", "seblak",
    "kwetiau", "bihun", "capcay", "katsu", "rice", "soup", "sop", "gulai", "rendang",
    "rawon", "pecel", "penyet", "bakar", "goreng", "crispy", "snack", "dimsum",
    "siomay", "batagor", "martabak", "pisang", "cireng", "pempek", "bubur", "lontong",
    "sambal", "sambel", "sayur", "paket", "combo", "platter", "wing", "wings"
  ];

  if (foodKeywords.some((kw) => lower.includes(kw))) {
    return "makanan";
  }

  // 2. Drink keywords using word boundaries / specific drink prefixes
  const drinkRegex = /\b(es|ice|iced|teh|tea|kopi|coffee|latte|cappuccino|cappucino|espresso|americano|jus|juice|susu|milk|air|mineral|water|sirup|syrup|drink|drinks|boba|cendol|cincau|soda|cola|fanta|sprite|yakult|milo|avocado|alpukat|lemon|matcha|nutrisari|pocari|aqua|le minerale|nestle|tehbotol|fruittea|thai tea|green tea|red velvet|taro|chocolate|cokelat|coklat|smoothie|shake|wedang|ronde|dawet|hangat|dingin)\b/i;

  if (drinkRegex.test(lower)) {
    return "minuman";
  }

  return "makanan";
}
