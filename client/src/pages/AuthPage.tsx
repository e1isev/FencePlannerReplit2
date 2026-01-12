import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { useAuthStore } from "@/store/authStore";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const error = useAuthStore((state) => state.error);
  const loading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (user) {
      setLocation("/projects");
    }
  }, [user, setLocation]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const success =
      mode === "login"
        ? await login(email, password)
        : await register(email, password);
    if (success) {
      setLocation("/projects");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            {mode === "login"
              ? "Log in to access your saved projects."
              : "Register to save and sync your projects."}
          </p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
            <p className="text-xs text-slate-500">Minimum 8 characters.</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {mode === "login" ? "Log in" : "Register"}
          </Button>
        </form>
        <div className="text-sm text-slate-600">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-primary font-semibold"
          >
            {mode === "login" ? "Create one" : "Log in"}
          </button>
        </div>
        <Button variant="ghost" onClick={() => setLocation("/")} className="w-full">
          Back to start
        </Button>
      </div>
    </div>
  );
}
