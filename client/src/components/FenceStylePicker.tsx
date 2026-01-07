import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store/appStore";
import {
  FENCE_CATEGORIES,
  getFenceStylesByCategory,
} from "@/config/fenceStyles";
import { FenceCategoryId } from "@/types/models";

export const FenceStylePicker = React.memo(function FenceStylePicker() {
  const fenceStyleId = useAppStore((state) => state.fenceStyleId);
  const fenceCategoryId = useAppStore((state) => state.fenceCategoryId);
  const setFenceCategory = useAppStore((state) => state.setFenceCategory);
  const setFenceStyle = useAppStore((state) => state.setFenceStyle);

  return (
    <Tabs
      value={fenceCategoryId}
      onValueChange={(value) => setFenceCategory(value as FenceCategoryId)}
      className="space-y-3"
    >
      <TabsList className="grid w-full grid-cols-2">
        {FENCE_CATEGORIES.map((category) => (
          <TabsTrigger
            key={category.id}
            value={category.id}
            className="text-xs"
            data-testid={`tab-fence-category-${category.id}`}
          >
            {category.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {FENCE_CATEGORIES.map((category) => (
        <TabsContent key={category.id} value={category.id} className="m-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {getFenceStylesByCategory(category.id).map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setFenceStyle(style.id)}
                className={`flex h-full flex-col items-center gap-2 rounded-lg border-2 p-2 text-left text-xs transition-all ${
                  fenceStyleId === style.id
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                }`}
                data-testid={`card-style-${style.id}`}
              >
                <div className="flex h-16 w-full items-center justify-center">
                  <img
                    src={style.imageSrc}
                    alt={style.label}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="w-full text-center text-[11px] font-medium text-slate-700">
                  {style.label}
                </span>
              </button>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
});
