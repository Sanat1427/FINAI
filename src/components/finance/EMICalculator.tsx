"use client";
import React, { useState } from "react";
import { CalculatorIcon } from "../icons";

export function EMICalculator() {
  const [principal, setPrincipal] = useState<string>("500000");
  const [rate, setRate] = useState<string>("9");
  const [years, setYears] = useState<string>("5");
  const [result, setResult] = useState<{ emi: number; totalPayment: number; totalInterest: number } | null>(null);

  // We reuse the formula identical to the backend for instantaneous local feel, 
  // though the primary source of truth during chat is the backend tool.
  // In a real app with shared code, we'd import calculateEMI.
  const calculateLocal = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(principal);
    const r = parseFloat(rate);
    const y = parseFloat(years);
    
    if (isNaN(p) || isNaN(r) || isNaN(y) || p <= 0 || r < 0 || y <= 0) {
      setResult(null);
      return;
    }

    const monthlyRate = r / 12 / 100;
    const numberOfMonths = y * 12;

    if (monthlyRate === 0) {
      setResult({
        emi: p / numberOfMonths,
        totalPayment: p,
        totalInterest: 0
      });
      return;
    }

    const emi = (p * monthlyRate * Math.pow(1 + monthlyRate, numberOfMonths)) / (Math.pow(1 + monthlyRate, numberOfMonths) - 1);
    const totalPayment = emi * numberOfMonths;
    const totalInterest = totalPayment - p;

    setResult({ emi, totalPayment, totalInterest });
  };

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-8 w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">EMI Calculator</h2>
        <p className="text-slate-500 mt-1">Estimate your monthly loan repayment.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <form onSubmit={calculateLocal} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Loan Amount (₹)</label>
              <input
                type="number"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                required
                min="1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  required
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tenure (Years)</label>
                <input
                  type="number"
                  value={years}
                  onChange={(e) => setYears(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  required
                  min="1"
                  max="50"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-white font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <CalculatorIcon width={18} height={18} />
              Calculate EMI
            </button>
          </form>
        </div>

        {result && (
          <div className="bg-slate-50 p-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Calculation Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <p className="text-xs text-slate-500 font-medium mb-1">Monthly EMI</p>
                <p className="text-xl font-bold text-slate-900">₹{Math.round(result.emi).toLocaleString("en-IN")}</p>
              </div>
              
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <p className="text-xs text-slate-500 font-medium mb-1">Total Interest</p>
                <p className="text-xl font-bold text-slate-900">₹{Math.round(result.totalInterest).toLocaleString("en-IN")}</p>
              </div>
              
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <p className="text-xs text-slate-500 font-medium mb-1">Total Payment</p>
                <p className="text-xl font-bold text-slate-900">₹{Math.round(result.totalPayment).toLocaleString("en-IN")}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
