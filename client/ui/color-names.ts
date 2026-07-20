type ColorFamily =
  | "black"
  | "white"
  | "gray"
  | "beige"
  | "brown"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "purple"
  | "magenta"
  | "pink";

type NamedColor = {
  name: string;
  hex: string;
  family: ColorFamily;
};

// The first four anchors preserve the familiar default team names. The rest provide
// perceptual matching across a broad, user-facing palette instead of tying names to seat order.
const NAMED_COLORS: NamedColor[] = [
  { name: "Black", hex: "#111111", family: "black" },
  { name: "White", hex: "#eeeeee", family: "white" },
  { name: "Green", hex: "#4f9d69", family: "green" },
  { name: "Red", hex: "#e07a5f", family: "red" },
  { name: "Jet Black", hex: "#000000", family: "black" },
  { name: "Charcoal", hex: "#36454f", family: "black" },
  { name: "Dark Gray", hex: "#4a4a4a", family: "gray" },
  { name: "Dim Gray", hex: "#696969", family: "gray" },
  { name: "Gray", hex: "#808080", family: "gray" },
  { name: "Slate Gray", hex: "#708090", family: "gray" },
  { name: "Silver", hex: "#c0c0c0", family: "gray" },
  { name: "Light Gray", hex: "#d3d3d3", family: "gray" },
  { name: "White Smoke", hex: "#f5f5f5", family: "white" },
  { name: "Snow", hex: "#fffafa", family: "white" },
  { name: "Ivory", hex: "#fffff0", family: "white" },
  { name: "Cream", hex: "#fffdd0", family: "beige" },
  { name: "Beige", hex: "#f5f5dc", family: "beige" },
  { name: "Tan", hex: "#d2b48c", family: "beige" },
  { name: "Khaki", hex: "#f0e68c", family: "beige" },
  { name: "Brown", hex: "#a52a2a", family: "brown" },
  { name: "Saddle Brown", hex: "#8b4513", family: "brown" },
  { name: "Chocolate", hex: "#d2691e", family: "brown" },
  { name: "Sienna", hex: "#a0522d", family: "brown" },
  { name: "Peru", hex: "#cd853f", family: "brown" },
  { name: "Maroon", hex: "#800000", family: "red" },
  { name: "Bright Red", hex: "#ff0000", family: "red" },
  { name: "Dark Red", hex: "#8b0000", family: "red" },
  { name: "Crimson", hex: "#dc143c", family: "red" },
  { name: "Firebrick", hex: "#b22222", family: "red" },
  { name: "Indian Red", hex: "#cd5c5c", family: "red" },
  { name: "Tomato", hex: "#ff6347", family: "red" },
  { name: "Coral", hex: "#ff7f50", family: "red" },
  { name: "Salmon", hex: "#fa8072", family: "red" },
  { name: "Light Salmon", hex: "#ffa07a", family: "red" },
  { name: "Orange Red", hex: "#ff4500", family: "orange" },
  { name: "Orange", hex: "#ffa500", family: "orange" },
  { name: "Dark Orange", hex: "#ff8c00", family: "orange" },
  { name: "Gold", hex: "#ffd700", family: "yellow" },
  { name: "Goldenrod", hex: "#daa520", family: "yellow" },
  { name: "Yellow", hex: "#ffff00", family: "yellow" },
  { name: "Lemon Chiffon", hex: "#fffacd", family: "yellow" },
  { name: "Olive", hex: "#808000", family: "yellow" },
  { name: "Yellow Green", hex: "#9acd32", family: "green" },
  { name: "Chartreuse", hex: "#7fff00", family: "green" },
  { name: "Lime", hex: "#00ff00", family: "green" },
  { name: "Lime Green", hex: "#32cd32", family: "green" },
  { name: "Classic Green", hex: "#008000", family: "green" },
  { name: "Dark Green", hex: "#006400", family: "green" },
  { name: "Forest Green", hex: "#228b22", family: "green" },
  { name: "Sea Green", hex: "#2e8b57", family: "green" },
  { name: "Medium Sea Green", hex: "#3cb371", family: "green" },
  { name: "Spring Green", hex: "#00ff7f", family: "green" },
  { name: "Mint", hex: "#98ff98", family: "green" },
  { name: "Teal", hex: "#008080", family: "teal" },
  { name: "Dark Cyan", hex: "#008b8b", family: "teal" },
  { name: "Light Sea Green", hex: "#20b2aa", family: "teal" },
  { name: "Turquoise", hex: "#40e0d0", family: "teal" },
  { name: "Aquamarine", hex: "#7fffd4", family: "teal" },
  { name: "Cyan", hex: "#00ffff", family: "cyan" },
  { name: "Powder Blue", hex: "#b0e0e6", family: "blue" },
  { name: "Sky Blue", hex: "#87ceeb", family: "blue" },
  { name: "Deep Sky Blue", hex: "#00bfff", family: "blue" },
  { name: "Cornflower Blue", hex: "#6495ed", family: "blue" },
  { name: "Dodger Blue", hex: "#1e90ff", family: "blue" },
  { name: "Bright Blue", hex: "#0000ff", family: "blue" },
  { name: "Royal Blue", hex: "#4169e1", family: "blue" },
  { name: "Medium Blue", hex: "#0000cd", family: "blue" },
  { name: "Dark Blue", hex: "#00008b", family: "blue" },
  { name: "Navy", hex: "#000080", family: "blue" },
  { name: "Steel Blue", hex: "#4682b4", family: "blue" },
  { name: "Slate Blue", hex: "#6a5acd", family: "blue" },
  { name: "Indigo", hex: "#4b0082", family: "indigo" },
  { name: "Purple", hex: "#800080", family: "purple" },
  { name: "Dark Violet", hex: "#9400d3", family: "purple" },
  { name: "Blue Violet", hex: "#8a2be2", family: "purple" },
  { name: "Medium Purple", hex: "#9370db", family: "purple" },
  { name: "Violet", hex: "#ee82ee", family: "purple" },
  { name: "Orchid", hex: "#da70d6", family: "purple" },
  { name: "Plum", hex: "#dda0dd", family: "purple" },
  { name: "Lavender", hex: "#e6e6fa", family: "purple" },
  { name: "Magenta", hex: "#ff00ff", family: "magenta" },
  { name: "Rose", hex: "#ff007f", family: "pink" },
  { name: "Hot Pink", hex: "#ff69b4", family: "pink" },
  { name: "Deep Pink", hex: "#ff1493", family: "pink" },
  { name: "Pink", hex: "#ffc0cb", family: "pink" },
  { name: "Light Pink", hex: "#ffb6c1", family: "pink" },
];

const FAMILY_PREFIX: Record<ColorFamily, string> = {
  black: "B",
  white: "W",
  gray: "GY",
  beige: "BE",
  brown: "BR",
  red: "R",
  orange: "O",
  yellow: "Y",
  green: "G",
  teal: "TE",
  cyan: "C",
  blue: "BL",
  indigo: "I",
  purple: "P",
  magenta: "M",
  pink: "PK",
};

const LAB_COLORS = NAMED_COLORS.map((color) => ({ ...color, lab: hexToLab(color.hex)! }));

export function nearestColorName(hex: string): string {
  return nearestNamedColor(hex).name;
}

export function colorResultPrefix(hex: string): string {
  return FAMILY_PREFIX[nearestNamedColor(hex).family];
}

export function namedColorCount(): number {
  return NAMED_COLORS.length;
}

function nearestNamedColor(hex: string): NamedColor {
  const lab = hexToLab(hex);
  if (!lab) return NAMED_COLORS[0];
  let closest = LAB_COLORS[0];
  let closestDistance = Infinity;
  for (const color of LAB_COLORS) {
    const distance = labDistance(lab, color.lab);
    if (distance >= closestDistance) continue;
    closest = color;
    closestDistance = distance;
  }
  return closest;
}

type Lab = [number, number, number];

function hexToLab(hex: string): Lab | undefined {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!match) return undefined;
  const [red, green, blue] = match.slice(1).map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047;
  const y = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883;
  const convert = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = convert(x);
  const fy = convert(y);
  const fz = convert(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDistance(first: Lab, second: Lab): number {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2],
  );
}
