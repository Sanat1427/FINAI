"use client";
import React, { useState, useEffect } from "react";
import { MessageSquareIcon, CalculatorIcon, MenuIcon, FileTextIcon } from "../icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

interface AppShellProps {
  children: React.ReactNode;
  onNewChat?: () => void;
}

interface UserProfile {
  id: string;
  email: string | null;
  name?: string | null;
}

export function AppShell({ children, onNewChat }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function loadUserProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && isMounted) {
          // Check if profiles table exists in existing database schema
          let displayName = user.user_metadata?.full_name || user.user_metadata?.name || null;

          try {
            const { data: dbProfile } = await supabase
              .from("profiles")
              .select("full_name, name")
              .eq("id", user.id)
              .maybeSingle();

            if (dbProfile) {
              displayName = dbProfile.full_name || dbProfile.name || displayName;
            }
          } catch {
            // If profiles table does not exist, safely fall back to auth user metadata
          }

          setProfile({
            id: user.id,
            email: user.email ?? null,
            name: displayName,
          });
        } else if (isMounted) {
          setProfile(null);
        }
      } catch (err) {
        console.error("Error loading user profile:", err);
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    }

    loadUserProfile();

    // Single auth state listener to avoid duplicate queries
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        setProfile({
          id: session.user.id,
          email: session.user.email ?? null,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || null,
        });
      } else {
        setProfile(null);
      }
      setLoadingProfile(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const closeSidebar = () => setSidebarOpen(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const userInitial = profile?.name
    ? profile.name[0].toUpperCase()
    : profile?.email
    ? profile.email[0].toUpperCase()
    : "U";

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6">
            <Link href="/" className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                <CalculatorIcon width={18} height={18} />
              </span>
              FinAI
            </Link>
          </div>

          <nav className="flex-1 px-4 space-y-2 overflow-y-auto pb-4">
            <Link
              href="/chat"
              onClick={(e) => {
                closeSidebar();
                if (pathname === "/chat" && onNewChat) {
                  e.preventDefault();
                  onNewChat();
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/chat"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <MessageSquareIcon width={18} height={18} />
              Financial Copilot
            </Link>

            <Link
              href="/emi"
              onClick={closeSidebar}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/emi"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <CalculatorIcon width={18} height={18} />
              EMI Calculator
            </Link>

            <Link
              href="/simple-interest"
              onClick={closeSidebar}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/simple-interest"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <CalculatorIcon width={18} height={18} />
              Simple Interest
            </Link>

            <Link
              href="/compound-interest"
              onClick={closeSidebar}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/compound-interest"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <CalculatorIcon width={18} height={18} />
              Compound Interest
            </Link>

            <Link
              href="/upload"
              onClick={closeSidebar}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/upload"
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <FileTextIcon width={18} height={18} />
              Knowledge Base
            </Link>
          </nav>

          {/* User Profile & Sign Out Section */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/50">
            {loadingProfile ? (
              <div className="flex items-center gap-3 px-3 py-2 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-slate-200 rounded w-24" />
                  <div className="h-2 bg-slate-200 rounded w-32" />
                </div>
              </div>
            ) : profile ? (
              <div className="mb-2 px-3 py-2 flex items-center gap-3 rounded-lg bg-white border border-slate-200/60 shadow-xs">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                  {userInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {profile.name || "Authenticated User"}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate" title={profile.email ?? ""}>
                    {profile.email}
                  </p>
                </div>
              </div>
            ) : null}

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-14 flex items-center justify-between px-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg md:hidden"
              aria-label="Open sidebar"
            >
              <MenuIcon width={24} height={24} />
            </button>
            <span className="font-semibold text-slate-900 md:hidden">FinAI</span>
          </div>

          {/* Desktop/Mobile Header User Indicator */}
          <div className="flex items-center gap-3">
            {profile && (
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 py-1.5 px-3 rounded-full border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span className="font-medium text-slate-700 truncate max-w-[150px] sm:max-w-[200px]">
                  {profile.email}
                </span>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
      </main>
    </div>
  );
}
