import Link from "next/link";
import { MessageSquareIcon, CalculatorIcon, FileTextIcon } from "@/components/icons";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-50">
        <Link href="/" className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
            <CalculatorIcon width={18} height={18} />
          </span>
          FinAI
        </Link>
        <div className="hidden md:flex gap-6 items-center text-sm font-medium text-slate-600">
          <Link href="/chat" className="hover:text-emerald-600 transition-colors">Copilot</Link>
          <Link href="/emi" className="hover:text-emerald-600 transition-colors">Calculators</Link>
          <Link href="/upload" className="hover:text-emerald-600 transition-colors">Knowledge Base</Link>
        </div>
        <Link href="/chat" className="bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
          Get Started
        </Link>
      </nav>

      <main className="flex-1 flex flex-col items-center">
        {/* Hero Section */}
        <section className="w-full max-w-6xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center">
          <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
            Your Personal <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">AI Financial Council</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-10 leading-relaxed">
            FinAI analyzes your financial questions using multiple AI agents to provide balanced, evidence-based perspectives without the bias.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link href="/chat" className="bg-emerald-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2">
              <MessageSquareIcon width={20} height={20} />
              Try the Copilot
            </Link>
            <Link href="/emi" className="bg-white text-slate-700 border border-slate-200 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-slate-50 transition-all flex items-center justify-center gap-2">
              <CalculatorIcon width={20} height={20} />
              Financial Tools
            </Link>
          </div>
        </section>

        {/* Financial Council Explanation */}
        <section className="w-full bg-white border-y border-slate-200 py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">How the Council Works</h2>
              <p className="text-slate-600 max-w-2xl mx-auto">
                Every query is evaluated by a multi-agent system to ensure you receive a comprehensive and grounded analysis.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8 relative">
              {/* Desktop connecting line */}
              <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-0.5 bg-slate-100 z-0 border-t-2 border-dashed border-slate-200"></div>

              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-8 relative z-10 text-center">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl shadow-sm">↑</div>
                <h3 className="text-xl font-bold text-emerald-900 mb-3">The Optimist</h3>
                <p className="text-emerald-800/80 text-sm leading-relaxed">
                  Identifies potential benefits, opportunities, and productive uses of borrowing based on verified facts.
                </p>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-8 relative z-10 text-center">
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl shadow-sm">↓</div>
                <h3 className="text-xl font-bold text-rose-900 mb-3">The Pessimist</h3>
                <p className="text-rose-800/80 text-sm leading-relaxed">
                  Highlights potential risks, downside scenarios, and repayment burdens to ensure cautious planning.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 relative z-10 text-center shadow-sm">
                <div className="w-16 h-16 bg-slate-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl shadow-sm">⚖️</div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">The Judge</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Synthesizes both perspectives alongside retrieved evidence to deliver a balanced final verdict.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="w-full max-w-6xl mx-auto px-6 py-24">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-12">
              <div>
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                  <FileTextIcon width={24} height={24} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">RAG Knowledge Base</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  FinAI&apos;s answers are grounded in reality. Upload your own PDFs (like RBI guidelines or financial documents) to act as the source of truth for the Copilot.
                </p>
                <Link href="/upload" className="text-blue-600 font-semibold hover:text-blue-700 flex items-center gap-1">
                  Manage Documents →
                </Link>
              </div>

              <div>
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-6">
                  <CalculatorIcon width={24} height={24} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Deterministic Calculators</h3>
                <p className="text-slate-600 leading-relaxed mb-4">
                  Never rely on AI for math. FinAI utilizes precise, deterministic formulas for calculating EMIs, Simple Interest, and Compound Interest.
                </p>
                <Link href="/emi" className="text-purple-600 font-semibold hover:text-purple-700 flex items-center gap-1">
                  Try Calculators →
                </Link>
              </div>
            </div>

            <div className="bg-slate-900 rounded-3xl p-8 md:p-12 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 opacity-20 blur-[100px] rounded-full"></div>
              <h3 className="text-3xl font-bold mb-6 relative z-10">Start planning smarter today.</h3>
              <p className="text-slate-300 mb-10 relative z-10 max-w-sm">
                Join the future of financial education with an AI that provides perspectives, not just answers.
              </p>
              <Link href="/chat" className="inline-flex bg-white text-slate-900 px-6 py-3 rounded-lg font-semibold hover:bg-slate-100 transition-colors relative z-10">
                Launch Copilot
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full bg-slate-900 text-slate-400 py-12 text-sm text-center border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <CalculatorIcon width={18} height={18} />
            FinAI
          </div>
          <p>© {new Date().getFullYear()} FinAI. Local Development Environment.</p>
          <div className="flex gap-4">
            <span className="opacity-50 cursor-not-allowed">Privacy</span>
            <span className="opacity-50 cursor-not-allowed">Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
