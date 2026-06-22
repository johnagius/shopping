// Lightweight keyword-based categoriser. Groups products into supermarket
// "aisles" so the shopping list can be sorted the way you actually walk a shop.
// It's intentionally simple and offline; it never blocks anything and falls
// back to "Other" when unsure.

export const AISLES = [
  "Fruit & Veg",
  "Bakery",
  "Dairy & Eggs",
  "Meat & Fish",
  "Frozen",
  "Pantry",
  "Snacks & Sweets",
  "Drinks",
  "Household & Cleaning",
  "Other",
] as const;

export type Aisle = (typeof AISLES)[number];

export function aisleOrder(category: string | null | undefined): number {
  const idx = AISLES.indexOf((category ?? "Other") as Aisle);
  return idx === -1 ? AISLES.length : idx;
}

// Order matters: earlier, more specific keywords win.
const RULES: { aisle: Aisle; keywords: string[] }[] = [
  {
    aisle: "Household & Cleaning",
    keywords: [
      "powerwash", "detergent", "bleach", "cleaner", "cleaning", "soap", "washing",
      "refuse", "garbage", "bin bag", "bags large", "toilet", "tissue", "kitchen roll",
      "sponge", "dishwasher", "fabric", "softener", "wipes", "foil", "cling",
    ],
  },
  {
    aisle: "Frozen",
    keywords: [
      "frozen", "pizza", "ice cream", "kiev", "fish finger", "nugget", "chips frozen",
      "pockets", "mini kievs",
    ],
  },
  {
    aisle: "Dairy & Eggs",
    keywords: [
      "milk", "cheese", "yogurt", "yoghurt", "butter", "cream", "egg", "margarine",
      "mozzarella", "ricotta", "parmesan",
    ],
  },
  {
    aisle: "Meat & Fish",
    keywords: [
      "chicken", "beef", "pork", "sausage", "bacon", "ham", "mince", "steak", "fish",
      "salmon", "tuna", "turkey", "lamb",
    ],
  },
  {
    aisle: "Bakery",
    keywords: ["bread", "loaf", "baguette", "roll", "bun", "croissant", "ftira", "pita", "wrap"],
  },
  {
    aisle: "Fruit & Veg",
    keywords: [
      "apple", "banana", "orange", "tomato", "potato", "onion", "lettuce", "carrot",
      "pepper", "cucumber", "lemon", "garlic", "salad", "spinach", "grape", "strawberr",
      "fruit", "veg",
    ],
  },
  {
    aisle: "Snacks & Sweets",
    keywords: [
      "chocolate", "crunchie", "cadbury", "biscuit", "cookie", "crisp", "chips", "candy",
      "sweet", "snack", "wafer", "brownie", "tub", "nutella", "popcorn",
    ],
  },
  {
    aisle: "Drinks",
    keywords: [
      "water", "juice", "cola", "soda", "coke", "fanta", "sprite", "beer", "wine",
      "coffee", "tea", "drink", "kinnie", "energy",
    ],
  },
  {
    aisle: "Pantry",
    keywords: [
      "pasta", "maccaroni", "macaroni", "spaghetti", "penne", "lasagne", "lasagna",
      "rice", "flour", "sugar", "oil", "sauce", "beans", "soup", "tomato passata",
      "passata", "cereal", "tin", "can", "salt", "pepper", "vinegar", "honey", "jam",
      "al forno",
    ],
  },
];

export function categorize(name: string): Aisle {
  const n = name.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => n.includes(k))) return rule.aisle;
  }
  return "Other";
}
