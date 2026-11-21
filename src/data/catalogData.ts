// Shared catalog data for the Hot & Spicy menu book, gaming lounge rates and venue settings.
// Used by both the browser bundle and the Express server (server.ts) as the default source of truth.

export type CatalogImageKey = 'momos' | 'tandoor' | 'pizza' | 'burger' | 'noodles' | 'frappe';

export interface CatalogChapterMeta {
  chapter: string;
  title: string;
  subtitle: string;
  /** Page index inside the Book Menu (0 is the front cover). */
  pageNumber: number;
  defaultImageKey: CatalogImageKey;
}

export interface CatalogItem {
  id: string;
  chapter: string;
  name: string;
  price: number;
  description: string;
  isVeg: boolean;
  isSpicy: boolean;
  imageKey: CatalogImageKey;
  imageUrl?: string;
  inStock?: boolean;
}

export interface GamingRates {
  pool15Price: number;
  pool30Price: number;
  ps5HourlyPrice: number;
}

export interface VenueSettings {
  openingTime: string;
  closingTime: string;
  kitchenLastOrder: string;
  whatsappNumber: string;
  address: string;
  instagramHandle: string;
  instagramUrl: string;
  youtubeUrl: string;
  facebookUrl: string;
}

export const CATALOG_CHAPTERS: CatalogChapterMeta[] = [
  {
    chapter: 'Momos',
    title: 'Momo Fiesta',
    subtitle: 'Steamed, fried & tossed dumplings with fiery chilli dip',
    pageNumber: 1,
    defaultImageKey: 'momos',
  },
  {
    chapter: 'Tandoor',
    title: 'Charcoal Tandoor',
    subtitle: 'Smoky skewers straight off the embers',
    pageNumber: 2,
    defaultImageKey: 'tandoor',
  },
  {
    chapter: 'Pizza',
    title: 'Stone-Baked Pizza',
    subtitle: 'Hand-stretched bases with bubbling mozzarella',
    pageNumber: 3,
    defaultImageKey: 'pizza',
  },
  {
    chapter: 'Burgers',
    title: 'Loaded Burgers',
    subtitle: 'Toasted buns stacked high with crispy fillings',
    pageNumber: 4,
    defaultImageKey: 'burger',
  },
  {
    chapter: 'Wok & Rolls',
    title: 'Wok & Rolls',
    subtitle: 'Indo-Chinese wok tosses, chowmein & rolls',
    pageNumber: 5,
    defaultImageKey: 'noodles',
  },
  {
    chapter: 'Café',
    title: 'Café & Coolers',
    subtitle: 'Frappes, shakes & chilled refreshers',
    pageNumber: 6,
    defaultImageKey: 'frappe',
  },
];

export const DEFAULT_CATALOG_ITEMS: CatalogItem[] = [
  // Momos
  {
    id: 'bm-1',
    chapter: 'Momos',
    name: 'Spicy Momo Fiesta',
    price: 129,
    description: 'Fried chicken momos tossed in house chilli sauce, served with fiery red dip.',
    isVeg: false,
    isSpicy: true,
    imageKey: 'momos',
    inStock: true,
  },
  {
    id: 'bm-2',
    chapter: 'Momos',
    name: 'Steamed Veg Momos',
    price: 89,
    description: 'Delicate steamed dumplings packed with cabbage, carrot and spring onion.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'momos',
    inStock: true,
  },
  {
    id: 'bm-3',
    chapter: 'Momos',
    name: 'Garlic Tossed Chicken Momos',
    price: 139,
    description: 'Tossed momos glazed with roasted garlic and spring onions.',
    isVeg: false,
    isSpicy: false,
    imageKey: 'momos',
    inStock: true,
  },
  {
    id: 'bm-4',
    chapter: 'Momos',
    name: 'Paneer Schezwan Momos',
    price: 119,
    description: 'Cottage cheese momos pan-fried and coated in bold Schezwan sauce.',
    isVeg: true,
    isSpicy: true,
    imageKey: 'momos',
    inStock: true,
  },

  // Tandoor
  {
    id: 'bm-5',
    chapter: 'Tandoor',
    name: 'Signature Tandoor Tikka',
    price: 249,
    description: 'Smoky charcoal chicken tikka marinated overnight in yoghurt and spices.',
    isVeg: false,
    isSpicy: true,
    imageKey: 'tandoor',
    inStock: true,
  },
  {
    id: 'bm-6',
    chapter: 'Tandoor',
    name: 'Paneer Tikka',
    price: 219,
    description: 'Paneer tikka skewers sizzling straight off the embers with peppers and onion.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'tandoor',
    inStock: true,
  },
  {
    id: 'bm-7',
    chapter: 'Tandoor',
    name: 'Chicken Malai Kebab',
    price: 259,
    description: 'Creamy cashew and cheese marinated chicken, gently charred.',
    isVeg: false,
    isSpicy: false,
    imageKey: 'tandoor',
    inStock: true,
  },
  {
    id: 'bm-8',
    chapter: 'Tandoor',
    name: 'Tandoori Mushroom',
    price: 199,
    description: 'Button mushrooms in a tangy tandoori masala, finished with mint chutney.',
    isVeg: true,
    isSpicy: true,
    imageKey: 'tandoor',
    inStock: true,
  },

  // Pizza
  {
    id: 'bm-9',
    chapter: 'Pizza',
    name: 'Corn & Mozzarella Cheese Pizza',
    price: 199,
    description: 'Stone-baked base loaded with sweet corn and stretchy mozzarella.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'pizza',
    inStock: true,
  },
  {
    id: 'bm-10',
    chapter: 'Pizza',
    name: 'Peri Peri Chicken Pizza',
    price: 279,
    description: 'Peri peri chicken, onions and jalapeños over a zesty tomato base.',
    isVeg: false,
    isSpicy: true,
    imageKey: 'pizza',
    inStock: true,
  },
  {
    id: 'bm-11',
    chapter: 'Pizza',
    name: 'Farmhouse Veggie Pizza',
    price: 229,
    description: 'Capsicum, onion, tomato and mushroom on a classic cheese base.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'pizza',
    inStock: true,
  },
  {
    id: 'bm-12',
    chapter: 'Pizza',
    name: 'Tandoori Paneer Pizza',
    price: 259,
    description: 'Tandoor-spiced paneer cubes with onions and a drizzle of mint mayo.',
    isVeg: true,
    isSpicy: true,
    imageKey: 'pizza',
    inStock: true,
  },

  // Burgers
  {
    id: 'bm-13',
    chapter: 'Burgers',
    name: 'Gourmet Loaded Chicken Burger',
    price: 169,
    description: 'Crispy chicken fillet, cheese slice, lettuce and smoky house sauce.',
    isVeg: false,
    isSpicy: false,
    imageKey: 'burger',
    inStock: true,
  },
  {
    id: 'bm-14',
    chapter: 'Burgers',
    name: 'Crispy Veg Burger',
    price: 99,
    description: 'Golden veg patty, fresh onion, tomato and creamy mayo.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'burger',
    inStock: true,
  },
  {
    id: 'bm-15',
    chapter: 'Burgers',
    name: 'Fiery Zinger Burger',
    price: 189,
    description: 'Extra-crunchy spiced chicken with jalapeños and chilli mayo.',
    isVeg: false,
    isSpicy: true,
    imageKey: 'burger',
    inStock: true,
  },
  {
    id: 'bm-16',
    chapter: 'Burgers',
    name: 'Paneer Makhani Burger',
    price: 149,
    description: 'Grilled paneer slab in a rich makhani glaze with crunchy slaw.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'burger',
    inStock: true,
  },

  // Wok & Rolls
  {
    id: 'bm-17',
    chapter: 'Wok & Rolls',
    name: 'Hakka Chowmein',
    price: 149,
    description: 'Wok-tossed hakka noodles with crunchy vegetables and egg.',
    isVeg: false,
    isSpicy: false,
    imageKey: 'noodles',
    inStock: true,
  },
  {
    id: 'bm-18',
    chapter: 'Wok & Rolls',
    name: 'Veg Schezwan Noodles',
    price: 129,
    description: 'Fiery Schezwan wok noodles with peppers, cabbage and spring onion.',
    isVeg: true,
    isSpicy: true,
    imageKey: 'noodles',
    inStock: true,
  },
  {
    id: 'bm-19',
    chapter: 'Wok & Rolls',
    name: 'Chilli Chicken Dry',
    price: 199,
    description: 'Crispy chicken tossed with green chilli, capsicum and soy.',
    isVeg: false,
    isSpicy: true,
    imageKey: 'noodles',
    inStock: true,
  },
  {
    id: 'bm-20',
    chapter: 'Wok & Rolls',
    name: 'Egg Chicken Roll',
    price: 99,
    description: 'Flaky paratha roll with egg, spiced chicken, onion and sauces.',
    isVeg: false,
    isSpicy: false,
    imageKey: 'noodles',
    inStock: true,
  },

  // Café
  {
    id: 'bm-21',
    chapter: 'Café',
    name: 'Hazelnut Mocha Frappe',
    price: 149,
    description: 'Iced hazelnut mocha frappe swirl topped with velvety whipped cream.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'frappe',
    inStock: true,
  },
  {
    id: 'bm-22',
    chapter: 'Café',
    name: 'Classic Cold Coffee',
    price: 109,
    description: 'Creamy blended cold coffee with a chocolate drizzle.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'frappe',
    inStock: true,
  },
  {
    id: 'bm-23',
    chapter: 'Café',
    name: 'Oreo Thick Shake',
    price: 139,
    description: 'Thick vanilla shake blended with crushed Oreo cookies.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'frappe',
    inStock: true,
  },
  {
    id: 'bm-24',
    chapter: 'Café',
    name: 'Virgin Mint Mojito',
    price: 99,
    description: 'Fresh mint, lime and soda over crushed ice.',
    isVeg: true,
    isSpicy: false,
    imageKey: 'frappe',
    inStock: true,
  },
];

export const DEFAULT_GAMING_RATES: GamingRates = {
  pool15Price: 60,
  pool30Price: 100,
  ps5HourlyPrice: 120,
};

export const DEFAULT_VENUE_SETTINGS: VenueSettings = {
  openingTime: '1:30 PM',
  closingTime: '10:00 PM',
  kitchenLastOrder: '9:30 PM',
  whatsappNumber: '+91 7605857713',
  address: 'Boropara More, Dingalhat, Near Azdan Moto Hub, Bansberia, Hooghly, West Bengal – 712502',
  instagramHandle: '@hotandspicy_aa',
  instagramUrl: 'https://www.instagram.com/hotandspicy_aa/',
  youtubeUrl: 'https://www.youtube.com/@Hotandspicyaa',
  facebookUrl: 'https://www.facebook.com/profile.php?id=61594005043419',
};

/** Formats the venue's daily operating window, e.g. "1:30 PM – 10:00 PM". */
export function formatOperatingHours(
  settings: Pick<VenueSettings, 'openingTime' | 'closingTime'> = DEFAULT_VENUE_SETTINGS
): string {
  const open = (settings?.openingTime || DEFAULT_VENUE_SETTINGS.openingTime).trim();
  const close = (settings?.closingTime || DEFAULT_VENUE_SETTINGS.closingTime).trim();
  return `${open} – ${close}`;
}

/**
 * Normalises a WhatsApp / phone number into international digits for wa.me and tel: links.
 * Bare 10-digit Indian numbers (optionally with a leading 0) get the 91 country code.
 */
export function normalizeWhatsAppDigits(raw: string | null | undefined): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) {
    digits = DEFAULT_VENUE_SETTINGS.whatsappNumber.replace(/\D/g, '');
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return digits;
}
