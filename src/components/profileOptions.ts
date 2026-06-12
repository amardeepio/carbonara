import type { CommuteMode, DietPreference } from "@/lib/types";

/** Selectable profile answers, shared by onboarding and the profile page. */
export interface ProfileOption<T extends string> {
  value: T;
  label: string;
  icon: string;
  blurb: string;
}

export const COMMUTE_OPTIONS: ProfileOption<CommuteMode>[] = [
  { value: "metro", label: "Metro / train", icon: "🚇", blurb: "Already low-carbon" },
  { value: "bus", label: "Bus", icon: "🚌", blurb: "Shared & efficient" },
  { value: "two_wheeler", label: "Two-wheeler", icon: "🛵", blurb: "Light per km" },
  { value: "car", label: "Car", icon: "🚗", blurb: "Your biggest lever" },
  { value: "walk_cycle", label: "Walk / cycle", icon: "🚶", blurb: "Zero emissions" },
];

export const DIET_OPTIONS: ProfileOption<DietPreference>[] = [
  { value: "veg", label: "Vegetarian", icon: "🍛", blurb: "India's low-carbon default" },
  { value: "vegan", label: "Vegan", icon: "🥗", blurb: "Lightest on the planet" },
  { value: "eggs_chicken", label: "Eggs & chicken", icon: "🍳", blurb: "Moderate impact" },
  { value: "mixed", label: "Everything", icon: "🍖", blurb: "Red meat weighs the most" },
];
