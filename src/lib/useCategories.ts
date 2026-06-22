import { useState, useEffect, useCallback } from "react";
import { api } from "./api";
import { AISLES } from "./categorize";

/**
 * Loads the user's categories (aisles) from the DB, falling back to the
 * built-in list. Provides ordering (matching DB sort_order) and an
 * `addNew` helper that prompts for a name, persists it, and returns it.
 */
export function useCategories() {
  const [categories, setCategories] = useState<string[]>([...AISLES]);

  const reload = useCallback(async () => {
    try {
      const rows = await api.getCategories();
      if (rows.length) setCategories(rows.map((r) => r.name));
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const orderOf = useCallback(
    (name: string | null | undefined) => {
      const i = categories.indexOf(name ?? "Other");
      return i === -1 ? categories.length : i;
    },
    [categories],
  );

  // Prompt for and create a new category; returns its name or null.
  const addNew = useCallback(async (): Promise<string | null> => {
    const name = window.prompt("New category name")?.trim();
    if (!name) return null;
    try {
      await api.addCategory(name);
    } catch {
      /* ignore (e.g. duplicate) */
    }
    await reload();
    return name;
  }, [reload]);

  return { categories, orderOf, reload, addNew };
}

export const ADD_CATEGORY_VALUE = "__add_category__";
