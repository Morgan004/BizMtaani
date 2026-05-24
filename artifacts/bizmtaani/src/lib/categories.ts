import {
  UtensilsCrossed,
  Home as HomeIcon,
  Shirt,
  Smartphone,
  Wrench,
  ShoppingBag,
  RefreshCcw,
  Clapperboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface CategoryDef {
  key: string;
  displayShort: string;
  icon: LucideIcon;
  color: string;
  badgeColor: string;
  tagline: string;
  subcategories: string[];
}

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    key: "Food & Groceries",
    displayShort: "Food",
    icon: UtensilsCrossed,
    color: "text-amber-600 bg-amber-50 border-amber-300",
    badgeColor: "bg-amber-100 text-amber-700",
    tagline: "Groceries, cooked food, restaurants, hotels",
    subcategories: [
      "Groceries",
      "Fresh Produce",
      "Restaurants & Cooked Food",
      "Bakeries",
      "Hotels / Eateries",
    ],
  },
  {
    key: "Accommodation",
    displayShort: "Housing",
    icon: HomeIcon,
    color: "text-indigo-600 bg-indigo-50 border-indigo-300",
    badgeColor: "bg-indigo-100 text-indigo-700",
    tagline: "Houses, apartments, bedsitters, Airbnb",
    subcategories: [
      "Houses to Rent",
      "Apartments",
      "Bedsitters / Rooms",
      "Airbnb / Short Stays",
      "Lodges / Guest Houses",
    ],
  },
  {
    key: "Fashion & Clothing",
    displayShort: "Fashion",
    icon: Shirt,
    color: "text-purple-600 bg-purple-50 border-purple-300",
    badgeColor: "bg-purple-100 text-purple-700",
    tagline: "Clothes, shoes, accessories, beauty, jewellery",
    subcategories: [
      "Clothes",
      "Shoes",
      "Bags & Accessories",
      "Beauty & Cosmetics",
      "Jewelry",
    ],
  },
  {
    key: "Electronics & Tech",
    displayShort: "Electronics",
    icon: Smartphone,
    color: "text-blue-600 bg-blue-50 border-blue-300",
    badgeColor: "bg-blue-100 text-blue-700",
    tagline: "Phones, laptops, TVs, repairs, cyber services",
    subcategories: [
      "Phones",
      "Laptops & Computers",
      "TVs & Electronics",
      "Accessories",
      "Repairs & Tech Services",
      "Cyber / Printing Services",
    ],
  },
  {
    key: "Services",
    displayShort: "Services",
    icon: Wrench,
    color: "text-teal-600 bg-teal-50 border-teal-300",
    badgeColor: "bg-teal-100 text-teal-700",
    tagline: "Home, personal, business & other services",
    subcategories: [
      "Home Services",
      "Personal Services",
      "Business & Digital Services",
      "Delivery & Transport",
      "Other Services",
    ],
  },
  {
    key: "General Products",
    displayShort: "Products",
    icon: ShoppingBag,
    color: "text-orange-600 bg-orange-50 border-orange-300",
    badgeColor: "bg-orange-100 text-orange-700",
    tagline: "Household items, furniture, hardware, farm supplies",
    subcategories: [
      "Household Items",
      "Furniture",
      "Hardware & Tools",
      "Farm Supplies",
      "Miscellaneous Products",
    ],
  },
  {
    key: "Second-Hand / Used Items",
    displayShort: "2nd Hand",
    icon: RefreshCcw,
    color: "text-yellow-600 bg-yellow-50 border-yellow-300",
    badgeColor: "bg-yellow-100 text-yellow-700",
    tagline: "Used phones, furniture, mtumba, vehicles",
    subcategories: [
      "Used Phones & Electronics",
      "Used Furniture & Household",
      "Mtumba / Used Clothing",
      "Vehicles & Motorbikes",
      "Other Used Items",
    ],
  },
  {
    key: "Entertainment & Events",
    displayShort: "Events",
    icon: Clapperboard,
    color: "text-pink-600 bg-pink-50 border-pink-300",
    badgeColor: "bg-pink-100 text-pink-700",
    tagline: "Clubs, DJs, photography, events, venues",
    subcategories: [
      "Clubs & Gaming",
      "DJs & Entertainment",
      "Photography & Media",
      "Event Planning & Decor",
      "Venues & Event Spaces",
    ],
  },
];

export function getCategoryDef(key: string): CategoryDef | undefined {
  return CATEGORY_DEFS.find((c) => c.key === key);
}

export function getCategoryBadgeColor(key: string): string {
  return getCategoryDef(key)?.badgeColor ?? "bg-gray-100 text-gray-600";
}
