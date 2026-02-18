/**
 * Settings Page
 */

import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOut, useAuth } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  AccountSection,
  ProvidersSection,
  ChatSection,
  ModelsSection,
  ShortcutsSection,
} from "@/components/settings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings - osschat" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

type Section = "account" | "providers" | "chat" | "models" | "shortcuts";

const sections: Array<{ id: Section; label: string }> = [
  { id: "account", label: "Account" },
  { id: "providers", label: "Providers" },
  { id: "chat", label: "Chat" },
  { id: "models", label: "Models" },
  { id: "shortcuts", label: "Shortcuts" },
];

function SettingsPage() {
  const { user, isAuthenticated, loading, refetchSession } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("account");

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
        <Link to="/auth/sign-in">
          <Button>Sign In</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-3xl px-6">
          {/* Top row */}
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back
              </Link>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                  <AvatarFallback className="text-xs">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{user.name || "User"}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>

          {/* Navigation tabs */}
          <nav className="-mb-px flex gap-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "relative px-4 py-3 text-sm font-medium transition-colors",
                  activeSection === section.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
                {activeSection === section.id && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">
          {activeSection === "account" && <AccountSection user={user} refetchSession={refetchSession} />}
          {activeSection === "providers" && <ProvidersSection />}
          {activeSection === "chat" && <ChatSection />}
          {activeSection === "models" && <ModelsSection />}
          {activeSection === "shortcuts" && <ShortcutsSection />}
        </div>
      </main>
    </div>
  );
}


