import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export function AuthInitializer() {
  const refresh = useAuthStore((state) => state.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return null;
}
