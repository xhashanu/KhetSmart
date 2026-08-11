import type { ConsultOverrides } from "../api";

export const DEFAULT_HARVEST_SELECTION: ConsultOverrides = {
  quantity_quintals: 50,
  crop: "Potato",
  district: null,
};

/** Synthetic consult text when refreshing plan from parsed selection only. */
export function harvestConsultText(selection: ConsultOverrides): string {
  const cropWord =
    selection.crop === "Potato" ? "aloo" : selection.crop.replace(" Potato", "");
  return `Amar ${selection.quantity_quintals} quintal ${cropWord} ache`;
}
